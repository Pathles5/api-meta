# Research — Webhooks (Phase 7)

## Archivos relevantes

### Rutas
- `src/routes/health.js` — Router simple, exportacion directa (no factory)
- `src/routes/posts.js` — Router con factory function `createPostsRouter(repo, metaApi)` para inyeccion de dependencias

### Middleware
- `src/middleware/authenticate.js` — API key auth via `X-API-Key` header, usa `crypto.timingSafeEqual`
- `src/middleware/cors.js` — Factory function `cors(options)` que retorna middleware
- `src/middleware/errorHandler.js` — Error handler global + `createError(statusCode, message)` helper
- `src/middleware/rateLimit.js` — Factory function `rateLimit({windowMs, max})` con cleanup interval
- `src/middleware/requestLogger.js` — Exportacion directa, usa pino logger
- `src/middleware/validate.js` — Factory function `validateBody(schema)` que retorna middleware

### Servicios
- `src/services/metaApi.js` — Exportaciones directas: `fetchPost()`, `fetchPosts()`. Accede a env vars directamente via `process.env`
- `src/services/postVerification.js` — Factory function `createPostVerificationService(repo, metaApi)`

### Repositorios
- `src/repositories/postRepository.js` — Factory function `createPostRepository(client, options)` + singleton default export

### Config
- `src/config/dynamodb.js` — Factory function `createDynamoDBClient()` + singleton `getDynamoDBClient()`

### Utils
- `src/utils/logger.js` — Singleton pino logger

### App entry points
- `src/app.js` — Express app setup, monta rutas y middleware
- `src/server.js` — Server startup con dotenv
- `lambda.js` — Lambda handler via `@vendia/serverless-express`

### Infraestructura
- `infra/lib/ig-api-stack.js` — CDK stack con Lambda + API Gateway
- `infra/bin/app.js` — CDK app entry point

---

## Patrones observados

### 1. Factory Function Pattern (el patron dominante)

**Dos tipos de exportacion coexisten:**

| Tipo | Ejemplo | Uso |
|------|---------|-----|
| **Factory function** | `createPostsRouter(repo, metaApi)` | Cuando hay dependencias inyectables |
| **Exportacion directa** | `healthRouter`, `authenticate` | Cuando no hay dependencias o son singleton |

**Regla clara:** Si el modulo necesita dependencias para testing -> factory function. Si no -> exportacion directa.

### 2. Estructura de Rutas

`
Patron factory (posts.js):
  function createPostsRouter(repo = defaultRepo, metaApi = defaultMetaApi) {
    const router = Router();
    // ... definir rutas ...
    return router;
  }
  const postsRouter = createPostsRouter();
  export { postsRouter, createPostsRouter };

Patron directo (health.js):
  const healthRouter = Router();
  healthRouter.get("/health", (req, res) => { ... });
  export { healthRouter };
`

**Para webhooks:** Necesitaremos factory function porque depende de repo y posiblemente de un servicio de procesamiento.

### 3. Middleware Pattern

`
Patron factory (cors, rateLimit, validate):
  function cors(options = {}) {
    return (req, res, next) => { ... };
  }

Patron directo (authenticate, requestLogger):
  function authenticate(req, res, next) { ... }
  export { authenticate };
`

**Para verifyMetaSignature:** Deberia ser factory function ya que necesita `META_APP_SECRET` como parametro (o puede leer de `process.env` directamente como hace `authenticate`).

### 4. Error Handling

- `createError(statusCode, message)` en `src/middleware/errorHandler.js`
- Se usa `next(error)` para propagar errores al error handler global
- Stack traces solo en development

### 5. Environment Variables

**Patron centralizado con prefijos:**
- `META_` -> Meta/Instagram API (`META_ACCESS_TOKEN`, `META_IG_USER_ID`)
- `AUTH_` -> Authentication (`AUTH_API_KEY`)
- `APP_` -> Application config (`APP_PORT`, `APP_RATE_LIMIT_*`, `APP_LOG_LEVEL`)
- `AWS_` -> AWS config (`AWS_REGION`)
- `DYNAMODB_` -> DynamoDB config (`DYNAMODB_*`)

**Para webhooks:** Se necesita `META_APP_SECRET` (nuevo, prefijo `META_`).

**No hay un archivo de configuracion centralizado** — cada modulo lee `process.env` directamente. `src/config/dynamodb.js` es el unico archivo en `config/` y solo maneja DynamoDB.

---

## Configuracion actual

