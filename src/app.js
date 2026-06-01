import express from "express";
import { healthRouter } from "./routes/health.js";
import { postsRouter } from "./routes/posts.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { cors } from "./middleware/cors.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { authenticate } from "./middleware/authenticate.js";

const app = express();

app.use(cors());
app.use(
  rateLimit({
    windowMs: parseInt(process.env.APP_RATE_LIMIT_WINDOW_MS) || 60000,
    max: parseInt(process.env.APP_RATE_LIMIT_MAX) || 100,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(requestLogger);

app.use(healthRouter);
app.use("/posts", authenticate, postsRouter);

app.use(errorHandler);

export { app };
