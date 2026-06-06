import crypto from "node:crypto";
import { createError } from "./errorHandler.js";

/**
 * Express middleware that verifies the HMAC-SHA256 signature of incoming
 * Meta (Facebook / Instagram) webhook payloads.
 *
 * Meta sends the header `X-Hub-Signature-256` with the format `sha256=<hex>`.
 * This middleware recomputes the HMAC over the raw request body (which must
 * arrive as a Buffer — use `express.raw()` before this middleware) and
 * compares it in constant time.
 *
 * @param {string} [appSecret] - The Meta App Secret used for HMAC.
 *   Defaults to `process.env.META_APP_SECRET`.
 * @returns {import("express").RequestHandler}
 */
function verifyMetaSignature(appSecret) {
  return (req, res, next) => {
    const secret = appSecret || process.env.META_APP_SECRET;

    if (!secret) {
      return next(createError(500, "META_APP_SECRET not configured"));
    }

    const signatureHeader = req.headers["x-hub-signature-256"];

    if (!signatureHeader) {
      return next(createError(401, "Missing signature"));
    }

    const expectedPrefix = "sha256=";

    if (!signatureHeader.startsWith(expectedPrefix)) {
      return next(createError(401, "Invalid signature"));
    }

    const receivedSignature = signatureHeader.slice(expectedPrefix.length);

    const rawBody = req.body;

    if (!Buffer.isBuffer(rawBody)) {
      return next(createError(500, "Raw body not available for signature verification"));
    }

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    let isValid;
    try {
      isValid = crypto.timingSafeEqual(
        Buffer.from(receivedSignature, "hex"),
        Buffer.from(expectedSignature, "hex"),
      );
    } catch {
      isValid = false;
    }

    if (!isValid) {
      return next(createError(401, "Invalid signature"));
    }

    next();
  };
}

export { verifyMetaSignature };
