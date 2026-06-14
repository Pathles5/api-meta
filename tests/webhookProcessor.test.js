import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createWebhookProcessor, extractPostId } from "../src/services/webhookProcessor.js";

function createTestLogger() {
  const calls = { info: [], warn: [], error: [], debug: [] };
  return {
    calls,
    info: (...args) => calls.info.push(args),
    warn: (...args) => calls.warn.push(args),
    error: (...args) => calls.error.push(args),
    debug: (...args) => calls.debug.push(args),
  };
}

function createMockRepo(options = {}) {
  const posts = new Map();
  const savedPosts = [];
  const priceUpdates = [];
  return {
    posts, savedPosts, priceUpdates,
    async getPost(id) {
      if (options.getPostThrows) throw new Error("DynamoDB error");
      return posts.get(id) || null;
    },
    async savePost(post) {
      if (options.savePostThrows) throw new Error("Save failed");
      savedPosts.push(post);
      posts.set(post.id, post);
      return post;
    },
    async updatePostPrice(id, priceData) {
      if (options.updatePriceThrows) throw new Error("Update failed");
      priceUpdates.push({ id, priceData });
      return priceData;
    },
  };
}

function createMockMetaApi(options = {}) {
  return {
    async fetchPost(postId) {
      if (options.fetchPostThrows) {
        const err = new Error(options.errorMessage || "Fetch failed");
        err.statusCode = options.errorStatusCode || 500;
        throw err;
      }
      if (options.fetchPost404) {
        const err = new Error("Post not found");
        err.statusCode = 404;
        throw err;
      }
      if (options.fetchPost429) {
        const err = new Error("Rate limit");
        err.statusCode = 429;
        throw err;
      }
      return {
        id: postId,
        caption: options.caption !== undefined ? options.caption : "Vendo iPhone por 500 euros",
        mediaType: "IMAGE",
        mediaUrl: "https://example.com/img.jpg",
        permalink: "https://instagram.com/p/" + postId,
        thumbnailUrl: null,
        timestamp: "2026-06-14T10:00:00+0000",
        likeCount: 10,
        commentsCount: 5,
      };
    },
  };
}

function createMockPriceExtractor(options = {}) {
  return {
    async extractPrice(_caption) {
      if (options.extractThrows) throw new Error("Grok error");
      return options.result || { price: 500, currency: "EUR", confidence: 0.95 };
    },
  };
}

describe("extractPostId", () => {
  it("should extract post ID from comments field", () => {
    const change = { field: "comments", value: { id: "c1", media: { id: "post-123" } } };
    assert.equal(extractPostId(change), "post-123");
  });

  it("should extract post ID from mentions field", () => {
    const change = { field: "mentions", value: { id: "m1", media: { id: "post-456" } } };
    assert.equal(extractPostId(change), "post-456");
  });

  it("should return null for reactions field", () => {
    const change = { field: "reactions", value: { id: "r1", comment_id: "c1" } };
    assert.equal(extractPostId(change), null);
  });

  it("should return null for unknown field", () => {
    const change = { field: "unknown", value: { media: { id: "post-789" } } };
    assert.equal(extractPostId(change), null);
  });

  it("should return null when value has no media.id", () => {
    const change = { field: "comments", value: { id: "c1" } };
    assert.equal(extractPostId(change), null);
  });

  it("should return null when value is null", () => {
    const change = { field: "comments", value: null };
    assert.equal(extractPostId(change), null);
  });

  it("should return null when value is not an object", () => {
    const change = { field: "comments", value: "string" };
    assert.equal(extractPostId(change), null);
  });
});

