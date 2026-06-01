import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateBody } from "../src/middleware/validate.js";

describe("validateBody", () => {
  it("should pass validation for valid body", () => {
    const schema = {
      name: { required: true, type: "string" },
    };
    const middleware = validateBody(schema);

    const req = { body: { name: "test" } };
    let called = false;
    const res = {};
    const next = () => {
      called = true;
    };

    middleware(req, res, next);

    assert.ok(called);
  });

  it("should fail validation for missing required field", () => {
    const schema = {
      name: { required: true, type: "string" },
    };
    const middleware = validateBody(schema);

    const req = { body: {} };
    let capturedError;
    const res = {};
    const next = (err) => {
      capturedError = err;
    };

    middleware(req, res, next);

    assert.ok(capturedError);
    assert.equal(capturedError.statusCode, 400);
    assert.ok(capturedError.message.includes("name is required"));
  });

  it("should fail validation for wrong type", () => {
    const schema = {
      count: { required: true, type: "number" },
    };
    const middleware = validateBody(schema);

    const req = { body: { count: "not a number" } };
    let capturedError;
    const res = {};
    const next = (err) => {
      capturedError = err;
    };

    middleware(req, res, next);

    assert.ok(capturedError);
    assert.equal(capturedError.statusCode, 400);
    assert.ok(capturedError.message.includes("must be of type number"));
  });

  it("should fail validation for string too short", () => {
    const schema = {
      name: { required: true, type: "string", minLength: 3 },
    };
    const middleware = validateBody(schema);

    const req = { body: { name: "ab" } };
    let capturedError;
    const res = {};
    const next = (err) => {
      capturedError = err;
    };

    middleware(req, res, next);

    assert.ok(capturedError);
    assert.equal(capturedError.statusCode, 400);
    assert.ok(capturedError.message.includes("at least 3 characters"));
  });

  it("should pass validation when optional field is missing", () => {
    const schema = {
      name: { required: true, type: "string" },
      email: { type: "string" },
    };
    const middleware = validateBody(schema);

    const req = { body: { name: "test" } };
    let called = false;
    const res = {};
    const next = () => {
      called = true;
    };

    middleware(req, res, next);

    assert.ok(called);
  });
});
