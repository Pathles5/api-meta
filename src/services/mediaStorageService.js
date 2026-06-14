import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "../config/s3.js";
import { createError } from "../middleware/errorHandler.js";
import { logger } from "../utils/logger.js";
import { unlink, stat, readFile } from "fs/promises";
import { basename } from "path";

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
 * Infers the MIME content type from a file extension.
 * Falls back to "application/octet-stream" if unknown.
 * @param {string} url - The media URL or filename.
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
    // Invalid URL - fall through to default
  }
  return "media_" + Date.now();
}

/**
 * Builds the S3 object key for a media file.
 * Format: instagram/{postId}/{mediaType}/{filename}
 * @param {string} postId - The Instagram post ID.
 * @param {string} mediaType - The media type (IMAGE, VIDEO, CAROUSEL_ALBUM, THUMBNAIL).
 * @param {string} filename - The media filename.
 * @returns {string} S3 key.
 */
function buildS3Key(postId, mediaType, filename) {
  const normalizedType = (mediaType || "UNKNOWN").toUpperCase();
  return "instagram/" + postId + "/" + normalizedType + "/" + filename;
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
      "Failed to download media: HTTP " + response.status,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType =
    response.headers.get("content-type") || inferContentType(url);

  return { buffer, contentType };
}

/**
 * Deletes temporary local files. Silently ignores ENOENT errors.
 * @param {string|string[]} filePaths - One or more file paths to delete.
 * @returns {Promise<{deleted: string[], failed: string[]}>}
 */
async function cleanupTempFiles(filePaths) {
  const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
  const deleted = [];
  const failed = [];

  for (const filePath of paths) {
    if (!filePath) continue;
    try {
      await unlink(filePath);
      deleted.push(filePath);
      logger.debug({ filePath }, "Temp file cleaned up");
    } catch (err) {
      if (err.code === "ENOENT") {
        logger.debug({ filePath }, "Temp file already removed");
      } else {
        failed.push(filePath);
        logger.warn({ filePath, err: err.message }, "Failed to clean up temp file");
      }
    }
  }

  return { deleted, failed };
}

/**
 * Uploads a buffer to S3 with metadata.
 * @param {import("@aws-sdk/client-s3").S3Client} client - S3 client.
 * @param {string} bucket - S3 bucket name.
 * @param {string} key - S3 object key.
 * @param {Buffer} body - File content.
 * @param {string} contentType - MIME type.
 * @param {object} [metadata] - Custom S3 metadata.
 * @returns {Promise<void>}
 */
