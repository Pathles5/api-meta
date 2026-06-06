# Instagram REST API

REST API for integrating with Meta's Instagram API to retrieve posts and handle webhook events.

## Objectives

- Retrieve Instagram posts via the Meta API
- Receive and process Instagram webhook events
- Learn how AI-assisted development agents work on real projects

## Tech Stack

- **Runtime**: Node.js 24
- **Package Manager**: PNPM
- **Framework**: Express.js 5
- **Logger**: pino
- **Database**: DynamoDB (on-demand, AWS SDK v3)
- **Infrastructure**: AWS CDK (Lambda, API Gateway, DynamoDB)
- **CI/CD**: GitHub Actions (lint → test → deploy)
- **Region**: eu-west-1 (Ireland)

## Architecture

```
┌──────────┐      ┌───────────────┐      ┌─────────────────┐
│  Client   │─────▶│ API Gateway   │─────▶│ Lambda (Express)│
│           │◀─────│ (REST API)    │◀─────│                 │
└──────────┘      └───────────────┘      └────────┬────────┘
                                                  │
                                    ┌─────────────┼─────────────┐
                                    ▼                           ▼
                            ┌──────────────┐          ┌──────────────┐
                            │   DynamoDB   │          │  Meta API    │
                            │  (ig-posts)  │          │ (v24.0)      │
                            └──────────────┘          └──────────────┘
```

## Project Structure

```
src/
├── config/             # AWS/DynamoDB client configuration
├── middleware/          # Express middleware (auth, cors, errorHandler, rateLimit, requestLogger)
├── repositories/       # Data access layer (postRepository)
├── routes/             # Route handlers (health, posts)
├── services/           # Business logic (metaApi, postVerification)
├── utils/              # Utilities (logger)
├── app.js              # Express app configuration
├── index.js            # Package entry point
└── server.js           # Server startup (local dev)
infra/
├── bin/                # CDK app entry point
└── lib/                # CDK stack definitions
lambda.js               # Lambda handler (serverless-express adapter)
tests/                  # Tests
scripts/                # Setup scripts (setup-table.js)
docs/                   # Documentation and decisions
```

## Environment Variables

Create a `.env` file based on `.env.example`:

```env
# Meta API
META_ACCESS_TOKEN=your_access_token_here
META_IG_USER_ID=your_ig_user_id_here

# Authentication
AUTH_API_KEY=your_api_key_here

# Application
APP_PORT=3000
NODE_ENV=development
APP_RATE_LIMIT_WINDOW_MS=60000
APP_RATE_LIMIT_MAX=100
APP_LOG_LEVEL=info

# AWS
AWS_REGION=eu-west-1

# DynamoDB
DYNAMODB_ENDPOINT=http://localhost:8000
DYNAMODB_TABLE_NAME=ig-posts
DYNAMODB_POST_TTL_DAYS=90

# Post Verification
POST_VERIFICATION_HOURS=24
```

| Variable | Prefix | Description |
|----------|--------|-------------|
| `META_ACCESS_TOKEN` | `META_` | Meta/Facebook API access token |
| `META_IG_USER_ID` | `META_` | Instagram Business Account ID |
| `AUTH_API_KEY` | `AUTH_` | API key for client authentication (`X-API-Key` header) |
| `APP_PORT` | `APP_` | Server port (default: `3000`) |
| `NODE_ENV` | — | Environment: `development`, `production`, etc. |
| `APP_RATE_LIMIT_WINDOW_MS` | `APP_` | Rate limit window in ms (default: `60000`) |
| `APP_RATE_LIMIT_MAX` | `APP_` | Max requests per window (default: `100`) |
| `APP_LOG_LEVEL` | `APP_` | Log level: `fatal`, `error`, `warn`, `info`, `debug`, `trace` |
| `AWS_REGION` | `AWS_` | AWS region (default: `eu-west-1`) |
| `DYNAMODB_ENDPOINT` | `DYNAMODB_` | DynamoDB endpoint (local: `http://localhost:8000`) |
| `DYNAMODB_TABLE_NAME` | `DYNAMODB_` | DynamoDB table name (default: `ig-posts`) |
| `DYNAMODB_POST_TTL_DAYS` | `DYNAMODB_` | Post TTL in days (default: `90`) |
| `POST_VERIFICATION_HOURS` | `POST_` | Hours before post re-verification (default: `24`) |

