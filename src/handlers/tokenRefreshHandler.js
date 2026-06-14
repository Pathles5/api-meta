import { performTokenRefresh } from "../services/metaTokenRefresh.js";
import { logger } from "../utils/logger.js";

/**
 * Lambda handler para refresh automático del token de Meta
 * Se ejecuta cada 30 días via EventBridge Rule
 */
export async function handler() {
  logger.info("Token refresh Lambda invoked");

  const result = await performTokenRefresh();

  if (!result.success) {
    logger.error({ message: result.message }, "Token refresh failed");
    throw new Error(result.message);
  }

  logger.info("Token refresh completed successfully");

  return {
    statusCode: 200,
    body: JSON.stringify(result),
  };
}
