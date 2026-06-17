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

  /**
   * @openapi
   * /posts:
   *   get:
   *     summary: Fetch and cache recent Instagram posts
   *     description: Retrieves recent posts from the Instagram Graph API and caches them in DynamoDB.
   *     tags: [Posts]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           default: 20
   *         description: Number of posts to fetch (1-100)
   *     responses:
   *       200:
   *         description: List of posts with paging info
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   type: array
   *                   items:
   *                     type: object
   *                 paging:
   *                   type: object
   *       400:
   *         description: Invalid limit parameter
   *       401:
   *         description: Unauthorized
   */
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
   *
   * @openapi
   * /posts/list:
   *   get:
   *     summary: List cached posts from DynamoDB
   *     description: Reads posts from DynamoDB with cursor-based pagination.
   *     tags: [Posts]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           minimum: 1
   *           maximum: 100
   *           default: 20
   *         description: Number of posts to return (1-100)
   *       - in: query
   *         name: cursor
   *         schema:
   *           type: string
   *         description: Pagination cursor from previous response
   *     responses:
   *       200:
   *         description: Paginated list of posts
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   type: array
   *                   items:
   *                     type: object
   *                 paging:
   *                   type: object
   *                   properties:
   *                     nextCursor:
   *                       type: string
   *                       nullable: true
   *       400:
   *         description: Invalid limit parameter
   *       401:
   *         description: Unauthorized
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

  /**
   * @openapi
   * /posts/{id}:
   *   get:
   *     summary: Get a single post by ID
   *     description: Retrieves a post by ID from cache or fetches it from Instagram. Verifies stale posts.
   *     tags: [Posts]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Instagram post ID
   *     responses:
   *       200:
   *         description: Post data
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *       400:
   *         description: Post ID is required
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Post no longer exists on Instagram
   */
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

  /**
   * @openapi
   * /posts/sync:
   *   post:
   *     summary: Sync posts from Instagram
   *     description: Fetches recent posts from Instagram and saves them to DynamoDB.
   *     tags: [Posts]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               limit:
   *                 type: integer
   *                 minimum: 1
   *                 maximum: 100
   *                 default: 20
   *     responses:
   *       200:
   *         description: Sync result with count and data
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 synced:
   *                   type: integer
   *                 data:
   *                   type: array
   *                   items:
   *                     type: object
   *       400:
   *         description: Invalid limit parameter
   *       401:
   *         description: Unauthorized
   */
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

  /**
   * @openapi
   * /posts/verify:
   *   post:
   *     summary: Verify stale posts
   *     description: Checks cached posts against Instagram to verify they still exist.
   *     tags: [Posts]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               limit:
   *                 type: integer
   *                 minimum: 1
   *                 maximum: 100
   *                 default: 50
   *     responses:
   *       200:
   *         description: Verification results
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *       400:
   *         description: Invalid limit parameter
   *       401:
   *         description: Unauthorized
   */
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
