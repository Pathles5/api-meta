import pino from "pino";

const logger = pino({
  level: process.env.APP_LOG_LEVEL || "info",
});

export { logger };
