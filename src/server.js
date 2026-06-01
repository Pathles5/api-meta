import "dotenv/config";
import { app } from "./app.js";
import { logger } from "./utils/logger.js";

const PORT = process.env.APP_PORT || 3000;

app.listen(PORT, () => {
  logger.info({ port: PORT }, "Server running");
});
