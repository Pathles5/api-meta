import { Duration, Stack } from "aws-cdk-lib";
import { Alarm } from "aws-cdk-lib/aws-cloudwatch";
import {
  LambdaRestApi,
  EndpointType,
  MethodLoggingLevel,
} from "aws-cdk-lib/aws-apigateway";
import { Table, BillingMode, AttributeType } from "aws-cdk-lib/aws-dynamodb";
import { Runtime, Function, Code, Architecture } from "aws-cdk-lib/aws-lambda";
import { resolve } from "path";

export class IgApiStack extends Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);

    const { tableName, metaAccessToken, igUserId, authApiKey, verificationHours, logLevel } =
      props;

    const table = new Table(this, `${id}-posts-table`, {
      tableName,
      billingMode: BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "id", type: AttributeType.STRING },
      timeToLiveAttribute: "expiresAt",
    });

    const lambda = new Function(this, `${id}-lambda`, {
      functionName: `${id}-api`,
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      handler: "lambda.handler",
      code: Code.fromAsset(resolve(import.meta.dirname, "../../"), {
        exclude: [
          "infra/**",
          "tests/**",
          "tools/**",
          ".github/**",
          "docs/**",
          "scripts/**",
          ".env",
          ".env.*",
          "*.md",
          "cdk.out/**",
          "node_modules/.cache/**",
        ],
      }),
      memorySize: 256,
      timeout: Duration.seconds(30),
      environment: {
        DYNAMODB_TABLE_NAME: tableName,
        META_ACCESS_TOKEN: metaAccessToken,
        META_IG_USER_ID: igUserId,
        AUTH_API_KEY: authApiKey,
        POST_VERIFICATION_HOURS: verificationHours,
        APP_LOG_LEVEL: logLevel,
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
        stageName: "prod",
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

    this.apiUrl = api.url;
  }
}
