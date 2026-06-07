import { Duration, Stack } from "aws-cdk-lib";
import { Alarm, Dashboard, GraphWidget } from "aws-cdk-lib/aws-cloudwatch";
import {
  LambdaRestApi,
  EndpointType,
  MethodLoggingLevel,
} from "aws-cdk-lib/aws-apigateway";
import { Table, BillingMode, AttributeType } from "aws-cdk-lib/aws-dynamodb";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { resolve } from "path";

export class IgApiStack extends Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);

    const { tableName, environment, metaAccessToken, igUserId, authApiKey, verificationHours, logLevel, metaAppSecret, metaVerifyToken } =
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

    new Alarm(this, `${id}-lambda-errors`, {
      metric: lambda.metricErrors({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: "Lambda function errors",
    });

    new Alarm(this, `${id}-lambda-throttles`, {
      metric: lambda.metricThrottles({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: "Lambda function throttles",
    });

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

    this.apiUrl = api.url;
  }
}
