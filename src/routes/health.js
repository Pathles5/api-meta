import { Router } from "express";

const healthRouter = Router();

healthRouter.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

export { healthRouter };
