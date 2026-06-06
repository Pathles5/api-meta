import { describe, it, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import { createWebhooksRouter } from "../src/routes/webhooks.js";

const originalEnv = process.env;

const TEST_SECRET = "test-app-secret-12345";
const TEST_VERIFY_TOKEN = "test-verify-token-abc";

let server;
let baseUrl;

function computeSignature(body, secret) {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function createTestApp(processor) {
  process.env.META_APP_SECRET = TEST_SECRET;
  const app = express();
  const webhooksRouter = createWebhooksRouter(processor);
  // Match app.js: raw body for /webhooks, verifyMetaSignature is inside the router (POST only)
  app.use("/webhooks", express.raw({ type: "application/json" }), webhooksRouter);
  return app;
}

function startServer(app) {
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
}

afterEach(() => {
  process.env = originalEnv;
  if (server) {
    server.close();
    server = undefined;
  }
});

describe("GET /webhooks — Subscription Verification", () => {
  it("should return 200 with challenge for valid subscription", async () => {
    process.env.META_VERIFY_TOKEN = TEST_VERIFY_TOKEN;
    const app = createTestApp();
    await startServer(app);

    const url = new URL(`${baseUrl}/webhooks`);
    url.searchParams.set("hub.mode", "subscribe");
    url.searchParams.set("hub.challenge", "CHALLENGE_STRING_123");
    url.searchParams.set("hub.verify_token", TEST_VERIFY_TOKEN);

    const response = await fetch(url.toString());
    const text = await response.text();

    assert.equal(response.status, 200);
    assert.equal(text, "CHALLENGE_STRING_123");
  });

  it("should return 403 when mode is incorrect", async () => {
    process.env.META_VERIFY_TOKEN = TEST_VERIFY_TOKEN;
    const app = createTestApp();
    await startServer(app);

    const url = new URL(`${baseUrl}/webhooks`);
    url.searchParams.set("hub.mode", "unsubscribe");
    url.searchParams.set("hub.challenge", "CHALLENGE_STRING_123");
    url.searchParams.set("hub.verify_token", TEST_VERIFY_TOKEN);

    const response = await fetch(url.toString());

    assert.equal(response.status, 403);
  });

  it("should return 403 when verify_token is incorrect", async () => {
    process.env.META_VERIFY_TOKEN = TEST_VERIFY_TOKEN;
    const app = createTestApp();
    await startServer(app);

    const url = new URL(`${baseUrl}/webhooks`);
    url.searchParams.set("hub.mode", "subscribe");
    url.searchParams.set("hub.challenge", "CHALLENGE_STRING_123");
    url.searchParams.set("hub.verify_token", "wrong-token");

    const response = await fetch(url.toString());

    assert.equal(response.status, 403);
  });

  it("should return 403 when parameters are missing", async () => {
    process.env.META_VERIFY_TOKEN = TEST_VERIFY_TOKEN;
    const app = createTestApp();
    await startServer(app);

    const response = await fetch(`${baseUrl}/webhooks`);

    assert.equal(response.status, 403);
  });
});

describe("POST /webhooks — Receive Events", () => {
  it("should return 200 for valid event with correct signature", async () => {
    process.env.META_VERIFY_TOKEN = TEST_VERIFY_TOKEN;
    const mockProcessor = { processEvent: mock.fn(() => ({ processed: 1, errors: 0 })) };
    const app = createTestApp(mockProcessor);
    await startServer(app);

    const payload = JSON.stringify({
      object: "instagram",
      entry: [{ id: "ig-123", time: 1717700000, changes: [{ field: "comments", value: {} }] }],
    });
    const signature = computeSignature(payload, TEST_SECRET);

    const response = await fetch(`${baseUrl}/webhooks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": signature,
      },
      body: payload,
    });

    assert.equal(response.status, 200);
    const text = await response.text();
    assert.equal(text, "EVENT_RECEIVED");
    assert.equal(mockProcessor.processEvent.mock.callCount(), 1);
  });

  it("should return 401 for event with invalid signature", async () => {
    process.env.META_VERIFY_TOKEN = TEST_VERIFY_TOKEN;
    const app = createTestApp();
    await startServer(app);

    const payload = JSON.stringify({ object: "instagram", entry: [] });

    const response = await fetch(`${baseUrl}/webhooks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": "sha256=0000000000000000000000000000000000000000000000000000000000000000",
      },
      body: payload,
    });

    assert.equal(response.status, 401);
  });

  it("should return 200 even for malformed JSON payload (Meta always gets 200)", async () => {
    process.env.META_VERIFY_TOKEN = TEST_VERIFY_TOKEN;
    const mockProcessor = { processEvent: mock.fn(() => ({ processed: 0, errors: 0 })) };
    const app = createTestApp(mockProcessor);
    await startServer(app);

    const badPayload = "this is not json";
    const signature = computeSignature(badPayload, TEST_SECRET);

    const response = await fetch(`${baseUrl}/webhooks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": signature,
      },
      body: badPayload,
    });

    assert.equal(response.status, 200);
    const text = await response.text();
    assert.equal(text, "EVENT_RECEIVED");
  });

  it("should return 401 when signature header is missing", async () => {
    process.env.META_VERIFY_TOKEN = TEST_VERIFY_TOKEN;
    const app = createTestApp();
    await startServer(app);

    const payload = JSON.stringify({ object: "instagram", entry: [] });

    const response = await fetch(`${baseUrl}/webhooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });

    assert.equal(response.status, 401);
  });
});
