import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createWebhookProcessor } from "../src/services/webhookProcessor.js";

/**
 * Creates a silent logger that captures log calls for assertion.
 */
function createTestLogger() {
  const calls = { info: [], warn: [], error: [] };
  return {
    calls,
    info: (...args) => calls.info.push(args),
    warn: (...args) => calls.warn.push(args),
    error: (...args) => calls.error.push(args),
  };
}

describe("createWebhookProcessor", () => {
  it("should process a valid Instagram event", () => {
    const log = createTestLogger();
    const processor = createWebhookProcessor({ logger: log });

    const payload = {
      object: "instagram",
      entry: [
        {
          id: "ig-user-123",
          time: 1717700000,
          changes: [
            {
              field: "comments",
              value: { id: "comment-1", text: "Hello!", from: { id: "user-1", username: "testuser" } },
            },
          ],
        },
      ],
    };

    const result = processor.processEvent(payload);

    assert.equal(result.processed, 1);
    assert.equal(result.errors, 0);
    assert.equal(log.calls.info.length, 1);
  });

  it("should return processed: 0 for non-instagram object", () => {
    const log = createTestLogger();
    const processor = createWebhookProcessor({ logger: log });

    const payload = {
      object: "unknown",
      entry: [{ id: "123", changes: [] }],
    };

    const result = processor.processEvent(payload);

    assert.equal(result.processed, 0);
    assert.equal(result.errors, 0);
    assert.ok(log.calls.warn.length > 0);
  });

  it("should process multiple entries with multiple changes", () => {
    const log = createTestLogger();
    const processor = createWebhookProcessor({ logger: log });

    const payload = {
      object: "instagram",
      entry: [
        {
          id: "ig-user-1",
          time: 1717700000,
          changes: [
            { field: "comments", value: { id: "c1" } },
            { field: "mentions", value: { id: "m1" } },
          ],
        },
        {
          id: "ig-user-2",
          time: 1717700001,
          changes: [
            { field: "comments", value: { id: "c2" } },
          ],
        },
      ],
    };

    const result = processor.processEvent(payload);

    assert.equal(result.processed, 3);
    assert.equal(result.errors, 0);
    assert.equal(log.calls.info.length, 3);
  });

  it("should skip entries without changes array", () => {
    const log = createTestLogger();
    const processor = createWebhookProcessor({ logger: log });

    const payload = {
      object: "instagram",
      entry: [
        { id: "ig-user-1", time: 1717700000 },
        {
          id: "ig-user-2",
          time: 1717700001,
          changes: [{ field: "comments", value: { id: "c1" } }],
        },
      ],
    };

    const result = processor.processEvent(payload);

    assert.equal(result.processed, 1);
    assert.equal(result.errors, 0);
    assert.ok(log.calls.warn.length > 0);
  });

  it("should return processed: 0 for empty payload", () => {
    const log = createTestLogger();
    const processor = createWebhookProcessor({ logger: log });

    const result = processor.processEvent(null);

    assert.equal(result.processed, 0);
    assert.equal(result.errors, 0);
    assert.ok(log.calls.warn.length > 0);
  });

  it("should return processed: 0 for payload with empty entry array", () => {
    const log = createTestLogger();
    const processor = createWebhookProcessor({ logger: log });

    const payload = {
      object: "instagram",
      entry: [],
    };

    const result = processor.processEvent(payload);

    assert.equal(result.processed, 0);
    assert.equal(result.errors, 0);
  });

  it("should accept 'page' as a valid object type", () => {
    const log = createTestLogger();
    const processor = createWebhookProcessor({ logger: log });

    const payload = {
      object: "page",
      entry: [
        {
          id: "page-123",
          time: 1717700000,
          changes: [{ field: "feed", value: { id: "f1" } }],
        },
      ],
    };

    const result = processor.processEvent(payload);

    assert.equal(result.processed, 1);
    assert.equal(result.errors, 0);
  });
});
