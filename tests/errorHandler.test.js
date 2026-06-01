import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createError, errorHandler } from "../src/middleware/errorHandler.js";

describe("createError", () => {
  it("should create an error with status code and message", () => {
    const error = createError(404, "Not found");

    assert.equal(error.statusCode, 404);
    assert.equal(error.message, "Not found");
    assert.ok(error instanceof Error);
  });
});

describe("errorHandler", () => {
  it("should handle errors with status code", () => {
    const error = createError(400, "Bad request");
    let capturedStatus;
    let capturedBody;

    const req = {};
    const res = {
      status: (code) => {
        capturedStatus = code;
        return res;
      },
      json: (body) => {
        capturedBody = body;
      },
    };
    const next = () => {};

    errorHandler(error, req, res, next);

    assert.equal(capturedStatus, 400);
    assert.equal(capturedBody.error, "Bad request");
  });

  it("should handle errors without status code (500)", () => {
    const error = new Error("Something broke");
    let capturedStatus;
    let capturedBody;

    const req = {};
    const res = {
      status: (code) => {
        capturedStatus = code;
        return res;
      },
      json: (body) => {
        capturedBody = body;
      },
    };
    const next = () => {};

    errorHandler(error, req, res, next);

    assert.equal(capturedStatus, 500);
    assert.equal(capturedBody.error, "Internal Server Error");
  });
});