async function uploadToS3(client, bucket, key, body, contentType, metadata) {
  const md = metadata || {};
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: md,
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
function createMediaStorageService(options) {
  const opts = options || {};
  const s3Client = opts.s3Client || getS3Client();
  const bucketName = opts.bucketName || process.env.S3_BUCKET_NAME;

  if (!bucketName) {
    throw createError(500, "S3_BUCKET_NAME not configured");
  }

  /**
   * Uploads a buffer to S3 with proper key format and metadata.
   * @param {string} postId - Instagram post ID.
   * @param {string} mediaType - Media type (IMAGE, VIDEO, CAROUSEL_ALBUM, THUMBNAIL).
   * @param {Buffer} buffer - File content.
   * @param {object} [extra]
   * @param {string} [extra.filename]
   * @param {string} [extra.contentType]
   * @param {string} [extra.sourceUrl]
   * @returns {Promise<{key: string, bucket: string, contentType: string, size: number}>}
   */
  async function uploadBuffer(postId, mediaType, buffer, extra) {
    const e = extra || {};
    if (!postId) throw createError(400, "postId is required");
    if (!mediaType) throw createError(400, "mediaType is required");
    if (!buffer || buffer.length === 0) throw createError(400, "buffer is required and must be non-empty");

    const filename = e.filename || ("media_" + Date.now());
    const contentType = e.contentType || inferContentType(filename);
    const key = buildS3Key(postId, mediaType, filename);

    const metadata = {
      postid: postId,
      mediatype: mediaType,
      uploadedat: new Date().toISOString(),
    };
    if (e.sourceUrl) {
      metadata.sourceurl = e.sourceUrl;
    }

    logger.info({ postId, mediaType, key }, "Uploading buffer to S3");
    await uploadToS3(s3Client, bucketName, key, buffer, contentType, metadata);
    logger.info({ key, size: buffer.length, contentType }, "Media stored in S3");

    return { key, bucket: bucketName, contentType, size: buffer.length };
  }

  /**
   * Uploads a local file to S3. Cleans up temp file after upload (success or failure).
   * @param {string} postId
   * @param {string} mediaType
   * @param {string} filePath
   * @param {object} [extra]
   * @returns {Promise<{key: string, bucket: string, contentType: string, size: number, cleanup: object}>}
   */
  async function uploadFile(postId, mediaType, filePath, extra) {
    const e = extra || {};
    if (!postId) throw createError(400, "postId is required");
    if (!mediaType) throw createError(400, "mediaType is required");
    if (!filePath) throw createError(400, "filePath is required");

    const shouldCleanup = e.cleanup !== false;
    const filename = e.filename || basename(filePath);
    const contentType = e.contentType || inferContentType(filePath);

    let fileSize;
    try {
      const fileStat = await stat(filePath);
      fileSize = fileStat.size;
    } catch {
      if (shouldCleanup) await cleanupTempFiles(filePath);
      throw createError(404, "File not found: " + filePath);
    }

    const key = buildS3Key(postId, mediaType, filename);
    const metadata = {
      postid: postId,
      mediatype: mediaType,
      uploadedat: new Date().toISOString(),
    };
    if (e.sourceUrl) {
      metadata.sourceurl = e.sourceUrl;
    }

    logger.info({ postId, mediaType, key, filePath }, "Uploading file to S3");

    let uploadError;
    try {
      const buf = await readFile(filePath);
      await uploadToS3(s3Client, bucketName, key, buf, contentType, metadata);
      logger.info({ key, size: fileSize, contentType }, "File stored in S3");
    } catch (err) {
      uploadError = err;
    }

    let cleanupResult = { deleted: [], failed: [] };
    if (shouldCleanup) {
      cleanupResult = await cleanupTempFiles(filePath);
    }

    if (uploadError) {
      throw uploadError;
    }

    return { key, bucket: bucketName, contentType, size: fileSize, cleanup: cleanupResult };
  }

  /**
   * Downloads media from a URL and stores it in S3.
   * @param {string} postId
   * @param {string} mediaType
   * @param {string} mediaUrl
   * @returns {Promise<{key: string, bucket: string, contentType: string, size: number}>}
   */
  async function storeMedia(postId, mediaType, mediaUrl) {
    if (!postId) throw createError(400, "postId is required");
    if (!mediaUrl) throw createError(400, "mediaUrl is required");
    if (!mediaType) throw createError(400, "mediaType is required");

    const filename = extractFilename(mediaUrl);
    logger.info({ postId, mediaType, mediaUrl }, "Downloading and storing media");
    const { buffer, contentType } = await downloadMedia(mediaUrl);

    return uploadBuffer(postId, mediaType, buffer, {
      filename,
      contentType,
      sourceUrl: mediaUrl,
    });
  }

  /**
   * Stores all media for a post (handles IMAGE, VIDEO, CAROUSEL_ALBUM).
   * @param {object} post
   * @returns {Promise<Array>}
   */
  async function storePostMedia(post) {
    if (!post || !post.id) throw createError(400, "post with id is required");

    const results = [];

    if (post.mediaType === "CAROUSEL_ALBUM" && post.carouselUrls && post.carouselUrls.length) {
      for (const url of post.carouselUrls) {
        const result = await storeMedia(post.id, "CAROUSEL_ALBUM", url);
        results.push(result);
      }
    } else if (post.mediaUrl) {
      const result = await storeMedia(post.id, post.mediaType || "IMAGE", post.mediaUrl);
      results.push(result);
    }

    if (post.mediaType === "VIDEO" && post.thumbnailUrl) {
      const result = await storeMedia(post.id, "THUMBNAIL", post.thumbnailUrl);
      results.push(result);
    }

    return results;
  }

  return {
    uploadBuffer,
    uploadFile,
    storeMedia,
    storePostMedia,
    getBucketName: function getBucketName() { return bucketName; },
  };
}

export {
  createMediaStorageService,
  inferContentType,
  extractFilename,
  buildS3Key,
  downloadMedia,
  uploadToS3,
  cleanupTempFiles,
};
