# Architectural Decisions

## 2026-05-31: Project Initialization

### Decision: Project Structure

**Context**: Need a clean, maintainable structure for a small Node.js API project.

**Decision**:
- `src/` for source code
- `tests/` for tests
- `docs/` for documentation and decisions

**Rationale**: Simple, standard structure. Aligns with PROJECT_CONTEXT.md requirements.

**Alternatives considered**:
- Monorepo with separate packages: Rejected (over-engineering for initial phase)
- Flat structure: Rejected (harder to scale)

---

### Decision: Package Manager

**Context**: Need a fast, reliable package manager.

**Decision**: PNPM

**Rationale**: Specified in PROJECT_CONTEXT.md. Faster than npm, better disk usage.

---

### Decision: Module System

**Context**: Node.js 22 supports ESM natively.

**Decision**: ES Modules (`"type": "module"` in package.json)

**Rationale**: Modern standard, better tree-shaking, aligns with Node.js direction.

---

### Decision: Linting

**Context**: Need code quality tooling.

**Decision**: ESLint 10 with flat config

**Rationale**: Industry standard, modern flat config format, supports ESM.

---

### Decision: Testing

**Context**: Need a test runner.

**Decision**: Node.js built-in test runner (`node --test`)

**Rationale**: Zero dependencies, sufficient for unit tests, aligns with "avoid unnecessary dependencies" philosophy.

---

## 2026-05-31: Phase 1 - Basic REST API

### Decision: Web Framework

**Context**: Need a simple, mature web framework for the REST API.

**Decision**: Express.js 5

**Rationale**: Industry standard, extensive documentation, large ecosystem. Express 5 chosen for native ESM support and modern features.

**Alternatives considered**:
- Fastify: Rejected (slightly more complex setup, smaller ecosystem)
- Native HTTP: Rejected (too low-level for rapid development)
- Hono: Rejected (newer, smaller community)

---

### Decision: Project File Structure

**Context**: Need organized separation of concerns.

**Decision**:
- `src/app.js` - Express app configuration and middleware
- `src/server.js` - Server startup and port configuration
- `src/routes/` - Route handlers
- `src/middleware/` - Custom middleware (error handling, validation)

**Rationale**: Clear separation between app configuration and server startup. Routes and middleware are modular and easy to extend.

---

### Decision: Error Handling

**Context**: Need consistent error responses across the API.

**Decision**: Centralized error handler middleware with `createError` helper function.

**Rationale**:
- Errors include status code and message
- Stack traces only exposed in development
- Custom errors can be created with `createError(statusCode, message)`

---

### Decision: Request Validation

**Context**: Need to validate incoming request bodies.

**Decision**: Custom `validateBody` middleware with schema-based validation.

**Rationale**: Simple schema object defines validation rules. No external dependency needed. Supports:
- Required fields
- Type checking
- Min/max length

**Alternatives considered**:
- Joi: Rejected (heavy dependency)
- Zod: Rejected (adds complexity for simple validation)
- JSON Schema: Rejected (overkill for initial phase)

---

## 2026-05-31: Roadmap Reorganization

### Decision: Move Infrastructure to End

**Context**: User prefers to focus on application logic first, leaving infrastructure/IaC for the final deployment phase.

**Decision**: Reorder roadmap so CDK/AWS setup comes after all application features are complete.

**Rationale**:
- Allows faster iteration on business logic
- Infrastructure can be designed based on actual application needs
- Reduces context switching between code and IaC

**New order**:
- Phase 0-5: Application features (foundation, API, security, persistence, post management)
- Phase 6: Infrastructure & Deployment (CDK, AWS setup)
- Phase 7: Webhooks
- Phase 8: Production Readiness (monitoring, documentation)

---

## 2026-05-31: Phase 2 - Meta API Integration

### Decision: Meta Graph API Version

**Context**: Need to integrate with Instagram API to fetch posts.

**Decision**: Use Meta Graph API v24.0

**Rationale**:
- Latest stable version
- Tested and confirmed working with our endpoints
- No breaking changes for our fields
- v19.0 was initial choice, upgraded after testing

