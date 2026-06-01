import { logger } from "../utils/logger.js";

function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;

  if (statusCode >= 500) {
    logger.error({ err }, "Server error");
  } else {
    logger.warn({ err }, "Client error");
  }

  const message = err.statusCode ? err.message : "Internal Server Error";

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
}

function createError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export { errorHandler, createError };
