import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";

import { createMediaPipeline, buildS3Uri } from "../src/services/mediaPipeline.js";

// --- Helpers to build mock services ---

/**
 * Creates a mock instagramMediaService.
 * @param {object} [overrides]
 * @returns {object}
 */
function createMockInstagramMediaService(overrides) {
  const o = overrides || {};
  return {
    fetchMedia: o.fetchMedia || mock.fn(),
    validateUrl: o.validateUrl || mock.fn((url) => {
      if (!url || typeof url !== "string") return { valid: false, error: "URL is required" };
      if (!url.includes("instagram.com")) return { valid: false, error: "Not an Instagram URL" };
      return { valid: true, shortcode: "ABC123", type: "post" };
    }),
    resolveMedia: o.resolveMedia || mock.fn(),
    destroy: o.destroy || mock.fn(),
  };
}

/**
 * Creates a mock mediaStorageService.
 * @param {object} [overrides]
 * @returns {object}
 */
function createMockMediaStorageService(overrides) {
  const o = overrides || {};
  return {
    uploadBuffer: o.uploadBuffer || mock.fn(async (postId, mediaType, buffer, extra) => {
      return {
        key: "instagram/" + postId + "/" + mediaType + "/" + (extra?.filename || "media.jpg"),
        bucket: "test-bucket",
        contentType: extra?.contentType || "image/jpeg",
        size: buffer?.length || 0,
      };
    }),
    uploadFile: o.uploadFile || mock.fn(),
    storeMedia: o.storeMedia || mock.fn(),
    getBucketName: o.getBucketName || mock.fn(() => "test-bucket"),
  };
}

/**
 * Creates a mock downloaded media result.
 * @param {object} [overrides]
 * @returns {object}
 */
function createMockDownloadedMedia(overrides) {
  const o = overrides || {};
  return {
    postId: o.postId || "123456789",
    shortcode: o.shortcode || "ABC123",
    mediaType: o.mediaType || "image",
    buffer: o.buffer || Buffer.from([1, 2, 3, 4, 5]),
    sizeBytes: o.sizeBytes || 5,
    contentType: o.contentType || "image/jpeg",
    extension: o.extension || ".jpg",
    sourceUrl: o.sourceUrl || "https://scontent.cdninstagram.com/photo.jpg",
    thumbnailBuffer: o.thumbnailBuffer || null,
    caption: o.caption || "Test caption",
    permalink: o.permalink || "https://www.instagram.com/p/ABC123/",
  };
}

