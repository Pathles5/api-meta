import { describe, it, before, after, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { stopCleanup } from "../src/middleware/rateLimit.js";

const originalEnv = process.env;
const originalFetch = globalThis.fetch;

let server;
let baseUrl;

const mockSavePost = mock.fn();
const mockGetPost = mock.fn();
const mockSavePosts = mock.fn();
const mockDeletePost = mock.fn();
const mockListPosts = mock.fn();
const mockGetTableName = mock.fn(() => "ig-posts-test");
const mockUpdateVerificationDate = mock.fn(async () => "2026-05-31T00:00:00.000Z");
const mockListPostsNeedingVerification = mock.fn(async () => []);

const mockRepo = {
  savePost: mockSavePost,
  getPost: mockGetPost,
  savePosts: mockSavePosts,
  deletePost: mockDeletePost,
  listPosts: mockListPosts,
  getTableName: mockGetTableName,
  updateVerificationDate: mockUpdateVerificationDate,
  listPostsNeedingVerification: mockListPostsNeedingVerification,
};

function resetMocks() {
  mockGetTableName.mock.mockImplementation(() => "ig-posts-test");

  mockSavePost.mock.mockImplementation(async (post) => ({
    ...post,
    createdAt: "2026-05-31T00:00:00.000Z",
    expiresAt: 1785456000,
  }));

  mockGetPost.mock.mockImplementation(async () => null);

  mockSavePosts.mock.mockImplementation(async (posts) =>
    posts.map((p) => ({
      ...p,
      createdAt: "2026-05-31T00:00:00.000Z",
      expiresAt: 1785456000,
    })),
  );

  mockDeletePost.mock.mockImplementation(async () => {});
  mockUpdateVerificationDate.mock.mockImplementation(
    async () => new Date().toISOString(),
  );
  mockListPostsNeedingVerification.mock.mockImplementation(async () => []);
}

function mockMetaFetch(response) {
  globalThis.fetch = async (url) => {
    if (typeof url === "string" && url.includes("graph.facebook.com")) {
      return {
        json: async () => response,
      };
    }
    return originalFetch(url);
  };
}

async function apiFetch(path, options = {}) {
  return originalFetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "X-API-Key": process.env.AUTH_API_KEY, ...options.headers },
  });
}

before(async () => {
  process.env.META_ACCESS_TOKEN = "test-token";
  process.env.META_IG_USER_ID = "test-ig-user";
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

describe("GET /posts", () => {
  beforeEach(() => {
    process.env.META_ACCESS_TOKEN = "test-token";
    process.env.IG_USER_ID = "test-ig-user";
    process.env.API_KEY = "test-api-key";
    globalThis.fetch = originalFetch;
    resetMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  });

  it("should return list of posts from Meta API and save to DynamoDB", async () => {
    mockMetaFetch({
      data: [
        {
          id: "111",
          caption: "Post 1",
          media_type: "IMAGE",
          media_url: "https://example.com/1.jpg",
          permalink: "https://instagram.com/p/1",
          timestamp: "2026-05-31T10:00:00+0000",
          like_count: 10,
          comments_count: 2,
        },
      ],
      paging: { cursors: { before: "abc", after: "def" } },
    });

    const response = await apiFetch("/posts");
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.data));
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].id, "111");
    assert.ok(body.data[0].createdAt);
    assert.ok(body.data[0].expiresAt);
    assert.ok(body.paging);
    assert.equal(mockSavePosts.mock.callCount(), 1);
  });

  it("should accept limit parameter", async () => {
    mockMetaFetch({ data: [], paging: null });

    const response = await apiFetch("/posts?limit=5");
    assert.equal(response.status, 200);
  });

  it("should return 400 for invalid limit", async () => {
    const response = await apiFetch("/posts?limit=0");
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.ok(body.error.includes("Limit"));
  });

  it("should return 400 for limit > 100", async () => {
    const response = await apiFetch("/posts?limit=101");
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.ok(body.error.includes("Limit"));
  });

  it("should return 500 when META_ACCESS_TOKEN is not set", async () => {
    delete process.env.META_ACCESS_TOKEN;

    const response = await apiFetch("/posts");
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.ok(body.error.includes("META_ACCESS_TOKEN"));
  });

  it("should return 500 when IG_USER_ID is not set", async () => {
    delete process.env.META_IG_USER_ID;

    const response = await apiFetch("/posts");
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.ok(body.error.includes("META_IG_USER_ID"));
  });

  it("should return 401 when API key is missing", async () => {
    const response = await originalFetch(`${baseUrl}/posts`);
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.ok(body.error.includes("API key"));
  });

  it("should return 403 for invalid API key", async () => {
    const response = await originalFetch(`${baseUrl}/posts`, {
      headers: { "X-API-Key": "wrong-key" },
    });
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.ok(body.error.includes("Invalid API key"));
  });
});

