import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import {
  inferContentType,
  extractFilename,
  buildS3Key,
  cleanupTempFiles,
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

  // -- inferContentType --

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

  // -- extractFilename --

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

  // -- buildS3Key --

  describe("buildS3Key", () => {
    it("should build key in format instagram/{postId}/{mediaType}/{filename}", () => {
      assert.equal(
        buildS3Key("123456", "IMAGE", "photo.jpg"),
        "instagram/123456/IMAGE/photo.jpg",
      );
    });

    it("should handle VIDEO media type", () => {
      assert.equal(
        buildS3Key("post_abc-123", "VIDEO", "video.mp4"),
        "instagram/post_abc-123/VIDEO/video.mp4",
      );
    });

    it("should handle CAROUSEL_ALBUM media type", () => {
      assert.equal(
        buildS3Key("carousel1", "CAROUSEL_ALBUM", "slide1.jpg"),
        "instagram/carousel1/CAROUSEL_ALBUM/slide1.jpg",
      );
    });

    it("should handle THUMBNAIL media type", () => {
      assert.equal(
        buildS3Key("vid1", "THUMBNAIL", "thumb.jpg"),
        "instagram/vid1/THUMBNAIL/thumb.jpg",
      );
    });

    it("should normalize mediaType to uppercase", () => {
      assert.equal(
        buildS3Key("123", "image", "photo.jpg"),
        "instagram/123/IMAGE/photo.jpg",
      );
    });

    it("should use UNKNOWN when mediaType is null", () => {
      assert.equal(
        buildS3Key("123", null, "photo.jpg"),
        "instagram/123/UNKNOWN/photo.jpg",
      );
    });
  });

  // -- cleanupTempFiles --

  describe("cleanupTempFiles", () => {
    it("should delete a single existing file", async () => {
      const dir = join(tmpdir(), "cleanup_test_" + Date.now());
      mkdirSync(dir, { recursive: true });
      const filePath = join(dir, "temp.txt");
      writeFileSync(filePath, "hello");

      const result = await cleanupTempFiles(filePath);
      assert.equal(result.deleted.length, 1);
      assert.equal(result.deleted[0], filePath);
      assert.equal(result.failed.length, 0);
      assert.equal(existsSync(filePath), false);
    });

    it("should delete multiple files", async () => {
      const dir = join(tmpdir(), "cleanup_multi_" + Date.now());
      mkdirSync(dir, { recursive: true });
      const file1 = join(dir, "a.txt");
      const file2 = join(dir, "b.txt");
      writeFileSync(file1, "aaa");
      writeFileSync(file2, "bbb");

      const result = await cleanupTempFiles([file1, file2]);
      assert.equal(result.deleted.length, 2);
      assert.equal(result.failed.length, 0);
    });

    it("should silently ignore ENOENT for already-deleted files", async () => {
      const result = await cleanupTempFiles("/nonexistent/path/file.txt");
      assert.equal(result.deleted.length, 0);
      assert.equal(result.failed.length, 0);
    });

    it("should handle empty array", async () => {
      const result = await cleanupTempFiles([]);
      assert.equal(result.deleted.length, 0);
      assert.equal(result.failed.length, 0);
    });

    it("should skip null/undefined paths", async () => {
      const result = await cleanupTempFiles([null, undefined, ""]);
      assert.equal(result.deleted.length, 0);
      assert.equal(result.failed.length, 0);
    });
  });

  // -- createMediaStorageService --

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

    it("should expose uploadBuffer, uploadFile, storeMedia, storePostMedia", () => {
      const service = createMediaStorageService({
        s3Client: {},
        bucketName: "test-bucket",
      });
      assert.equal(typeof service.uploadBuffer, "function");
      assert.equal(typeof service.uploadFile, "function");
      assert.equal(typeof service.storeMedia, "function");
      assert.equal(typeof service.storePostMedia, "function");
    });
  });

  // -- uploadBuffer --

  describe("uploadBuffer", () => {
    it("should throw 400 if postId is missing", async () => {
      const mockS3 = { send: mock.fn() };
      const service = createMediaStorageService({
        s3Client: mockS3,
        bucketName: "test-bucket",
      });

      await assert.rejects(
        () => service.uploadBuffer(null, "IMAGE", Buffer.from([1, 2, 3])),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.ok(err.message.includes("postId"));
          return true;
        },
      );
    });

    it("should throw 400 if mediaType is missing", async () => {
      const mockS3 = { send: mock.fn() };
      const service = createMediaStorageService({
        s3Client: mockS3,
        bucketName: "test-bucket",
      });

      await assert.rejects(
        () => service.uploadBuffer("123", null, Buffer.from([1, 2, 3])),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.ok(err.message.includes("mediaType"));
          return true;
        },
      );
    });

    it("should throw 400 if buffer is empty", async () => {
      const mockS3 = { send: mock.fn() };
      const service = createMediaStorageService({
        s3Client: mockS3,
        bucketName: "test-bucket",
      });

      await assert.rejects(
        () => service.uploadBuffer("123", "IMAGE", Buffer.alloc(0)),
        (err) => {
          assert.equal(err.statusCode, 400);
          return true;
        },
      );
    });

    it("should upload buffer to S3 with correct key format and metadata", async () => {
      const sentCommands = [];
      const mockS3 = {
        send: mock.fn(async (cmd) => {
          sentCommands.push(cmd);
        }),
      };

      const service = createMediaStorageService({
        s3Client: mockS3,
        bucketName: "test-bucket",
      });

      const buf = Buffer.from([1, 2, 3, 4, 5]);
      const result = await service.uploadBuffer("post123", "IMAGE", buf, {
        filename: "photo.jpg",
        sourceUrl: "https://instagram.com/photo.jpg",
      });

      assert.equal(result.bucket, "test-bucket");
      assert.equal(result.key, "instagram/post123/IMAGE/photo.jpg");
      assert.equal(result.contentType, "image/jpeg");
      assert.equal(result.size, 5);
      assert.equal(mockS3.send.mock.callCount(), 1);

      // Verify metadata was passed
      const cmd = sentCommands[0];
      assert.equal(cmd.input.Metadata.postid, "post123");
      assert.equal(cmd.input.Metadata.mediatype, "IMAGE");
      assert.ok(cmd.input.Metadata.uploadedat);
      assert.equal(cmd.input.Metadata.sourceurl, "https://instagram.com/photo.jpg");
    });

    it("should infer content type from filename", async () => {
      const mockS3 = { send: mock.fn() };
      const service = createMediaStorageService({
        s3Client: mockS3,
        bucketName: "test-bucket",
      });

      const result = await service.uploadBuffer("p1", "VIDEO", Buffer.from([1]), {
        filename: "clip.mp4",
      });
      assert.equal(result.contentType, "video/mp4");
    });
  });

  // -- uploadFile --

  describe("uploadFile", () => {
    it("should throw 400 if postId is missing", async () => {
      const mockS3 = { send: mock.fn() };
      const service = createMediaStorageService({
        s3Client: mockS3,
        bucketName: "test-bucket",
      });

      await assert.rejects(
        () => service.uploadFile(null, "IMAGE", "/tmp/file.jpg"),
        (err) => {
          assert.equal(err.statusCode, 400);
          return true;
        },
      );
    });

    it("should throw 400 if filePath is missing", async () => {
      const mockS3 = { send: mock.fn() };
      const service = createMediaStorageService({
        s3Client: mockS3,
        bucketName: "test-bucket",
      });

      await assert.rejects(
        () => service.uploadFile("123", "IMAGE", null),
        (err) => {
          assert.equal(err.statusCode, 400);
          return true;
        },
      );
    });

    it("should upload file and cleanup temp file on success", async () => {
      const dir = join(tmpdir(), "upload_test_" + Date.now());
      mkdirSync(dir, { recursive: true });
      const filePath = join(dir, "photo.jpg");
      writeFileSync(filePath, Buffer.from([10, 20, 30, 40, 50]));

      const mockS3 = { send: mock.fn() };
      const service = createMediaStorageService({
        s3Client: mockS3,
        bucketName: "test-bucket",
      });

      const result = await service.uploadFile("post1", "IMAGE", filePath);

      assert.equal(result.key, "instagram/post1/IMAGE/photo.jpg");
      assert.equal(result.bucket, "test-bucket");
      assert.equal(result.contentType, "image/jpeg");
      assert.equal(result.size, 5);
      assert.equal(result.cleanup.deleted.length, 1);
      assert.equal(result.cleanup.deleted[0], filePath);
      assert.equal(existsSync(filePath), false);
      assert.equal(mockS3.send.mock.callCount(), 1);
    });

    it("should cleanup temp file even when upload fails", async () => {
      const dir = join(tmpdir(), "upload_fail_" + Date.now());
      mkdirSync(dir, { recursive: true });
      const filePath = join(dir, "video.mp4");
      writeFileSync(filePath, Buffer.from([1, 2, 3]));

      const mockS3 = {
        send: mock.fn(async () => {
          throw new Error("S3 error");
        }),
      };
      const service = createMediaStorageService({
        s3Client: mockS3,
        bucketName: "test-bucket",
      });

      await assert.rejects(
        () => service.uploadFile("post2", "VIDEO", filePath),
        /S3 error/,
      );

      // File should still be cleaned up despite upload failure
      assert.equal(existsSync(filePath), false);
    });

    it("should skip cleanup when cleanup=false", async () => {
      const dir = join(tmpdir(), "upload_noclean_" + Date.now());
      mkdirSync(dir, { recursive: true });
      const filePath = join(dir, "photo.jpg");
      writeFileSync(filePath, Buffer.from([1, 2]));

      const mockS3 = { send: mock.fn() };
      const service = createMediaStorageService({
        s3Client: mockS3,
        bucketName: "test-bucket",
      });

      const result = await service.uploadFile("p3", "IMAGE", filePath, {
        cleanup: false,
      });

      assert.equal(result.cleanup.deleted.length, 0);
      assert.equal(existsSync(filePath), true);
    });

    it("should throw 404 for non-existent file", async () => {
      const mockS3 = { send: mock.fn() };
      const service = createMediaStorageService({
        s3Client: mockS3,
        bucketName: "test-bucket",
      });

      await assert.rejects(
        () => service.uploadFile("p4", "IMAGE", "/nonexistent/file.jpg"),
        (err) => {
          assert.equal(err.statusCode, 404);
          assert.ok(err.message.includes("File not found"));
          return true;
        },
      );
    });
  });

  // -- storeMedia --

  describe("storeMedia", () => {
    it("should throw 400 if postId is missing", async () => {
      const mockS3 = { send: mock.fn() };
      const service = createMediaStorageService({
        s3Client: mockS3,
        bucketName: "test-bucket",
      });

      await assert.rejects(
        () => service.storeMedia(null, "IMAGE", "https://example.com/photo.jpg"),
        (err) => {
          assert.equal(err.statusCode, 400);
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
        () => service.storeMedia("123", "IMAGE", null),
        (err) => {
          assert.equal(err.statusCode, 400);
          return true;
        },
      );
    });

    it("should throw 400 if mediaType is missing", async () => {
      const mockS3 = { send: mock.fn() };
      const service = createMediaStorageService({
        s3Client: mockS3,
        bucketName: "test-bucket",
      });

      await assert.rejects(
        () => service.storeMedia("123", null, "https://example.com/photo.jpg"),
        (err) => {
          assert.equal(err.statusCode, 400);
          return true;
        },
      );
    });

    it("should download media and upload to S3 with correct key", async () => {
      const mockS3 = { send: mock.fn() };
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
          "IMAGE",
          "https://instagram.com/images/photo.jpg",
        );

        assert.equal(result.bucket, "test-bucket");
        assert.equal(result.key, "instagram/post123/IMAGE/photo.jpg");
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
          () => service.storeMedia("post123", "IMAGE", "https://example.com/missing.jpg"),
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
          "VIDEO",
          "https://example.com/video.mp4",
        );

        assert.equal(result.contentType, "video/mp4");
        assert.equal(result.key, "instagram/post456/VIDEO/video.mp4");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // -- storePostMedia --

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

    it("should store single IMAGE post with correct key", async () => {
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
        assert.equal(results[0].key, "instagram/img-post-1/IMAGE/photo.jpg");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("should store VIDEO with thumbnail using THUMBNAIL mediaType", async () => {
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

        assert.equal(results.length, 2);
        const keys = results.map((r) => r.key);
        assert.ok(keys.includes("instagram/vid-post-1/VIDEO/video.mp4"));
        assert.ok(keys.includes("instagram/vid-post-1/THUMBNAIL/thumb.jpg"));
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
        assert.equal(results[0].key, "instagram/carousel-1/CAROUSEL_ALBUM/slide1.jpg");
        assert.equal(results[1].key, "instagram/carousel-1/CAROUSEL_ALBUM/slide2.jpg");
        assert.equal(results[2].key, "instagram/carousel-1/CAROUSEL_ALBUM/slide3.jpg");
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