describe("mediaPipeline", () => {
  afterEach(() => {
    mock.reset();
  });

  // -- buildS3Uri --

  describe("buildS3Uri", () => {
    it("should build s3:// URI from bucket and key", () => {
      assert.equal(
        buildS3Uri("my-bucket", "instagram/123/IMAGE/photo.jpg"),
        "s3://my-bucket/instagram/123/IMAGE/photo.jpg",
      );
    });

    it("should handle keys with special characters", () => {
      assert.equal(
        buildS3Uri("bucket", "instagram/post-1/VIDEO/clip.mp4"),
        "s3://bucket/instagram/post-1/VIDEO/clip.mp4",
      );
    });
  });

  // -- createMediaPipeline — constructor validation --

  describe("createMediaPipeline", () => {
    it("should throw if instagramMediaService is missing", () => {
      assert.throws(
        () => createMediaPipeline({ mediaStorageService: {} }),
        (err) => {
          assert.equal(err.statusCode, 500);
          assert.ok(err.message.includes("instagramMediaService"));
          return true;
        },
      );
    });

    it("should throw if mediaStorageService is missing", () => {
      assert.throws(
        () => createMediaPipeline({ instagramMediaService: {} }),
        (err) => {
          assert.equal(err.statusCode, 500);
          assert.ok(err.message.includes("mediaStorageService"));
          return true;
        },
      );
    });

    it("should throw if deps is null", () => {
      assert.throws(
        () => createMediaPipeline(null),
        (err) => {
          assert.equal(err.statusCode, 500);
          return true;
        },
      );
    });

    it("should create pipeline with valid dependencies", () => {
      const pipeline = createMediaPipeline({
        instagramMediaService: createMockInstagramMediaService(),
        mediaStorageService: createMockMediaStorageService(),
      });
      assert.equal(typeof pipeline.processInstagramUrl, "function");
      assert.equal(typeof pipeline.processBatch, "function");
    });
  });

  // -- processInstagramUrl — happy paths --

  describe("processInstagramUrl", () => {
    it("should process an IMAGE post end-to-end", async () => {
      const downloaded = createMockDownloadedMedia({ mediaType: "image" });
      const igService = createMockInstagramMediaService({
        fetchMedia: mock.fn(async () => downloaded),
      });
      const storageService = createMockMediaStorageService();
      const pipeline = createMediaPipeline({
        instagramMediaService: igService,
        mediaStorageService: storageService,
      });

      const result = await pipeline.processInstagramUrl(
        "https://www.instagram.com/p/ABC123/",
      );

      assert.equal(result.postId, "123456789");
      assert.equal(result.shortcode, "ABC123");
      assert.equal(result.mediaType, "image");
      assert.equal(result.s3Uri, "s3://test-bucket/instagram/123456789/IMAGE/media.jpg");
      assert.equal(result.s3Key, "instagram/123456789/IMAGE/media.jpg");
      assert.equal(result.bucket, "test-bucket");
      assert.equal(result.sizeBytes, 5);
      assert.equal(result.contentType, "image/jpeg");
      assert.equal(result.thumbnailS3Uri, null);
      assert.equal(result.thumbnailS3Key, null);
      assert.equal(result.sourceUrl, "https://www.instagram.com/p/ABC123/");
      assert.equal(result.permalink, "https://www.instagram.com/p/ABC123/");

      // Verify fetchMedia was called
      assert.equal(igService.fetchMedia.mock.callCount(), 1);
      // Verify uploadBuffer was called once (no thumbnail for image)
      assert.equal(storageService.uploadBuffer.mock.callCount(), 1);
    });

    it("should process a VIDEO post with thumbnail", async () => {
      const thumbBuffer = Buffer.from([10, 20, 30]);
      const downloaded = createMockDownloadedMedia({
        mediaType: "video",
        buffer: Buffer.from([1, 2, 3, 4, 5, 6]),
        sizeBytes: 6,
        contentType: "video/mp4",
        extension: ".mp4",
        thumbnailBuffer: thumbBuffer,
      });

      const uploadCalls = [];
      const igService = createMockInstagramMediaService({
        fetchMedia: mock.fn(async () => downloaded),
      });
      const storageService = createMockMediaStorageService({
        uploadBuffer: mock.fn(async (postId, mediaType, buffer, extra) => {
          const call = { postId, mediaType, size: buffer.length, filename: extra?.filename };
          uploadCalls.push(call);
          return {
            key: "instagram/" + postId + "/" + mediaType + "/" + (extra?.filename || "media"),
            bucket: "test-bucket",
            contentType: extra?.contentType || "video/mp4",
            size: buffer.length,
          };
        }),
      });

      const pipeline = createMediaPipeline({
        instagramMediaService: igService,
        mediaStorageService: storageService,
      });

      const result = await pipeline.processInstagramUrl(
        "https://www.instagram.com/reel/XYZ789/",
      );

      assert.equal(result.mediaType, "video");
      assert.equal(result.s3Key, "instagram/123456789/VIDEO/media.mp4");
      assert.ok(result.thumbnailS3Uri);
      assert.ok(result.thumbnailS3Uri.startsWith("s3://test-bucket/"));
      assert.ok(result.thumbnailS3Key.includes("THUMBNAIL"));

      // Should have uploaded video + thumbnail
      assert.equal(storageService.uploadBuffer.mock.callCount(), 2);
      assert.equal(uploadCalls[0].mediaType, "VIDEO");
      assert.equal(uploadCalls[1].mediaType, "THUMBNAIL");
    });

    it("should skip thumbnail when includeThumbnail=false", async () => {
      const downloaded = createMockDownloadedMedia({
        mediaType: "video",
        thumbnailBuffer: Buffer.from([10, 20]),
      });

      const igService = createMockInstagramMediaService({
        fetchMedia: mock.fn(async () => downloaded),
      });
      const storageService = createMockMediaStorageService();
      const pipeline = createMediaPipeline({
        instagramMediaService: igService,
        mediaStorageService: storageService,
      });

      const result = await pipeline.processInstagramUrl(
        "https://www.instagram.com/p/ABC123/",
        { includeThumbnail: false },
      );

      assert.equal(result.thumbnailS3Uri, null);
      assert.equal(storageService.uploadBuffer.mock.callCount(), 1);
    });

    it("should pass extra headers to fetchMedia", async () => {
      const downloaded = createMockDownloadedMedia();
      const igService = createMockInstagramMediaService({
        fetchMedia: mock.fn(async () => downloaded),
      });
      const storageService = createMockMediaStorageService();
      const pipeline = createMediaPipeline({
        instagramMediaService: igService,
        mediaStorageService: storageService,
      });

      await pipeline.processInstagramUrl("https://www.instagram.com/p/ABC123/", {
        headers: { "X-Custom": "value" },
      });

      const fetchCall = igService.fetchMedia.mock.calls[0];
      assert.deepEqual(fetchCall.arguments[1], {
        includeThumbnail: true,
        headers: { "X-Custom": "value" },
      });
    });

    it("should release buffer references after successful processing", async () => {
      const downloaded = createMockDownloadedMedia({
        mediaType: "video",
        thumbnailBuffer: Buffer.from([10, 20]),
      });

      const igService = createMockInstagramMediaService({
        fetchMedia: mock.fn(async () => downloaded),
      });
      const storageService = createMockMediaStorageService();
      const pipeline = createMediaPipeline({
        instagramMediaService: igService,
        mediaStorageService: storageService,
      });

      await pipeline.processInstagramUrl("https://www.instagram.com/p/ABC123/");

      // After processing, buffer references should be nulled for GC
      assert.equal(downloaded.buffer, null);
      assert.equal(downloaded.thumbnailBuffer, null);
    });
  });

  // -- processInstagramUrl — error handling --

  describe("processInstagramUrl — error handling", () => {
    it("should throw 400 for invalid Instagram URL", async () => {
      const igService = createMockInstagramMediaService({
        validateUrl: mock.fn(() => ({ valid: false, error: "Not an Instagram URL" })),
      });
      const storageService = createMockMediaStorageService();
      const pipeline = createMediaPipeline({
        instagramMediaService: igService,
        mediaStorageService: storageService,
      });

      await assert.rejects(
        () => pipeline.processInstagramUrl("https://example.com/not-instagram"),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.ok(err.message.includes("Invalid Instagram URL"));
          return true;
        },
      );

      // fetchMedia should NOT have been called
      assert.equal(igService.fetchMedia.mock.callCount(), 0);
      // uploadBuffer should NOT have been called
      assert.equal(storageService.uploadBuffer.mock.callCount(), 0);
    });

    it("should throw 400 for null URL", async () => {
      const igService = createMockInstagramMediaService({
        validateUrl: mock.fn(() => ({ valid: false, error: "URL is required" })),
      });
      const storageService = createMockMediaStorageService();
      const pipeline = createMediaPipeline({
        instagramMediaService: igService,
        mediaStorageService: storageService,
      });

      await assert.rejects(
        () => pipeline.processInstagramUrl(null),
        (err) => {
          assert.equal(err.statusCode, 400);
          return true;
        },
      );
    });

    it("should re-throw typed errors from fetchMedia (with statusCode)", async () => {
      const fetchError = new Error("Not Found");
      fetchError.statusCode = 404;

      const igService = createMockInstagramMediaService({
        fetchMedia: mock.fn(async () => { throw fetchError; }),
      });
      const storageService = createMockMediaStorageService();
      const pipeline = createMediaPipeline({
        instagramMediaService: igService,
        mediaStorageService: storageService,
      });

      await assert.rejects(
        () => pipeline.processInstagramUrl("https://www.instagram.com/p/ABC123/"),
        (err) => {
          assert.equal(err.statusCode, 404);
          assert.equal(err.message, "Not Found");
          return true;
        },
      );

      // S3 upload should NOT have been called
      assert.equal(storageService.uploadBuffer.mock.callCount(), 0);
    });

    it("should wrap untyped errors from fetchMedia as 502", async () => {
      const igService = createMockInstagramMediaService({
        fetchMedia: mock.fn(async () => { throw new Error("Network timeout"); }),
      });
      const storageService = createMockMediaStorageService();
      const pipeline = createMediaPipeline({
        instagramMediaService: igService,
        mediaStorageService: storageService,
      });

      await assert.rejects(
        () => pipeline.processInstagramUrl("https://www.instagram.com/p/ABC123/"),
        (err) => {
          assert.equal(err.statusCode, 502);
          assert.ok(err.message.includes("Failed to download"));
          assert.ok(err.message.includes("Network timeout"));
          return true;
        },
      );
    });

    it("should throw 502 when downloaded media buffer is empty", async () => {
      const downloaded = createMockDownloadedMedia({
        buffer: Buffer.alloc(0),
        sizeBytes: 0,
      });

      const igService = createMockInstagramMediaService({
        fetchMedia: mock.fn(async () => downloaded),
      });
      const storageService = createMockMediaStorageService();
      const pipeline = createMediaPipeline({
        instagramMediaService: igService,
        mediaStorageService: storageService,
      });

      await assert.rejects(
        () => pipeline.processInstagramUrl("https://www.instagram.com/p/ABC123/"),
        (err) => {
          assert.equal(err.statusCode, 502);
          assert.ok(err.message.includes("empty"));
          return true;
        },
      );
    });

    it("should throw 502 when fetchMedia returns null", async () => {
      const igService = createMockInstagramMediaService({
        fetchMedia: mock.fn(async () => null),
      });
      const storageService = createMockMediaStorageService();
      const pipeline = createMediaPipeline({
        instagramMediaService: igService,
        mediaStorageService: storageService,
      });

      await assert.rejects(
        () => pipeline.processInstagramUrl("https://www.instagram.com/p/ABC123/"),
        (err) => {
          assert.equal(err.statusCode, 502);
          return true;
        },
      );
    });

    it("should re-throw typed errors from uploadBuffer (with statusCode)", async () => {
      const downloaded = createMockDownloadedMedia();
      const s3Error = new Error("Access Denied");
      s3Error.statusCode = 403;

      const igService = createMockInstagramMediaService({
        fetchMedia: mock.fn(async () => downloaded),
      });
      const storageService = createMockMediaStorageService({
        uploadBuffer: mock.fn(async () => { throw s3Error; }),
      });
      const pipeline = createMediaPipeline({
        instagramMediaService: igService,
        mediaStorageService: storageService,
      });

      await assert.rejects(
        () => pipeline.processInstagramUrl("https://www.instagram.com/p/ABC123/"),
        (err) => {
          assert.equal(err.statusCode, 403);
          assert.equal(err.message, "Access Denied");
          return true;
        },
      );
    });

    it("should wrap untyped S3 errors as 500", async () => {
      const downloaded = createMockDownloadedMedia();

      const igService = createMockInstagramMediaService({
        fetchMedia: mock.fn(async () => downloaded),
      });
      const storageService = createMockMediaStorageService({
        uploadBuffer: mock.fn(async () => { throw new Error("S3 connection lost"); }),
      });
      const pipeline = createMediaPipeline({
        instagramMediaService: igService,
        mediaStorageService: storageService,
      });

      await assert.rejects(
        () => pipeline.processInstagramUrl("https://www.instagram.com/p/ABC123/"),
        (err) => {
          assert.equal(err.statusCode, 500);
          assert.ok(err.message.includes("Failed to upload"));
          assert.ok(err.message.includes("S3 connection lost"));
          return true;
        },
      );
    });

    it("should continue when thumbnail upload fails (non-fatal)", async () => {
      const downloaded = createMockDownloadedMedia({
        mediaType: "video",
        thumbnailBuffer: Buffer.from([10, 20, 30]),
      });

      let callCount = 0;
      const igService = createMockInstagramMediaService({
        fetchMedia: mock.fn(async () => downloaded),
      });
      const storageService = createMockMediaStorageService({
        uploadBuffer: mock.fn(async (postId, mediaType) => {
          callCount++;
          if (mediaType === "THUMBNAIL") {
            throw new Error("S3 throttle");
          }
          return {
            key: "instagram/" + postId + "/" + mediaType + "/media.mp4",
            bucket: "test-bucket",
            contentType: "video/mp4",
            size: 6,
          };
        }),
      });

      const pipeline = createMediaPipeline({
        instagramMediaService: igService,
        mediaStorageService: storageService,
      });

      // Should NOT throw — thumbnail failure is non-fatal
      const result = await pipeline.processInstagramUrl(
        "https://www.instagram.com/p/ABC123/",
      );

      assert.ok(result.s3Uri);
      assert.equal(result.thumbnailS3Uri, null);
      assert.equal(result.thumbnailS3Key, null);
      assert.equal(callCount, 2); // video + thumbnail attempted
    });
  });

  // -- processBatch --

  describe("processBatch", () => {
    it("should throw 400 for non-array input", async () => {
      const pipeline = createMediaPipeline({
        instagramMediaService: createMockInstagramMediaService(),
        mediaStorageService: createMockMediaStorageService(),
      });

      await assert.rejects(
        () => pipeline.processBatch("not-an-array"),
        (err) => {
          assert.equal(err.statusCode, 400);
          return true;
        },
      );
    });

    it("should throw 400 for empty array", async () => {
      const pipeline = createMediaPipeline({
        instagramMediaService: createMockInstagramMediaService(),
        mediaStorageService: createMockMediaStorageService(),
      });

      await assert.rejects(
        () => pipeline.processBatch([]),
        (err) => {
          assert.equal(err.statusCode, 400);
          return true;
        },
      );
    });

    it("should process multiple URLs and collect results", async () => {
      let counter = 0;
      const igService = createMockInstagramMediaService({
        fetchMedia: mock.fn(async () => {
          counter++;
          return createMockDownloadedMedia({
            postId: "post_" + counter,
            shortcode: "SC" + counter,
          });
        }),
      });
      const storageService = createMockMediaStorageService();
      const pipeline = createMediaPipeline({
        instagramMediaService: igService,
        mediaStorageService: storageService,
      });

      const { results, errors } = await pipeline.processBatch([
        "https://www.instagram.com/p/AAA/",
        "https://www.instagram.com/p/BBB/",
      ]);

      assert.equal(results.length, 2);
      assert.equal(errors.length, 0);
      assert.equal(results[0].postId, "post_1");
      assert.equal(results[1].postId, "post_2");
    });

    it("should continue on individual failures and collect errors", async () => {
      let callCount = 0;
      const igService = createMockInstagramMediaService({
        fetchMedia: mock.fn(async () => {
          callCount++;
          if (callCount === 2) {
            const err = new Error("Download failed");
            err.statusCode = 502;
            throw err;
          }
          return createMockDownloadedMedia({ postId: "post_" + callCount });
        }),
      });
      const storageService = createMockMediaStorageService();
      const pipeline = createMediaPipeline({
        instagramMediaService: igService,
        mediaStorageService: storageService,
      });

      const { results, errors } = await pipeline.processBatch([
        "https://www.instagram.com/p/AAA/",
        "https://www.instagram.com/p/BBB/",
        "https://www.instagram.com/p/CCC/",
      ]);

      assert.equal(results.length, 2);
      assert.equal(errors.length, 1);
      assert.ok(errors[0].url.includes("BBB"));
      assert.ok(errors[0].error.includes("Download failed"));
    });

    it("should return all errors when all URLs fail", async () => {
      const igService = createMockInstagramMediaService({
        validateUrl: mock.fn(() => ({ valid: false, error: "Invalid" })),
      });
      const storageService = createMockMediaStorageService();
      const pipeline = createMediaPipeline({
        instagramMediaService: igService,
        mediaStorageService: storageService,
      });

      const { results, errors } = await pipeline.processBatch([
        "https://example.com/bad1",
        "https://example.com/bad2",
      ]);

      assert.equal(results.length, 0);
      assert.equal(errors.length, 2);
    });
  });

  // -- Integration-style tests (mocked services, full flow) --

  describe("integration — full URL to S3 URI flow", () => {
    it("should produce correct S3 URI for an image post", async () => {
      const downloaded = createMockDownloadedMedia({
        postId: "17823945012345678",
        shortcode: "CxyzABC",
        mediaType: "image",
        buffer: Buffer.alloc(1024),
        sizeBytes: 1024,
        contentType: "image/jpeg",
        extension: ".jpg",
      });

      const igService = createMockInstagramMediaService({
        fetchMedia: mock.fn(async () => downloaded),
        validateUrl: mock.fn(() => ({ valid: true, shortcode: "CxyzABC", type: "post" })),
      });

      const storageService = createMockMediaStorageService({
        uploadBuffer: mock.fn(async (postId, mediaType, buffer, extra) => ({
          key: "instagram/" + postId + "/" + mediaType + "/" + extra.filename,
          bucket: "ig-media-prod",
          contentType: extra.contentType,
          size: buffer.length,
        })),
      });

      const pipeline = createMediaPipeline({
        instagramMediaService: igService,
        mediaStorageService: storageService,
      });

      const result = await pipeline.processInstagramUrl(
        "https://www.instagram.com/p/CxyzABC/",
      );

      assert.equal(result.s3Uri, "s3://ig-media-prod/instagram/17823945012345678/IMAGE/media.jpg");
      assert.equal(result.s3Key, "instagram/17823945012345678/IMAGE/media.jpg");
      assert.equal(result.bucket, "ig-media-prod");
      assert.equal(result.sizeBytes, 1024);
      assert.equal(result.contentType, "image/jpeg");
    });

    it("should produce correct S3 URIs for video + thumbnail", async () => {
      const downloaded = createMockDownloadedMedia({
        postId: "999888777",
        shortcode: "ReelXYZ",
        mediaType: "video",
        buffer: Buffer.alloc(5000),
        sizeBytes: 5000,
        contentType: "video/mp4",
        extension: ".mp4",
        thumbnailBuffer: Buffer.alloc(500),
      });

      const igService = createMockInstagramMediaService({
        fetchMedia: mock.fn(async () => downloaded),
        validateUrl: mock.fn(() => ({ valid: true, shortcode: "ReelXYZ", type: "reel" })),
      });

      const uploadedKeys = [];
      const storageService = createMockMediaStorageService({
        uploadBuffer: mock.fn(async (postId, mediaType, buffer, extra) => {
          const key = "instagram/" + postId + "/" + mediaType + "/" + extra.filename;
          uploadedKeys.push(key);
          return {
            key,
            bucket: "ig-media-prod",
            contentType: extra.contentType,
            size: buffer.length,
          };
        }),
      });

      const pipeline = createMediaPipeline({
        instagramMediaService: igService,
        mediaStorageService: storageService,
      });

      const result = await pipeline.processInstagramUrl(
        "https://www.instagram.com/reel/ReelXYZ/",
      );

      assert.equal(result.s3Uri, "s3://ig-media-prod/instagram/999888777/VIDEO/media.mp4");
      assert.equal(result.thumbnailS3Uri, "s3://ig-media-prod/instagram/999888777/THUMBNAIL/thumbnail.jpg");
      assert.equal(uploadedKeys.length, 2);
      assert.ok(uploadedKeys.includes("instagram/999888777/VIDEO/media.mp4"));
      assert.ok(uploadedKeys.includes("instagram/999888777/THUMBNAIL/thumbnail.jpg"));
    });

    it("should not upload thumbnail when video has no thumbnailBuffer", async () => {
      const downloaded = createMockDownloadedMedia({
        mediaType: "video",
        thumbnailBuffer: null,
      });

      const igService = createMockInstagramMediaService({
        fetchMedia: mock.fn(async () => downloaded),
      });
      const storageService = createMockMediaStorageService();
      const pipeline = createMediaPipeline({
        instagramMediaService: igService,
        mediaStorageService: storageService,
      });

      const result = await pipeline.processInstagramUrl(
        "https://www.instagram.com/p/ABC123/",
      );

      assert.equal(result.thumbnailS3Uri, null);
      assert.equal(storageService.uploadBuffer.mock.callCount(), 1);
    });

    it("should handle carousel (first item only)", async () => {
      const downloaded = createMockDownloadedMedia({
        mediaType: "carousel",
        buffer: Buffer.alloc(2048),
        sizeBytes: 2048,
        extension: ".jpg",
      });

      const igService = createMockInstagramMediaService({
        fetchMedia: mock.fn(async () => downloaded),
      });
      const storageService = createMockMediaStorageService();
      const pipeline = createMediaPipeline({
        instagramMediaService: igService,
        mediaStorageService: storageService,
      });

      const result = await pipeline.processInstagramUrl(
        "https://www.instagram.com/p/ABC123/",
      );

      assert.equal(result.mediaType, "carousel");
      assert.ok(result.s3Key.includes("CAROUSEL"));
    });
  });
});
