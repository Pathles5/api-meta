import { logger as defaultLogger } from "../utils/logger.js";

/**
 * Creates a webhook event processor for incoming Meta / Instagram webhooks.
 *
 * @param {object} [options]
 * @param {object} [options.logger] - Custom logger (defaults to project pino logger).
 * @returns {{ processEvent: (payload: object) => { processed: number, errors: number } }}
 */
function createWebhookProcessor(options = {}) {
  const log = options.logger || defaultLogger;

  /**
   * Process a raw webhook payload from Meta.
   *
   * Expected structure:
   * ```json
   * {
   *   "object": "instagram",
   *   "entry": [{ "id": "...", "time": "...", "changes": [...] }]
   * }
   * ```
   *
   * @param {object} payload - The parsed webhook JSON payload.
   * @returns {{ processed: number, errors: number }}
   */
  function processEvent(payload) {
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
          log.info(
            {
              object: payload.object,
              entryId: entry.id,
              field: change.field,
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

  return { processEvent };
}

export { createWebhookProcessor };
