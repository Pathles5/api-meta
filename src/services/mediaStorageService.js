import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "../config/s3.js";
import { createError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";

const SUPPORTED_EXTENSIONS = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
};

/**
 * Infers the MIME content type from a URL's file extension.
 * Falls back to "application/octet-stream" if unknown.
 * @param {string} url - The media URL.
 * @returns {string} MIME type.
 */
function inferContentType(url) {
  const lower = url.toLowerCase().split("?")[0];
  for (const [ext, mime] of Object.entries(SUPPORTED_EXTENSIONS)) {
    if (lower.endsWith(ext)) return mime;
  }
  return "application/octet-stream";
}

/**
 * Extracts a filename from a URL path.
 * Falls back to "media" + timestamp if no filename is found.
 * @param {string} url - The media URL.
 * @returns {string} Filename.
 */
function extractFilename(url) {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split("/");
    const last = parts[parts.length - 1];
    if (last && last.includes(".")) {
      return decodeURIComponent(last);
    }
  } catch {
    // Invalid URL — fall through to default
  }
  return `media_${Date.now()}`;
}

/**
 * Builds the S3 object key for a media file.
 * Format: media/{postId}/{filename}
 * @param {string} postId - The Instagram post ID.
 * @param {string} filename - The media filename.
 * @returns {string} S3 key.
 */
function buildS3Key(postId, filename) {
  return `media/${postId}/${filename}`;
}

/**
 * Downloads binary content from a URL.
 * @param {string} url - The URL to download from.
 * @returns {Promise<{buffer: Buffer, contentType: string}>}
 */
async function downloadMedia(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw createError(
      502,
      `Failed to download media: HTTP ${response.status}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType =
    response.headers.get("content-type") || inferContentType(url);

  return { buffer, contentType };
}

/**
 * Uploads a buffer to S3.
 * @param {import("@aws-sdk/client-s3").S3Client} client - S3 client.
 * @param {string} bucket - S3 bucket name.
 * @param {string} key - S3 object key.
 * @param {Buffer} body - File content.
 * @param {string} contentType - MIME type.
 * @returns {Promise<void>}
 */
async function uploadToS3(client, bucket, key, body, contentType) {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/**
 * Creates a media storage service backed by S3.
 * @param {object} [options]
 * @param {import("@aws-sdk/client-s3").S3Client} [options.s3Client] - S3 client (defaults to singleton).
 * @param {string} [options.bucketName] - S3 bucket name (defaults to env S3_BUCKET_NAME).
 * @returns {object} Media storage service.
 */
function createMediaStorageService(options = {}) {
  const s3Client = options.s3Client || getS3Client();
  const bucketName = options.bucketName || process.env.S3_BUCKET_NAME;

  if (!bucketName) {
    throw createError(500, "S3_BUCKET_NAME not configured");
  }

  /**
   * Downloads media from a URL and stores it in S3.
   * @param {string} postId - Instagram post ID.
   * @param {string} mediaUrl - URL of the media to download.
   * @returns {Promise<{key: string, bucket: string, contentType: string, size: number}>}
   */
  async function storeMedia(postId, mediaUrl) {
    if (!postId) {
      throw createError(400, "postId is required");
    }
    if (!mediaUrl) {
      throw createError(400, "mediaUrl is required");
    }

    const filename = extractFilename(mediaUrl);
    const key = buildS3Key(postId, filename);

    logger.info({ postId, mediaUrl, key }, "Downloading and storing media");

    const { buffer, contentType } = await downloadMedia(mediaUrl);
    await uploadToS3(s3Client, bucketName, key, buffer, contentType);

    logger.info({ key, size: buffer.length, contentType }, "Media stored in S3");

    return {
      key,
      bucket: bucketName,
      contentType,
      size: buffer.length,
    };
  }

  /**
   * Stores all media for a post (handles IMAGE, VIDEO, CAROUSEL_ALBUM).
   * For CAROUSEL_ALBUM, accepts an array of media URLs.
   * @param {object} post - Normalized post object.
   * @param {string} post.id - Post ID.
   * @param {string} post.mediaType - IMAGE | VIDEO | CAROUSEL_ALBUM.
   * @param {string|null} post.mediaUrl - Media URL (for IMAGE/VIDEO).
   * @param {string|null} post.thumbnailUrl - Thumbnail URL (for VIDEO).
   * @param {string[]} [post.carouselUrls] - Array of URLs for carousel items.
   * @returns {Promise<Array<{key: string, bucket: string, contentType: string, size: number}>>}
   */
  async function storePostMedia(post) {
    if (!post || !post.id) {
      throw createError(400, "post with id is required");
    }

    const results = [];

    if (post.mediaType === "CAROUSEL_ALBUM" && post.carouselUrls?.length) {
      for (const url of post.carouselUrls) {
        const result = await storeMedia(post.id, url);
        results.push(result);
      }
    } else if (post.mediaUrl) {
      const result = await storeMedia(post.id, post.mediaUrl);
      results.push(result);
    }

    if (post.mediaType === "VIDEO" && post.thumbnailUrl) {
      const result = await storeMedia(post.id, post.thumbnailUrl);
      results.push(result);
    }

    return results;
  }

  return {
    storeMedia,
    storePostMedia,
    getBucketName: () => bucketName,
  };
}

export {
  createMediaStorageService,
  inferContentType,
  extractFilename,
  buildS3Key,
  downloadMedia,
  uploadToS3,
};
