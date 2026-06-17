import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { getSwaggerSpec } from "../config/swagger.js";

/**
 * Creates the documentation router.
 * Serves Swagger UI at /docs and the raw OpenAPI JSON at /docs/json.
 *
 * @returns {import("express").Router}
 */
function createDocsRouter() {
  const router = Router();

  /**
   * GET /docs/json — Raw OpenAPI 3.0 specification (JSON).
   */
  router.get("/json", (_req, res) => {
    const spec = getSwaggerSpec();
    res.json(spec);
  });

  /**
   * GET /docs — Swagger UI (HTML interface).
   */
  router.use("/", swaggerUi.serve, swaggerUi.setup(undefined, {
    swaggerUrl: "/docs/json",
    customSiteTitle: "IG-API — Swagger UI",
  }));

  return router;
}

const docsRouter = createDocsRouter();

export { docsRouter, createDocsRouter };
