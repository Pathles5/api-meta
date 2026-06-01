import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

function createDynamoDBClient() {
  const region = process.env.AWS_REGION || "us-east-1";
  const endpoint = process.env.DYNAMODB_ENDPOINT || undefined;

  const client = new DynamoDBClient({
    region,
    ...(endpoint && { endpoint }),
  });

  return DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  });
}

let client;

function getDynamoDBClient() {
  if (!client) {
    client = createDynamoDBClient();
  }
  return client;
}

export { getDynamoDBClient };
