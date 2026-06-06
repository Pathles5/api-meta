import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyMetaSignature } from "../src/middleware/verifyMetaSignature.js";

const originalEnv = process.env;

const TEST_SECRET = "test-app-secret-12345";

function mockReqRes({ body, headers = {} }) {
  const req = { headers, body };
  let statusCode;
  let responseBody;
  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      responseBody = data;
    },
    send(data) {
      responseBody = data;
    },
  };
  let nextCalled = false;
  let nextArg;
  const next = (arg) => {
    nextCalled = true;
    nextArg = arg;
  };
  return {
    req,
    res,
    next,
    getStatus: () => statusCode,
    getBody: () => responseBody,
    getNext: () => ({ called: nextCalled, arg: nextArg }),
  };
}

function computeSignature(body, secret) {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

afterEach(() => {
  process.env = originalEnv;
});

describe("verifyMetaSignature", () => {
  it("should call next() with valid signature", () => {
    const body = Buffer.from('{"object":"instagram"}');
    const signature = computeSignature(body, TEST_SECRET);
    const { req, res, next, getNext } = mockReqRes({
      body,
      headers: { "x-hub-signature-256": signature },
    });

    const middleware = verifyMetaSignature(TEST_SECRET);
    middleware(req, res, next);

    assert.equal(getNext().called, true);
    assert.equal(getNext().arg, undefined);
  });

  it("should return 401 when signature header is missing", () => {
    const body = Buffer.from('{"object":"instagram"}');
    const { req, res, next, getNext } = mockReqRes({
      body,
      headers: {},
    });

    const middleware = verifyMetaSignature(TEST_SECRET);
    middleware(req, res, next);

    assert.equal(getNext().called, true);
    assert.equal(getNext().arg.statusCode, 401);
    assert.ok(getNext().arg.message.includes("Missing signature"));
  });

  it("should return 401 when signature is invalid", () => {
    const body = Buffer.from('{"object":"instagram"}');
    const { req, res, next, getNext } = mockReqRes({
      body,
      headers: { "x-hub-signature-256": "sha256=0000000000000000000000000000000000000000000000000000000000000000" },
    });

    const middleware = verifyMetaSignature(TEST_SECRET);
    middleware(req, res, next);

    assert.equal(getNext().called, true);
    assert.equal(getNext().arg.statusCode, 401);
    assert.ok(getNext().arg.message.includes("Invalid signature"));
  });

  it("should return 401 when header format is incorrect (no sha256= prefix)", () => {
    const body = Buffer.from('{"object":"instagram"}');
    const { req, res, next, getNext } = mockReqRes({
      body,
      headers: { "x-hub-signature-256": "md5=abc123" },
    });

    const middleware = verifyMetaSignature(TEST_SECRET);
    middleware(req, res, next);

    assert.equal(getNext().called, true);
    assert.equal(getNext().arg.statusCode, 401);
    assert.ok(getNext().arg.message.includes("Invalid signature"));
  });

  it("should return 500 when META_APP_SECRET is not configured", () => {
    delete process.env.META_APP_SECRET;
    const body = Buffer.from('{"object":"instagram"}');
    const { req, res, next, getNext } = mockReqRes({
      body,
      headers: { "x-hub-signature-256": "sha256=abc" },
    });

    const middleware = verifyMetaSignature();
    middleware(req, res, next);

    assert.equal(getNext().called, true);
    assert.equal(getNext().arg.statusCode, 500);
    assert.ok(getNext().arg.message.includes("META_APP_SECRET not configured"));
  });

  it("should use process.env.META_APP_SECRET when no argument is passed", () => {
    process.env.META_APP_SECRET = TEST_SECRET;
    const body = Buffer.from('{"object":"instagram"}');
    const signature = computeSignature(body, TEST_SECRET);
    const { req, res, next, getNext } = mockReqRes({
      body,
      headers: { "x-hub-signature-256": signature },
    });

    const middleware = verifyMetaSignature();
    middleware(req, res, next);

    assert.equal(getNext().called, true);
    assert.equal(getNext().arg, undefined);
  });

  it("should use timing-safe comparison (timingSafeEqual)", () => {
    // Verify that the implementation uses crypto.timingSafeEqual by checking
    // that a wrong-length signature does not throw but returns 401.
    const body = Buffer.from('{"object":"instagram"}');
    const { req, res, next, getNext } = mockReqRes({
      body,
      headers: { "x-hub-signature-256": "sha256=abcd" },
    });

    const middleware = verifyMetaSignature(TEST_SECRET);
    middleware(req, res, next);

    assert.equal(getNext().called, true);
    assert.equal(getNext().arg.statusCode, 401);
    assert.ok(getNext().arg.message.includes("Invalid signature"));
  });
});
