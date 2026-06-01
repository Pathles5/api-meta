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

describe("GET /health", () => {
  it("should return 200 with status ok", async () => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.ok(body.timestamp);
  });
});

describe("GET /nonexistent", () => {
  it("should return 404", async () => {
    const response = await fetch(`${baseUrl}/nonexistent`);

    assert.equal(response.status, 404);
  });
});
