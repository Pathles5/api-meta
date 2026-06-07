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

El proyecto utiliza **16 variables de entorno** organizadas por categoría. **4 son obligatorias** y **12 son opcionales**.

### Variables de Entorno - Tabla Completa

| Variable | Categoría | Obligatoria | Descripción | Valor por defecto | Ejemplo |
|----------|-----------|-------------|-------------|-------------------|---------|
| `META_ACCESS_TOKEN` | META | ✅ **Sí** | Token de acceso Meta/Facebook API | — | `EAABsbCS...` |
| `META_IG_USER_ID` | META | ✅ **Sí** | ID de cuenta de Instagram Business | — | `17841400...` |
| `META_APP_SECRET` | META | ✅ **Sí** | Secret de la app Meta (para HMAC webhooks) | — | `abc123...` |
| `META_VERIFY_TOKEN` | META | ❌ No | Token de verificación de webhooks (lo defines tú) | — | `my_verify_token` |
| `AUTH_API_KEY` | AUTH | ✅ **Sí** | API key para autenticación de clientes (`X-API-Key` header) | — | `sk-test-abc123...` |
| `APP_PORT` | APP | ❌ No | Puerto del servidor | `3000` | `3000` |
| `NODE_ENV` | APP | ❌ No | Modo de ejecución de Node.js. En Lambda siempre es "production" por seguridad y rendimiento. NO confundir con IG_ENV. | `production` | `development` (local), `production` (CDK) |
| `APP_RATE_LIMIT_WINDOW_MS` | APP | ❌ No | Ventana de rate limit en milisegundos | `60000` | `60000` |
| `APP_RATE_LIMIT_MAX` | APP | ❌ No | Máximo de requests por ventana | `100` | `100` |
| `APP_LOG_LEVEL` | APP | ❌ No | Nivel de log | `info` | `debug` |
| `AWS_REGION` | AWS | ❌ No | Región de AWS | `eu-west-1` | `eu-west-1` |
| `DYNAMODB_ENDPOINT` | DYNAMODB | ❌ No | Endpoint de DynamoDB | `http://localhost:8000` | `http://localhost:8000` |
| `DYNAMODB_TABLE_NAME` | DYNAMODB | ❌ No | Nombre de la tabla DynamoDB | `ig-posts` | `ig-posts-pre` |
| `DYNAMODB_POST_TTL_DAYS` | DYNAMODB | ❌ No | TTL de posts en días | `90` | `90` |
| `POST_VERIFICATION_HOURS` | POST | ❌ No | Horas antes de re-verificación de posts | `24` | `24` |
| `IG_ENV` | ENTORNO | ❌ No | Entorno de infraestructura. Controla nombres de recursos AWS (stack, tabla, API Gateway). Se obtiene automáticamente del nombre de la branch en CI/CD. NO confundir con NODE_ENV. | `pre` | `pro` |

### ⚠️ Diferencia entre NODE_ENV e IG_ENV

Es importante no confundir estas dos variables:

| Variable | Propósito | Valores | Uso |
|----------|-----------|---------|-----|
| **NODE_ENV** | Modo de ejecución de Node.js | `development`, `production`, `test` | Controla comportamiento del runtime (ej: stack traces en errores) |
| **IG_ENV** | Entorno de infraestructura | `dev`, `pre`, `int`, `pro` | Controla nombres de recursos AWS (stack, tabla, API Gateway) |

**¿Por qué NODE_ENV=production en Lambda?**

En AWS Lambda, `NODE_ENV` siempre se establece como `"production"` independientemente del entorno (pre/int/pro) porque:
- Es el estándar de la industria para servidores
- Mejora el rendimiento (Node.js optimiza para production)
- Es más seguro (no expone stack traces en errores)

**¿Cómo se identifica el entorno entonces?**

Con `IG_ENV`, que se obtiene automáticamente del nombre de la branch en CI/CD:
- Branch `pre` → `IG_ENV=pre` → Stack `ig-api-pre`, Tabla `ig-posts-pre`
- Branch `int` → `IG_ENV=int` → Stack `ig-api-int`, Tabla `ig-posts-int`
- Branch `pro` → `IG_ENV=pro` → Stack `ig-api-pro`, Tabla `ig-posts-pro`

**Ejemplo análogo:** En un proyecto React, puedes tener múltiples entornos (staging, production) todos con `NODE_ENV=production`, pero cada uno con su propia configuración de infraestructura.

### Categorías de Variables

