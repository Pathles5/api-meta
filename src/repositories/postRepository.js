import {
  PutCommand,
  GetCommand,
  DeleteCommand,
  ScanCommand,
  UpdateCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { getDynamoDBClient } from "../config/dynamodb.js";

const DEFAULT_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "ig-posts";
const DEFAULT_TTL_DAYS = parseInt(process.env.DYNAMODB_POST_TTL_DAYS) || 90;

function createPostRepository(client, options = {}) {
  const tableName = options.tableName || DEFAULT_TABLE_NAME;
  const ttlDays = options.ttlDays || DEFAULT_TTL_DAYS;

  function computeExpiresAt() {
    const now = new Date();
    now.setDate(now.getDate() + ttlDays);
    return Math.floor(now.getTime() / 1000);
  }

  async function savePost(post) {
    const item = {
      ...post,
      createdAt: new Date().toISOString(),
      expiresAt: computeExpiresAt(),
    };

    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
      }),
    );

    return item;
  }

  async function getPost(id) {
    const result = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: { id },
      }),
    );

    return result.Item || null;
  }

  async function listPosts(limit = 20) {
    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        Limit: limit,
      }),
    );

    return result.Items || [];
  }

  async function deletePost(id) {
    await client.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { id },
      }),
    );
  }

  async function savePosts(posts) {
    const now = new Date().toISOString();
    const expires = computeExpiresAt();
    const saved = [];

    for (let i = 0; i < posts.length; i += 25) {
      const chunk = posts.slice(i, i + 25);
      const requestItems = chunk.map((post) => ({
        PutRequest: {
          Item: {
            ...post,
            createdAt: now,
            expiresAt: expires,
          },
        },
      }));

      await client.send(
        new BatchWriteCommand({
          RequestItems: { [tableName]: requestItems },
        }),
      );

      saved.push(...chunk.map((post) => ({
        ...post,
        createdAt: now,
        expiresAt: expires,
      })));
    }

    return saved;
  }

  async function updateVerificationDate(id) {
    const now = new Date().toISOString();

    await client.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id },
        UpdateExpression: "SET lastVerificationDate = :date",
        ExpressionAttributeValues: { ":date": now },
      }),
    );

    return now;
  }

  async function listPostsNeedingVerification(hours = 24, limit = 50) {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hours);
    const cutoffISO = cutoff.toISOString();

    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        Limit: limit,
        FilterExpression:
          "attribute_not_exists(lastVerificationDate) OR lastVerificationDate < :cutoff",
        ExpressionAttributeValues: { ":cutoff": cutoffISO },
      }),
    );

    return result.Items || [];
  }

  return {
    savePost,
    getPost,
    listPosts,
    deletePost,
    savePosts,
    updateVerificationDate,
    listPostsNeedingVerification,
    getTableName: () => tableName,
  };
}

let defaultRepo;

function getDefaultRepository() {
  if (!defaultRepo) {
    const client = getDynamoDBClient();
    defaultRepo = createPostRepository(client);
  }
  return defaultRepo;
}

const {
  savePost,
  getPost,
  listPosts,
  deletePost,
  savePosts,
  updateVerificationDate,
  listPostsNeedingVerification,
  getTableName,
} = getDefaultRepository();

export {
  savePost,
  getPost,
  listPosts,
  deletePost,
  savePosts,
  updateVerificationDate,
  listPostsNeedingVerification,
  getTableName,
  createPostRepository,
};
