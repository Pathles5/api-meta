import { createError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

/**
 * @typedef {Object} MediaPipelineResult
 * @property {string} postId - Instagram post ID.
 * @property {string} shortcode - Post shortcode.
 * @property {string} mediaType - Normalized type: 'image', 'video', or 'carousel'.
 * @property {string} s3Uri - Primary S3 URI (s3://bucket/key).
 * @property {string} s3Key - Primary S3 object key.
 * @property {string} bucket - S3 bucket name.
 * @property {number} sizeBytes - Size of the primary media.
 * @property {string} contentType - MIME type of the primary media.
 * @property {string|null} thumbnailS3Uri - Thumbnail S3 URI (video posts only).
 * @property {string|null} thumbnailS3Key - Thumbnail S3 key.
 * @property {string} sourceUrl - Original Instagram URL.
 * @property {string} permalink - Permanent link to the post.
 */

/**
 * Builds an S3 URI from bucket and key.
 * @param {string} bucket - S3 bucket name.
 * @param {string} key - S3 object key.
 * @returns {string} S3 URI (s3://bucket/key).
 */
function buildS3Uri(bucket, key) {
  return "s3://" + bucket + "/" + key;
}

/**
 * Creates a media pipeline that wires Instagram media download to S3 storage.
 *
 * The pipeline orchestrates two services:
 * 1. instagramMediaService — resolves Instagram URLs and downloads media buffers.
 * 2. mediaStorageService   — uploads buffers to S3 with proper key format and metadata.
 *
 * @param {object} deps
 * @param {object} deps.instagramMediaService - Instagram media service (fetchMedia, validateUrl).
 * @param {object} deps.mediaStorageService - Media storage service (uploadBuffer).
 * @returns {object} Media pipeline.
 */
function createMediaPipeline(deps) {
  if (!deps || !deps.instagramMediaService) {
    throw createError(500, "instagramMediaService dependency is required");
  }
  if (!deps.mediaStorageService) {
    throw createError(500, "mediaStorageService dependency is required");
  }

  const instagramMediaService = deps.instagramMediaService;
  const mediaStorageService = deps.mediaStorageService;

  /**
   * Process an Instagram URL through the full pipeline:
   * validate → resolve → download → upload to S3.
   *
   * For IMAGE posts: downloads and uploads the image.
   * For VIDEO posts: downloads and uploads the video + thumbnail (thumbnail is non-fatal).
   * For CAROUSEL posts: downloads and uploads the first item only.
   *
   * @param {string} instagramUrl - Public Instagram post URL.
   * @param {object} [options]
   * @param {boolean} [options.includeThumbnail=true] - For videos, also upload the thumbnail.
   * @param {Record<string, string>} [options.headers] - Extra HTTP headers for download.
   * @returns {Promise<MediaPipelineResult>}
   */
  async function processInstagramUrl(instagramUrl, options) {
    const opts = options || {};
    const includeThumbnail = opts.includeThumbnail !== false;

    // Step 1: Validate the URL format (fast fail, no API calls)
    const validation = instagramMediaService.validateUrl(instagramUrl);
    if (!validation.valid) {
      throw createError(400, "Invalid Instagram URL: " + validation.error);
    }

    logger.info({ instagramUrl, shortcode: validation.shortcode }, "Pipeline: processing Instagram URL");

    // Step 2: Resolve + download via instagramMediaService
    let downloaded;
    try {
      downloaded = await instagramMediaService.fetchMedia(instagramUrl, {
        includeThumbnail,
        headers: opts.headers,
      });
    } catch (err) {
      // Re-throw with context if it's already a typed error
      if (err.statusCode) {
        throw err;
      }
      throw createError(
        502,
        "Failed to download Instagram media: " + err.message,
      );
    }

    if (!downloaded || !downloaded.buffer || downloaded.buffer.length === 0) {
      const id = downloaded?.shortcode || downloaded?.postId || "unknown";
      throw createError(502, "Downloaded media is empty for post: " + id);
    }

    logger.info(
      { postId: downloaded.postId, mediaType: downloaded.mediaType, sizeBytes: downloaded.sizeBytes },
      "Pipeline: media downloaded",
    );

    // Step 3: Upload primary media to S3
    let uploadResult;
    try {
      uploadResult = await mediaStorageService.uploadBuffer(
        downloaded.postId,
        downloaded.mediaType.toUpperCase(),
        downloaded.buffer,
        {
          filename: "media" + downloaded.extension,
          contentType: downloaded.contentType,
          sourceUrl: downloaded.sourceUrl,
        },
      );
    } catch (err) {
      if (err.statusCode) {
        throw err;
      }
      throw createError(
        500,
        "Failed to upload media to S3: " + err.message,
      );
    }

    logger.info(
      { key: uploadResult.key, bucket: uploadResult.bucket },
      "Pipeline: primary media uploaded to S3",
    );

    // Step 4: For videos, upload thumbnail (non-fatal on failure)
    let thumbnailS3Uri = null;
    let thumbnailS3Key = null;

    if (
      includeThumbnail &&
      downloaded.mediaType === "video" &&
      downloaded.thumbnailBuffer &&
      downloaded.thumbnailBuffer.length > 0
    ) {
      try {
        const thumbResult = await mediaStorageService.uploadBuffer(
          downloaded.postId,
          "THUMBNAIL",
          downloaded.thumbnailBuffer,
          {
            filename: "thumbnail.jpg",
            contentType: "image/jpeg",
            sourceUrl: downloaded.sourceUrl,
          },
        );
        thumbnailS3Uri = buildS3Uri(thumbResult.bucket, thumbResult.key);
        thumbnailS3Key = thumbResult.key;
        logger.info({ key: thumbResult.key }, "Pipeline: thumbnail uploaded to S3");
      } catch (err) {
        // Thumbnail upload failure is non-fatal — log and continue
        logger.warn(
          { err: err.message, postId: downloaded.postId },
          "Pipeline: thumbnail upload failed (non-fatal)",
        );
      }
    }

    // Release buffer references to help GC
    downloaded.buffer = null;
    downloaded.thumbnailBuffer = null;

    const s3Uri = buildS3Uri(uploadResult.bucket, uploadResult.key);

    return {
      postId: downloaded.postId,
      shortcode: downloaded.shortcode,
      mediaType: downloaded.mediaType,
      s3Uri,
      s3Key: uploadResult.key,
      bucket: uploadResult.bucket,
      sizeBytes: uploadResult.size,
      contentType: uploadResult.contentType,
      thumbnailS3Uri,
      thumbnailS3Key,
      sourceUrl: instagramUrl,
      permalink: downloaded.permalink,
    };
  }

  /**
   * Process multiple Instagram URLs in sequence.
   * Continues on individual failures and collects results + errors.
   *
   * @param {string[]} instagramUrls - Array of public Instagram post URLs.
   * @param {object} [options] - Same options as processInstagramUrl.
   * @returns {Promise<{results: MediaPipelineResult[], errors: Array<{url: string, error: string}>}>}
   */
  async function processBatch(instagramUrls, options) {
    if (!Array.isArray(instagramUrls) || instagramUrls.length === 0) {
      throw createError(400, "instagramUrls must be a non-empty array");
    }

    const results = [];
    const errors = [];

    for (const url of instagramUrls) {
      try {
        const result = await processInstagramUrl(url, options);
        results.push(result);
      } catch (err) {
        errors.push({ url, error: err.message });
        logger.warn({ url, err: err.message }, "Pipeline: batch item failed");
      }
    }

    return { results, errors };
  }

  return {
    processInstagramUrl,
    processBatch,
  };
}

export { createMediaPipeline, buildS3Uri };
