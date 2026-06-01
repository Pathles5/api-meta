import { createError } from "../middleware/errorHandler.js";

const META_API_BASE = "https://graph.facebook.com/v24.0";

function getAccessToken() {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    throw createError(500, "META_ACCESS_TOKEN not configured");
  }
  return token;
}

function getInstagramUserId() {
  const igUserId = process.env.META_IG_USER_ID;
  if (!igUserId) {
    throw createError(500, "META_IG_USER_ID not configured");
  }
  return igUserId;
}

function handleMetaError(data) {
  if (!data.error) return false;

  const { code, message } = data.error;

  if (code === 190) {
    throw createError(401, "Invalid or expired access token");
  }

  if (code === 4) {
    throw createError(429, "Rate limit exceeded. Please try again later.");
  }

  if (code === 100) {
    throw createError(404, "Post not found");
  }

  throw createError(502, `Meta API error: ${message}`);
}

function normalizePost(data) {
  return {
    id: data.id,
    caption: data.caption || null,
    mediaType: data.media_type,
    mediaUrl: data.media_url || null,
    permalink: data.permalink,
    thumbnailUrl: data.thumbnail_url || null,
    timestamp: data.timestamp,
    likeCount: data.like_count || 0,
    commentsCount: data.comments_count || 0,
  };
}

async function fetchPosts(limit = 20) {
  const accessToken = getAccessToken();
  const igUserId = getInstagramUserId();

  const url = `${META_API_BASE}/${encodeURIComponent(igUserId)}/media?fields=id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,like_count,comments_count&limit=${limit}&access_token=${accessToken}`;

  const response = await fetch(url);
  const data = await response.json();

  handleMetaError(data);

  return {
    data: data.data.map(normalizePost),
    paging: data.paging || null,
  };
}

async function fetchPost(postId) {
  const accessToken = getAccessToken();
  const url = `${META_API_BASE}/${encodeURIComponent(postId)}?fields=id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,like_count,comments_count&access_token=${accessToken}`;

  const response = await fetch(url);
  const data = await response.json();

  handleMetaError(data);

  return normalizePost(data);
}

export { fetchPost, fetchPosts };