### Variables de entorno existentes (.env.example)
`
META_ACCESS_TOKEN=...
META_IG_USER_ID=...
AUTH_API_KEY=...
APP_PORT=3000
NODE_ENV=development
APP_RATE_LIMIT_WINDOW_MS=60000
APP_RATE_LIMIT_MAX=100
APP_LOG_LEVEL=info
AWS_REGION=eu-west-1
DYNAMODB_ENDPOINT=http://localhost:8000
DYNAMODB_TABLE_NAME=ig-posts
DYNAMODB_POST_TTL_DAYS=90
POST_VERIFICATION_HOURS=24
`

### Variable necesaria para webhooks
`
META_APP_SECRET=<necesaria para HMAC-SHA256>
`

---

## Tests — Patrones observados

### Framework
- **Node.js built-in test runner** (`node:test`)
- **Assertions:** `node:assert/strict`
- **Mocking:** `mock.fn()` de `node:test`

### Patron de inyeccion de dependencias en tests

`
// tests/posts.test.js — Patron principal
const mockRepo = {
  savePost: mock.fn(async (post) => ({ ... })),
  getPost: mock.fn(async () => null),
  // ... todos los metodos mockeados
};

// Inyeccion via factory:
testApp.use("/posts", authenticate, createPostsRouter(mockRepo));
`

`
// tests/postVerification.test.js — Patron alternativo
function createMockRepo(overrides = {}) {
  return {
    getPost: mock.fn(async () => null),
    deletePost: mock.fn(async () => {}),
    ...overrides,
  };
}
function createMockMetaApi(overrides = {}) {
  return {
    fetchPost: mock.fn(async () => ({ id: "123", ... })),
    ...overrides,
  };
}
`

### Patron de setup/teardown

`
const originalEnv = process.env;
const originalFetch = globalThis.fetch;

before(async () => {
  process.env.AUTH_API_KEY = "test-api-key";
  // ... setup server
});

after(async () => {
  process.env = originalEnv;
  globalThis.fetch = originalFetch;
  stopCleanup();
  if (server) await new Promise((resolve) => server.close(resolve));
});
`

### Patron de integration test

`
// Crear app Express de test con dependencias mockeadas
const testApp = express.default();
testApp.use(cors());
testApp.use(rateLimit());
testApp.use(express.default.json());
testApp.use(requestLogger);
testApp.use(healthRouter);
testApp.use("/posts", authenticate, createPostsRouter(mockRepo));
testApp.use(errorHandler);

// Servidor en puerto aleatorio
server = testApp.listen(0, () => {
  baseUrl = `http://localhost:`;
});
`

### Tests de middleware (unit)

`
// tests/authenticate.test.js — Test unitario directo
function mockReqRes(headers = {}) {
  const req = { headers };
  let statusCode, body;
  const res = {
    status(code) { statusCode = code; return res; },
    json(data) { body = data; },
  };
  const next = (arg) => { nextCalled = true; nextArg = arg; };
  return { req, res, next, getStatus: () => statusCode, ... };
}
`

---

## Infraestructura — API Gateway

### Configuracion actual (infra/lib/ig-api-stack.js)

`
const api = new LambdaRestApi(this, `-api-gateway`, {
  restApiName: `-api`,
  handler: lambda,
  proxy: false,  // <- IMPORTANTE: rutas explicitas, no proxy
  deployOptions: {
    stageName: "prod",
    throttlingRateLimit: 100,
    throttlingBurstLimit: 200,
  },
});

// Rutas explicitas:
const health = api.root.addResource("health");
health.addMethod("GET");

