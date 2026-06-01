import "dotenv/config";
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
} from "@aws-sdk/client-dynamodb";

const tableName = process.env.DYNAMODB_TABLE_NAME || "ig-posts";
const region = process.env.AWS_REGION || "us-east-1";
const endpoint = process.env.DYNAMODB_ENDPOINT || "http://localhost:8000";

async function setupTable() {
  const client = new DynamoDBClient({ region, endpoint });

  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    console.log(`Table "${tableName}" already exists.`);
    return;
  } catch (error) {
    if (error.name !== "ResourceNotFoundException") {
      throw error;
    }
  }

  console.log(`Creating table "${tableName}"...`);

  await client.send(
    new CreateTableCommand({
      TableName: tableName,
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );

  console.log(`Table "${tableName}" created successfully.`);
}

setupTable().catch((err) => {
  console.error("Failed to setup table:", err.message);
  process.exit(1);
});
