import {
  PutCommand,
  DeleteCommand,
  QueryCommand,
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
    // Query en la tabla principal usando solo el Partition Key (id)
    // DynamoDB requiere ambos PK y SK para GetItem, pero solo tenemos id
    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "id = :id",
        ExpressionAttributeValues: { ":id": id },
        Limit: 1,
      }),
    );

    return result.Items?.[0] || null;
  }

  /**
   * Lista posts desde DynamoDB ordenados por fecha (mas recientes primero).
   * Soporta paginacion via cursor (base64 del LastEvaluatedKey).
   * @param {number} [limit=20] - Cantidad maxima de posts a retornar (1-100).
   * @param {string|null} [cursor=null] - Cursor de paginacion (base64 JSON del ExclusiveStartKey).
   * @returns {Promise<{items: Array, nextCursor: string|null}>} Items y cursor para la siguiente pagina.
   */
  async function listPosts(limit = 20, cursor = null) {
    const params = {
      TableName: tableName,
      IndexName: "by-timestamp",
      KeyConditionExpression: "timestamp > :minTimestamp",
      ExpressionAttributeValues: { ":minTimestamp": "1970-01-01T00:00:00.000Z" },
      Limit: limit,
      ScanIndexForward: false,
    };

    if (cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
        params.ExclusiveStartKey = decoded;
      } catch {
        // Cursor invalido: ignorar y empezar desde el inicio
      }
    }

    const result = await client.send(new QueryCommand(params));

    const nextCursor = result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString("base64")
      : null;

    return { items: result.Items || [], nextCursor };
  }

  async function deletePost(id) {
    // Primero obtener el timestamp (Sort Key) del post
    const post = await getPost(id);
    if (!post) return;

    await client.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { id, timestamp: post.timestamp },
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
    // Primero obtener el timestamp (Sort Key) del post
    const post = await getPost(id);
    if (!post) return null;

    const now = new Date().toISOString();

    await client.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id, timestamp: post.timestamp },
        UpdateExpression: "SET lastVerificationDate = :date",
        ExpressionAttributeValues: { ":date": now },
      }),
    );

    return now;
  }

  /**
   * Actualiza los campos de precio extraido por Grok AI en un post.
   * @param {string} id - Instagram post ID.
   * @param {object} priceData - Datos de precio a guardar.
   * @param {number|null} priceData.price - Precio numerico extraido.
   * @param {string|null} priceData.currency - Codigo ISO de moneda (EUR, USD, etc.).
   * @param {number} priceData.confidence - Confianza de extraccion (0.0-1.0).
   * @returns {Promise<object|null>} Los datos de precio guardados, o null si el post no existe.
   */
  async function updatePostPrice(id, priceData) {
    const post = await getPost(id);
    if (!post) return null;

    const { price, currency, confidence } = priceData;

    const updateParts = [];
    const exprValues = {};

    if (price !== undefined && price !== null) {
      updateParts.push("price = :price");
      exprValues[":price"] = price;
    }
    if (currency !== undefined) {
      updateParts.push("currency = :currency");
      exprValues[":currency"] = currency;
    }
    if (confidence !== undefined) {
      updateParts.push("priceConfidence = :confidence");
      exprValues[":confidence"] = confidence;
    }

    if (updateParts.length === 0) {
      return { price: null, currency: null, confidence: 0 };
    }

    await client.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id, timestamp: post.timestamp },
        UpdateExpression: `SET ${updateParts.join(", ")}`,
        ExpressionAttributeValues: exprValues,
      }),
    );

    return { price, currency, confidence };
  }

  async function listPostsNeedingVerification(hours = 24, limit = 50) {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hours);
    const cutoffISO = cutoff.toISOString();

    // Query en GSI by-timestamp con filtro de verificación
    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: "by-timestamp",
        KeyConditionExpression: "timestamp > :minTimestamp",
        FilterExpression:
          "attribute_not_exists(lastVerificationDate) OR lastVerificationDate < :cutoff",
        ExpressionAttributeValues: {
          ":minTimestamp": "1970-01-01T00:00:00.000Z",
          ":cutoff": cutoffISO,
        },
        Limit: limit,
        ScanIndexForward: false,
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
    updatePostPrice,
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
  updatePostPrice,
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
  updatePostPrice,
  listPostsNeedingVerification,
  getTableName,
  createPostRepository,
};