#### 🔷 META (4 variables)
- **`META_ACCESS_TOKEN`** (Obligatoria): Token de acceso a la API de Meta/Facebook. Se obtiene desde [developers.facebook.com](https://developers.facebook.com/)
- **`META_IG_USER_ID`** (Obligatoria): ID de tu cuenta de Instagram Business. Se obtiene haciendo llamadas a la API de Graph
- **`META_APP_SECRET`** (Obligatoria): Secret de tu aplicación Meta. Se usa para verificar la autenticidad de webhooks mediante HMAC
- **`META_VERIFY_TOKEN`** (Opcional): Token que defines tú para verificar webhooks. Se configura en el panel de Meta

#### 🔐 AUTH (1 variable)
- **`AUTH_API_KEY`** (Obligatoria): API key que los clientes usan para autenticar requests. Se envía en el header `X-API-Key`

#### ⚙️ APP (5 variables)
- **`APP_PORT`**: Puerto del servidor (solo desarrollo local)
- **`NODE_ENV`**: Modo de ejecución de Node.js (`development`, `production`). En Lambda siempre es `production`. NO confundir con `IG_ENV`
- **`APP_RATE_LIMIT_WINDOW_MS`**: Ventana de tiempo para rate limiting en milisegundos
- **`APP_RATE_LIMIT_MAX`**: Máximo de requests permitidos por ventana
- **`APP_LOG_LEVEL`**: Nivel de log (`fatal`, `error`, `warn`, `info`, `debug`, `trace`)

#### ☁️ AWS (1 variable)
- **`AWS_REGION`**: Región de AWS donde se despliega (default: `eu-west-1` - Irlanda)

#### 🗄️ DYNAMODB (3 variables)
- **`DYNAMODB_ENDPOINT`**: Endpoint de DynamoDB. En local usa `http://localhost:8000`, en AWS se ignora
- **`DYNAMODB_TABLE_NAME`**: Nombre de la tabla DynamoDB
- **`DYNAMODB_POST_TTL_DAYS`**: Días que un post se mantiene antes de ser eliminado automáticamente

#### 📝 POST (1 variable)
- **`POST_VERIFICATION_HOURS`**: Horas que pasan antes de que un post sea re-verificado contra la API de Meta

#### 🌍 ENTORNO (1 variable)
- **`IG_ENV`**: Entorno de infraestructura (`dev`, `pre`, `int`, `pro`). Controla nombres de recursos AWS. Se obtiene automáticamente del nombre de la branch. NO confundir con `NODE_ENV`

### Ejemplo de archivo `.env` para desarrollo local

```env
# 🔷 META API (Obligatorias)
META_ACCESS_TOKEN=EAABsbCS6X4kBAMNlRZAjZAy5ZCZA...
META_IG_USER_ID=17841400123456789
META_APP_SECRET=abc123def456ghi789jkl012mno345
META_VERIFY_TOKEN=my_custom_verify_token

# 🔐 AUTH (Obligatoria)
AUTH_API_KEY=sk-test-abc123def456ghi789

# ⚙️ APP (Opcionales)
APP_PORT=3000
NODE_ENV=development
APP_RATE_LIMIT_WINDOW_MS=60000
APP_RATE_LIMIT_MAX=100
APP_LOG_LEVEL=info

# ☁️ AWS (Opcional)
AWS_REGION=eu-west-1

# 🗄️ DYNAMODB (Opcionales - solo para desarrollo local)
DYNAMODB_ENDPOINT=http://localhost:8000
DYNAMODB_TABLE_NAME=ig-posts
DYNAMODB_POST_TTL_DAYS=90

# 📝 POST (Opcional)
POST_VERIFICATION_HOURS=24

# 🌍 ENTORNO (Opcional)
IG_ENV=dev
```

### Cómo obtener `META_IG_USER_ID`

```bash
# 1. Verificar tu token
curl -s "https://graph.facebook.com/v24.0/me?fields=id,name&access_token=TOKEN"

# 2. Obtener tu Facebook Page ID y IG User ID
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

## Configuración de GitHub Secrets

El proyecto utiliza **GitHub Environments** para gestionar secretos de forma segura. Cada entorno de despliegue (`pre`, `int`, `pro`) tiene su propio conjunto de secretos.

### Crear GitHub Environment "pre"

1. **Ir a Settings → Environments → New environment**
2. **Nombrar el environment**: `pre`
3. **Añadir secrets** (hacer clic en "Add secret" para cada uno):

| Secret | Descripción | Ejemplo |
|--------|-------------|---------|
| `META_ACCESS_TOKEN` | Token de acceso Meta/Facebook | `EAABsbCS6X4kBAMN...` |
| `META_IG_USER_ID` | ID de cuenta Instagram Business | `17841400123456789` |
| `META_APP_SECRET` | Secret de la app Meta | `abc123def456ghi789...` |
| `META_VERIFY_TOKEN` | Token de verificación webhooks | `my_custom_verify_token` |
| `AUTH_API_KEY` | API key para autenticación | `sk-test-abc123def456...` |

### Cómo funciona el CI/CD con Secrets

```
Push a branch "pre"
       ↓
GitHub Actions se activa
       ↓
Lee automáticamente los secrets del environment "pre"
       ↓
Los inyecta como variables de entorno durante el build
       ↓
CDK deploy usa estos secrets para configurar Lambda
       ↓
API desplegada con secretos configurados
```

### Crear Environments para otros entornos

Repetir el proceso para `int` y `pro`:

1. **Settings → Environments → New environment**
2. **Nombrar**: `int` o `pro`
3. **Añadir los mismos 5 secrets** (pueden tener valores diferentes)
4. **Para `pro`**: Añadir "Required reviewers" para approval manual

### Seguridad de Secretos

- **Nunca** almacenes secrets en el código fuente
- **Nunca** hagas commit de archivos `.env`
- **Usa** GitHub Environments para gestión centralizada
- **Usa** "Required reviewers" para producción
- **Los secrets** se encriptan en repositorio y solo se desencriptan durante workflows

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

Los despliegues están automatizados via GitHub Actions. **Nunca despliegues desde local** (excepto en emergencias).

### Flujo de Despliegue Completo

```
Push a branch "pre"
       ↓
GitHub Actions se activa
       ↓
Lee secrets del environment "pre"
       ↓
Ejecuta pipeline:
  1. Lint (ESLint)
  2. Test (Jest)
  3. CDK deploy
       ↓
Despliega stack "ig-api-pre" en AWS
       ↓
API disponible en:
https://xxxxx.execute-api.eu-west-1.amazonaws.com/prod/
```

### Despliegue por Entorno

| Entorno | Trigger | Despliegue | Aprobación |
|---------|---------|------------|------------|
| `dev` | Push a `dev` | ❌ **No** (solo local) | N/A |
| `pre` | Push a `pre` | ✅ Automático | No |
| `int` | Push a `int` | ✅ Automático | No |
| `pro` | Push a `pro` | ✅ Automático | ✅ **Manual** |

### GitHub Environments

Los secrets se organizan por **GitHub Environments** para mantener el aislamiento entre entornos.

**Crear Environment "pre":**
1. Ir a **Settings → Environments → New environment**
2. Nombrar: `pre`
3. Añadir secrets (ver sección [Configuración de GitHub Secrets](#configuración-de-github-secrets))

**Crear Environment "pro" (con approval):**
1. Ir a **Settings → Environments → New environment**
2. Nombrar: `pro`
3. Añadir secrets
4. Activar **"Required reviewers"**
5. Añadir reviewers para approval manual

### Pipeline de GitHub Actions

```yaml
# .github/workflows/deploy.yml (simplificado)
name: Deploy
on:
  push:
    branches: [pre, int, pro]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ github.ref_name }}  # Usa el nombre de la branch como environment
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm cdk deploy --require-approval never
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          META_ACCESS_TOKEN: ${{ secrets.META_ACCESS_TOKEN }}
          META_IG_USER_ID: ${{ secrets.META_IG_USER_ID }}
          META_APP_SECRET: ${{ secrets.META_APP_SECRET }}
          META_VERIFY_TOKEN: ${{ secrets.META_VERIFY_TOKEN }}
          AUTH_API_KEY: ${{ secrets.AUTH_API_KEY }}
