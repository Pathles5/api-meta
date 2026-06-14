import { logger as defaultLogger } from "../utils/logger.js";

/**
 * Extrae el Instagram post ID de un webhook change.
 *
 * Soporta los campos:
 * - "comments": value.media.id
 * - "mentions": value.media.id
 * - "reactions": no tiene post_id directo (retorna null)
 *
 * @param {{ field: string, value: object }} change - Un webhook change entry.
 * @returns {string|null} Post ID o null si no se puede extraer.
 */
function extractPostId(change) {
  const { field, value } = change;

  if (!value || typeof value !== "object") return null;

  if (field === "comments" || field === "mentions") {
    return value?.media?.id || null;
  }

  // reactions no tienen post_id directo
  return null;
}

/**
 * Crea un procesador de eventos webhook para Meta / Instagram.
 *
 * El procesador implementa el flujo FEAT-026/028:
 * 1. Extrae el post ID del evento webhook.
 * 2. Verifica si el post existe en DynamoDB.
 * 3. Si no existe, lo obtiene de Meta API y lo guarda.
 * 4. Extrae el precio del caption usando Grok AI.
 * 5. Almacena el precio en DynamoDB.
 *
 * @param {object} [options]
 * @param {object} [options.logger] - Custom logger (defaults to project pino logger).
 * @param {object} [options.repo] - Post repository (postRepository).
 * @param {object} [options.metaApi] - Meta API service (fetchPost).
 * @param {object} [options.priceExtractor] - Price extractor service (extractPrice).
 * @returns {{ processEvent: (payload: object) => Promise<{ processed: number, errors: number }> }}
 */
function createWebhookProcessor(options = {}) {
  const log = options.logger || defaultLogger;
  const repo = options.repo || null;
  const metaApi = options.metaApi || null;
  const priceExtractor = options.priceExtractor || null;

  /**
   * Procesa un evento de webhook de Meta/Instagram.
   *
   * Para cada change en el payload:
   * - Extrae el post ID (si es comments/mentions).
   * - Verifica si el post existe en DynamoDB.
   * - Si no existe, lo fetch de Meta API y lo guarda.
   * - Extrae el precio del caption con Grok AI.
   * - Guarda el precio en DynamoDB.
   *
   * @param {object} payload - The parsed webhook JSON payload.
   * @returns {Promise<{ processed: number, errors: number }>}
   */
  async function processEvent(payload) {
    if (!payload || typeof payload !== "object") {
      log.warn("Received empty or invalid webhook payload");
      return { processed: 0, errors: 0 };
    }

    const validObjects = ["instagram", "page"];

    if (!validObjects.includes(payload.object)) {
      log.warn({ object: payload.object }, "Unsupported webhook object type");
      return { processed: 0, errors: 0 };
    }

    if (!Array.isArray(payload.entry) || payload.entry.length === 0) {
      log.warn("Webhook payload has no entries");
      return { processed: 0, errors: 0 };
    }

    let processed = 0;
    let errors = 0;

    for (const entry of payload.entry) {
      if (!Array.isArray(entry.changes)) {
        log.warn({ entryId: entry.id }, "Entry has no changes array, skipping");
        continue;
      }

      for (const change of entry.changes) {
        try {
          const postId = extractPostId(change);

          if (postId && repo && metaApi) {
            await handlePostEvent(postId, change);
          }

          log.info(
            {
              object: payload.object,
              entryId: entry.id,
              field: change.field,
              postId,
              value: change.value,
            },
            "Webhook change processed",
          );
          processed++;
        } catch (err) {
          log.error({ err, change }, "Error processing webhook change");
          errors++;
        }
      }
    }

    return { processed, errors };
  }

  /**
   * Maneja el flujo completo para un post detectado via webhook:
   * check-exists → fetch-if-missing → extract-price → store-price.
   *
   * @param {string} postId - Instagram post ID.
   * @param {{ field: string, value: object }} change - The webhook change entry.
   */
  async function handlePostEvent(postId, _change) {
    let post;

    // 1. Check if post exists in DynamoDB
    try {
      post = await repo.getPost(postId);
    } catch (err) {
      log.error({ postId, err }, "Failed to check post existence in DynamoDB");
      return;
    }

    // 2. If post doesn't exist, fetch from Meta API and save
    if (!post) {
      try {
        post = await metaApi.fetchPost(postId);
        const postToSave = {
          ...post,
          source: "webhook",
          webhookReceived: true,
        };
        await repo.savePost(postToSave);
        log.info({ postId }, "Post created from webhook event");
      } catch (err) {
        if (err.statusCode === 404) {
          log.warn({ postId }, "Post no longer exists on Instagram");
        } else if (err.statusCode === 429) {
          log.warn({ postId }, "Meta API rate limit exceeded, skipping post creation");
        } else {
          log.error({ postId, err }, "Failed to fetch post from Meta API");
        }
        return;
      }
    } else {
      log.debug({ postId }, "Post already exists, skipping creation");
    }

    // 3. Extract price from caption using Grok AI
    if (priceExtractor && post && post.caption) {
      try {
        const priceData = await priceExtractor.extractPrice(post.caption);

        if (priceData.price !== null) {
          await repo.updatePostPrice(postId, priceData);
          log.info({ postId, price: priceData.price, currency: priceData.currency }, "Price stored in DynamoDB");
        } else {
          log.debug({ postId }, "No price found in caption");
        }
      } catch (err) {
        log.error({ postId, err }, "Failed to extract or store price");
      }
    }
  }

  return { processEvent, extractPostId };
}

export { createWebhookProcessor, extractPostId };
