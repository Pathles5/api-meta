import { Duration, RemovalPolicy, Stack, Tags } from "aws-cdk-lib";
import { Alarm, Dashboard, GraphWidget, Metric } from "aws-cdk-lib/aws-cloudwatch";
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions";
import {
  LambdaRestApi,
  EndpointType,
  MethodLoggingLevel,
} from "aws-cdk-lib/aws-apigateway";
import { Table, BillingMode, AttributeType } from "aws-cdk-lib/aws-dynamodb";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Topic } from "aws-cdk-lib/aws-sns";
import { EmailSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { resolve } from "path";

export class IgApiStack extends Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);

    const { tableName, environment, igUserId, authApiKey, verificationHours, logLevel, metaAppSecret, metaVerifyToken, alarmEmail } =
      props;

    const table = new Table(this, `${id}-posts-table`, {
      tableName,
      billingMode: BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "id", type: AttributeType.STRING },
      timeToLiveAttribute: "expiresAt",
    });

    // ── Global Secondary Indexes (GSIs) ──
    // GSI: by-timestamp — Listar posts por fecha (reemplaza Scan ineficiente)
    table.addGlobalSecondaryIndex({
      indexName: "by-timestamp",
      partitionKey: { name: "timestamp", type: AttributeType.STRING },
      sortKey: { name: "id", type: AttributeType.STRING },
    });

    // GSI: by-mediaType — deferred: DynamoDB allows only 1 GSI change per update
    // table.addGlobalSecondaryIndex({
    //   indexName: "by-mediaType",
    //   partitionKey: { name: "mediaType", type: AttributeType.STRING },
    //   sortKey: { name: "timestamp", type: AttributeType.STRING },
    // });

    // GSI: by-price — deferred: DynamoDB allows only 1 GSI change per update
    // table.addGlobalSecondaryIndex({
    //   indexName: "by-price",
    //   partitionKey: { name: "price", type: AttributeType.NUMBER },
    //   sortKey: { name: "timestamp", type: AttributeType.STRING },
    // });

    // ── S3 Bucket for Instagram media storage ──
    // Stores images/videos downloaded from Instagram.
    // Cost: $0 within Free Tier (5 GB standard storage).
    const mediaBucket = new Bucket(this, `${id}-media-bucket`, {
      bucketName: `${id}-media-${environment}`,
      removalPolicy: RemovalPolicy.RETAIN,
      // Lifecycle: auto-delete objects after 90 days (aligned with DynamoDB TTL)
      lifecycleRules: [
        {
          expiration: Duration.days(90),
          enabled: true,
        },
      ],
    });

    // ── Lambda LogGroup con retención de 30 días ──
    // Al crear el LogGroup explícitamente y pasarlo a la Lambda, evitamos que
    // CDK cree uno automático sin retención, lo cual podría exceder el Free Tier
    // de CloudWatch Logs (5 GB) por acumulación indefinida.
    const lambdaLogGroup = new LogGroup(this, `${id}-lambda-logs`, {
      logGroupName: `/aws/lambda/${id}-api`,
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const lambda = new NodejsFunction(this, `${id}-lambda`, {
      functionName: `${id}-api`,
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      handler: "handler",
      entry: resolve(import.meta.dirname, "../../lambda.js"),
      bundling: {
        minify: true,
        sourceMap: false,
        target: "node22",
        externalModules: ["@aws-sdk/*"],
      },
      logGroup: lambdaLogGroup,
      memorySize: 256,
      timeout: Duration.seconds(15),
      environment: {
        DYNAMODB_TABLE_NAME: tableName,
        S3_BUCKET_NAME: mediaBucket.bucketName,
        META_IG_USER_ID: igUserId,
        AUTH_API_KEY: authApiKey,
        POST_VERIFICATION_HOURS: verificationHours,
        APP_LOG_LEVEL: logLevel,
        META_APP_SECRET: metaAppSecret,
        META_VERIFY_TOKEN: metaVerifyToken,
        IG_ENV: environment,
        NODE_ENV: "production",
      },
    });

    table.grantReadWriteData(lambda);
    mediaBucket.grantReadWrite(lambda);

    // ── SSM Parameter Store: lectura del token de Meta ──
    lambda.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["ssm:GetParameter"],
        resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/ig-api/${environment}/*`],
      })
    );

    // ── SNS Topic for alarm notifications ──
    const alarmTopic = new Topic(this, `${id}-alarm-topic`, {
      topicName: `${id}-alarm-topic`,
    });

    if (alarmEmail) {
      alarmTopic.addSubscription(new EmailSubscription(alarmEmail));
    }

    const snsAction = new SnsAction(alarmTopic);

    const lambdaErrorsAlarm = new Alarm(this, `${id}-lambda-errors`, {
      metric: lambda.metricErrors({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: "Lambda function errors",
    });
    lambdaErrorsAlarm.addAlarmAction(snsAction);
    lambdaErrorsAlarm.addOkAction(snsAction);

    const lambdaThrottlesAlarm = new Alarm(this, `${id}-lambda-throttles`, {
      metric: lambda.metricThrottles({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: "Lambda function throttles",
    });
    lambdaThrottlesAlarm.addAlarmAction(snsAction);
    lambdaThrottlesAlarm.addOkAction(snsAction);

    const lambdaDurationAlarm = new Alarm(this, `${id}-lambda-duration`, {
      metric: lambda.metricDuration({
        period: Duration.minutes(5),
        statistic: "p95",
      }),
      threshold: 5000, // 5 segundos
      evaluationPeriods: 2,
      alarmDescription: "Lambda p95 duration exceeds 5s",
    });
    lambdaDurationAlarm.addAlarmAction(snsAction);
    lambdaDurationAlarm.addOkAction(snsAction);

    const api = new LambdaRestApi(this, `${id}-api-gateway`, {
      restApiName: `${id}-api`,
      handler: lambda,
      proxy: false,
      deployOptions: {
        stageName: environment,
        loggingLevel: MethodLoggingLevel.INFO,
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
      },
      endpointTypes: [EndpointType.REGIONAL],
    });

    const health = api.root.addResource("health");
    health.addMethod("GET");

    const posts = api.root.addResource("posts");
    posts.addMethod("GET");
    posts.addMethod("POST");

    const postsId = posts.addResource("{id}");
    postsId.addMethod("GET");

    const postsSync = posts.addResource("sync");
    postsSync.addMethod("POST");

    const postsVerify = posts.addResource("verify");
    postsVerify.addMethod("POST");

    const webhooks = api.root.addResource("webhooks");
    webhooks.addMethod("GET");
    webhooks.addMethod("POST");

    // ── API Gateway & DynamoDB alarms ──
    const api5xxAlarm = new Alarm(this, `${id}-api-5xx-errors`, {
      metric: api.metricServerError({ period: Duration.minutes(5) }),
      threshold: 10,
      evaluationPeriods: 1,
      alarmDescription: "API Gateway 5XX errors > 10 in 5 min",
    });
    api5xxAlarm.addAlarmAction(snsAction);
    api5xxAlarm.addOkAction(snsAction);

    const apiLatencyAlarm = new Alarm(this, `${id}-api-latency`, {
      metric: api.metricLatency({
        period: Duration.minutes(5),
        statistic: "p95",
      }),
      threshold: 1000, // 1 segundo
      evaluationPeriods: 2,
      alarmDescription: "API Gateway p95 latency exceeds 1s",
    });
    apiLatencyAlarm.addAlarmAction(snsAction);
    apiLatencyAlarm.addOkAction(snsAction);

    const readThrottleMetric = new Metric({
      namespace: "AWS/DynamoDB",
      metricName: "ThrottledRequests",
      dimensionsMap: {
        TableName: table.tableName,
        Operation: "GetItem",
      },
      period: Duration.minutes(5),
      statistic: "Sum",
    });

    const dynamoThrottleAlarm = new Alarm(this, `${id}-dynamodb-read-throttle`, {
      metric: readThrottleMetric,
      threshold: 0,
      evaluationPeriods: 1,
      alarmDescription: "DynamoDB read throttles detected",
    });
    dynamoThrottleAlarm.addAlarmAction(snsAction);
    dynamoThrottleAlarm.addOkAction(snsAction);

    // CloudWatch Dashboard
    const dashboard = new Dashboard(this, `${id}-dashboard`, {
      dashboardName: `${id}-monitoring`,
    });

    dashboard.addWidgets(
      new GraphWidget({
        title: "Lambda Invocations",
        left: [lambda.metricInvocations({ period: Duration.minutes(5) })],
        width: 12,
      }),
      new GraphWidget({
        title: "Lambda Duration (p95)",
        left: [lambda.metricDuration({ period: Duration.minutes(5), statistic: "p95" })],
        width: 12,
      }),
    );

    dashboard.addWidgets(
      new GraphWidget({
        title: "Lambda Errors",
        left: [lambda.metricErrors({ period: Duration.minutes(5) })],
        width: 12,
      }),
      new GraphWidget({
        title: "Lambda Throttles",
        left: [lambda.metricThrottles({ period: Duration.minutes(5) })],
        width: 12,
      }),
    );

    dashboard.addWidgets(
      new GraphWidget({
        title: "API Gateway 4XX Errors",
        left: [api.metricClientError({ period: Duration.minutes(5) })],
        width: 12,
      }),
      new GraphWidget({
        title: "API Gateway 5XX Errors",
        left: [api.metricServerError({ period: Duration.minutes(5) })],
        width: 12,
      }),
    );

    // ── Token Refresh Lambda (cada 30 días) ──
    const tokenRefreshLogGroup = new LogGroup(this, `${id}-token-refresh-logs`, {
      logGroupName: `/aws/lambda/${id}-token-refresh`,
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const tokenRefreshLambda = new NodejsFunction(this, `${id}-token-refresh`, {
      functionName: `${id}-token-refresh`,
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      handler: "handler",
      entry: resolve(import.meta.dirname, "../../src/handlers/tokenRefreshHandler.js"),
      bundling: {
        minify: true,
        sourceMap: false,
        target: "node22",
        externalModules: ["@aws-sdk/*"],
      },
      logGroup: tokenRefreshLogGroup,
      memorySize: 128,
      timeout: Duration.seconds(30),
      environment: {
        IG_ENV: environment,
        APP_LOG_LEVEL: logLevel,
        NODE_ENV: "production",
      },
    });

    // IAM: lectura y escritura en SSM para el token refresh
    tokenRefreshLambda.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["ssm:GetParameter", "ssm:PutParameter"],
        resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/ig-api/${environment}/*`],
      })
    );

    // EventBridge Rule: ejecutar cada 30 días
    const tokenRefreshRule = new Rule(this, `${id}-token-refresh-schedule`, {
      ruleName: `${id}-token-refresh-schedule`,
      schedule: Schedule.rate(Duration.days(30)),
      description: "Refresh Meta access token every 30 days",
    });

    tokenRefreshRule.addTarget(new LambdaFunction(tokenRefreshLambda));

    // Alarma si la Lambda de refresh falla
    const tokenRefreshErrorsAlarm = new Alarm(this, `${id}-token-refresh-errors`, {
      metric: tokenRefreshLambda.metricErrors({ period: Duration.hours(1) }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: "Token refresh Lambda failed - token may expire soon",
    });
    tokenRefreshErrorsAlarm.addAlarmAction(snsAction);
    tokenRefreshErrorsAlarm.addOkAction(snsAction);

    // ── Stack-level tags (propagate to ALL child resources) ──
    Tags.of(this).add("Stack", `ig-api-${environment}`);
    Tags.of(this).add("Environment", environment);
    Tags.of(this).add("Project", "IG-API");
    Tags.of(this).add("ManagedBy", "CDK");

    // ── Resource-specific tags ──
    Tags.of(table).add("Resource", "DynamoDB");
    Tags.of(table).add("Name", `${tableName}`);

    Tags.of(mediaBucket).add("Resource", "S3");
    Tags.of(mediaBucket).add("Name", `${id}-media-${environment}`);

    Tags.of(lambda).add("Resource", "Lambda");
    Tags.of(lambda).add("Name", `${id}-api`);

    Tags.of(api).add("Resource", "APIGateway");
    Tags.of(api).add("Name", `${id}-api`);

    Tags.of(dashboard).add("Resource", "CloudWatch");
    Tags.of(dashboard).add("Name", `${id}-monitoring`);

    Tags.of(alarmTopic).add("Resource", "SNS");
    Tags.of(alarmTopic).add("Name", `${id}-alarm-topic`);

    Tags.of(tokenRefreshLambda).add("Resource", "Lambda");
    Tags.of(tokenRefreshLambda).add("Name", `${id}-token-refresh`);

    Tags.of(tokenRefreshRule).add("Resource", "EventBridge");
    Tags.of(tokenRefreshRule).add("Name", `${id}-token-refresh-schedule`);

    this.apiUrl = api.url;
  }
}