---

### Decision: API Client Structure

**Context**: Need to encapsulate Meta API calls.

**Decision**: Create `src/services/metaApi.js` with `fetchPost()` function.

**Rationale**:
- Single responsibility: handles all Meta API communication
- Returns normalized data structure
- Throws typed errors for different failure scenarios

---

### Decision: Error Handling for External API

**Context**: Meta API returns various error codes that need to be mapped to HTTP status codes.

**Decision**: Map Meta error codes to appropriate HTTP status codes:
- Code 190 (invalid token) → 401
- Code 4 (rate limit) → 429
- Code 100 (not found) → 404
- Other errors → 502

**Rationale**: Provides meaningful error responses to clients while exposing internal API details only in development.

---

### Decision: Environment Variables for Credentials

**Context**: Need to store Meta API credentials securely.

**Decision**: Use `META_ACCESS_TOKEN` environment variable. Create `.env.example` for documentation.

**Rationale**: Follows security best practices. Never store credentials in code. Supports different environments.

---

### Decision: Response Data Structure

**Context**: Need consistent response format for Instagram posts.

**Decision**: Normalize Meta API response to:
```javascript
{
  id, caption, mediaType, mediaUrl,
  permalink, thumbnailUrl, timestamp,
  likeCount, commentsCount
}
```

**Rationale**: Consistent interface regardless of Meta API response format. Easier to consume and test.

---

## 2026-05-31: Environment Variable Management

### Decision: Use dotenv

**Context**: Need to load `.env` files for local development.

**Decision**: Use `dotenv` package.

**Rationale**:
- Industry standard for Node.js projects
- Well-tested and maintained
- Supports `.env` file format natively
- Eliminates need for custom `loadEnv.js` utility

**Alternatives considered**:
- Node.js `--env-file`: Rejected (issues with background processes on Windows)
- Custom `loadEnv.js`: Rejected (redundant when `dotenv` exists)

---

### Decision: Persist IG_USER_ID

**Context**: To fetch Instagram posts, we need the Instagram Business Account ID. Initial discovery required multiple API calls.

**Decision**: Store `IG_USER_ID` as environment variable.

**Rationale**:
- `IG_USER_ID` never changes for a given account
- Eliminates need for `FB_PAGE_ID` (only needed for discovery)
- Reduces API calls from 5 to 2 (list posts or get single post)
- One-time setup: get ID via `GET /me/accounts?fields=instagram_business_account`

**Flow to obtain IG_USER_ID** (one-time setup):
```
1. GET /me/accounts?fields=instagram_business_account
   → Returns: [{ id: "FB_PAGE_ID", instagram_business_account: { id: "IG_USER_ID" } }]
2. Store IG_USER_ID in .env
```

---

## 2026-05-31: Meta API Request Flow

### Full Request Flow (Documentation)

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUJO PARA OBTENER UN POST                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PASO 1: Verificar token (opcional, solo debugging)             │
│  GET https://graph.facebook.com/v24.0/me                        │
│  ?access_token=TOKEN                                            │
│  → Retorna: { id: "24779338558434760", name: "..." }           │
│                                                                  │
│  PASO 2: Obtener Facebook Page ID                               │
│  GET https://graph.facebook.com/v24.0/me/accounts               │
│  ?fields=id,name,instagram_business_account                     │
│  &access_token=TOKEN                                            │
│  → Retorna: [{                                                  │
│       id: "951052168088124",                                    │
│       name: "Test paj fb",                                      │
│       instagram_business_account: { id: "17841478291207902" }  │
│     }]                                                          │
│                                                                  │
│  PASO 3: Obtener Instagram Business Account ID                  │
│  (ya viene en el PASO 2 si solicitas el campo                   │
│   instagram_business_account)                                   │
│  → IG_USER_ID = "17841478291207902"                             │
│                                                                  │
│  PASO 4: Listar posts del usuario                               │
│  GET https://graph.facebook.com/v24.0/{IG_USER_ID}/media       │
│  ?fields=id,caption,media_type,timestamp                        │
│  &limit=5                                                       │
│  &access_token=TOKEN                                            │
│  → Retorna: { data: [{ id: "18064467956158130", ... }] }      │
│                                                                  │
│  PASO 5: Obtener un post específico                             │
│  GET https://graph.facebook.com/v24.0/{MEDIA_ID}               │
│  ?fields=id,caption,media_type,media_url,permalink,             │
│          thumbnail_url,timestamp,like_count,comments_count      │
│  &access_token=TOKEN                                            │
│  → Retorna: { id: "18064467956158130", caption: "...", ... }  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

