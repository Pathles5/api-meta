import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";

import {
  createInstagramMediaService,
  DEFAULT_MAX_FILE_SIZE,
} from "../src/services/instagramMediaService.js";

/**
 * Create a mock fetchPost function that returns a configurable post.
 * @param {object} postData - The post data to return.
 * @returns {Function} Mock fetchPost.
 */
function createMockFetchPost(postData) {
  return mock.fn(async () => postData);
}

/**
 * Create a mock HttpClient with controllable behavior.
 * @param {object} [overrides]
 * @returns {object} Mock HttpClient.
 */
function createMockHttpClient(overrides) {
  const o = overrides || {};
  return {
    downloadToBuffer: mock.fn(
      o.downloadToBuffer ||
        (async () => ({
          buffer: Buffer.from("fake-media-content"),
          sizeBytes: 18,
          contentType: "image/jpeg",
          extension: ".jpg",
          url: "https://scontent.cdninstagram.com/image.jpg",
        })),
    ),
    head: mock.fn(
      o.head ||
        (async () => ({
          contentType: "image/jpeg",
          contentLength: 12345,
          url: "https://scontent.cdninstagram.com/image.jpg",
          extension: ".jpg",
          headers: {},
        })),
    ),
    destroy: mock.fn(o.destroy || (() => {})),
  };
}

const SAMPLE_IMAGE_POST = {
  id: "17854360229135472",
  mediaType: "IMAGE",
  mediaUrl: "https://scontent.cdninstagram.com/v/image.jpg",
  thumbnailUrl: null,
  caption: "Test image post",
  permalink: "https://www.instagram.com/p/ABC123/",
};

const SAMPLE_VIDEO_POST = {
  id: "17854360229135473",
  mediaType: "VIDEO",
  mediaUrl: "https://scontent.cdninstagram.com/v/video.mp4",
  thumbnailUrl: "https://scontent.cdninstagram.com/v/thumb.jpg",
  caption: "Test video post",
  permalink: "https://www.instagram.com/reel/XYZ789/",
};

