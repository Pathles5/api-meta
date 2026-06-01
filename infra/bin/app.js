#!/usr/bin/env node
import "dotenv/config";
import { App } from "aws-cdk-lib";
import { IgApiStack } from "../lib/ig-api-stack.js";

const app = new App();

const stackName = process.env.CDK_STACK_NAME || "ig-api";
const env = {
  region: process.env.AWS_REGION || "eu-west-1",
};

new IgApiStack(app, stackName, {
  env,
  tableName: process.env.DYNAMODB_TABLE_NAME || "ig-posts",
  metaAccessToken: process.env.META_ACCESS_TOKEN,
  igUserId: process.env.META_IG_USER_ID,
  authApiKey: process.env.AUTH_API_KEY,
  verificationHours: process.env.POST_VERIFICATION_HOURS || "24",
  logLevel: process.env.APP_LOG_LEVEL || "info",
});
