import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { authenticate } from "../src/middleware/authenticate.js";

const originalEnv = process.env;

function mockReqRes(headers = {}) {
  const req = { headers };
  let statusCode;
  let body;
  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      body = data;
    },
  };
  let nextCalled = false;
  let nextArg;
  const next = (arg) => {
    nextCalled = true;
    nextArg = arg;
  };
  return { req, res, next, getStatus: () => statusCode, getBody: () => body, getNext: () => ({ called: nextCalled, arg: nextArg }) };
}

afterEach(() => {
  process.env = originalEnv;
});

describe("authenticate", () => {
  it("should call next() with valid API key", () => {
    process.env.AUTH_API_KEY = "valid-key";
    const { req, res, next, getNext } = mockReqRes({ "x-api-key": "valid-key" });

    authenticate(req, res, next);

    assert.equal(getNext().called, true);
    assert.equal(getNext().arg, undefined);
  });

  it("should return 401 when API key is missing", () => {
    process.env.AUTH_API_KEY = "valid-key";
    const { req, res, next, getNext } = mockReqRes({});

    authenticate(req, res, next);

    assert.equal(getNext().called, true);
    assert.equal(getNext().arg.statusCode, 401);
    assert.ok(getNext().arg.message.includes("API key required"));
  });

  it("should return 403 for invalid API key", () => {
    process.env.AUTH_API_KEY = "valid-key";
    const { req, res, next, getNext } = mockReqRes({ "x-api-key": "wrong-key" });

    authenticate(req, res, next);

    assert.equal(getNext().called, true);
    assert.equal(getNext().arg.statusCode, 403);
    assert.ok(getNext().arg.message.includes("Invalid API key"));
  });

  it("should return 500 when AUTH_API_KEY is not configured", () => {
    delete process.env.AUTH_API_KEY;
    const { req, res, next, getNext } = mockReqRes({ "x-api-key": "any-key" });

    authenticate(req, res, next);

    assert.equal(getNext().called, true);
    assert.equal(getNext().arg.statusCode, 500);
    assert.ok(getNext().arg.message.includes("AUTH_API_KEY not configured"));
  });
});
