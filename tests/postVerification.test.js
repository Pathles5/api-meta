import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { createPostVerificationService } from "../src/services/postVerification.js";

const originalEnv = process.env;

function createMockRepo(overrides = {}) {
  return {
    getPost: mock.fn(async () => null),
    deletePost: mock.fn(async () => {}),
    updateVerificationDate: mock.fn(async () => new Date().toISOString()),
    listPostsNeedingVerification: mock.fn(async () => []),
    ...overrides,
  };
}

function createMockMetaApi(overrides = {}) {
  return {
    fetchPost: mock.fn(async () => ({
      id: "123",
      caption: "Test",
      mediaType: "IMAGE",
      mediaUrl: "https://example.com/img.jpg",
      permalink: "https://instagram.com/p/test",
      timestamp: "2026-05-31T10:00:00+0000",
      likeCount: 10,
      commentsCount: 2,
    })),
    ...overrides,
  };
}

beforeEach(() => {
  process.env = { ...originalEnv };
  process.env.POST_VERIFICATION_HOURS = "24";
});

describe("postVerification", () => {
  describe("verifyPost", () => {
    it("should verify existing post", async () => {
      const repo = createMockRepo();
      const metaApi = createMockMetaApi();
      const service = createPostVerificationService(repo, metaApi);

      const result = await service.verifyPost("123");

      assert.equal(result.status, "verified");
      assert.ok(result.post);
      assert.equal(repo.updateVerificationDate.mock.callCount(), 1);
    });

    it("should delete post not found on Instagram", async () => {
      const repo = createMockRepo();
      const metaApi = createMockMetaApi({
        fetchPost: mock.fn(async () => {
          const err = new Error("Not found");
          err.statusCode = 404;
          throw err;
        }),
      });
      const service = createPostVerificationService(repo, metaApi);

      const result = await service.verifyPost("456");

      assert.equal(result.status, "deleted");
      assert.equal(result.postId, "456");
      assert.equal(repo.deletePost.mock.callCount(), 1);
    });

    it("should handle rate limit gracefully", async () => {
      const repo = createMockRepo();
      const metaApi = createMockMetaApi({
        fetchPost: mock.fn(async () => {
          const err = new Error("Rate limited");
          err.statusCode = 429;
          throw err;
        }),
      });
      const service = createPostVerificationService(repo, metaApi);

      const result = await service.verifyPost("789");

      assert.equal(result.status, "rate_limited");
      assert.equal(result.postId, "789");
      assert.equal(repo.deletePost.mock.callCount(), 0);
    });

    it("should handle other errors", async () => {
      const repo = createMockRepo();
      const metaApi = createMockMetaApi({
        fetchPost: mock.fn(async () => {
          throw new Error("Network error");
        }),
      });
      const service = createPostVerificationService(repo, metaApi);

      const result = await service.verifyPost("abc");

      assert.equal(result.status, "error");
      assert.equal(result.error, "Network error");
    });
  });

  describe("verifyStalePosts", () => {
    it("should verify all stale posts", async () => {
      const repo = createMockRepo({
        listPostsNeedingVerification: mock.fn(async () => [
          { id: "111" },
          { id: "222" },
        ]),
      });
      const metaApi = createMockMetaApi();
      const service = createPostVerificationService(repo, metaApi);

      const { summary } = await service.verifyStalePosts(10);

      assert.equal(summary.total, 2);
      assert.equal(summary.verified, 2);
      assert.equal(summary.deleted, 0);
    });

    it("should stop on rate limit", async () => {
      let callCount = 0;
      const repo = createMockRepo({
        listPostsNeedingVerification: mock.fn(async () => [
          { id: "111" },
          { id: "222" },
        ]),
      });
      const metaApi = createMockMetaApi({
        fetchPost: mock.fn(async () => {
          callCount++;
          if (callCount === 2) {
            const err = new Error("Rate limited");
            err.statusCode = 429;
            throw err;
          }
          return { id: "test" };
        }),
      });
      const service = createPostVerificationService(repo, metaApi);

      const { summary } = await service.verifyStalePosts(10);

      assert.equal(summary.total, 2);
      assert.equal(summary.verified, 1);
      assert.equal(summary.rateLimited, 1);
    });

    it("should return empty results when no stale posts", async () => {
      const repo = createMockRepo();
      const metaApi = createMockMetaApi();
      const service = createPostVerificationService(repo, metaApi);

      const { summary } = await service.verifyStalePosts();

      assert.equal(summary.total, 0);
      assert.equal(summary.verified, 0);
    });
  });

  describe("needsVerification", () => {
    it("should return true when no lastVerificationDate", () => {
      const repo = createMockRepo();
      const metaApi = createMockMetaApi();
      const service = createPostVerificationService(repo, metaApi);

      const result = service.needsVerification({ id: "123" });

      assert.equal(result, true);
    });

    it("should return true when verification is old", () => {
      const repo = createMockRepo();
      const metaApi = createMockMetaApi();
      const service = createPostVerificationService(repo, metaApi);

      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 48);

      const result = service.needsVerification({
        id: "123",
        lastVerificationDate: oldDate.toISOString(),
      });

      assert.equal(result, true);
    });

    it("should return false when recently verified", () => {
      const repo = createMockRepo();
      const metaApi = createMockMetaApi();
      const service = createPostVerificationService(repo, metaApi);

      const recentDate = new Date();
      recentDate.setHours(recentDate.getHours() - 1);

      const result = service.needsVerification({
        id: "123",
        lastVerificationDate: recentDate.toISOString(),
      });

      assert.equal(result, false);
    });
  });
});