describe("GET /posts/:id", () => {
  beforeEach(() => {
    process.env.META_ACCESS_TOKEN = "test-token";
    process.env.IG_USER_ID = "test-ig-user";
    process.env.API_KEY = "test-api-key";
    globalThis.fetch = originalFetch;
    resetMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  });

  it("should return cached post from DynamoDB when recently verified", async () => {
    const recentDate = new Date();
    recentDate.setHours(recentDate.getHours() - 1);

    mockGetPost.mock.mockImplementationOnce(async () => ({
      id: "123456",
      caption: "Cached caption",
      mediaType: "IMAGE",
      createdAt: "2026-05-31T00:00:00.000Z",
      expiresAt: 1785456000,
      lastVerificationDate: recentDate.toISOString(),
    }));

    const response = await apiFetch("/posts/123456");
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.id, "123456");
    assert.equal(body.caption, "Cached caption");
    assert.equal(mockGetPost.mock.callCount(), 1);
  });

  it("should verify stale cached post and delete if removed from Instagram", async () => {
    const oldDate = new Date();
    oldDate.setHours(oldDate.getHours() - 48);

    mockGetPost.mock.mockImplementationOnce(async () => ({
      id: "999",
      caption: "Old post",
      mediaType: "IMAGE",
      createdAt: "2026-05-31T00:00:00.000Z",
      expiresAt: 1785456000,
      lastVerificationDate: oldDate.toISOString(),
    }));

    mockMetaFetch({
      error: { code: 100, message: "Unsupported get request" },
    });

    const response = await apiFetch("/posts/999");
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.ok(body.error.includes("no longer exists"));
    assert.equal(mockDeletePost.mock.callCount(), 1);
  });

  it("should fetch from Meta API when not in cache and save", async () => {
    mockMetaFetch({
      id: "123456",
      caption: "Test caption",
      media_type: "IMAGE",
      media_url: "https://example.com/image.jpg",
      permalink: "https://instagram.com/p/test",
      timestamp: "2026-05-31T10:00:00+0000",
      like_count: 100,
      comments_count: 10,
    });

    const response = await apiFetch("/posts/123456");
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.id, "123456");
    assert.equal(body.mediaType, "IMAGE");
    assert.equal(body.likeCount, 100);
    assert.ok(body.createdAt);
    assert.ok(body.expiresAt);
    assert.equal(mockSavePost.mock.callCount(), 1);
  });

  it("should return 401 for invalid token", async () => {
    mockMetaFetch({
      error: { code: 190, message: "Invalid OAuth access token" },
    });

    const response = await apiFetch("/posts/123456");
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.ok(body.error.includes("access token"));
  });

  it("should return 429 for rate limit", async () => {
    mockMetaFetch({
      error: { code: 4, message: "Application has been rate limited" },
    });

    const response = await apiFetch("/posts/123456");
    const body = await response.json();

    assert.equal(response.status, 429);
    assert.ok(body.error.includes("Rate limit"));
  });

  it("should return 404 for post not found", async () => {
    mockMetaFetch({
      error: { code: 100, message: "Unsupported get request" },
    });

    const response = await apiFetch("/posts/nonexistent");
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.ok(body.error.includes("not found"));
  });

  it("should return 500 when META_ACCESS_TOKEN is not set", async () => {
    delete process.env.META_ACCESS_TOKEN;

    const response = await apiFetch("/posts/123456");
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.ok(body.error.includes("META_ACCESS_TOKEN"));
  });

  it("should return 401 when API key is missing", async () => {
    const response = await originalFetch(`${baseUrl}/posts/123456`);
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.ok(body.error.includes("API key"));
  });

  it("should return 403 for invalid API key", async () => {
    const response = await originalFetch(`${baseUrl}/posts/123456`, {
      headers: { "X-API-Key": "wrong-key" },
    });
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.ok(body.error.includes("Invalid API key"));
  });
});

describe("POST /posts/sync", () => {
  beforeEach(() => {
    process.env.META_ACCESS_TOKEN = "test-token";
    process.env.META_IG_USER_ID = "test-ig-user";
    process.env.AUTH_API_KEY = "test-api-key";
    globalThis.fetch = originalFetch;
    resetMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  });

  it("should sync posts from Meta API to DynamoDB", async () => {
    mockMetaFetch({
      data: [
        {
          id: "111",
          caption: "Post 1",
          media_type: "IMAGE",
          media_url: "https://example.com/1.jpg",
          permalink: "https://instagram.com/p/1",
          timestamp: "2026-05-31T10:00:00+0000",
          like_count: 10,
          comments_count: 2,
        },
      ],
      paging: null,
    });

    const callsBefore = mockSavePosts.mock.callCount();

    const response = await apiFetch("/posts/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.synced, 1);
    assert.ok(Array.isArray(body.data));
    assert.equal(mockSavePosts.mock.callCount(), callsBefore + 1);
  });

  it("should accept limit in request body", async () => {
    mockMetaFetch({ data: [], paging: null });

    const response = await apiFetch("/posts/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 5 }),
    });

    assert.equal(response.status, 200);
  });

  it("should return 401 when API key is missing", async () => {
    const response = await originalFetch(`${baseUrl}/posts/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.ok(body.error.includes("API key"));
  });
});
