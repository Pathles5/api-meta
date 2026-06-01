# Roadmap

## Phase 0: Foundation ✅

**Status**: Completed

- [x] Initialize project with PNPM
- [x] Create directory structure: src/, tests/, docs/
- [x] Configure .gitignore
- [x] Set up ESLint with flat config
- [x] Initialize Git repository
- [x] Create GitHub Actions CI workflow
- [x] Create README.md
- [x] Create docs/decisions.md
- [x] Create docs/roadmap.md

---

## Phase 1: Basic REST API ✅

**Status**: Completed

- [x] Set up Express.js server
- [x] Create health check endpoint (`GET /health`)
- [x] Implement centralized error handling
- [x] Add request validation
- [x] Write initial unit tests

---

## Phase 2: Meta API Integration ✅

**Status**: Completed

- [x] Configure Facebook Developer account and app (manual step)
- [x] Create `GET /posts/:id` endpoint
- [x] Create `GET /posts` endpoint (list posts)
- [x] Handle Meta API rate limits and errors
- [x] Add integration tests with mocks
- [x] Use dotenv for environment variables
- [x] Persist IG_USER_ID in environment
- [x] Implement pino logger

---

## Phase 3: Security

**Status**: Completed

- [x] Implement API key authentication (X-API-Key header, /health excluded)
- [x] Add rate limiting (configurable from .env)
- [x] Configure CORS (configurable origin, preflight handling)
- [x] Add request logging (pino, no secrets exposed)

---

## Phase 4: Data Persistence

**Status**: Completed

- [x] Set up DynamoDB on-demand (AWS SDK v3)
- [x] Implement repository pattern (createPostRepository factory)
- [x] Add TTL for cost optimization (configurable POST_TTL_DAYS)
- [x] Dependency injection in routes for testability

---

## Phase 5: Post Management

**Status**: Completed

- [x] On-demand post verification (GET /:id checks staleness)
- [x] Handle post deletion (Meta 404 → delete from DynamoDB)
- [x] Update lastVerificationDate (via updateVerificationDate)
- [x] Batch verification endpoint (POST /posts/verify)
- [x] Configurable verification interval (POST_VERIFICATION_HOURS)
- [x] Store media URL from Meta CDN directly in DynamoDB (no S3) — Revisiting if links expire faster than expected

---

## Phase 6: Infrastructure & Deployment

**Status**: Completed

- [x] Initialize AWS CDK project
- [x] Set up API Gateway + Lambda (serverless-express)
- [x] Configure DynamoDB tables (CDK PAY_PER_REQUEST, TTL enabled)
- [x] Lambda handler (lambda.js) — same Express app, different entry point
- [x] GitHub Actions deploy pipeline (lint → test → CDK deploy)
- [x] GitHub Secrets documented
- [x] Lambda packaging optimization (exclude patterns)
- [x] API Gateway throttling (100 RPS / 200 burst)
- [x] CloudWatch alarms (Lambda errors + throttles)
- [x] CDK bootstrap conditional (skip if exists)
- [x] CDK deploy approval: `broadening` mode
- [x] pnpm cache in CI
- [x] Dependency audit (critical level)
- [x] Security hardening (timing-safe auth, body limit, batch writes)

---

## Phase 7: Webhooks

**Status**: Ready to implement

**Note**: Webhooks require HTTPS endpoint. The cloud deployment (Phase 6) is now complete, so implementation can proceed.

- [ ] Create `POST /webhooks` endpoint
- [ ] Implement webhook signature validation
- [ ] Handle subscription verification (challenge-response)
- [ ] Process incoming events (publications, notifications)

---

## Phase 8: Production Readiness

**Status**: Pending

- [ ] Monitoring and alerting (CloudWatch)
- [ ] API documentation
- [ ] Cost review
- [ ] Final testing