### How to get META_IG_USER_ID

```bash
# 1. Verify your token
curl -s "https://graph.facebook.com/v24.0/me?fields=id,name&access_token=TOKEN"

# 2. Get your Facebook Page ID and IG User ID
curl -s "https://graph.facebook.com/v24.0/me/accounts?fields=id,name,instagram_business_account&access_token=TOKEN"

# Response:
# {
#   "data": [{
#     "id": "FB_PAGE_ID",
#     "name": "Page Name",
#     "instagram_business_account": { "id": "IG_USER_ID" }
#   }]
# }
```

## Instagram API Request Flow

### Initial Setup (One-time)

```
┌─────────────────────────────────────────────────────────────────┐
│                    OBTENER IG_USER_ID                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. GET https://graph.facebook.com/v24.0/me/accounts            │
│     ?fields=id,name,instagram_business_account                  │
│     &access_token=TOKEN                                         │
│                                                                  │
│  2. Response:                                                    │
│     {                                                           │
│       "data": [{                                                │
│         "id": "FB_PAGE_ID",                                     │
│         "instagram_business_account": { "id": "IG_USER_ID" }   │
│       }]                                                        │
│     }                                                           │
│                                                                  │
│  3. Store IG_USER_ID in .env                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Fetching Posts

```
┌─────────────────────────────────────────────────────────────────┐
│                    LISTAR POSTS                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  GET https://graph.facebook.com/v24.0/{IG_USER_ID}/media       │
│  ?fields=id,caption,media_type,media_url,permalink,             │
│          thumbnail_url,timestamp,like_count,comments_count      │
│  &limit=20                                                      │
│  &access_token=TOKEN                                            │
│                                                                  │
│  Response:                                                       │
│  {                                                               │
│    "data": [                                                    │
│      { "id": "18064467956158130", "caption": "...", ... },     │
│      { "id": "18064467956158131", "caption": "...", ... }      │
│    ],                                                            │
│    "paging": { "cursors": {...}, "next": "..." }               │
│  }                                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    OBTENER POST POR ID                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  GET https://graph.facebook.com/v24.0/{MEDIA_ID}               │
│  ?fields=id,caption,media_type,media_url,permalink,             │
│          thumbnail_url,timestamp,like_count,comments_count      │
│  &access_token=TOKEN                                            │
│                                                                  │
│  Response:                                                       │
│  {                                                               │
│    "id": "18064467956158130",                                   │
│    "caption": "Lorem ipsum...",                                 │
│    "media_type": "IMAGE",                                       │
│    "media_url": "https://...",                                  │
│    "permalink": "https://instagram.com/p/DRhKRJajORk/",        │
│    "like_count": 10,                                            │
│    "comments_count": 2                                          │
│  }                                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Error Codes

| Meta Code | HTTP | Description |
|-----------|------|-------------|
| 190 | 401 | Invalid or expired access token |
| 4 | 429 | Rate limit exceeded |
| 100 | 404 | Post not found |
| Other | 502 | Meta API error |

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | No | Health check |
| GET | `/posts` | Yes | List posts (query: `limit=1-100`, default: 20) |
| GET | `/posts/:id` | Yes | Get post by ID (with on-demand verification) |
| POST | `/posts/sync` | Yes | Sync posts from Meta API to DynamoDB (body: `{ limit: 1-100 }`, default: 20) |
| POST | `/posts/verify` | Yes | Verify stale posts and delete removed ones |

**Auth**: Requires `X-API-Key` header (see `AUTH_API_KEY` env var).

## Logging

The API uses `pino` for structured JSON logging.

**Log levels** (set via `APP_LOG_LEVEL` env var):
- `fatal` > `error` > `warn` > `info` (default) > `debug` > `trace`

**Example output**:
```json
{"level":30,"time":1717165200000,"port":3000,"msg":"Server running"}
```

## Getting Started

### Prerequisites

- Node.js 24+
- PNPM
- Java 21+ (for DynamoDB Local)

