import { Duration, Stack, Tags } from "aws-cdk-lib";
import { Alarm, Dashboard, GraphWidget, Metric } from "aws-cdk-lib/aws-cloudwatch";
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions";
import {
  LambdaRestApi,
  EndpointType,
  MethodLoggingLevel,
} from "aws-cdk-lib/aws-apigateway";
import { Table, BillingMode, AttributeType } from "aws-cdk-lib/aws-dynamodb";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Topic } from "aws-cdk-lib/aws-sns";
import { EmailSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { resolve } from "path";

export class IgApiStack extends Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);

    const { tableName, environment, metaAccessToken, igUserId, authApiKey, verificationHours, logLevel, metaAppSecret, metaVerifyToken, alarmEmail } =
      props;

    const table = new Table(this, `${id}-posts-table`, {
      tableName,
      billingMode: BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "id", type: AttributeType.STRING },
      timeToLiveAttribute: "expiresAt",
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
      memorySize: 256,
      timeout: Duration.seconds(30),
      environment: {
        DYNAMODB_TABLE_NAME: tableName,
        META_ACCESS_TOKEN: metaAccessToken,
        META_IG_USER_ID: igUserId,
        AUTH_API_KEY: authApiKey,
        POST_VERIFICATION_HOURS: verificationHours,
        APP_LOG_LEVEL: logLevel,
        META_APP_SECRET: metaAppSecret,
        META_VERIFY_TOKEN: metaVerifyToken,
        NODE_ENV: "production",
      },
    });

    table.grantReadWriteData(lambda);

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

    // ── Stack-level tags (propagate to ALL child resources) ──
    Tags.of(this).add("Stack", `ig-api-${environment}`);
    Tags.of(this).add("Environment", environment);
    Tags.of(this).add("Project", "IG-API");
    Tags.of(this).add("ManagedBy", "CDK");

    // ── Resource-specific tags ──
    Tags.of(table).add("Resource", "DynamoDB");
    Tags.of(table).add("Name", `${tableName}`);

    Tags.of(lambda).add("Resource", "Lambda");
    Tags.of(lambda).add("Name", `${id}-api`);

    Tags.of(api).add("Resource", "APIGateway");
    Tags.of(api).add("Name", `${id}-api`);

    Tags.of(dashboard).add("Resource", "CloudWatch");
    Tags.of(dashboard).add("Name", `${id}-monitoring`);

    Tags.of(alarmTopic).add("Resource", "SNS");
    Tags.of(alarmTopic).add("Name", `${id}-alarm-topic`);

    this.apiUrl = api.url;
  }
}