describe("createWebhookProcessor", () => {
  describe("basic validation (no DI)", () => {
    it("should process a valid Instagram event", async () => {
      const log = createTestLogger();
      const processor = createWebhookProcessor({ logger: log });
      const payload = {
        object: "instagram",
        entry: [{ id: "ig-user-123", time: 1717700000, changes: [{ field: "comments", value: { id: "comment-1", text: "Hello!", from: { id: "user-1" } } }] }],
      };
      const result = await processor.processEvent(payload);
      assert.equal(result.processed, 1);
      assert.equal(result.errors, 0);
    });

    it("should return processed: 0 for non-instagram object", async () => {
      const log = createTestLogger();
      const processor = createWebhookProcessor({ logger: log });
      const payload = { object: "unknown", entry: [{ id: "123", changes: [] }] };
      const result = await processor.processEvent(payload);
      assert.equal(result.processed, 0);
      assert.equal(result.errors, 0);
    });

    it("should process multiple entries with multiple changes", async () => {
      const log = createTestLogger();
      const processor = createWebhookProcessor({ logger: log });
      const payload = {
        object: "instagram",
        entry: [
          { id: "ig-user-1", time: 1717700000, changes: [{ field: "comments", value: { id: "c1" } }, { field: "mentions", value: { id: "m1" } }] },
          { id: "ig-user-2", time: 1717700001, changes: [{ field: "comments", value: { id: "c2" } }] },
        ],
      };
      const result = await processor.processEvent(payload);
      assert.equal(result.processed, 3);
      assert.equal(result.errors, 0);
    });

    it("should skip entries without changes array", async () => {
      const log = createTestLogger();
      const processor = createWebhookProcessor({ logger: log });
      const payload = {
        object: "instagram",
        entry: [
          { id: "ig-user-1", time: 1717700000 },
          { id: "ig-user-2", time: 1717700001, changes: [{ field: "comments", value: { id: "c1" } }] },
        ],
      };
      const result = await processor.processEvent(payload);
      assert.equal(result.processed, 1);
      assert.equal(result.errors, 0);
    });

    it("should return processed: 0 for empty payload", async () => {
      const log = createTestLogger();
      const processor = createWebhookProcessor({ logger: log });
      const result = await processor.processEvent(null);
      assert.equal(result.processed, 0);
      assert.equal(result.errors, 0);
    });

    it("should return processed: 0 for payload with empty entry array", async () => {
      const log = createTestLogger();
      const processor = createWebhookProcessor({ logger: log });
      const payload = { object: "instagram", entry: [] };
      const result = await processor.processEvent(payload);
      assert.equal(result.processed, 0);
      assert.equal(result.errors, 0);
    });

    it("should accept page as a valid object type", async () => {
      const log = createTestLogger();
      const processor = createWebhookProcessor({ logger: log });
      const payload = { object: "page", entry: [{ id: "page-123", time: 1717700000, changes: [{ field: "feed", value: { id: "f1" } }] }] };
      const result = await processor.processEvent(payload);
      assert.equal(result.processed, 1);
      assert.equal(result.errors, 0);
    });
  });

  describe("post event handling with DI", () => {
    it("should fetch and save post when it does not exist in DB", async () => {
      const log = createTestLogger();
      const repo = createMockRepo();
      const metaApi = createMockMetaApi({ caption: "Vendo iPhone por 500 euros" });
      const priceExtractor = createMockPriceExtractor({ result: { price: 500, currency: "EUR", confidence: 0.95 } });
      const processor = createWebhookProcessor({ logger: log, repo, metaApi, priceExtractor });
      const payload = {
        object: "instagram",
        entry: [{ id: "ig-user-1", time: 1717700000, changes: [{ field: "comments", value: { id: "c1", media: { id: "post-123" } } }] }],
      };
      const result = await processor.processEvent(payload);
      assert.equal(result.processed, 1);
      assert.equal(result.errors, 0);
      assert.equal(repo.savedPosts.length, 1);
      assert.equal(repo.savedPosts[0].id, "post-123");
      assert.equal(repo.savedPosts[0].source, "webhook");
      assert.equal(repo.savedPosts[0].webhookReceived, true);
      assert.equal(repo.priceUpdates.length, 1);
      assert.equal(repo.priceUpdates[0].priceData.price, 500);
    });

    it("should skip fetching when post already exists in DB", async () => {
      const log = createTestLogger();
      const repo = createMockRepo();
      repo.posts.set("post-123", { id: "post-123", caption: "Vendo algo por 200 euros", timestamp: "2026-06-14T10:00:00+0000" });
      const metaApi = createMockMetaApi();
      const priceExtractor = createMockPriceExtractor({ result: { price: 200, currency: "EUR", confidence: 0.9 } });
      const processor = createWebhookProcessor({ logger: log, repo, metaApi, priceExtractor });
      const payload = {
        object: "instagram",
        entry: [{ id: "ig-user-1", time: 1717700000, changes: [{ field: "comments", value: { id: "c1", media: { id: "post-123" } } }] }],
      };
      const result = await processor.processEvent(payload);
      assert.equal(result.processed, 1);
      assert.equal(repo.savedPosts.length, 0);
      assert.equal(repo.priceUpdates.length, 1);
    });

    it("should handle Meta API 404 gracefully", async () => {
      const log = createTestLogger();
      const repo = createMockRepo();
      const metaApi = createMockMetaApi({ fetchPost404: true });
      const priceExtractor = createMockPriceExtractor();
      const processor = createWebhookProcessor({ logger: log, repo, metaApi, priceExtractor });
      const payload = {
        object: "instagram",
        entry: [{ id: "ig-user-1", time: 1717700000, changes: [{ field: "comments", value: { id: "c1", media: { id: "deleted-post" } } }] }],
      };
      const result = await processor.processEvent(payload);
      assert.equal(result.processed, 1);
      assert.equal(result.errors, 0);
      assert.equal(repo.savedPosts.length, 0);
    });

    it("should handle Meta API 429 gracefully", async () => {
      const log = createTestLogger();
      const repo = createMockRepo();
      const metaApi = createMockMetaApi({ fetchPost429: true });
      const priceExtractor = createMockPriceExtractor();
      const processor = createWebhookProcessor({ logger: log, repo, metaApi, priceExtractor });
      const payload = {
        object: "instagram",
        entry: [{ id: "ig-user-1", time: 1717700000, changes: [{ field: "comments", value: { id: "c1", media: { id: "post-123" } } }] }],
      };
      const result = await processor.processEvent(payload);
      assert.equal(result.processed, 1);
      assert.equal(repo.savedPosts.length, 0);
    });

    it("should skip price update when no price is found", async () => {
      const log = createTestLogger();
      const repo = createMockRepo();
      const metaApi = createMockMetaApi({ caption: "Miren lo que encontre hoy" });
      const priceExtractor = createMockPriceExtractor({ result: { price: null, currency: null, confidence: 0 } });
      const processor = createWebhookProcessor({ logger: log, repo, metaApi, priceExtractor });
      const payload = {
        object: "instagram",
        entry: [{ id: "ig-user-1", time: 1717700000, changes: [{ field: "comments", value: { id: "c1", media: { id: "post-123" } } }] }],
      };
      const result = await processor.processEvent(payload);
      assert.equal(result.processed, 1);
      assert.equal(repo.priceUpdates.length, 0);
    });

    it("should skip price extraction when post has no caption", async () => {
      const log = createTestLogger();
      const repo = createMockRepo();
      const metaApi = createMockMetaApi({ caption: null });
      const priceExtractor = createMockPriceExtractor();
      const processor = createWebhookProcessor({ logger: log, repo, metaApi, priceExtractor });
      const payload = {
        object: "instagram",
        entry: [{ id: "ig-user-1", time: 1717700000, changes: [{ field: "comments", value: { id: "c1", media: { id: "post-123" } } }] }],
      };
      const result = await processor.processEvent(payload);
      assert.equal(result.processed, 1);
      assert.equal(repo.priceUpdates.length, 0);
    });

    it("should handle price extractor errors gracefully", async () => {
      const log = createTestLogger();
      const repo = createMockRepo();
      const metaApi = createMockMetaApi();
      const priceExtractor = createMockPriceExtractor({ extractThrows: true });
      const processor = createWebhookProcessor({ logger: log, repo, metaApi, priceExtractor });
      const payload = {
        object: "instagram",
        entry: [{ id: "ig-user-1", time: 1717700000, changes: [{ field: "comments", value: { id: "c1", media: { id: "post-123" } } }] }],
      };
      const result = await processor.processEvent(payload);
      assert.equal(result.processed, 1);
      assert.equal(result.errors, 0);
    });

    it("should handle repo.getPost errors gracefully", async () => {
      const log = createTestLogger();
      const repo = createMockRepo({ getPostThrows: true });
      const metaApi = createMockMetaApi();
      const priceExtractor = createMockPriceExtractor();
      const processor = createWebhookProcessor({ logger: log, repo, metaApi, priceExtractor });
      const payload = {
        object: "instagram",
        entry: [{ id: "ig-user-1", time: 1717700000, changes: [{ field: "comments", value: { id: "c1", media: { id: "post-123" } } }] }],
      };
      const result = await processor.processEvent(payload);
      assert.equal(result.processed, 1);
      assert.equal(result.errors, 0);
    });

    it("should not call priceExtractor when not provided", async () => {
      const log = createTestLogger();
      const repo = createMockRepo();
      const metaApi = createMockMetaApi();
      const processor = createWebhookProcessor({ logger: log, repo, metaApi });
      const payload = {
        object: "instagram",
        entry: [{ id: "ig-user-1", time: 1717700000, changes: [{ field: "comments", value: { id: "c1", media: { id: "post-123" } } }] }],
      };
      const result = await processor.processEvent(payload);
      assert.equal(result.processed, 1);
      assert.equal(repo.savedPosts.length, 1);
      assert.equal(repo.priceUpdates.length, 0);
    });

    it("should skip post handling for reactions (no post ID)", async () => {
      const log = createTestLogger();
      const repo = createMockRepo();
      const metaApi = createMockMetaApi();
      const priceExtractor = createMockPriceExtractor();
      const processor = createWebhookProcessor({ logger: log, repo, metaApi, priceExtractor });
      const payload = {
        object: "instagram",
        entry: [{ id: "ig-user-1", time: 1717700000, changes: [{ field: "reactions", value: { id: "r1", reaction: "like", comment_id: "c1" } }] }],
      };
      const result = await processor.processEvent(payload);
      assert.equal(result.processed, 1);
      assert.equal(repo.savedPosts.length, 0);
      assert.equal(repo.priceUpdates.length, 0);
    });

    it("should handle multiple changes with different post IDs", async () => {
      const log = createTestLogger();
      const repo = createMockRepo();
      const metaApi = createMockMetaApi();
      const priceExtractor = createMockPriceExtractor({ result: { price: 100, currency: "USD", confidence: 0.8 } });
      const processor = createWebhookProcessor({ logger: log, repo, metaApi, priceExtractor });
      const payload = {
        object: "instagram",
        entry: [{ id: "ig-user-1", time: 1717700000, changes: [{ field: "comments", value: { id: "c1", media: { id: "post-A" } } }, { field: "mentions", value: { id: "m1", media: { id: "post-B" } } }] }],
      };
      const result = await processor.processEvent(payload);
      assert.equal(result.processed, 2);
      assert.equal(repo.savedPosts.length, 2);
      assert.equal(repo.priceUpdates.length, 2);
    });
  });
});
