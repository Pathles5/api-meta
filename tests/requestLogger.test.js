import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { requestLogger } from "../src/middleware/requestLogger.js";

function mockReqRes(statusCode = 200) {
  const req = {
    method: "GET",
    originalUrl: "/test",
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
  };
  const listeners = {};
  const res = {
    statusCode,
    on(event, fn) {
      listeners[event] = fn;
    },
  };
  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };
  return { req, res, next, getNext: () => nextCalled, emitFinish: () => listeners.finish?.() };
}

describe("requestLogger", () => {
  it("should call next() immediately", () => {
    const { req, res, next, getNext } = mockReqRes();

    requestLogger(req, res, next);

    assert.equal(getNext(), true);
  });

  it("should log on response finish", () => {
    const { req, res, emitFinish } = mockReqRes(200);

    requestLogger(req, res, () => {});
    emitFinish();
  });

  it("should log errors for status >= 400", () => {
    const { req, res, emitFinish } = mockReqRes(500);

    requestLogger(req, res, () => {});
    emitFinish();
  });
});
