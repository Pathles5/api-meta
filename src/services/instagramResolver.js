import { createError } from "../middleware/errorHandler.js";

/**
 * Supported Instagram URL path patterns.
 * - /p/{shortcode}       → standard post
 * - /reel/{shortcode}    → reel
 * - /tv/{shortcode}      → IGTV
 * - /reels/{shortcode}   → reels (alternate)
 */
const INSTAGRAM_PATH_REGEX =
  /^\/(?:[A-Za-z0-9_.]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)\/?/;

/**
 * Instagram domain patterns (with or without www).
 * @type {RegExp}
 */
const INSTAGRAM_HOST_REGEX =
  /^(?:www\.)?(?:instagram\.com|instagr\.am)$/i;

/**
 * @typedef {Object} ParsedInstagramUrl
 * @property {string} shortcode - The media shortcode.
 * @property {string} type - One of 'post', 'reel', 'tv'.
 * @property {string|null} username - The username if present in the URL.
 */

/**
 * Parse an Instagram public URL and extract the shortcode.
 *
 * Supported formats:
 * - https://www.instagram.com/p/ABC123/
 * - https://instagram.com/reel/ABC123
 * - https://www.instagr.am/p/ABC123/
 * - https://www.instagram.com/username/p/ABC123/
 *
 * @param {string} url - The Instagram post URL.
 * @returns {ParsedInstagramUrl} Parsed URL components.
 * @throws {Error} If the URL is not a valid Instagram post URL.
 */
function parseInstagramUrl(url) {
  if (!url || typeof url !== "string") {
    throw createError(400, "Instagram URL is required");
  }

  let parsed;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw createError(400, "Invalid URL format: " + url);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw createError(400, "Unsupported URL scheme: " + parsed.protocol);
  }

  if (!INSTAGRAM_HOST_REGEX.test(parsed.hostname)) {
    throw createError(
      400,
      "Not an Instagram URL: " + parsed.hostname,
    );
  }

  const pathname = parsed.pathname;
  const match = pathname.match(INSTAGRAM_PATH_REGEX);

  if (!match) {
    throw createError(
      400,
      "Could not extract shortcode from URL path: " + pathname,
    );
  }

  const shortcode = match[1];
  const segments = pathname.split("/").filter(Boolean);

  // Find the path prefix (p, reel, reels, tv) — it may be preceded by a username
  const mediaPrefixes = ["p", "reel", "reels", "tv"];
  const prefixIndex = segments.findIndex((s) =>
    mediaPrefixes.includes(s.toLowerCase()),
  );
  const pathPrefix = prefixIndex >= 0 ? segments[prefixIndex] : segments[0];

  /** @type {string} */
  let type;
  switch (pathPrefix.toLowerCase()) {
    case "reel":
    case "reels":
      type = "reel";
      break;
    case "tv":
      type = "tv";
      break;
    default:
      type = "post";
  }

  // Username is the segment before the media prefix (if any)
  const username =
    prefixIndex > 0 ? segments[prefixIndex - 1] : null;

  return { shortcode, type, username };
}

/**
 * Determine the media type category from an Instagram media_type value.
 * @param {string} mediaType - Raw media type from the Graph API (IMAGE, VIDEO, CAROUSEL_ALBUM).
 * @returns {string} Normalized type: 'image', 'video', or 'carousel'.
 */
function normalizeMediaType(mediaType) {
  switch ((mediaType || "").toUpperCase()) {
    case "VIDEO":
      return "video";
    case "CAROUSEL_ALBUM":
      return "carousel";
    default:
      return "image";
  }
}

/**
 * @typedef {Object} ResolvedMedia
 * @property {string} postId - The Instagram media ID.
 * @property {string} shortcode - The shortcode extracted from the URL.
 * @property {string} mediaType - Normalized type: 'image', 'video', or 'carousel'.
 * @property {string|null} mediaUrl - Direct URL to the primary media (image or video).
 * @property {string|null} thumbnailUrl - Thumbnail URL (for videos).
 * @property {string|null} caption - Post caption text.
 * @property {string} permalink - Permanent link to the post.
 */

/**
 * Resolve an Instagram post URL to direct media URLs using the Meta Graph API.
 *
 * @param {string} instagramUrl - Public Instagram post URL.
 * @param {object} deps
 * @param {Function} deps.fetchPost - async (postId) => post object from Meta API.
 * @returns {Promise<ResolvedMedia>} Resolved media information.
 */
async function resolveMediaUrl(instagramUrl, deps) {
  if (!deps || typeof deps.fetchPost !== "function") {
    throw createError(500, "fetchPost dependency is required");
  }

  const { shortcode, type } = parseInstagramUrl(instagramUrl);

  // The Meta Graph API uses the shortcode as the media identifier
  // when querying via the /{shortcode} endpoint
  let postData;
  try {
    postData = await deps.fetchPost(shortcode);
  } catch (err) {
    if (err.statusCode) {
      throw err;
    }
    throw createError(
      502,
      "Failed to resolve Instagram media: " + err.message,
    );
  }

  if (!postData) {
    throw createError(404, "Instagram post not found: " + shortcode);
  }

  const mediaType = normalizeMediaType(postData.mediaType);
  const mediaUrl = postData.mediaUrl || null;
  const thumbnailUrl = postData.thumbnailUrl || null;

  // For videos, the primary downloadable URL is the mediaUrl (video file)
  // For images, the primary URL is the mediaUrl (image file)
  // For carousels, the mediaUrl is the first item (additional items need separate API calls)

  return {
    postId: postData.id || shortcode,
    shortcode,
    mediaType,
    mediaUrl,
    thumbnailUrl,
    caption: postData.caption || null,
    permalink: postData.permalink || instagramUrl,
    urlType: type,
  };
}

/**
 * Validate whether a URL is a valid Instagram post URL (without making API calls).
 * @param {string} url - The URL to validate.
 * @returns {boolean} True if the URL is a parseable Instagram post URL.
 */
function isInstagramPostUrl(url) {
  try {
    parseInstagramUrl(url);
    return true;
  } catch {
    return false;
  }
}

export {
  parseInstagramUrl,
  resolveMediaUrl,
  normalizeMediaType,
  isInstagramPostUrl,
  INSTAGRAM_PATH_REGEX,
  INSTAGRAM_HOST_REGEX,
};
