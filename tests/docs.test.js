import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../src/app.js";

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("GET /docs/json", () => {
  it("should return 200 with OpenAPI spec", async () => {
    const response = await fetch(`${baseUrl}/docs/json`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.openapi, "3.0.0");
    assert.ok(body.info);
    assert.equal(body.info.title, "IG-API — Instagram REST API");
    assert.ok(body.paths);
  });

  it("should include /health endpoint in spec", async () => {
    const response = await fetch(`${baseUrl}/docs/json`);
    const body = await response.json();

    assert.ok(body.paths["/health"]);
    assert.ok(body.paths["/health"].get);
    assert.equal(body.paths["/health"].get.summary, "Health check");
  });

  it("should include /posts endpoints in spec", async () => {
    const response = await fetch(`${baseUrl}/docs/json`);
    const body = await response.json();

    assert.ok(body.paths["/posts"]);
    assert.ok(body.paths["/posts"].get);
    assert.ok(body.paths["/posts/list"]);
    assert.ok(body.paths["/posts/{id}"]);
    assert.ok(body.paths["/posts/sync"]);
    assert.ok(body.paths["/posts/verify"]);
  });

  it("should include /webhooks endpoints in spec", async () => {
    const response = await fetch(`${baseUrl}/docs/json`);
    const body = await response.json();

    assert.ok(body.paths["/webhooks"]);
    assert.ok(body.paths["/webhooks"].get);
    assert.ok(body.paths["/webhooks"].post);
  });
});

describe("GET /docs", () => {
  it("should return 200 with HTML content (Swagger UI)", async () => {
    const response = await fetch(`${baseUrl}/docs/`, {
      headers: { Accept: "text/html" },
      redirect: "follow",
    });

    assert.equal(response.status, 200);
    const contentType = response.headers.get("content-type") || "";
    assert.ok(
      contentType.includes("text/html"),
      `Expected text/html content type, got: ${contentType}`,
    );

    const html = await response.text();
    assert.ok(html.includes("swagger"), "Response should contain swagger references");
  });
});