### Install

```bash
pnpm install
```

### Local Development

The API uses DynamoDB Local for development. Follow these steps:

#### 1. Start DynamoDB Local (Terminal 1)

```bash
pnpm db:start
```

This starts DynamoDB Local on `http://localhost:8000`.

#### 2. Create the database table (Terminal 2, first time only)

```bash
pnpm db:setup
```

#### 3. Start the API server (Terminal 3)

```bash
pnpm dev
```

The server starts on `http://localhost:3000` with hot-reload.

### Testing the API

```bash
# Health check (no auth required)
curl http://localhost:3000/health

# List posts from Meta API → saved to DynamoDB
curl -H "X-API-Key: sk-test-abc123def456" \
  http://localhost:3000/posts?limit=3

# Get post by ID (served from DynamoDB cache)
curl -H "X-API-Key: sk-test-abc123def456" \
  http://localhost:3000/posts/POST_ID

# Verify stale posts (>24h without verification)
curl -X POST \
  -H "X-API-Key: sk-test-abc123def456" \
  -H "Content-Type: application/json" \
  -d '{"limit":50}' \
  http://localhost:3000/posts/verify

# Without API key → 401
curl http://localhost:3000/posts
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm db:start` | Start DynamoDB Local (port 8000) |
| `pnpm db:setup` | Create the DynamoDB table |
| `pnpm dev` | Start API server with hot-reload |
| `pnpm start` | Start API server (production) |
| `pnpm test` | Run all tests |
| `pnpm lint` | Run ESLint |
| `pnpm lint:fix` | Run ESLint with auto-fix |

### Test

```bash
pnpm test
```

### Lint

```bash
pnpm lint
```

## Deployment

Deployments are automated via GitHub Actions. **Never deploy from local.**

### Pipeline Flow

```
Push to main → GitHub Actions
  → lint → test → CDK deploy → API live
```

### Required GitHub Secrets

Configure these in your repository: **Settings → Secrets and variables → Actions**

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | AWS IAM user access key |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM user secret key |
| `META_ACCESS_TOKEN` | Meta/Facebook API access token |
| `META_IG_USER_ID` | Instagram Business Account ID |
| `AUTH_API_KEY` | API key for client authentication |

### AWS Resources Created

- **Lambda Function**: `ig-api` (Node.js 22, ARM64, 256MB)
- **API Gateway**: REST API (Regional, eu-west-1)
- **DynamoDB Table**: `ig-posts` (PAY_PER_REQUEST)

### Manual Deploy (emergency only)

```bash
# Requires AWS CLI configured locally
pnpm cdk deploy --require-approval never
```

## 🌍 Entornos

El proyecto soporta múltiples entornos con stacks CDK independientes:

| Entorno | Stack | Stage | Branch | Descripción |
|---------|-------|-------|--------|-------------|
| `dev` | N/A | N/A | `dev` | Desarrollo local |
| `pre` | `ig-api-pre` | `pre` | `pre` | Preproducción (AWS) |
| `int` | `ig-api-int` | `int` | `int` | Integración (AWS) |
| `pro` | `ig-api-pro` | `pro` | `pro` | Producción (AWS) |

### Desplegar a un entorno específico

```bash
# Desplegar a pre (default)
pnpm cdk deploy

# Desplegar a pro
IG_ENV=pro pnpm cdk deploy

# Desplegar a int
IG_ENV=int pnpm cdk deploy
```

Cada entorno tiene su propia tabla DynamoDB, Lambda, API Gateway y CloudWatch Dashboard.

### Flujo de trabajo con branches

```bash
# Desarrollo local
git checkout dev
# ... hacer cambios ...
git push origin dev

# Desplegar a pre
git checkout pre
git merge dev
git push origin pre  # → deploy automático

# Desplegar a int
git checkout int
git merge pre
git push origin int  # → deploy automático

# Desplegar a pro (con approval)
git checkout pro
git merge int
git push origin pro  # → deploy con approval manual
```

## Documentation

- [Project Context](PROJECT_CONTEXT.md)
- [Decisions](docs/decisions.md)
- [Roadmap](docs/roadmap.md)

## License

ISC