describe("instagramMediaService", () => {
  let service;
  let mockClient;
  let fetchPost;

  afterEach(() => {
    mock.reset();
    if (service) service.destroy();
  });

  // ─── createInstagramMediaService ─────────────────────────────────

  describe("createInstagramMediaService", () => {
    it("should throw if fetchPost is not provided", () => {
      assert.throws(
        () => createInstagramMediaService({}),
        /fetchPost dependency is required/,
      );
    });

    it("should throw if config is null", () => {
      assert.throws(
        () => createInstagramMediaService(null),
        /fetchPost dependency is required/,
      );
    });

    it("should create service with valid config", () => {
      fetchPost = createMockFetchPost(SAMPLE_IMAGE_POST);
      service = createInstagramMediaService({ fetchPost });
      assert.ok(service);
      assert.equal(typeof service.fetchMedia, "function");
      assert.equal(typeof service.resolveMedia, "function");
      assert.equal(typeof service.downloadBuffer, "function");
      assert.equal(typeof service.peekMedia, "function");
      assert.equal(typeof service.validateUrl, "function");
      assert.equal(typeof service.destroy, "function");
    });

    it("should accept a custom httpClient", () => {
      fetchPost = createMockFetchPost(SAMPLE_IMAGE_POST);
      mockClient = createMockHttpClient();
      service = createInstagramMediaService({ fetchPost, httpClient: mockClient });
      assert.ok(service);
    });
  });

  // ─── DEFAULT_MAX_FILE_SIZE ───────────────────────────────────────

  describe("DEFAULT_MAX_FILE_SIZE", () => {
    it("should be 100MB", () => {
      assert.equal(DEFAULT_MAX_FILE_SIZE, 100 * 1024 * 1024);
    });
  });

  // ─── validateUrl ─────────────────────────────────────────────────

  describe("validateUrl", () => {
    beforeEach(() => {
      fetchPost = createMockFetchPost(SAMPLE_IMAGE_POST);
      service = createInstagramMediaService({ fetchPost });
    });

    it("should return valid for correct post URL", () => {
      const result = service.validateUrl("https://www.instagram.com/p/ABC123/");
      assert.equal(result.valid, true);
      assert.equal(result.shortcode, "ABC123");
      assert.equal(result.type, "post");
    });

    it("should return valid for reel URL", () => {
      const result = service.validateUrl(
        "https://www.instagram.com/reel/XYZ789/",
      );
      assert.equal(result.valid, true);
      assert.equal(result.shortcode, "XYZ789");
      assert.equal(result.type, "reel");
    });

    it("should return invalid for non-Instagram URL", () => {
      const result = service.validateUrl("https://twitter.com/user/status/123");
      assert.equal(result.valid, false);
      assert.ok(result.error);
    });

    it("should return invalid for null", () => {
      const result = service.validateUrl(null);
      assert.equal(result.valid, false);
    });
  });

  // ─── resolveMedia ────────────────────────────────────────────────

  describe("resolveMedia", () => {
    it("should resolve an image post", async () => {
      fetchPost = createMockFetchPost(SAMPLE_IMAGE_POST);
      service = createInstagramMediaService({ fetchPost });

      const result = await service.resolveMedia(
        "https://www.instagram.com/p/ABC123/",
      );

      assert.equal(result.shortcode, "ABC123");
      assert.equal(result.mediaType, "image");
      assert.equal(result.mediaUrl, SAMPLE_IMAGE_POST.mediaUrl);
      assert.equal(fetchPost.mock.calls.length, 1);
    });

    it("should resolve a video post", async () => {
      fetchPost = createMockFetchPost(SAMPLE_VIDEO_POST);
      service = createInstagramMediaService({ fetchPost });

      const result = await service.resolveMedia(
        "https://www.instagram.com/reel/XYZ789/",
      );

      assert.equal(result.mediaType, "video");
      assert.equal(result.mediaUrl, SAMPLE_VIDEO_POST.mediaUrl);
      assert.equal(result.thumbnailUrl, SAMPLE_VIDEO_POST.thumbnailUrl);
    });

    it("should throw for invalid URL", async () => {
      fetchPost = createMockFetchPost(SAMPLE_IMAGE_POST);
      service = createInstagramMediaService({ fetchPost });

      await assert.rejects(
        () => service.resolveMedia("not-a-url"),
        /Invalid URL format/,
      );
    });
  });

  // ─── downloadBuffer ──────────────────────────────────────────────

  describe("downloadBuffer", () => {
    it("should download content to buffer via httpClient", async () => {
      fetchPost = createMockFetchPost(SAMPLE_IMAGE_POST);
      mockClient = createMockHttpClient();
      service = createInstagramMediaService({
        fetchPost,
        httpClient: mockClient,
      });

      const result = await service.downloadBuffer(
        "https://scontent.cdninstagram.com/image.jpg",
      );

      assert.ok(Buffer.isBuffer(result.buffer));
      assert.equal(result.sizeBytes, 18);
      assert.equal(mockClient.downloadToBuffer.mock.calls.length, 1);
    });

    it("should throw for null URL", async () => {
      fetchPost = createMockFetchPost(SAMPLE_IMAGE_POST);
      mockClient = createMockHttpClient();
      service = createInstagramMediaService({
        fetchPost,
        httpClient: mockClient,
      });

      await assert.rejects(
        () => service.downloadBuffer(null),
        /mediaUrl is required/,
      );
    });

    it("should pass headers to httpClient", async () => {
      fetchPost = createMockFetchPost(SAMPLE_IMAGE_POST);
      mockClient = createMockHttpClient();
      service = createInstagramMediaService({
        fetchPost,
        httpClient: mockClient,
      });

      await service.downloadBuffer("https://example.com/img.jpg", {
        headers: { "X-Custom": "value" },
      });

      const callArgs = mockClient.downloadToBuffer.mock.calls[0].arguments;
      assert.deepEqual(callArgs[1], { headers: { "X-Custom": "value" } });
    });
  });

  // ─── fetchMedia ──────────────────────────────────────────────────

  describe("fetchMedia", () => {
    it("should resolve URL and download image", async () => {
      fetchPost = createMockFetchPost(SAMPLE_IMAGE_POST);
      mockClient = createMockHttpClient();
      service = createInstagramMediaService({
        fetchPost,
        httpClient: mockClient,
      });

      const result = await service.fetchMedia(
        "https://www.instagram.com/p/ABC123/",
      );

      assert.equal(result.shortcode, "ABC123");
      assert.equal(result.mediaType, "image");
      assert.ok(Buffer.isBuffer(result.buffer));
      assert.equal(result.sourceUrl, SAMPLE_IMAGE_POST.mediaUrl);
      assert.equal(result.caption, "Test image post");
      assert.equal(result.thumbnailBuffer, null);
    });

    it("should download video and thumbnail for video posts", async () => {
      let downloadCallCount = 0;
      fetchPost = createMockFetchPost(SAMPLE_VIDEO_POST);
      mockClient = createMockHttpClient({
        downloadToBuffer: mock.fn(async (url) => {
          downloadCallCount++;
          if (url.includes("video.mp4")) {
            return {
              buffer: Buffer.from("video-data"),
              sizeBytes: 10,
              contentType: "video/mp4",
              extension: ".mp4",
              url,
            };
          }
          return {
            buffer: Buffer.from("thumb-data"),
            sizeBytes: 5,
            contentType: "image/jpeg",
            extension: ".jpg",
            url,
          };
        }),
      });
      service = createInstagramMediaService({
        fetchPost,
        httpClient: mockClient,
      });

      const result = await service.fetchMedia(
        "https://www.instagram.com/reel/XYZ789/",
      );

      assert.equal(result.mediaType, "video");
      assert.ok(Buffer.isBuffer(result.buffer));
      assert.ok(Buffer.isBuffer(result.thumbnailBuffer));
      assert.equal(downloadCallCount, 2);
    });

    it("should skip thumbnail when includeThumbnail is false", async () => {
      fetchPost = createMockFetchPost(SAMPLE_VIDEO_POST);
      mockClient = createMockHttpClient();
      service = createInstagramMediaService({
        fetchPost,
        httpClient: mockClient,
      });

      const result = await service.fetchMedia(
        "https://www.instagram.com/reel/XYZ789/",
        { includeThumbnail: false },
      );

      assert.equal(result.thumbnailBuffer, null);
      assert.equal(mockClient.downloadToBuffer.mock.calls.length, 1);
    });

    it("should handle thumbnail download failure gracefully", async () => {
      fetchPost = createMockFetchPost(SAMPLE_VIDEO_POST);
      mockClient = createMockHttpClient({
        downloadToBuffer: mock.fn(async (url) => {
          if (url.includes("thumb")) {
            throw new Error("Thumbnail CDN error");
          }
          return {
            buffer: Buffer.from("video-data"),
            sizeBytes: 10,
            contentType: "video/mp4",
            extension: ".mp4",
            url,
          };
        }),
      });
      service = createInstagramMediaService({
        fetchPost,
        httpClient: mockClient,
      });

      const result = await service.fetchMedia(
        "https://www.instagram.com/reel/XYZ789/",
      );

      assert.ok(Buffer.isBuffer(result.buffer));
      assert.equal(result.thumbnailBuffer, null);
    });

    it("should throw if resolved post has no mediaUrl", async () => {
      const noMediaPost = {
        id: "123",
        mediaType: "IMAGE",
        mediaUrl: null,
        thumbnailUrl: null,
        caption: null,
        permalink: "https://www.instagram.com/p/ABC123/",
      };
      fetchPost = createMockFetchPost(noMediaPost);
      service = createInstagramMediaService({ fetchPost });

      await assert.rejects(
        () => service.fetchMedia("https://www.instagram.com/p/ABC123/"),
        /No media URL available/,
      );
    });

    it("should propagate download errors", async () => {
      fetchPost = createMockFetchPost(SAMPLE_IMAGE_POST);
      mockClient = createMockHttpClient({
        downloadToBuffer: mock.fn(async () => {
          throw new Error("CDN timeout");
        }),
      });
      service = createInstagramMediaService({
        fetchPost,
        httpClient: mockClient,
      });

      await assert.rejects(
        () => service.fetchMedia("https://www.instagram.com/p/ABC123/"),
        /CDN timeout/,
      );
    });
  });

  // ─── peekMedia ───────────────────────────────────────────────────

  describe("peekMedia", () => {
    it("should return metadata without downloading", async () => {
      fetchPost = createMockFetchPost(SAMPLE_IMAGE_POST);
      mockClient = createMockHttpClient();
      service = createInstagramMediaService({
        fetchPost,
        httpClient: mockClient,
      });

      const result = await service.peekMedia(
        "https://www.instagram.com/p/ABC123/",
      );

      assert.equal(result.shortcode, "ABC123");
      assert.equal(result.mediaType, "image");
      assert.equal(result.contentType, "image/jpeg");
      assert.equal(result.contentLength, 12345);
      assert.equal(mockClient.downloadToBuffer.mock.calls.length, 0);
      assert.equal(mockClient.head.mock.calls.length, 1);
    });

    it("should throw if no mediaUrl available", async () => {
      const noMediaPost = {
        id: "123",
        mediaType: "IMAGE",
        mediaUrl: null,
        permalink: "https://www.instagram.com/p/ABC123/",
      };
      fetchPost = createMockFetchPost(noMediaPost);
      mockClient = createMockHttpClient();
      service = createInstagramMediaService({
        fetchPost,
        httpClient: mockClient,
      });

      await assert.rejects(
        () => service.peekMedia("https://www.instagram.com/p/ABC123/"),
        /No media URL available/,
      );
    });

    it("should indicate hasThumbnail for video posts", async () => {
      fetchPost = createMockFetchPost(SAMPLE_VIDEO_POST);
      mockClient = createMockHttpClient();
      service = createInstagramMediaService({
        fetchPost,
        httpClient: mockClient,
      });

      const result = await service.peekMedia(
        "https://www.instagram.com/reel/XYZ789/",
      );

      assert.equal(result.hasThumbnail, true);
    });
  });

  // ─── destroy ─────────────────────────────────────────────────────

  describe("destroy", () => {
    it("should call httpClient.destroy", () => {
      fetchPost = createMockFetchPost(SAMPLE_IMAGE_POST);
      mockClient = createMockHttpClient();
      service = createInstagramMediaService({
        fetchPost,
        httpClient: mockClient,
      });

      service.destroy();
      assert.equal(mockClient.destroy.mock.calls.length, 1);
    });
  });
});
