import express from "express";
import { healthRouter } from "./routes/health.js";
import { postsRouter } from "./routes/posts.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { cors } from "./middleware/cors.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { authenticate } from "./middleware/authenticate.js";

const app = express();

app.use(cors());
app.use(requestLogger);

// Webhooks: raw body (before json parsing and authenticate)
app.use("/webhooks", express.raw({ type: "application/json" }), webhooksRouter);

// JSON parsing for the rest of the routes
app.use(express.json({ limit: "1mb" }));

app.use(healthRouter);
app.use("/posts", authenticate, postsRouter);

app.use(errorHandler);

export { app };
