import { Router } from "express";
import { fetchPost, fetchPosts } from "../services/metaApi.js";
import { createError } from "../middleware/errorHandler.js";
import * as defaultRepo from "../repositories/postRepository.js";
import { createPostVerificationService } from "../services/postVerification.js";
import * as defaultMetaApi from "../services/metaApi.js";

function createPostsRouter(
  repo = defaultRepo,
  metaApi = defaultMetaApi,
) {
  const router = Router();
  const verification = createPostVerificationService(repo, metaApi);

  router.get("/", async (req, res, next) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;

      if (limit < 1 || limit > 100) {
        return next(createError(400, "Limit must be between 1 and 100"));
      }

      const posts = await fetchPosts(limit);
      const saved = await repo.savePosts(posts.data);

      res.json({ data: saved, paging: posts.paging });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /posts/list?limit=N&cursor=xxx
   * Lee N posts desde DynamoDB con paginacion por cursor.
   */
  router.get("/list", async (req, res, next) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
      const cursor = req.query.cursor || null;

      if (Number.isNaN(limit) || limit < 1 || limit > 100) {
        return next(createError(400, "Limit must be between 1 and 100"));
      }

      const result = await repo.listPosts(limit, cursor);

      res.json({
        data: result.items,
        paging: {
          nextCursor: result.nextCursor,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!id || id.trim().length === 0) {
        return next(createError(400, "Post ID is required"));
      }

      const postId = id.trim();
      const cached = await repo.getPost(postId);

      if (cached && !verification.needsVerification(cached)) {
        return res.json(cached);
      }

      if (cached && verification.needsVerification(cached)) {
        const result = await verification.verifyPost(postId);

        if (result.status === "deleted") {
          return next(createError(404, "Post no longer exists on Instagram"));
        }

        if (result.status === "verified") {
          const updated = await repo.getPost(postId);
          return res.json(updated);
        }

        return res.json(cached);
      }

      const post = await fetchPost(postId);
      const saved = await repo.savePost(post);
      await repo.updateVerificationDate(postId);
      res.json(saved);
    } catch (error) {
      next(error);
    }
  });

  router.post("/sync", async (req, res, next) => {
    try {
      const limit = req.body?.limit || 20;

      if (limit < 1 || limit > 100) {
        return next(createError(400, "Limit must be between 1 and 100"));
      }

      const posts = await fetchPosts(limit);
      const saved = await repo.savePosts(posts.data);

      res.json({
        synced: saved.length,
        data: saved,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/verify", async (req, res, next) => {
    try {
      const limit = req.body?.limit || 50;

      if (limit < 1 || limit > 100) {
        return next(createError(400, "Limit must be between 1 and 100"));
      }

      const result = await verification.verifyStalePosts(limit);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

const postsRouter = createPostsRouter();

export { postsRouter, createPostsRouter };