```

### AWS Resources Created

Cada entorno cloud (`pre`, `int`, `pro`) despliega:

| Recurso | Nombre | Configuración |
|---------|--------|---------------|
| **Lambda Function** | `ig-api-{env}` | Node.js 22, ARM64, 256MB |
| **API Gateway** | REST API (Regional) | eu-west-1 |
| **DynamoDB Table** | `ig-posts-{env}` | PAY_PER_REQUEST |
| **CloudWatch Dashboard** | `ig-api-{env}-dashboard` | Métricas básicas |

### Manual Deploy (solo emergencias)

```bash
# Requiere AWS CLI configurado localmente
# ⚠️ Solo usar en emergencias
pnpm cdk deploy --require-approval never
```

### Variables de Entorno en Despliegue

| Variable | Fuente | Uso |
|----------|--------|-----|
| `AWS_ACCESS_KEY_ID` | GitHub Secret | Autenticación AWS |
| `AWS_SECRET_ACCESS_KEY` | GitHub Secret | Autenticación AWS |
| `META_ACCESS_TOKEN` | GitHub Environment | API de Meta |
| `META_IG_USER_ID` | GitHub Environment | Instagram Business |
| `META_APP_SECRET` | GitHub Environment | Webhooks HMAC |
| `META_VERIFY_TOKEN` | GitHub Environment | Verificación webhooks |
| `AUTH_API_KEY` | GitHub Environment | Autenticación clientes |
| `IG_ENV` | Branch name | Determina entorno |
| `NODE_ENV` | Fijo: `production` | Modo de ejecución |
| `DYNAMODB_TABLE_NAME` | CDK construct | Nombre de tabla |
| `AWS_REGION` | Fijo: `eu-west-1` | Región AWS |

## 🌍 Entornos

El proyecto soporta **4 entornos** con stacks CDK independientes. Cada entorno tiene su propia infraestructura aislada en AWS.

### Tabla de Entornos

| Entorno | Stack CDK | Stage | Branch | Recursos AWS | Descripción |
|---------|-----------|-------|--------|--------------|-------------|
| `dev` | N/A | N/A | `dev` | ❌ Ninguno | Desarrollo local (sin AWS) |
| `pre` | `ig-api-pre` | `pre` | `pre` | ✅ Lambda + API Gateway + DynamoDB | Preproducción |
| `int` | `ig-api-int` | `int` | `int` | ✅ Lambda + API Gateway + DynamoDB | Integración |
| `pro` | `ig-api-pro` | `pro` | `pro` | ✅ Lambda + API Gateway + DynamoDB | Producción |

### Recursos por Entorno

Cada entorno cloud (`pre`, `int`, `pro`) tiene:

| Recurso | Descripción | Configuración |
|---------|-------------|---------------|
| **Lambda Function** | `ig-api-{env}` | Node.js 22, ARM64, 256MB |
| **API Gateway** | REST API (Regional) | eu-west-1 |
| **DynamoDB Table** | `ig-posts-{env}` | PAY_PER_REQUEST |
| **CloudWatch Dashboard** | Monitoreo | Métricas básicas |

### Variable `IG_ENV`

La variable `IG_ENV` determina en qué entorno se ejecuta la aplicación:

```bash
# Se obtiene automáticamente del nombre de la branch
git checkout pre  → IG_ENV=pre
git checkout int  → IG_ENV=int
git checkout pro  → IG_ENV=pro
```

**En desarrollo local** (branch `dev`), `IG_ENV` no se establece, por lo que:
- Se usa DynamoDB Local (`http://localhost:8000`)
- No se conecta a AWS
- Se usa configuración de `.env`

