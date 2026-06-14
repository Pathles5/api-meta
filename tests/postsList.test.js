import { describe, it, before, after, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { stopCleanup } from "../src/middleware/rateLimit.js";

const originalEnv = process.env;
const originalFetch = globalThis.fetch;

let server;
let baseUrl;

const mockListPosts = mock.fn();
const mockGetTableName = mock.fn(() => "ig-posts-test");

const mockRepo = {
  listPosts: mockListPosts,
  getTableName: mockGetTableName,
  // Stubs for other repo methods (not used by /list but required by router setup)
  savePost: mock.fn(async (p) => p),
  getPost: mock.fn(async () => null),
  savePosts: mock.fn(async (p) => p),
  deletePost: mock.fn(async () => {}),
  updateVerificationDate: mock.fn(async () => new Date().toISOString()),
  listPostsNeedingVerification: mock.fn(async () => []),
};

function resetMocks() {
  mockGetTableName.mock.mockImplementation(() => "ig-posts-test");
  mockListPosts.mock.resetCalls();
}

async function apiFetch(path, options = {}) {
  return originalFetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "X-API-Key": process.env.AUTH_API_KEY, ...options.headers },
  });
}

before(async () => {
  process.env.AUTH_API_KEY = "test-api-key";

  resetMocks();

  const express = await import("express");
  const { createPostsRouter } = await import("../src/routes/posts.js");
  const { healthRouter } = await import("../src/routes/health.js");
  const { errorHandler } = await import("../src/middleware/errorHandler.js");
  const { cors } = await import("../src/middleware/cors.js");
  const { rateLimit } = await import("../src/middleware/rateLimit.js");
  const { requestLogger } = await import("../src/middleware/requestLogger.js");
  const { authenticate } = await import("../src/middleware/authenticate.js");

  const testApp = express.default();
  testApp.use(cors());
  testApp.use(rateLimit());
  testApp.use(express.default.json());
  testApp.use(requestLogger);
  testApp.use(healthRouter);
  testApp.use("/posts", authenticate, createPostsRouter(mockRepo));
  testApp.use(errorHandler);

  await new Promise((resolve) => {
    server = testApp.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  process.env = originalEnv;
  globalThis.fetch = originalFetch;
  stopCleanup();
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

describe("GET /posts/list", () => {
  beforeEach(() => {
    process.env.AUTH_API_KEY = "test-api-key";
    resetMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return posts from DynamoDB with default limit", async () => {
    const samplePosts = [
      { id: "1", caption: "Post 1", mediaType: "IMAGE" },
      { id: "2", caption: "Post 2", mediaType: "VIDEO" },
    ];

    mockListPosts.mock.mockImplementationOnce(async () => ({
      items: samplePosts,
      nextCursor: null,
    }));

    const response = await apiFetch("/posts/list");
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.data));
    assert.equal(body.data.length, 2);
    assert.equal(body.data[0].id, "1");
    assert.equal(body.data[1].id, "2");
    assert.equal(body.paging.nextCursor, null);
    assert.equal(mockListPosts.mock.callCount(), 1);

    // Verify default limit of 20 was passed
    const callArgs = mockListPosts.mock.calls[0].arguments;
    assert.equal(callArgs[0], 20);
    assert.equal(callArgs[1], null);
  });

  it("should accept custom limit parameter", async () => {
    mockListPosts.mock.mockImplementationOnce(async () => ({
      items: [{ id: "1" }],
      nextCursor: null,
    }));

    const response = await apiFetch("/posts/list?limit=5");
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.length, 1);

    const callArgs = mockListPosts.mock.calls[0].arguments;
    assert.equal(callArgs[0], 5);
  });

  it("should accept cursor parameter for pagination", async () => {
    const cursor = Buffer.from(JSON.stringify({ id: "100", timestamp: "2026-01-01" })).toString("base64");

    mockListPosts.mock.mockImplementationOnce(async () => ({
      items: [{ id: "101" }],
      nextCursor: null,
    }));

    const response = await apiFetch(`/posts/list?limit=10&cursor=${encodeURIComponent(cursor)}`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.length, 1);

    const callArgs = mockListPosts.mock.calls[0].arguments;
    assert.equal(callArgs[0], 10);
    assert.equal(callArgs[1], cursor);
  });

  it("should return nextCursor when more pages exist", async () => {
    const nextCursorValue = Buffer.from(JSON.stringify({ id: "50", timestamp: "2026-03-01" })).toString("base64");

    mockListPosts.mock.mockImplementationOnce(async () => ({
      items: [{ id: "51" }, { id: "50" }],
      nextCursor: nextCursorValue,
    }));

    const response = await apiFetch("/posts/list?limit=2");
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.length, 2);
    assert.equal(body.paging.nextCursor, nextCursorValue);
  });

  it("should return empty data array when no posts", async () => {
    mockListPosts.mock.mockImplementationOnce(async () => ({
      items: [],
      nextCursor: null,
    }));

    const response = await apiFetch("/posts/list");
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.data));
    assert.equal(body.data.length, 0);
    assert.equal(body.paging.nextCursor, null);
  });

  it("should return 400 for limit = 0", async () => {
    const response = await apiFetch("/posts/list?limit=0");
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.ok(body.error.includes("Limit"));
  });

  it("should return 400 for limit > 100", async () => {
    const response = await apiFetch("/posts/list?limit=101");
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.ok(body.error.includes("Limit"));
  });

  it("should return 400 for non-numeric limit", async () => {
    const response = await apiFetch("/posts/list?limit=abc");
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.ok(body.error.includes("Limit"));
  });

  it("should return 401 when API key is missing", async () => {
    const response = await originalFetch(`${baseUrl}/posts/list`);
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.ok(body.error.includes("API key"));
  });

  it("should return 403 for invalid API key", async () => {
    const response = await originalFetch(`${baseUrl}/posts/list`, {
      headers: { "X-API-Key": "wrong-key" },
    });
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.ok(body.error.includes("Invalid API key"));
  });

  it("should return 500 when repository throws", async () => {
    mockListPosts.mock.mockImplementationOnce(async () => {
      throw new Error("DynamoDB connection failed");
    });

    const response = await apiFetch("/posts/list");
    const body = await response.json();

    assert.equal(response.status, 500);
  });
});
