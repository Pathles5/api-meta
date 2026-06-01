import { logger } from "../utils/logger.js";

function createPostVerificationService(repo, metaApi) {
  const verificationHours =
    parseInt(process.env.POST_VERIFICATION_HOURS) || 24;

  async function verifyPost(postId) {
    try {
      const post = await metaApi.fetchPost(postId);
      await repo.updateVerificationDate(postId);
      logger.info({ postId }, "Post verified successfully");
      return { status: "verified", post };
    } catch (error) {
      if (error.statusCode === 404) {
        await repo.deletePost(postId);
        logger.info({ postId }, "Post deleted (no longer exists on Instagram)");
        return { status: "deleted", postId };
      }

      if (error.statusCode === 429) {
        logger.warn({ postId }, "Rate limited during verification, skipping");
        return { status: "rate_limited", postId };
      }

      logger.error({ postId, err: error }, "Verification failed");
      return { status: "error", postId, error: error.message };
    }
  }

  async function verifyStalePosts(limit = 50) {
    const posts = await repo.listPostsNeedingVerification(
      verificationHours,
      limit,
    );

    logger.info(
      { count: posts.length, verificationHours },
      "Starting verification of stale posts",
    );

    const results = [];

    for (const post of posts) {
      const result = await verifyPost(post.id);
      results.push(result);

      if (result.status === "rate_limited") {
        logger.warn("Rate limited, stopping verification batch");
        break;
      }
    }

    const summary = {
      total: posts.length,
      verified: results.filter((r) => r.status === "verified").length,
      deleted: results.filter((r) => r.status === "deleted").length,
      rateLimited: results.filter((r) => r.status === "rate_limited").length,
      errors: results.filter((r) => r.status === "error").length,
    };

    logger.info({ summary }, "Verification batch completed");

    return { summary, results };
  }

  function needsVerification(post) {
    if (!post.lastVerificationDate) return true;

    const lastVerified = new Date(post.lastVerificationDate);
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - verificationHours);

    return lastVerified < cutoff;
  }

  return { verifyPost, verifyStalePosts, needsVerification };
}

export { createPostVerificationService };
