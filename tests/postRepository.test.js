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
      // getPost ahora usa QueryCommand (devuelve Items, no Item)
      mockSend.mock.mockImplementationOnce(async () => ({
        Items: [samplePost],
      }));

      const result = await repo.getPost("123456");

      assert.equal(mockSend.mock.callCount(), 1);
      assert.equal(result.id, "123456");
    });

    it("should return null when not found", async () => {
      // QueryCommand devuelve Items vacío cuando no encuentra nada
      mockSend.mock.mockImplementationOnce(async () => ({
        Items: [],
      }));

      const result = await repo.getPost("nonexistent");

      assert.equal(result, null);
    });
  });

  describe("listPosts", () => {
    it("should return list of posts with pagination info", async () => {
      mockSend.mock.mockImplementationOnce(async () => ({
        Items: [samplePost],
      }));

      const result = await repo.listPosts(10);

      assert.equal(mockSend.mock.callCount(), 1);
      assert.ok(Array.isArray(result.items));
      assert.equal(result.items.length, 1);
      assert.equal(result.nextCursor, null);
    });

    it("should return empty items when no results", async () => {
      mockSend.mock.mockImplementationOnce(async () => ({
        Items: undefined,
      }));

      const result = await repo.listPosts();

      assert.ok(Array.isArray(result.items));
      assert.equal(result.items.length, 0);
      assert.equal(result.nextCursor, null);
    });

    it("should return nextCursor when LastEvaluatedKey is present", async () => {
      const lastKey = { id: "123", timestamp: "2026-01-01T00:00:00.000Z" };
      mockSend.mock.mockImplementationOnce(async () => ({
        Items: [samplePost],
        LastEvaluatedKey: lastKey,
      }));

      const result = await repo.listPosts(1);

      assert.equal(result.items.length, 1);
      assert.ok(result.nextCursor);
      const decoded = JSON.parse(Buffer.from(result.nextCursor, "base64").toString("utf-8"));
      assert.deepEqual(decoded, lastKey);
    });

    it("should pass ExclusiveStartKey when cursor is provided", async () => {
      const cursorKey = { id: "123", timestamp: "2026-01-01T00:00:00.000Z" };
      const cursor = Buffer.from(JSON.stringify(cursorKey)).toString("base64");

      mockSend.mock.mockImplementationOnce(async () => ({
        Items: [samplePost],
      }));

      await repo.listPosts(10, cursor);

      const callArgs = mockSend.mock.calls[0].arguments[0].input;
      assert.deepEqual(callArgs.ExclusiveStartKey, cursorKey);
    });

    it("should ignore invalid cursor and query from start", async () => {
      mockSend.mock.mockImplementationOnce(async () => ({
        Items: [samplePost],
      }));

      const result = await repo.listPosts(10, "invalid-base64-cursor!!!");

      assert.equal(result.items.length, 1);
      const callArgs = mockSend.mock.calls[0].arguments[0].input;
      assert.equal(callArgs.ExclusiveStartKey, undefined);
    });
  });

  describe("deletePost", () => {
    it("should delete post from DynamoDB", async () => {
      // deletePost primero llama a getPost (QueryCommand) para obtener el timestamp
      let callCount = 0;
      mockSend.mock.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return { Items: [samplePost] }; // getPost
        return {}; // deleteCommand
      });

      await repo.deletePost("123456");

      assert.equal(mockSend.mock.callCount(), 2);
    });

    it("should do nothing when post does not exist", async () => {
      mockSend.mock.mockImplementationOnce(async () => ({
        Items: [],
      }));

      await repo.deletePost("nonexistent");

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
      // updateVerificationDate primero llama a getPost (QueryCommand) para obtener el timestamp
      let callCount = 0;
      mockSend.mock.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return { Items: [samplePost] }; // getPost
        return {}; // updateCommand
      });

      const result = await repo.updateVerificationDate("123456");

      assert.equal(mockSend.mock.callCount(), 2);
      assert.ok(result);
      assert.ok(typeof result === "string");
    });

    it("should return null when post does not exist", async () => {
      mockSend.mock.mockImplementationOnce(async () => ({
        Items: [],
      }));

      const result = await repo.updateVerificationDate("nonexistent");

      assert.equal(mockSend.mock.callCount(), 1);
      assert.equal(result, null);
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
