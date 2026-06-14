import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";

import {
  inferContentType,
  extractFilename,
  buildS3Key,
  createMediaStorageService,
} from "../src/services/mediaStorageService.js";

const originalEnv = process.env;

describe("mediaStorageService", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.S3_BUCKET_NAME = "test-media-bucket";
  });

  afterEach(() => {
    process.env = originalEnv;
    mock.reset();
  });

  // ── inferContentType ──

  describe("inferContentType", () => {
    it("should return image/jpeg for .jpg URLs", () => {
      assert.equal(
        inferContentType("https://example.com/photo.jpg"),
        "image/jpeg",
      );
    });

    it("should return image/jpeg for .jpeg URLs", () => {
      assert.equal(
        inferContentType("https://example.com/photo.jpeg"),
        "image/jpeg",
      );
    });

    it("should return image/png for .png URLs", () => {
      assert.equal(
        inferContentType("https://example.com/image.png"),
        "image/png",
      );
    });

    it("should return video/mp4 for .mp4 URLs", () => {
      assert.equal(
        inferContentType("https://example.com/video.mp4"),
        "video/mp4",
      );
    });

    it("should return video/quicktime for .mov URLs", () => {
      assert.equal(
        inferContentType("https://example.com/clip.mov"),
        "video/quicktime",
      );
    });

    it("should return image/webp for .webp URLs", () => {
      assert.equal(
        inferContentType("https://example.com/image.webp"),
        "image/webp",
      );
    });

    it("should return application/octet-stream for unknown extensions", () => {
      assert.equal(
        inferContentType("https://example.com/file.xyz"),
        "application/octet-stream",
      );
    });

    it("should ignore query parameters when inferring type", () => {
      assert.equal(
        inferContentType("https://example.com/photo.jpg?token=abc&size=large"),
        "image/jpeg",
      );
    });

    it("should be case-insensitive", () => {
      assert.equal(
        inferContentType("https://example.com/photo.JPG"),
        "image/jpeg",
      );
    });
  });

  // ── extractFilename ──

  describe("extractFilename", () => {
    it("should extract filename from a simple URL", () => {
      assert.equal(
        extractFilename("https://example.com/images/photo.jpg"),
        "photo.jpg",
      );
    });

    it("should extract filename from URL with query params", () => {
      assert.equal(
        extractFilename(
          "https://scontent.cdninstagram.com/v/t51/image.jpg?_nc_ht=example&oh=abc",
        ),
        "image.jpg",
      );
    });

    it("should decode URI-encoded filenames", () => {
      assert.equal(
        extractFilename("https://example.com/my%20photo.jpg"),
        "my photo.jpg",
      );
    });

    it("should return fallback when URL has no filename with extension", () => {
      const result = extractFilename("https://example.com/path/");
      assert.ok(result.startsWith("media_"));
    });

    it("should return fallback for invalid URLs", () => {
      const result = extractFilename("not-a-url");
      assert.ok(result.startsWith("media_"));
    });
  });

  // ── buildS3Key ──

  describe("buildS3Key", () => {
    it("should build key in format media/{postId}/{filename}", () => {
      assert.equal(
        buildS3Key("123456", "photo.jpg"),
        "media/123456/photo.jpg",
      );
    });

    it("should handle post IDs with special characters", () => {
      assert.equal(
        buildS3Key("post_abc-123", "video.mp4"),
        "media/post_abc-123/video.mp4",
      );
    });
  });

  // ── createMediaStorageService ──

  describe("createMediaStorageService", () => {
    it("should throw if S3_BUCKET_NAME is not configured", () => {
      delete process.env.S3_BUCKET_NAME;

      assert.throws(
        () => createMediaStorageService({ s3Client: {} }),
        (err) => {
          assert.equal(err.statusCode, 500);
          assert.ok(err.message.includes("S3_BUCKET_NAME"));
          return true;
        },
      );
    });

    it("should create service with explicit bucket name", () => {
      const service = createMediaStorageService({
        s3Client: {},
        bucketName: "my-bucket",
      });
      assert.equal(service.getBucketName(), "my-bucket");
    });

    it("should use S3_BUCKET_NAME env var as default", () => {
      const service = createMediaStorageService({ s3Client: {} });
      assert.equal(service.getBucketName(), "test-media-bucket");
    });
  });

  // ── storeMedia ──

  describe("storeMedia", () => {
    it("should throw 400 if postId is missing", async () => {
      const mockS3 = { send: mock.fn() };
      const service = createMediaStorageService({
        s3Client: mockS3,
        bucketName: "test-bucket",
      });

      await assert.rejects(
        () => service.storeMedia(null, "https://example.com/photo.jpg"),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.ok(err.message.includes("postId"));
          return true;
        },
      );
    });

    it("should throw 400 if mediaUrl is missing", async () => {
      const mockS3 = { send: mock.fn() };
      const service = createMediaStorageService({
        s3Client: mockS3,
        bucketName: "test-bucket",
      });

      await assert.rejects(
        () => service.storeMedia("123", null),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.ok(err.message.includes("mediaUrl"));
          return true;
        },
      );
    });

    it("should download media and upload to S3", async () => {
      const sentCommands = [];
      const mockS3 = {
        send: mock.fn(async (cmd) => {
          sentCommands.push(cmd);
        }),
      };

      // Mock fetch for downloading
      const originalFetch = globalThis.fetch;
      const fakeData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      globalThis.fetch = async () => ({
        ok: true,
        headers: { get: () => "image/jpeg" },
        arrayBuffer: async () => fakeData.buffer.slice(
          fakeData.byteOffset,
          fakeData.byteOffset + fakeData.byteLength,
        ),
      });

      try {
        const service = createMediaStorageService({
          s3Client: mockS3,
          bucketName: "test-bucket",
        });

        const result = await service.storeMedia(
          "post123",
          "https://instagram.com/images/photo.jpg",
        );

        assert.equal(result.bucket, "test-bucket");
        assert.equal(result.key, "media/post123/photo.jpg");
        assert.equal(result.contentType, "image/jpeg");
        assert.equal(result.size, 10);
        assert.equal(mockS3.send.mock.callCount(), 1);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should throw 502 when download fails", async () => {
      const mockS3 = { send: mock.fn() };
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: false,
        status: 404,
      });

      try {
        const service = createMediaStorageService({
          s3Client: mockS3,
          bucketName: "test-bucket",
        });

        await assert.rejects(
          () => service.storeMedia("post123", "https://example.com/missing.jpg"),
          (err) => {
            assert.equal(err.statusCode, 502);
            assert.ok(err.message.includes("Failed to download"));
            return true;
          },
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should use inferred content type when response header is missing", async () => {
      const mockS3 = { send: mock.fn() };
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(10),
      });

      try {
        const service = createMediaStorageService({
          s3Client: mockS3,
          bucketName: "test-bucket",
        });

        const result = await service.storeMedia(
          "post456",
          "https://example.com/video.mp4",
        );

        assert.equal(result.contentType, "video/mp4");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // ── storePostMedia ──

  describe("storePostMedia", () => {
    it("should throw 400 if post is null", async () => {
      const mockS3 = { send: mock.fn() };
      const service = createMediaStorageService({
        s3Client: mockS3,
        bucketName: "test-bucket",
      });

      await assert.rejects(
        () => service.storePostMedia(null),
        (err) => {
          assert.equal(err.statusCode, 400);
          return true;
        },
      );
    });

    it("should throw 400 if post has no id", async () => {
      const mockS3 = { send: mock.fn() };
      const service = createMediaStorageService({
        s3Client: mockS3,
        bucketName: "test-bucket",
      });

      await assert.rejects(
        () => service.storePostMedia({ mediaUrl: "https://example.com/x.jpg" }),
        (err) => {
          assert.equal(err.statusCode, 400);
          return true;
        },
      );
    });

    it("should store single IMAGE post", async () => {
      const mockS3 = { send: mock.fn() };
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        headers: { get: () => "image/jpeg" },
        arrayBuffer: async () => new ArrayBuffer(100),
      });

      try {
        const service = createMediaStorageService({
          s3Client: mockS3,
          bucketName: "test-bucket",
        });

        const results = await service.storePostMedia({
          id: "img-post-1",
          mediaType: "IMAGE",
          mediaUrl: "https://example.com/photo.jpg",
        });

        assert.equal(results.length, 1);
        assert.equal(results[0].key, "media/img-post-1/photo.jpg");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should store VIDEO post with thumbnail", async () => {
      const mockS3 = { send: mock.fn() };
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        headers: { get: () => "application/octet-stream" },
        arrayBuffer: async () => new ArrayBuffer(200),
      });

      try {
        const service = createMediaStorageService({
          s3Client: mockS3,
          bucketName: "test-bucket",
        });

        const results = await service.storePostMedia({
          id: "vid-post-1",
          mediaType: "VIDEO",
          mediaUrl: "https://example.com/video.mp4",
          thumbnailUrl: "https://example.com/thumb.jpg",
        });

        // Should store both video and thumbnail
        assert.equal(results.length, 2);
        const keys = results.map((r) => r.key);
        assert.ok(keys.includes("media/vid-post-1/video.mp4"));
        assert.ok(keys.includes("media/vid-post-1/thumb.jpg"));
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should store CAROUSEL_ALBUM with multiple URLs", async () => {
      const mockS3 = { send: mock.fn() };
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        headers: { get: () => "image/jpeg" },
        arrayBuffer: async () => new ArrayBuffer(50),
      });

      try {
        const service = createMediaStorageService({
          s3Client: mockS3,
          bucketName: "test-bucket",
        });

        const results = await service.storePostMedia({
          id: "carousel-1",
          mediaType: "CAROUSEL_ALBUM",
          mediaUrl: null,
          carouselUrls: [
            "https://example.com/slide1.jpg",
            "https://example.com/slide2.jpg",
            "https://example.com/slide3.jpg",
          ],
        });

        assert.equal(results.length, 3);
        assert.equal(results[0].key, "media/carousel-1/slide1.jpg");
        assert.equal(results[1].key, "media/carousel-1/slide2.jpg");
        assert.equal(results[2].key, "media/carousel-1/slide3.jpg");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should return empty array when IMAGE post has no mediaUrl", async () => {
      const mockS3 = { send: mock.fn() };
      const service = createMediaStorageService({
        s3Client: mockS3,
        bucketName: "test-bucket",
      });

      const results = await service.storePostMedia({
        id: "no-media-post",
        mediaType: "IMAGE",
        mediaUrl: null,
      });

      assert.equal(results.length, 0);
      assert.equal(mockS3.send.mock.callCount(), 0);
    });
  });
});
