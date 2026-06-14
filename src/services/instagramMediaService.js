import { createError } from "../middleware/errorHandler.js";
import { resolveMediaUrl, parseInstagramUrl } from "./instagramResolver.js";
import { HttpClient } from "./httpClient.js";

/**
 * @typedef {Object} InstagramMediaServiceConfig
 * @property {HttpClient} [httpClient] - HTTP client instance (created if not provided).
 * @property {Function} fetchPost - async (shortcode) => post data from Meta Graph API.
 * @property {number} [maxFileSize] - Maximum download size in bytes (default: 100MB).
 * @property {number} [connectTimeout] - Connection timeout in ms (default: 10000).
 * @property {number} [readTimeout] - Read idle timeout in ms (default: 60000).
 */

/**
 * @typedef {Object} DownloadedMedia
 * @property {string} postId - Instagram post ID.
 * @property {string} shortcode - Post shortcode.
 * @property {string} mediaType - Normalized type: 'image', 'video', or 'carousel'.
 * @property {Buffer} buffer - Downloaded media content.
 * @property {number} sizeBytes - Size of the downloaded content.
 * @property {string} contentType - MIME type of the content.
 * @property {string} extension - File extension (e.g. '.jpg', '.mp4').
 * @property {string} sourceUrl - Direct URL that was downloaded.
 * @property {string|null} thumbnailBuffer - Thumbnail buffer (for video posts).
 * @property {string|null} caption - Post caption text.
 * @property {string} permalink - Permanent link to the post.
 */

/**
 * Default max file size: 100 MB.
 * @type {number}
 */
const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024;

/**
 * Create an Instagram media service facade.
 *
 * Combines URL resolution (Instagram URL → direct media URL) with
 * HTTP streaming download (media URL → Buffer) to provide a single
 * entry point for fetching Instagram media.
 *
 * @param {InstagramMediaServiceConfig} config - Service configuration.
 * @returns {object} Instagram media service.
 */
function createInstagramMediaService(config) {
  if (!config || typeof config.fetchPost !== "function") {
    throw createError(500, "fetchPost dependency is required");
  }

  const httpClient =
    config.httpClient ||
    new HttpClient({
      maxFileSize: config.maxFileSize || DEFAULT_MAX_FILE_SIZE,
      connectTimeout: config.connectTimeout || 10_000,
      readTimeout: config.readTimeout || 60_000,
    });

  const fetchPost = config.fetchPost;

  /**
   * Resolve an Instagram URL to media metadata (without downloading).
   *
   * @param {string} instagramUrl - Public Instagram post URL.
   * @returns {Promise<import("./instagramResolver.js").ResolvedMedia>}
   */
  async function resolveMedia(instagramUrl) {
    return resolveMediaUrl(instagramUrl, { fetchPost });
  }

  /**
   * Download media from a direct URL into a Buffer.
   *
   * @param {string} mediaUrl - Direct CDN URL to the media file.
   * @param {object} [options]
   * @param {Record<string, string>} [options.headers] - Extra HTTP headers.
   * @returns {Promise<{buffer: Buffer, sizeBytes: number, contentType: string, extension: string, url: string}>}
   */
  async function downloadBuffer(mediaUrl, options) {
    if (!mediaUrl) {
      throw createError(400, "mediaUrl is required");
    }
    return httpClient.downloadToBuffer(mediaUrl, options);
  }

  /**
   * Fetch Instagram media: resolve the URL and download the media content.
   *
   * For IMAGE posts: downloads the image.
   * For VIDEO posts: downloads the video file (+ optionally the thumbnail).
   * For CAROUSEL posts: downloads only the first item (use fetchCarousel for all items).
   *
   * @param {string} instagramUrl - Public Instagram post URL.
   * @param {object} [options]
   * @param {boolean} [options.includeThumbnail=true] - For videos, also download the thumbnail.
   * @param {Record<string, string>} [options.headers] - Extra HTTP headers.
   * @returns {Promise<DownloadedMedia>}
   */
  async function fetchMedia(instagramUrl, options) {
    const opts = options || {};
    const includeThumbnail = opts.includeThumbnail !== false;

    // Step 1: Resolve the Instagram URL to direct media URLs
    const resolved = await resolveMedia(instagramUrl);

    if (!resolved.mediaUrl) {
      throw createError(
        404,
        "No media URL available for post: " + resolved.shortcode,
      );
    }

    // Step 2: Download the primary media
    const downloaded = await downloadBuffer(resolved.mediaUrl, {
      headers: opts.headers,
    });

    // Step 3: For videos, optionally download the thumbnail
    let thumbnailBuffer = null;
    if (
      includeThumbnail &&
      resolved.mediaType === "video" &&
      resolved.thumbnailUrl
    ) {
      try {
        const thumbResult = await downloadBuffer(resolved.thumbnailUrl, {
          headers: opts.headers,
        });
        thumbnailBuffer = thumbResult.buffer;
      } catch {
        // Thumbnail download failure is non-fatal
        thumbnailBuffer = null;
      }
    }

    return {
      postId: resolved.postId,
      shortcode: resolved.shortcode,
      mediaType: resolved.mediaType,
      buffer: downloaded.buffer,
      sizeBytes: downloaded.sizeBytes,
      contentType: downloaded.contentType,
      extension: downloaded.extension,
      sourceUrl: resolved.mediaUrl,
      thumbnailBuffer,
      caption: resolved.caption,
      permalink: resolved.permalink,
    };
  }

  /**
   * Get metadata about the media without downloading the full content.
   * Uses a HEAD request to retrieve Content-Type and Content-Length.
   *
   * @param {string} instagramUrl - Public Instagram post URL.
   * @returns {Promise<object>} Media metadata including dimensions hint and size.
   */
  async function peekMedia(instagramUrl) {
    const resolved = await resolveMedia(instagramUrl);

    if (!resolved.mediaUrl) {
      throw createError(
        404,
        "No media URL available for post: " + resolved.shortcode,
      );
    }

    const headResult = await httpClient.head(resolved.mediaUrl);

    return {
      postId: resolved.postId,
      shortcode: resolved.shortcode,
      mediaType: resolved.mediaType,
      contentType: headResult.contentType,
      contentLength: headResult.contentLength,
      extension: headResult.extension,
      sourceUrl: resolved.mediaUrl,
      hasThumbnail: !!resolved.thumbnailUrl,
      caption: resolved.caption,
      permalink: resolved.permalink,
    };
  }

  /**
   * Validate an Instagram URL without making any API calls.
   *
   * @param {string} url - URL to validate.
   * @returns {{ valid: boolean, shortcode?: string, type?: string, error?: string }}
   */
  function validateUrl(url) {
    try {
      const parsed = parseInstagramUrl(url);
      return { valid: true, shortcode: parsed.shortcode, type: parsed.type };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  /**
   * Clean up resources.
   */
  function destroy() {
    httpClient.destroy();
  }

  return {
    resolveMedia,
    downloadBuffer,
    fetchMedia,
    peekMedia,
    validateUrl,
    destroy,
  };
}

export { createInstagramMediaService, DEFAULT_MAX_FILE_SIZE };