const posts = api.root.addResource("posts");
posts.addMethod("GET");
posts.addMethod("POST");
// ... sub-recursos
`

### Como agregar /webhooks

`
// Nuevo codigo necesario en ig-api-stack.js:
const webhooks = api.root.addResource("webhooks");
webhooks.addMethod("GET");   // Para challenge-response
webhooks.addMethod("POST");  // Para recibir eventos
`

**Consideraciones:**
- `proxy: false` significa que CADA ruta debe declararse explicitamente en CDK
- Los webhooks NO deben pasar por `authenticate` middleware (Meta no envia API key)
- El endpoint GET es para verificacion de suscripcion (challenge)
- El endpoint POST es para recibir eventos

### Lambda environment variables

Actualmente se pasan en CDK:
`
environment: {
  DYNAMODB_TABLE_NAME: tableName,
  META_ACCESS_TOKEN: metaAccessToken,
  META_IG_USER_ID: igUserId,
  AUTH_API_KEY: authApiKey,
  POST_VERIFICATION_HOURS: verificationHours,
  APP_LOG_LEVEL: logLevel,
  NODE_ENV: "production",
}
`

**Se necesita agregar:** `META_APP_SECRET` como parametro del stack y en environment.

---

## Specs existentes para webhooks

### En feature_list.json

| ID | Titulo | Estado | Dependencias |
|----|--------|--------|--------------|
| FEAT-008 | Webhook Endpoint | pending | FEAT-007 |
| FEAT-009 | Webhook Signature Validation | pending | FEAT-008 |
| FEAT-010 | Webhook Subscription Verification | pending | FEAT-008 |
| FEAT-011 | Process Incoming Webhook Events | pending | FEAT-009, FEAT-010 |

### En docs/session-context.md (plan del Leader)

`
| src/middleware/verifyMetaSignature.js | CREAR — HMAC-SHA256 con META_APP_SECRET |
| src/routes/webhooks.js               | CREAR — GET challenge + POST events     |
| src/services/webhookProcessor.js     | CREAR — Procesar eventos Meta           |
| src/app.js                           | MODIFICAR — Montar webhooks antes de authenticate |
| infra/lib/ig-api-stack.js            | MODIFICAR — Agregar ruta /webhooks      |
| .env, .env.example                   | MODIFICAR — Agregar META_APP_SECRET     |
`

### En docs/roadmap.md

`
## Fase 7: Webhooks
- Endpoint POST /webhooks
- Validacion de firma de webhook
- Challenge-response para suscripcion
- Procesamiento de eventos entrantes
`

---

## Referencias a webhooks/HMAC/SHA256 en el codebase

**Busqueda en src/:** No hay ninguna implementacion existente de webhooks, HMAC, SHA256, o X-Hub-Signature.

**Busqueda en docs/:** Solo referencias planificadas en:
- `docs/session-context.md` (lineas 49-58) — Plan detallado de archivos a crear
- `docs/decisions.md` (linea 140) — Mencion en roadmap
- `docs/roadmap.md` (lineas 65-74) — Descripcion de Phase 7

**Conclusion:** Los webhooks son 100% nuevos — no hay codigo existente que modificar excepto `app.js` e `ig-api-stack.js`.

---

## Brechas identificadas

### 1. Implementacion necesaria (todo nuevo)
- `src/middleware/verifyMetaSignature.js` — HMAC-SHA256 verification
- `src/routes/webhooks.js` — GET (challenge) + POST (events)
- `src/services/webhookProcessor.js` — Event processing logic

### 2. Archivos a modificar
- `src/app.js` — Montar `/webhooks` ANTES de `authenticate` (Meta no envia API key)
- `infra/lib/ig-api-stack.js` — Agregar recursos `/webhooks` GET/POST
- `infra/bin/app.js` — Pasar `metaAppSecret` al stack
- `.env.example` — Documentar `META_APP_SECRET`
- `.github/workflows/ci.yml` — Agregar `META_APP_SECRET` a secrets del deploy

### 3. Tests necesarios
- `tests/verifyMetaSignature.test.js` — Unit tests para middleware HMAC
- `tests/webhooks.test.js` — Integration tests para endpoints
- `tests/webhookProcessor.test.js` — Unit tests para procesamiento de eventos

### 4. Variable de entorno nueva
- `META_APP_SECRET` — Secret de la app de Meta para verificar firmas HMAC-SHA256

### 5. Decisiones pendientes
- Que eventos de Instagram procesar? (comments, likes, posts, stories?)
- Persistir eventos entrantes en DynamoDB o solo log?
- Necesita el webhook endpoint autenticacion propia (diferente a API key)?
- Rate limiting especifico para webhooks?

---

## Riesgos potenciales

1. **Orden de middleware en app.js:** Los webhooks DEBEN montarse ANTES de `authenticate` o Meta no podra hacer POST. Esto es un cambio critico en `app.js`.

2. **API Gateway proxy: false:** Cada recurso nuevo requiere declaracion explicita en CDK. Olvidar agregar `webhooks.addMethod()` causaria 403 en produccion.

3. **Lambda body parsing:** `express.json({ limit: "1mb" })` ya esta configurado — los payloads de webhook son pequenos, no hay problema.

4. **HMAC verification timing:** Usar `crypto.timingSafeEqual` (ya usado en `authenticate.js`) para comparar firmas — prevenir timing attacks.

5. **Challenge response:** Meta envia GET con `hub.mode`, `hub.challenge`, `hub.verify_token`. El verify_token debe ser configurable via env var.

6. **No romper tests existentes:** Los tests de `posts.test.js` crean su propia app Express — el cambio en `app.js` no los afecta directamente.

---

## Dependencias existentes relevantes

| Paquete | Uso para webhooks |
|---------|-------------------|
| `express` (5.2.1) | Router, JSON parsing |
| `pino` (10.3.1) | Logging |
| `node:crypto` (built-in) | HMAC-SHA256 verification |
| `@aws-sdk/lib-dynamodb` | Si se decide persistir eventos |

**No se necesitan nuevas dependencias** — `node:crypto` es suficiente para HMAC-SHA256.
