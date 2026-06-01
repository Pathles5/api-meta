import crypto from "node:crypto";
import { createError } from "./errorHandler.js";

function authenticate(req, res, next) {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey) {
    return next(createError(401, "API key required"));
  }

  const validApiKey = process.env.AUTH_API_KEY;

  if (!validApiKey) {
    return next(createError(500, "AUTH_API_KEY not configured"));
  }

  let isValid;
  try {
    isValid = crypto.timingSafeEqual(
      Buffer.from(apiKey, "utf8"),
      Buffer.from(validApiKey, "utf8"),
    );
  } catch {
    isValid = false;
  }
  if (!isValid) {
    return next(createError(403, "Invalid API key"));
  }

  next();
}

export { authenticate };
