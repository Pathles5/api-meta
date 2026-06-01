import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

const originalEnv = process.env;

describe("MetaApi Service", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  });

  const originalFetch = globalThis.fetch;

  it("should throw error when META_ACCESS_TOKEN is not set", async () => {
    delete process.env.META_ACCESS_TOKEN;
    process.env.META_IG_USER_ID = "test-ig-user";

    const { fetchPost } = await import("../src/services/metaApi.js");

    await assert.rejects(
      () => fetchPost("test-id"),
      (error) => {
        assert.equal(error.statusCode, 500);
        assert.ok(error.message.includes("META_ACCESS_TOKEN"));
        return true;
      }
    );
  });

  it("should throw error when META_IG_USER_ID is not set", async () => {
    process.env.META_ACCESS_TOKEN = "test-token";
    delete process.env.META_IG_USER_ID;

    const { fetchPosts } = await import("../src/services/metaApi.js");

    await assert.rejects(
      () => fetchPosts(),
      (error) => {
        assert.equal(error.statusCode, 500);
        assert.ok(error.message.includes("META_IG_USER_ID"));
        return true;
      }
    );
  });

  it("should fetch post successfully", async () => {
    process.env.META_ACCESS_TOKEN = "test-token";
    process.env.META_IG_USER_ID = "test-ig-user";

    const mockResponse = {
      id: "123456",
      caption: "Test caption",
      media_type: "IMAGE",
      media_url: "https://example.com/image.jpg",
      permalink: "https://instagram.com/p/test",
      timestamp: "2026-05-31T10:00:00+0000",
      like_count: 100,
      comments_count: 10,
    };

    globalThis.fetch = async () => ({
      json: async () => mockResponse,
    });

    const { fetchPost } = await import("../src/services/metaApi.js");
    const post = await fetchPost("123456");

    assert.equal(post.id, "123456");
    assert.equal(post.caption, "Test caption");
    assert.equal(post.mediaType, "IMAGE");
    assert.equal(post.likeCount, 100);
    assert.equal(post.commentsCount, 10);
  });

  it("should fetch posts list successfully", async () => {
    process.env.META_ACCESS_TOKEN = "test-token";
    process.env.META_IG_USER_ID = "test-ig-user";

    const mockResponse = {
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
        {
          id: "222",
          caption: "Post 2",
          media_type: "VIDEO",
          media_url: "https://example.com/2.mp4",
          permalink: "https://instagram.com/p/2",
          timestamp: "2026-05-30T10:00:00+0000",
          like_count: 20,
          comments_count: 5,
        },
      ],
      paging: { cursors: { before: "abc", after: "def" } },
    };

    globalThis.fetch = async () => ({
      json: async () => mockResponse,
    });

    const { fetchPosts } = await import("../src/services/metaApi.js");
    const result = await fetchPosts(10);

    assert.equal(result.data.length, 2);
    assert.equal(result.data[0].id, "111");
    assert.equal(result.data[1].id, "222");
    assert.ok(result.paging);
  });

  it("should handle Meta API error code 190 (invalid token)", async () => {
    process.env.META_ACCESS_TOKEN = "invalid-token";
    process.env.META_IG_USER_ID = "test-ig-user";

    globalThis.fetch = async () => ({
      json: async () => ({
        error: {
          code: 190,
          message: "Invalid OAuth access token",
        },
      }),
    });

    const { fetchPost } = await import("../src/services/metaApi.js");

    await assert.rejects(
      () => fetchPost("123456"),
      (error) => {
        assert.equal(error.statusCode, 401);
        assert.ok(error.message.includes("access token"));
        return true;
      }
    );
  });

  it("should handle Meta API rate limit error (code 4)", async () => {
    process.env.META_ACCESS_TOKEN = "test-token";
    process.env.META_IG_USER_ID = "test-ig-user";

    globalThis.fetch = async () => ({
      json: async () => ({
        error: {
          code: 4,
          message: "Application has been rate limited",
        },
      }),
    });

    const { fetchPost } = await import("../src/services/metaApi.js");

    await assert.rejects(
      () => fetchPost("123456"),
      (error) => {
        assert.equal(error.statusCode, 429);
        assert.ok(error.message.includes("Rate limit"));
        return true;
      }
    );
  });

  it("should handle post not found (code 100)", async () => {
    process.env.META_ACCESS_TOKEN = "test-token";
    process.env.META_IG_USER_ID = "test-ig-user";

    globalThis.fetch = async () => ({
      json: async () => ({
        error: {
          code: 100,
          message: "Unsupported get request",
        },
      }),
    });

    const { fetchPost } = await import("../src/services/metaApi.js");

    await assert.rejects(
      () => fetchPost("nonexistent"),
      (error) => {
        assert.equal(error.statusCode, 404);
        assert.ok(error.message.includes("not found"));
        return true;
      }
    );
  });
});
