import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cors } from "../src/middleware/cors.js";

function mockReqRes(method = "GET") {
  const req = { method };
  const headers = {};
  const res = {
    setHeader(name, value) {
      headers[name] = value;
    },
    sendStatus(code) {
      headers._status = code;
    },
  };
  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };
  return { req, res, next, getHeaders: () => headers, getNext: () => nextCalled };
}

describe("cors", () => {
  it("should set CORS headers for normal request", () => {
    const { req, res, next, getHeaders, getNext } = mockReqRes("GET");
    const middleware = cors();

    middleware(req, res, next);

    assert.equal(getNext(), true);
    assert.equal(getHeaders()["Access-Control-Allow-Origin"], "*");
    assert.equal(getHeaders()["Access-Control-Allow-Methods"], "GET, POST, PUT, DELETE, OPTIONS");
    assert.ok(getHeaders()["Access-Control-Allow-Headers"].includes("X-API-Key"));
  });

  it("should return 204 for OPTIONS preflight", () => {
    const { req, res, next, getHeaders, getNext } = mockReqRes("OPTIONS");
    const middleware = cors();

    middleware(req, res, next);

    assert.equal(getNext(), false);
    assert.equal(getHeaders()["_status"], 204);
  });

  it("should allow custom origin", () => {
    const { req, res, next, getHeaders, getNext } = mockReqRes("GET");
    const middleware = cors({ origin: "https://example.com" });

    middleware(req, res, next);

    assert.equal(getNext(), true);
    assert.equal(getHeaders()["Access-Control-Allow-Origin"], "https://example.com");
  });
});
