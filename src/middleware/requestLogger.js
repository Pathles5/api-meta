import { logger } from "../utils/logger.js";

function requestLogger(req, res, next) {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration,
      ip: req.ip || req.socket.remoteAddress,
    };

    if (res.statusCode >= 400) {
      logger.error(logData, "Request failed");
    } else {
      logger.info(logData, "Request completed");
    }
  });

  next();
}

export { requestLogger };
