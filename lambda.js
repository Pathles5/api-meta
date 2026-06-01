import serverlessExpress from "@vendia/serverless-express";
import { app } from "./src/app.js";

const serverlessExpressInstance = serverlessExpress({ app });

export async function handler(event, context) {
  return serverlessExpressInstance(event, context);
}