### Desplegar a un entorno específico

```bash
# Desplegar a pre (default)
pnpm cdk deploy

# Desplegar a pro
IG_ENV=pro pnpm cdk deploy

# Desplegar a int
IG_ENV=int pnpm cdk deploy
```

### Flujo de Despliegue

```
Push a branch "pre"
       ↓
GitHub Actions se activa
       ↓
Lee secrets del environment "pre"
       ↓
Ejecuta: lint → test → CDK deploy
       ↓
Despliega stack "ig-api-pre" en AWS
       ↓
API disponible en:
https://xxxxx.execute-api.eu-west-1.amazonaws.com/prod/
```

### Flujo de trabajo con branches

```bash
# Desarrollo local
git checkout dev
# ... hacer cambios ...
git push origin dev  # → NO despliega a AWS

# Desplegar a pre
git checkout pre
git merge dev
git push origin pre  # → deploy automático a pre

# Desplegar a int
git checkout int
git merge pre
git push origin int  # → deploy automático a int

# Desplegar a pro (con approval)
git checkout pro
git merge int
git push origin pro  # → deploy con approval manual
```

### Diferencias entre entornos

| Característica | `dev` | `pre` | `int` | `pro` |
|----------------|-------|-------|-------|-------|
| **AWS** | ❌ No | ✅ Sí | ✅ Sí | ✅ Sí |
| **DynamoDB** | Local (8000) | AWS | AWS | AWS |
| **Secrets** | `.env` file | GitHub Env | GitHub Env | GitHub Env |
| **Approval** | N/A | No | No | ✅ Sí |
| **Uso** | Desarrollo | Testing | Integración | Producción |

## Documentation

- [Project Context](PROJECT_CONTEXT.md)
- [Decisions](docs/decisions.md)
- [Roadmap](docs/roadmap.md)

## License

ISC
