import { Router } from "express";
import { logger } from "../utils/logger.js";
import { createWebhookProcessor } from "../services/webhookProcessor.js";
import { verifyMetaSignature } from "../middleware/verifyMetaSignature.js";
import * as postRepository from "../repositories/postRepository.js";
import * as metaApi from "../services/metaApi.js";
import { createPriceExtractor } from "../services/priceExtractor.js";

/**
 * Creates the webhooks router with GET (subscription verification) and
 * POST (event reception) endpoints for Meta / Instagram webhooks.
 *
 * @param {{ processEvent: Function }} [processor] - Webhook event processor.
 *   Defaults to a new `createWebhookProcessor()` instance with real dependencies
 *   (postRepository, metaApi, priceExtractor).
 * @returns {import("express").Router}
 */
function createWebhooksRouter(processor) {
  const router = Router();
  const eventProcessor =
    processor ||
    createWebhookProcessor({
      repo: postRepository,
      metaApi,
      priceExtractor: createPriceExtractor(),
    });

  /**
   * GET /webhooks — Meta subscription challenge-response.
   *
   * Meta sends a GET request with `hub.mode`, `hub.challenge`, and
   * `hub.verify_token` query parameters. If the mode is "subscribe" and
   * the verify token matches, we respond with the challenge value.
   *
   * @openapi
   * /webhooks:
   *   get:
   *     summary: Webhook subscription verification
   *     description: Meta challenge-response for webhook subscription verification.
   *     tags: [Webhooks]
   *     parameters:
   *       - in: query
   *         name: hub.mode
   *         schema:
   *           type: string
   *         required: true
   *         description: Must be "subscribe"
   *       - in: query
   *         name: hub.challenge
   *         schema:
   *           type: string
   *         required: true
   *         description: Challenge string to echo back
   *       - in: query
   *         name: hub.verify_token
   *         schema:
   *           type: string
   *         required: true
   *         description: Verification token
   *     responses:
   *       200:
   *         description: Challenge string returned on success
   *         content:
   *           text/plain:
   *             schema:
   *               type: string
   *       403:
   *         description: Invalid mode or token
   */
  router.get("/", (req, res) => {
    const mode = req.query["hub.mode"];
    const challenge = req.query["hub.challenge"];
    const token = req.query["hub.verify_token"];

    const expectedToken = process.env.META_VERIFY_TOKEN;

    if (!mode || !challenge || !token) {
      logger.warn({ mode, challenge, token }, "Missing webhook subscription parameters");
      return res.status(403).send("Forbidden");
    }

    if (mode !== "subscribe" || token !== expectedToken) {
      logger.warn({ mode, token }, "Webhook subscription verification failed");
      return res.status(403).send("Forbidden");
    }

    logger.info({ mode, challenge }, "Webhook subscription verified");
    return res.status(200).send(challenge);
  });

  /**
   * POST /webhooks — Receive webhook events from Meta.
   *
   * The body arrives as a raw Buffer (set by `express.raw()` in app.js).
   * The HMAC signature has already been verified by `verifyMetaSignature`
   * middleware before reaching this handler.
   *
   * We always respond 200 to Meta (even on processing errors) to prevent
   * unnecessary retries.
   *
   * @openapi
   * /webhooks:
   *   post:
   *     summary: Receive Instagram webhook events
   *     description: Receives and processes webhook events from Meta (Instagram). Always responds 200.
   *     tags: [Webhooks]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             description: Raw webhook payload from Meta
   *     responses:
   *       200:
   *         description: Event received (always returned, even on processing errors)
   *         content:
   *           text/plain:
   *             schema:
   *               type: string
   *               example: EVENT_RECEIVED
   */
  router.post("/", verifyMetaSignature(), async (req, res) => {
    let payload;

    try {
      const rawBody = req.body;
      if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
        logger.warn("Received empty webhook POST body");
        return res.status(200).send("EVENT_RECEIVED");
      }
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch (err) {
      logger.warn({ err }, "Failed to parse webhook payload as JSON");
      return res.status(200).send("EVENT_RECEIVED");
    }

    try {
      const result = await eventProcessor.processEvent(payload);
      logger.info({ result }, "Webhook events processed");
    } catch (err) {
      logger.error({ err }, "Error processing webhook event");
    }

    res.status(200).send("EVENT_RECEIVED");
  });

  return router;
}

const webhooksRouter = createWebhooksRouter();

export { webhooksRouter, createWebhooksRouter };