Con IG_USER_ID persistido:
- Eliminamos PASO 2 y PASO 3
- Reducimos de 5 llamadas a 2 (listar posts o consultar uno específico)
```

---

## 2026-05-31: Logging

### Decision: Use pino

**Context**: Need structured logging for production. ESLint warns on `console.log/error`.

**Decision**: Use `pino` logger.

**Rationale**:
- Industry standard for Node.js logging
- JSON output (CloudWatch parses natively)
- Fastest logger in Node.js ecosystem
- Configurable log level via `LOG_LEVEL` env var
- Minimal configuration

**Alternatives considered**:
- winston: Rejected (larger bundle, slower)
- Custom logger: Rejected (reinvents the wheel)

**Usage**:
```javascript
import { logger } from "./utils/logger.js";
logger.info({ port: 3000 }, "Server running");
logger.error({ err }, "Something failed");
```

---

## 2026-05-31: Phase 3 - Security (partial)

### Decision: Configurable Rate Limiting

**Context**: Rate limit values should be configurable per environment without code changes.

**Decision**: Read `APP_RATE_LIMIT_WINDOW_MS` and `APP_RATE_LIMIT_MAX` from environment variables, with defaults (60000ms / 100 requests).

**Rationale**:
- Allows tuning per environment (e.g., stricter in production, relaxed in dev)
- Follows existing `.env` pattern used for `META_ACCESS_TOKEN`, `PORT`, etc.
- Defaults ensure the app works out of the box without explicit configuration

---

## 2026-05-31: Phase 3 - Security

### Decision: API Key Authentication

**Context**: Need to protect API endpoints from unauthorized access.

**Decision**: Implement API key authentication via `X-API-Key` header using custom `authenticate` middleware.

**Rationale**:
- Simple, lightweight authentication for server-to-server communication
- No external dependencies needed
- Health check (`/health`) remains unauthenticated for monitoring probes
- Posts routes (`/posts/*`) require valid API key
- Returns 401 (missing key), 403 (invalid key), or 500 (key not configured)

**Alternatives considered**:
- OAuth/JWT: Rejected (overkill for server-to-server API)
- HTTP Basic Auth: Rejected (less standard for API gateways)
- API Gateway auth (Cognito): Deferred to Phase 6 (CDK/infrastructure)

---

### Decision: CORS Configuration

**Context**: Need to control cross-origin access to the API.

**Decision**: Custom `cors` middleware with configurable `origin`, `methods`, `allowedHeaders`, and preflight handling.

**Rationale**:
- Default `origin: "*"` for development; configurable per environment
- Handles OPTIONS preflight with 204 response
- Exposes rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`)

---

### Decision: Request Logging

**Context**: Need structured request logging for debugging and monitoring.

**Decision**: Custom `requestLogger` middleware using pino logger.

**Rationale**:
- Logs method, URL, status, duration, and IP for every request
- Uses `error` level for status >= 400, `info` for success
- No sensitive data logged (no headers, body, or tokens)

---

## 2026-05-31: Phase 4 - Data Persistence

### Decision: DynamoDB On-Demand

**Context**: Need persistent storage for Instagram posts with cost optimization.

**Decision**: Use Amazon DynamoDB with on-demand (PAY_PER_REQUEST) billing mode.

**Rationale**:
- No provisioned capacity needed — scales automatically
- Free tier: 25 GB storage + 25 WCU/25 RCU per month
- Pay-per-request model ideal for variable workloads
- TTL support natively for cost optimization
- Single-digit millisecond latency

**Alternatives considered**:
- RDS/PostgreSQL: Rejected (overkill for document storage, higher cost)
- SQLite: Rejected (no scalability, no managed service)
- MongoDB: Rejected (additional operational overhead)

---

### Decision: Repository Pattern

**Context**: Need to abstract data access from business logic.

**Decision**: Implement `createPostRepository(client, options)` factory pattern.

**Rationale**:
- Clean separation of concerns (routes ↔ data access)
- Injectable client enables easy testing with mock DynamoDB
- Factory pattern allows multiple configurations (test, dev, prod)
- Consistent interface: `savePost`, `getPost`, `listPosts`, `deletePost`, `savePosts`

**Interface**:
```javascript
const repo = createPostRepository(dynamoClient, { tableName, ttlDays });
await repo.savePost(post);
const post = await repo.getPost(id);
```

---

### Decision: TTL for Cost Optimization

**Context**: Old posts consume storage and read capacity unnecessarily.

**Decision**: Add `expiresAt` field (Unix timestamp) with configurable TTL via `DYNAMODB_POST_TTL_DAYS` env var (default: 90 days).

**Rationale**:
- DynamoDB TTL automatically deletes expired items at no cost
- Reduces storage consumption over time
- Configurable per environment (shorter in dev, longer in prod)

---

### Decision: Environment Variable Naming Convention

**Context**: Environment variables lacked clear scope identification. Mixing `API_KEY`, `PORT`, `RATE_LIMIT_WINDOW_MS`, etc. made it hard to understand which service/module each variable belonged to.

**Decision**: Use prefix-based naming convention:

| Prefix | Scope | Examples |
|---|---|---|
| `META_` | Meta/Instagram API | `META_ACCESS_TOKEN`, `META_IG_USER_ID` |
| `AUTH_` | Authentication | `AUTH_API_KEY` |
| `APP_` | Application config | `APP_PORT`, `APP_RATE_LIMIT_WINDOW_MS`, `APP_RATE_LIMIT_MAX`, `APP_LOG_LEVEL` |
| `AWS_` | AWS config | `AWS_REGION` |
| `DYNAMODB_` | DynamoDB config | `DYNAMODB_ENDPOINT`, `DYNAMODB_TABLE_NAME`, `DYNAMODB_POST_TTL_DAYS` |
| `NODE_ENV` | Standard (keep as-is) | `NODE_ENV` |

**Rationale**:
- Instantly clear which service/module a variable belongs to
- Easy to filter env vars by prefix (e.g., all `DYNAMODB_*` for infrastructure)
- Grouped logically in `.env` files and secret managers
- Follows patterns used by AWS SDK, Meta SDK, and other major projects

**Alternatives considered**:
- Flat naming (e.g., `ACCESS_TOKEN`, `USER_ID`): Rejected (ambiguous scope)
- Nested config objects: Rejected (over-engineering for env vars)
- Config files per environment: Rejected (env vars are standard for 12-factor apps)

---

### Decision: Dependency Injection in Routes

**Context**: Need to test routes with mock repository without module mocking.

**Decision**: `createPostsRouter(repo)` factory accepts repository parameter.

**Rationale**:
- Avoids `mock.module()` which isn't stable in Node.js 22
- Tests inject mock repository directly
- Production uses default repository (DynamoDB-backed)
- Clean, idiomatic approach without experimental features

---

## 2026-05-31: Phase 5 - Post Management

### Decision: On-Demand Post Verification

**Context**: Posts stored in DynamoDB may become stale if deleted or modified on Instagram.

**Decision**: Verify posts on-demand when requested via `GET /:id`, not on a schedule.

**Rationale**:
- No cron job or Lambda scheduled task needed
- Verification happens lazily — only when a client requests a post
- `POST /posts/verify` endpoint available for manual batch verification
- Configurable staleness threshold via `POST_VERIFICATION_HOURS` (default: 24h)

**Flow**:
```
GET /posts/:id
  → Check DynamoDB cache
  → If cached & recently verified → return cached
  → If cached & stale → re-verify with Meta API
      → If still exists → update verification date, return
      → If deleted → delete from DynamoDB, return 404
  → If not in cache → fetch from Meta API, save, return
```

---

### Decision: Post Deletion on Verification Failure

**Context**: When Meta API returns 404 for a post, it means the post was deleted from Instagram.

**Decision**: Automatically delete the post from DynamoDB and return 404 to the client.

**Rationale**:
- Keeps DynamoDB clean of stale data
- Client receives accurate "not found" response
- Consistent behavior between Meta API and local cache

---

### Decision: Deferred S3 Multimedia Storage

**Context**: Instagram media URLs from Meta API expire after ~1 hour. Need to evaluate if persistent media storage (S3) is required.

**Analysis**:

| Factor | Meta URLs (no S3) | S3 Storage |
|--------|-------------------|------------|
| **Cost** | $0 | ~$0.023/GB + PUT/GET requests |
| **Complexity** | None | IAM, bucket config, lifecycle rules |
| **Media availability** | Expires ~1 hour | Permanent |
| **API consumers** | Must fetch before expiry | Can access anytime |
| **Free tier** | N/A | 5 GB S3 Standard |

**Current state**: `mediaUrl` stores the Meta CDN URL directly. For most API consumers (dashboards, analytics), the URL is used immediately. For long-term archival, S3 would be needed.

**Decision**: DEFER S3 implementation until a concrete use case requires persistent media storage.

**When to revisit**:
- API consumers need to access media after Meta URLs expire
- Requirement for media backup/archival
- Need to serve media through CloudFront CDN

**Alternatives considered**:
- S3 + lifecycle policies: Good for archival, adds operational overhead
- CloudFront + S3 origin: Best performance, adds cost ($0.085/GB)
- Media proxy endpoint: Cache in memory, not persistent

---

## 2026-05-31: Phase 6 - Infrastructure & Deployment

### Decision: CDK + Lambda + API Gateway

**Context**: Deploy API to AWS. Never deploy from local — all deployments via GitHub Actions pipeline.

**Decision**: AWS CDK with Lambda + API Gateway REST API, deployed from GitHub Actions on push to `main`.

**Architecture**:
```
GitHub Actions (CI/CD)
  → pnpm lint → pnpm test → CDK deploy
    → Lambda (Node.js 22, ARM64, 256MB)
      → @vendia/serverless-express (Express.js adapter)
    → API Gateway REST API (Regional endpoint)
    → DynamoDB (PAY_PER_REQUEST)
```

**Rationale**:
- Lambda: pay-per-request, zero cost when idle, free tier covers 1M requests/month
- ARM64: 20% cheaper than x86
- API Gateway: managed, auto-scales, built-in throttling
- CDK: infrastructure as code, version-controlled, reproducible
- GitHub Actions: deploy only on push to main after tests pass
- Secrets stored in GitHub Secrets, never in code or .env

**Region**: eu-west-1 (Ireland)

**Stack name prefix**: `ig-api`

---

### Decision: Lambda Handler with serverless-express

**Context**: Express.js app needs to run inside AWS Lambda.

**Decision**: Use `@vendia/serverless-express` to wrap the existing Express app as a Lambda handler.

**Rationale**:
- Zero changes to existing Express routes/middleware
- `lambda.js` is the only new entry point
- Same app runs locally (server.js) and in Lambda (lambda.js)
- Well-maintained, widely adopted adapter

---

### Decision: Deployment Pipeline

**Context**: All infrastructure changes must go through CI/CD, never from local machines.

**Decision**: GitHub Actions workflow with two jobs:
1. `lint-and-test`: runs on every push/PR
2. `deploy`: runs only on push to `main` after tests pass

**Required GitHub Secrets**:

| Secret | Description |
|--------|-------------|
| `META_ACCESS_TOKEN` | Meta API token (for Lambda env) |
| `META_IG_USER_ID` | Instagram Business Account ID |
| `AUTH_API_KEY` | API key for client authentication |

> Nota: `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` eliminados — ahora se usa OIDC con `role-to-assume`.

**Rationale**:
- Secrets never in code, .env, or repo
- Deployment gated by tests passing
- `--require-approval never` avoids manual approval prompts
- Outputs file provides API URL after deploy

---

## 2026-05-31: Phase 5 - Post Verification Service

### Decision: On-Demand Post Verification with Factory Pattern

**Context**: Need to verify posts stored in DynamoDB are still live on Instagram, without using cron jobs or scheduled tasks.

**Decision**:
- On-demand (lazy) verification: check staleness on `GET /:id`
- Factory pattern service: `createPostVerificationService(repo, metaApi)`
- Batch endpoint `POST /verify` for manual triggering

**Rationale**:
- No cron job or EventBridge Scheduler needed
- Zero additional AWS cost
- Simple, educational approach
- Verification happens only when data is requested

**Alternatives considered**:
- EventBridge Scheduler: Rejected — unnecessary cost/complexity for educational project
- CloudWatch Events cron: Rejected — adds Lambda invocation costs
- Background worker: Rejected — over-engineering for current scale

---

## 2026-06-01: Code Review Fixes

### Decision: Timing-Safe API Key Comparison

**Context**: API key comparison using `!==` is vulnerable to timing attacks. An attacker can measure response time differences to guess the key byte-by-byte.

**Decision**: Use `crypto.timingSafeEqual` with `Buffer.from()` in `authenticate.js`.

**Rationale**:
- Constant-time comparison prevents timing attacks
- `try/catch` handles mismatched buffer lengths gracefully
- No external dependencies needed

---

### Decision: Error Handler Log Level Differentiation

**Context**: All errors were logged at `error` level, making it impossible to distinguish 4xx client errors from 5xx server errors in CloudWatch Logs.

**Decision**: Log `statusCode >= 500` at `error` level, everything else at `warn` level.

**Rationale**:
- Prevents client errors from inflating alarms
- Cleaner CloudWatch logs for debugging
- Follows standard logging practices

---

### Decision: Batch Writes with BatchWriteCommand

**Context**: `savePosts` used sequential `PutCommand` calls — 100 posts = 100 DynamoDB round trips, increasing Lambda duration cost.

**Decision**: Use `BatchWriteCommand` with chunks of 25 items (DynamoDB limit).

**Rationale**:
- Reduces DynamoDB round trips by ~25x
- Lower Lambda duration cost
- Shared `createdAt` timestamp per batch

---

## 2026-06-01: CI/CD Security Hardening

### Decision: OIDC for AWS Credentials (Eliminating Static Keys)

**Context**: `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` were stored as GitHub Secrets. Static keys have rotation requirements and potential exposure risk.

**Decision**: Replace static keys with OIDC (OpenID Connect) via `aws-actions/configure-aws-credentials@v4` with `role-to-assume`.

**Rationale**:
- No long-lived AWS secrets in GitHub Secrets
- Temporary credentials (1-hour expiry) via OIDC token exchange
- Automatic rotation — no manual key management
- GitHub OIDC provider cryptographically signs tokens
- Added `permissions: id-token: write` and `aws sts get-caller-identity` verification

**GitHub Secrets eliminados**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`

**Requiere**: IAM role `GitHubActionsDeployRole` with OIDC trust policy in AWS (✅ Account ID: `123456789012`)

---

### Decision: Request Body Size Limit

**Context**: `express.json()` without a limit allows arbitrarily large payloads, risking Lambda memory exhaustion.

**Decision**: Set `express.json({ limit: "1mb" })`.

**Rationale**:
- 1mb is sufficient for Instagram post metadata
- Prevents abuse via large payloads
- Aligns with Lambda 256MB memory

---

### Decision: URL-Encoding in Meta API Calls

**Context**: `igUserId` and `postId` were interpolated directly into URLs without encoding. Special characters could break the URL.

**Decision**: Apply `encodeURIComponent()` to both `igUserId` in `fetchPosts` and `postId` in `fetchPost`.

**Rationale**:
- Defensive coding against malformed IDs
- Consistent pattern across both functions
- Prevents URL injection

---

## 2026-06-01: Security Hardening

### Decision: CDK Deploy Approval Policy

**Context**: `--require-approval never` bypasses all CDK security checks (IAM, security groups). A code change could accidentally grant excessive permissions.

**Decision**: Change to `--require-approval broadening`.

**Rationale**:
- Requires manual approval when permissions are broadened
- Still auto-approves when permissions are narrowed
- Balances safety with deployment speed

---

### Decision: Dependency Audit Severity Threshold

**Context**: `pnpm audit --audit-level=moderate` with `continue-on-error: true` meant all vulnerabilities were silently ignored.

**Decision**: Change to `--audit-level=critical` without `continue-on-error`.

**Rationale**:
- Critical vulnerabilities should block deployment
- Moderate/low vulnerabilities are logged but don't block
- Prevents known critical CVEs from reaching production

---

### Decision: CI/CD Secrets Exposure Prevention

**Context**: `cdk-outputs.json` contained API Gateway URL and was left on the runner after deployment.

**Decision**: Delete `cdk-outputs.json` after outputting the API URL.

**Rationale**:
- Prevents credential/data leakage in CI artifacts
- API URL is logged in the workflow output for reference
- Follows principle of least exposure

---

## 2026-06-01: Pre-deploy Health Check en CI/CD

### Decision: Pre-deploy Health Check

**Context**: En sesiones anteriores, el usuario borró manualmente la tabla DynamoDB `ig-posts` para desbloquear un deploy, dejando el stack de CloudFormation en estado inconsistente. Esto causó fallos silenciosos en deploys posteriores.

**Decision**: Agregar un paso de verificación previa al deploy en `.github/workflows/ci.yml` que comprueba el estado del stack y la tabla DynamoDB antes de ejecutar `cdk deploy`. Si detecta inconsistencias, falla con un mensaje claro y acciones correctivas.

**Consequences**:
- Positivas: Previene deploys fallidos por estado inconsistente, mensajes de error claros
- Negativas: Agrega ~5 segundos al pipeline de CI/CD

**Alternatives considered**:
1. No verificar y dejar que CloudFormation falle → rechazada (errores confusos)
2. Usar `cdk import` automáticamente → rechazada (requiere interacción manual)
3. Verificar solo la tabla → rechazada (insuficiente, hay más recursos críticos)

---

## 2026-06-06: Estrategia de Entornos

### Decision: Stacks CDK Independientes por Entorno

**Context**: El proyecto necesita múltiples entornos (dev, pre, int, pro) con aislamiento completo de recursos.

**Decision**: Usar stacks CDK separados por entorno (`ig-api-pre`, `ig-api-int`, `ig-api-pro`), cada uno con sus propios recursos (Lambda, API Gateway, DynamoDB, CloudWatch). El entorno `dev` es local y no tiene stack en AWS.

**Rationale**:
- Aislamiento total entre entornos (datos, configuración, URLs)
- Despliegue independiente sin riesgo de afectar otros entornos
- Nombres de recursos únicos automáticamente (usan `${id}` = stack name)
- Dentro del AWS Free Tier para 2-3 entornos

**Alternatives considered**:
- Stack único con parámetros: Rechazada (no se pueden desplegar múltiples instancias del mismo stack)
- CDK Pipelines + Stages: Rechazada (over-engineering, CodePipeline tiene costo)

**Implementation**:
- Variable `IG_ENV` controla el entorno activo (default: `pre`)
- Stack name dinámico: `ig-api-${IG_ENV}`
- Table name dinámico: `ig-posts-${IG_ENV}`
- Stage name en API Gateway: `${IG_ENV}` (no hardcodeado como `prod`)
- Cada entorno tiene su propia branch: `dev`, `pre`, `int`, `pro`

**Consequences**:
- Positivas: Aislamiento, claridad, fácil de entender
- Negativas: Más stacks que gestionar (pero CDK lo automatiza)

---

## Pending Items

- [x] ~~Update Meta Graph API from v19.0 to v24.0~~ ✅ Completed
- [x] ~~Security audit and hardening~~ ✅ Completed
