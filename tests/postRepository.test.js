import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { createPostRepository } from "../src/repositories/postRepository.js";

let mockSend;
let repo;

const samplePost = {
  id: "123456",
  caption: "Test caption",
  mediaType: "IMAGE",
  mediaUrl: "https://example.com/image.jpg",
  permalink: "https://instagram.com/p/test",
  timestamp: "2026-05-31T10:00:00+0000",
  likeCount: 100,
  commentsCount: 10,
};

beforeEach(() => {
  mockSend = mock.fn();
  repo = createPostRepository(
    { send: mockSend },
    { tableName: "ig-posts-test", ttlDays: 30 },
  );
});

describe("postRepository", () => {
  describe("savePost", () => {
    it("should save post to DynamoDB", async () => {
      mockSend.mock.mockImplementationOnce(async () => ({}));

      const result = await repo.savePost(samplePost);

      assert.equal(mockSend.mock.callCount(), 1);
      assert.equal(result.id, "123456");
      assert.ok(result.createdAt);
      assert.ok(result.expiresAt);
    });

    it("should include all post fields", async () => {
      mockSend.mock.mockImplementationOnce(async () => ({}));

      const result = await repo.savePost(samplePost);

      assert.equal(result.caption, "Test caption");
      assert.equal(result.mediaType, "IMAGE");
      assert.equal(result.likeCount, 100);
    });

    it("should set expiresAt 30 days from now", async () => {
      mockSend.mock.mockImplementationOnce(async () => ({}));

      const result = await repo.savePost(samplePost);

      const now = Math.floor(Date.now() / 1000);
      const thirtyDays = 30 * 24 * 60 * 60;
      assert.ok(result.expiresAt > now);
      assert.ok(result.expiresAt <= now + thirtyDays + 1);
    });
  });

  describe("getPost", () => {
    it("should return post when found", async () => {
      mockSend.mock.mockImplementationOnce(async () => ({
        Item: samplePost,
      }));

      const result = await repo.getPost("123456");

      assert.equal(mockSend.mock.callCount(), 1);
      assert.equal(result.id, "123456");
    });

    it("should return null when not found", async () => {
      mockSend.mock.mockImplementationOnce(async () => ({
        Item: undefined,
      }));

      const result = await repo.getPost("nonexistent");

      assert.equal(result, null);
    });
  });

  describe("listPosts", () => {
    it("should return list of posts", async () => {
      mockSend.mock.mockImplementationOnce(async () => ({
        Items: [samplePost],
      }));

      const result = await repo.listPosts(10);

      assert.equal(mockSend.mock.callCount(), 1);
      assert.ok(Array.isArray(result));
      assert.equal(result.length, 1);
    });

    it("should return empty array when no items", async () => {
      mockSend.mock.mockImplementationOnce(async () => ({
        Items: undefined,
      }));

      const result = await repo.listPosts();

      assert.ok(Array.isArray(result));
      assert.equal(result.length, 0);
    });
  });

  describe("deletePost", () => {
    it("should delete post from DynamoDB", async () => {
      mockSend.mock.mockImplementationOnce(async () => ({}));

      await repo.deletePost("123456");

      assert.equal(mockSend.mock.callCount(), 1);
    });
  });

  describe("savePosts", () => {
    it("should save multiple posts", async () => {
      mockSend.mock.mockImplementation(async () => ({}));

      const posts = [samplePost, { ...samplePost, id: "789" }];
      const result = await repo.savePosts(posts);

      assert.equal(mockSend.mock.callCount(), 1);
      assert.equal(result.length, 2);
    });
  });

  describe("getTableName", () => {
    it("should return configured table name", () => {
      const name = repo.getTableName();
      assert.equal(name, "ig-posts-test");
    });
  });

  describe("updateVerificationDate", () => {
    it("should update lastVerificationDate", async () => {
      mockSend.mock.mockImplementationOnce(async () => ({}));

      const result = await repo.updateVerificationDate("123456");

      assert.equal(mockSend.mock.callCount(), 1);
      assert.ok(result);
      assert.ok(typeof result === "string");
    });
  });

  describe("listPostsNeedingVerification", () => {
    it("should return posts needing verification", async () => {
      mockSend.mock.mockImplementationOnce(async () => ({
        Items: [samplePost],
      }));

      const result = await repo.listPostsNeedingVerification(24, 10);

      assert.equal(mockSend.mock.callCount(), 1);
      assert.ok(Array.isArray(result));
      assert.equal(result.length, 1);
    });

    it("should return empty array when all posts verified", async () => {
      mockSend.mock.mockImplementationOnce(async () => ({
        Items: [],
      }));

      const result = await repo.listPostsNeedingVerification();

      assert.ok(Array.isArray(result));
      assert.equal(result.length, 0);
    });
  });
});
