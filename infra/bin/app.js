#!/usr/bin/env node
import "dotenv/config";
import { App } from "aws-cdk-lib";
import { IgApiStack } from "../lib/ig-api-stack.js";

const app = new App();

const environment = process.env.IG_ENV || "pre";
const stackName = `ig-api-${environment}`;
const env = {
  region: process.env.AWS_REGION || "eu-west-1",
};

new IgApiStack(app, stackName, {
  env,
  environment,
  tableName: process.env.DYNAMODB_TABLE_NAME || `ig-posts-${environment}`,
  igUserId: process.env.META_IG_USER_ID,
  authApiKey: process.env.AUTH_API_KEY,
  verificationHours: process.env.POST_VERIFICATION_HOURS || "24",
  logLevel: process.env.APP_LOG_LEVEL || "info",
  metaAppSecret: process.env.META_APP_SECRET,
  metaVerifyToken: process.env.META_VERIFY_TOKEN || "ig-api-verify-token",
  alarmEmail: process.env.ALARM_EMAIL || "antonio.lopez.sarmiento@gmail.com",
});
