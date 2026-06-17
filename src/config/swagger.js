import swaggerJSDoc from "swagger-jsdoc";

/**
 * OpenAPI 3.0 base specification.
 * @type {import("swagger-jsdoc").Options["definition"]}
 */
const definition = {
  openapi: "3.0.0",
  info: {
    title: "IG-API — Instagram REST API",
    version: "0.1.0",
    description:
      "Meta API integration for Instagram post retrieval, webhook handling, and media storage.",
    contact: { name: "IG-API Team" },
  },
  servers: [
    { url: "/", description: "Current server" },
  ],
};

/**
 * Glob patterns for JSDoc/OpenAPI annotation scanning.
 * @type {import("swagger-jsdoc").Options["apis"]}
 */
const apis = [
  "./src/routes/**/*.js",
  "./src/config/swagger-components/**/*.js",
];

/**
 * Returns a fully-resolved OpenAPI spec object by parsing JSDoc annotations.
 * @returns {object} OpenAPI 3.0 specification
 */
export function getSwaggerSpec() {
  return swaggerJSDoc({ definition, apis });
}
