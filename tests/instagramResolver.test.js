import { describe, it, afterEach, mock } from "node:test";
import assert from "node:assert/strict";

import {
  parseInstagramUrl,
  resolveMediaUrl,
  normalizeMediaType,
  isInstagramPostUrl,
  INSTAGRAM_PATH_REGEX,
  INSTAGRAM_HOST_REGEX,
} from "../src/services/instagramResolver.js";

describe("instagramResolver", () => {
  afterEach(() => {
    mock.reset();
  });

  // ─── parseInstagramUrl ───────────────────────────────────────────

  describe("parseInstagramUrl", () => {
    it("should throw if URL is null", () => {
      assert.throws(() => parseInstagramUrl(null), /URL is required/);
    });

    it("should throw if URL is empty string", () => {
      assert.throws(() => parseInstagramUrl(""), /URL is required/);
    });

    it("should throw if URL is not a string", () => {
      assert.throws(() => parseInstagramUrl(123), /URL is required/);
    });

    it("should throw for malformed URLs", () => {
      assert.throws(() => parseInstagramUrl("not-a-url"), /Invalid URL format/);
    });

    it("should throw for non-HTTP schemes", () => {
      assert.throws(
        () => parseInstagramUrl("ftp://instagram.com/p/ABC123"),
        /Unsupported URL scheme/,
      );
    });

    it("should throw for non-Instagram domains", () => {
      assert.throws(
        () => parseInstagramUrl("https://facebook.com/p/ABC123"),
        /Not an Instagram URL/,
      );
    });

    it("should throw for Instagram profile URLs without shortcode", () => {
      assert.throws(
        () => parseInstagramUrl("https://www.instagram.com/username/"),
        /Could not extract shortcode/,
      );
    });

    it("should parse standard post URL", () => {
      const result = parseInstagramUrl(
        "https://www.instagram.com/p/ABC123/",
      );
      assert.equal(result.shortcode, "ABC123");
      assert.equal(result.type, "post");
    });

    it("should parse post URL without trailing slash", () => {
      const result = parseInstagramUrl(
        "https://www.instagram.com/p/ABC123",
      );
      assert.equal(result.shortcode, "ABC123");
      assert.equal(result.type, "post");
    });

    it("should parse post URL without www", () => {
      const result = parseInstagramUrl(
        "https://instagram.com/p/XYZ789/",
      );
      assert.equal(result.shortcode, "XYZ789");
      assert.equal(result.type, "post");
    });

    it("should parse reel URL", () => {
      const result = parseInstagramUrl(
        "https://www.instagram.com/reel/ABC123/",
      );
      assert.equal(result.shortcode, "ABC123");
      assert.equal(result.type, "reel");
    });

    it("should parse reels URL (alternate)", () => {
      const result = parseInstagramUrl(
        "https://www.instagram.com/reels/ABC123/",
      );
      assert.equal(result.shortcode, "ABC123");
      assert.equal(result.type, "reel");
    });

    it("should parse TV URL", () => {
      const result = parseInstagramUrl(
        "https://www.instagram.com/tv/ABC123/",
      );
      assert.equal(result.shortcode, "ABC123");
      assert.equal(result.type, "tv");
    });

    it("should parse instagr.am short domain", () => {
      const result = parseInstagramUrl(
        "https://instagr.am/p/ABC123/",
      );
      assert.equal(result.shortcode, "ABC123");
      assert.equal(result.type, "post");
    });

    it("should parse URL with username prefix", () => {
      const result = parseInstagramUrl(
        "https://www.instagram.com/someuser/p/ABC123/",
      );
      assert.equal(result.shortcode, "ABC123");
      assert.equal(result.type, "post");
      assert.equal(result.username, "someuser");
    });

    it("should return null username for standard URLs", () => {
      const result = parseInstagramUrl(
        "https://www.instagram.com/p/ABC123/",
      );
      assert.equal(result.username, null);
    });

    it("should handle shortcodes with hyphens and underscores", () => {
      const result = parseInstagramUrl(
        "https://www.instagram.com/p/AbC-_12XyZ/",
      );
      assert.equal(result.shortcode, "AbC-_12XyZ");
    });

    it("should trim whitespace from URL", () => {
      const result = parseInstagramUrl(
        "  https://www.instagram.com/p/ABC123/  ",
      );
      assert.equal(result.shortcode, "ABC123");
    });

    it("should accept http:// scheme", () => {
      const result = parseInstagramUrl(
        "http://www.instagram.com/p/ABC123/",
      );
      assert.equal(result.shortcode, "ABC123");
    });
  });

  // ─── normalizeMediaType ──────────────────────────────────────────

  describe("normalizeMediaType", () => {
    it("should normalize IMAGE to 'image'", () => {
      assert.equal(normalizeMediaType("IMAGE"), "image");
    });

    it("should normalize image (lowercase) to 'image'", () => {
      assert.equal(normalizeMediaType("image"), "image");
    });

    it("should normalize VIDEO to 'video'", () => {
      assert.equal(normalizeMediaType("VIDEO"), "video");
    });

    it("should normalize CAROUSEL_ALBUM to 'carousel'", () => {
      assert.equal(normalizeMediaType("CAROUSEL_ALBUM"), "carousel");
    });

    it("should default to 'image' for null", () => {
      assert.equal(normalizeMediaType(null), "image");
    });

    it("should default to 'image' for undefined", () => {
      assert.equal(normalizeMediaType(undefined), "image");
    });

    it("should default to 'image' for unknown type", () => {
      assert.equal(normalizeMediaType("STORY"), "image");
    });
  });

  // ─── isInstagramPostUrl ──────────────────────────────────────────

  describe("isInstagramPostUrl", () => {
    it("should return true for valid post URL", () => {
      assert.equal(
        isInstagramPostUrl("https://www.instagram.com/p/ABC123/"),
        true,
      );
    });

    it("should return true for valid reel URL", () => {
      assert.equal(
        isInstagramPostUrl("https://www.instagram.com/reel/ABC123/"),
        true,
      );
    });

    it("should return false for invalid URL", () => {
      assert.equal(isInstagramPostUrl("not-a-url"), false);
    });

    it("should return false for non-Instagram URL", () => {
      assert.equal(
        isInstagramPostUrl("https://twitter.com/user/status/123"),
        false,
      );
    });

    it("should return false for Instagram profile URL", () => {
      assert.equal(
        isInstagramPostUrl("https://www.instagram.com/username/"),
        false,
      );
    });

    it("should return false for null", () => {
      assert.equal(isInstagramPostUrl(null), false);
    });
  });

  // ─── resolveMediaUrl ─────────────────────────────────────────────

  describe("resolveMediaUrl", () => {
    it("should throw if fetchPost is not provided", async () => {
      await assert.rejects(
        () => resolveMediaUrl("https://www.instagram.com/p/ABC123/", {}),
        /fetchPost dependency is required/,
      );
    });

    it("should throw if deps is null", async () => {
      await assert.rejects(
        () => resolveMediaUrl("https://www.instagram.com/p/ABC123/", null),
        /fetchPost dependency is required/,
      );
    });

    it("should resolve an image post", async () => {
      const fakePost = {
        id: "17854360229135472",
        mediaType: "IMAGE",
        mediaUrl: "https://scontent.cdninstagram.com/image.jpg",
        thumbnailUrl: null,
        caption: "Test caption",
        permalink: "https://www.instagram.com/p/ABC123/",
      };

      const fetchPost = mock.fn(async () => fakePost);
      const result = await resolveMediaUrl(
        "https://www.instagram.com/p/ABC123/",
        { fetchPost },
      );

      assert.equal(result.postId, "17854360229135472");
      assert.equal(result.shortcode, "ABC123");
      assert.equal(result.mediaType, "image");
      assert.equal(result.mediaUrl, "https://scontent.cdninstagram.com/image.jpg");
      assert.equal(result.caption, "Test caption");
      assert.equal(fetchPost.mock.calls.length, 1);
      assert.equal(fetchPost.mock.calls[0].arguments[0], "ABC123");
    });

    it("should resolve a video post", async () => {
      const fakePost = {
        id: "17854360229135473",
        mediaType: "VIDEO",
        mediaUrl: "https://scontent.cdninstagram.com/video.mp4",
        thumbnailUrl: "https://scontent.cdninstagram.com/thumb.jpg",
        caption: "Video post",
        permalink: "https://www.instagram.com/reel/XYZ789/",
      };

      const fetchPost = mock.fn(async () => fakePost);
      const result = await resolveMediaUrl(
        "https://www.instagram.com/reel/XYZ789/",
        { fetchPost },
      );

      assert.equal(result.mediaType, "video");
      assert.equal(result.mediaUrl, "https://scontent.cdninstagram.com/video.mp4");
      assert.equal(result.thumbnailUrl, "https://scontent.cdninstagram.com/thumb.jpg");
    });

    it("should resolve a carousel post", async () => {
      const fakePost = {
        id: "17854360229135474",
        mediaType: "CAROUSEL_ALBUM",
        mediaUrl: "https://scontent.cdninstagram.com/carousel1.jpg",
        thumbnailUrl: null,
        caption: "Carousel",
        permalink: "https://www.instagram.com/p/CAR001/",
      };

      const fetchPost = mock.fn(async () => fakePost);
      const result = await resolveMediaUrl(
        "https://www.instagram.com/p/CAR001/",
        { fetchPost },
      );

      assert.equal(result.mediaType, "carousel");
      assert.equal(result.mediaUrl, "https://scontent.cdninstagram.com/carousel1.jpg");
    });

    it("should throw 404 if fetchPost returns null", async () => {
      const fetchPost = mock.fn(async () => null);
      await assert.rejects(
        () =>
          resolveMediaUrl("https://www.instagram.com/p/ABC123/", { fetchPost }),
        (err) => err.statusCode === 404,
      );
    });

    it("should propagate HTTP errors from fetchPost", async () => {
      const error = new Error("Unauthorized");
      error.statusCode = 401;
      const fetchPost = mock.fn(async () => {
        throw error;
      });

      await assert.rejects(
        () =>
          resolveMediaUrl("https://www.instagram.com/p/ABC123/", { fetchPost }),
        (err) => err.statusCode === 401,
      );
    });

    it("should wrap non-HTTP errors as 502", async () => {
      const fetchPost = mock.fn(async () => {
        throw new Error("Network failure");
      });

      await assert.rejects(
        () =>
          resolveMediaUrl("https://www.instagram.com/p/ABC123/", { fetchPost }),
        (err) => err.statusCode === 502,
      );
    });

    it("should handle missing mediaUrl gracefully", async () => {
      const fakePost = {
        id: "17854360229135475",
        mediaType: "IMAGE",
        mediaUrl: undefined,
        thumbnailUrl: null,
        caption: null,
        permalink: null,
      };

      const fetchPost = mock.fn(async () => fakePost);
      const result = await resolveMediaUrl(
        "https://www.instagram.com/p/ABC123/",
        { fetchPost },
      );

      assert.equal(result.mediaUrl, null);
      assert.equal(result.thumbnailUrl, null);
      assert.equal(result.caption, null);
    });

    it("should use shortcode as postId fallback when id is missing", async () => {
      const fakePost = {
        mediaType: "IMAGE",
        mediaUrl: "https://example.com/img.jpg",
      };

      const fetchPost = mock.fn(async () => fakePost);
      const result = await resolveMediaUrl(
        "https://www.instagram.com/p/ABC123/",
        { fetchPost },
      );

      assert.equal(result.postId, "ABC123");
    });
  });

  // ─── INSTAGRAM_PATH_REGEX ────────────────────────────────────────

  describe("INSTAGRAM_PATH_REGEX", () => {
    it("should match /p/shortcode", () => {
      assert.ok(INSTAGRAM_PATH_REGEX.test("/p/ABC123/"));
    });

    it("should match /reel/shortcode", () => {
      assert.ok(INSTAGRAM_PATH_REGEX.test("/reel/ABC123/"));
    });

    it("should match /tv/shortcode", () => {
      assert.ok(INSTAGRAM_PATH_REGEX.test("/tv/ABC123/"));
    });

    it("should not match /explore/", () => {
      assert.ok(!INSTAGRAM_PATH_REGEX.test("/explore/"));
    });
  });

  // ─── INSTAGRAM_HOST_REGEX ────────────────────────────────────────

  describe("INSTAGRAM_HOST_REGEX", () => {
    it("should match instagram.com", () => {
      assert.ok(INSTAGRAM_HOST_REGEX.test("instagram.com"));
    });

    it("should match www.instagram.com", () => {
      assert.ok(INSTAGRAM_HOST_REGEX.test("www.instagram.com"));
    });

    it("should match instagr.am", () => {
      assert.ok(INSTAGRAM_HOST_REGEX.test("instagr.am"));
    });

    it("should not match facebook.com", () => {
      assert.ok(!INSTAGRAM_HOST_REGEX.test("facebook.com"));
    });
  });
});
