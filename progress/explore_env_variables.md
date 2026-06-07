# Research -- Variables de Entorno del Proyecto IG-API

## Archivos relevantes

- `.env.example` -- Plantilla oficial de variables de entorno (39 lineas)
- `.env` -- Configuracion local activa (13 variables)
- `src/config/dynamodb.js` -- Configuracion del cliente DynamoDB
- `src/server.js` -- Puerto del servidor
- `src/app.js` -- Rate limiting
- `src/utils/logger.js` -- Nivel de log
- `src/middleware/authenticate.js` -- Autenticacion API Key
- `src/middleware/verifyMetaSignature.js` -- Verificacion HMAC webhooks
- `src/middleware/errorHandler.js` -- Modo desarrollo (stack traces)
- `src/services/metaApi.js` -- Token de acceso Meta y IG User ID
- `src/services/postVerification.js` -- Horas de verificacion de posts
- `src/repositories/postRepository.js` -- Tabla DynamoDB y TTL
- `src/routes/webhooks.js` -- Token de verificacion de webhook
- `infra/bin/app.js` -- Punto de entrada CDK (todas las variables)
- `infra/lib/ig-api-stack.js` -- Stack CDK (pasa variables a Lambda)
- `.github/workflows/ci.yml` -- CI/CD (secrets de GitHub)
- `scripts/setup-table.js` -- Script de configuracion de tabla local

---

## Clasificacion por Categoria

### 1. META -- Relacionadas con Meta/Instagram Graph API

| Variable | Descripcion | Ejemplo | Obligatoria | Default | Entornos | Donde se configura |
|----------|-------------|---------|-------------|---------|----------|-------------------|
| `META_ACCESS_TOKEN` | Token de acceso de larga duracion para la Graph API de Meta. Se obtiene desde developers.facebook.com. Usado para autenticar todas las llamadas a la API de Instagram (leer posts, verificar posts). | `EAAL4y0pTiUM...` | SI | Ninguno (falla si no esta) | dev, pre, int, pro | `.env` (dev), GitHub Secrets -> CDK -> Lambda (pre/int/pro) |
| `META_IG_USER_ID` | ID de la cuenta de Instagram Business vinculada a la pagina de Facebook. Se obtiene con `GET /me/accounts?fields=instagram_business_account`. Es persistente (no cambia). | `17841478291207902` | SI | Ninguno (falla si no esta) | dev, pre, int, pro | `.env` (dev), GitHub Secrets -> CDK -> Lambda (pre/int/pro) |
| `META_APP_SECRET` | Secreto de la aplicacion de Meta, usado para verificar la autenticidad de los webhooks mediante HMAC-SHA256. Se obtiene en developers.facebook.com > Tu App > Settings > Basic. | `a1b2c3d4e5f6...` | SI (para webhooks) | Ninguno (webhooks fallan) | dev, pre, int, pro | `.env` (dev), GitHub Secrets -> CDK -> Lambda (pre/int/pro) |
| `META_VERIFY_TOKEN` | Token de verificacion definido por el desarrollador para el challenge-response de suscripcion de webhooks. Meta envia este token en la peticion GET de verificacion; si coincide, respondemos con el challenge. | `ig-api-verify-token` | RECOMENDADO | `ig-api-verify-token` (en CDK) | dev, pre, int, pro | `.env` (dev), GitHub Secrets -> CDK -> Lambda (pre/int/pro) |

### 2. AUTH -- Autenticacion y Seguridad

| Variable | Descripcion | Ejemplo | Obligatoria | Default | Entornos | Donde se configura |
|----------|-------------|---------|-------------|---------|----------|-------------------|
| `AUTH_API_KEY` | API Key que los clientes deben enviar en el header `X-API-Key` para acceder a los endpoints protegidos (`/posts/*`). Se compara usando `crypto.timingSafeEqual` para prevenir timing attacks. | `sk-test-abc123def456` | SI | Ninguno (error 500 si no esta) | dev, pre, int, pro | `.env` (dev), GitHub Secrets -> CDK -> Lambda (pre/int/pro) |

### 3. APP -- Configuracion General de la Aplicacion

| Variable | Descripcion | Ejemplo | Obligatoria | Default | Entornos | Donde se configura |
|----------|-------------|---------|-------------|---------|----------|-------------------|
| `APP_PORT` | Puerto en el que escucha el servidor Express (solo desarrollo local). En Lambda/API Gateway no se usa (Lambda maneja el puerto). | `3000` | NO | `3000` | dev | `.env` |
| `NODE_ENV` | Entorno de ejecucion estandar de Node.js. Cuando es `development`, el error handler incluye stack traces en la respuesta JSON. En produccion se establece como `production` en el CDK stack. | `development` | NO | `development` (codigo), `production` (CDK) | dev, pre, int, pro | `.env` (dev), CDK hardcodea `production` (pre/int/pro) |
| `APP_RATE_LIMIT_WINDOW_MS` | Ventana de tiempo en milisegundos para el rate limiting. Las peticiones se cuentan por IP dentro de esta ventana. | `60000` | NO | `60000` (1 minuto) | dev, pre, int, pro | `.env` (dev), CDK no la pasa (usa default) |
| `APP_RATE_LIMIT_MAX` | Numero maximo de peticiones permitidas por IP dentro de la ventana de rate limiting. Si se excede, responde HTTP 429. | `100` | NO | `100` | dev, pre, int, pro | `.env` (dev), CDK no la pasa (usa default) |
| `APP_LOG_LEVEL` | Nivel de severidad del logger pino. Solo se registran logs de este nivel o superior. Niveles: `fatal` > `error` > `warn` > `info` > `debug` > `trace`. | `info` | NO | `info` | dev, pre, int, pro | `.env` (dev), CDK pasa `info` (pre/int/pro) |

### 4. AWS -- Configuracion de Servicios AWS

| Variable | Descripcion | Ejemplo | Obligatoria | Default | Entornos | Donde se configura |
|----------|-------------|---------|-------------|---------|----------|-------------------|
| `AWS_REGION` | Region de AWS donde se despliegan los recursos y donde esta DynamoDB. En desarrollo local apunta a DynamoDB Local; en produccion es `eu-west-1` (Irlanda). | `eu-west-1` | NO | `us-east-1` (codigo), `eu-west-1` (CDK) | dev, pre, int, pro | `.env` (dev), CDK hardcodea `eu-west-1` (pre/int/pro) |

### 5. DYNAMODB -- Configuracion de DynamoDB

| Variable | Descripcion | Ejemplo | Obligatoria | Default | Entornos | Donde se configura |
|----------|-------------|---------|-------------|---------|----------|-------------------|
| `DYNAMODB_ENDPOINT` | URL del endpoint de DynamoDB. En desarrollo local apunta a DynamoDB Local (`http://localhost:8000`). En produccion no se usa (el SDK de AWS usa el endpoint oficial de la region). | `http://localhost:8000` | NO | `undefined` (usa endpoint AWS oficial) | dev | `.env` (solo dev) |
| `DYNAMODB_TABLE_NAME` | Nombre de la tabla de DynamoDB donde se almacenan los posts. En desarrollo es `ig-posts`; en produccion es `ig-posts-{IG_ENV}` (ej: `ig-posts-pre`, `ig-posts-int`, `ig-posts-pro`). | `ig-posts` | NO | `ig-posts` (codigo), `ig-posts-{environment}` (CDK) | dev, pre, int, pro | `.env` (dev), CDK genera nombre dinamico (pre/int/pro) |
| `DYNAMODB_POST_TTL_DAYS` | Numero de dias despues de los cuales los posts expiran automaticamente en DynamoDB (TTL). DynamoDB elimina items expirados sin costo. El campo `expiresAt` se calcula sumando estos dias a la fecha de creacion. | `90` | NO | `90` | dev, pre, int, pro | `.env` (dev), CDK no la pasa (usa default) |

### 6. POST -- Configuracion de Verificacion de Posts

| Variable | Descripcion | Ejemplo | Obligatoria | Default | Entornos | Donde se configura |
|----------|-------------|---------|-------------|---------|----------|-------------------|
| `POST_VERIFICATION_HOURS` | Numero de horas despues de las cuales un post se considera stale (obsoleto) y necesita re-verificacion con la API de Meta. Cuando un cliente solicita un post via `GET /:id`, si ha pasado mas de este tiempo desde la ultima verificacion, se consulta Meta API para confirmar que el post sigue existiendo. | `24` | NO | `24` | dev, pre, int, pro | `.env` (dev), CDK pasa `24` (pre/int/pro) |

### 7. IG_ENV -- Control de Entorno (Solo CDK/CI-CD)

| Variable | Descripcion | Ejemplo | Obligatoria | Default | Entornos | Donde se configura |
|----------|-------------|---------|-------------|---------|----------|-------------------|
| `IG_ENV` | Identificador del entorno de despliegue. Controla el nombre del stack CDK (`ig-api-{IG_ENV}`), el nombre de la tabla DynamoDB (`ig-posts-{IG_ENV}`), y el stage de API Gateway. Valores validos: `dev`, `pre`, `int`, `pro`. | `pre` | NO | `pre` | pre, int, pro | CI/CD: `github.ref_name` (nombre de la branch) |

---

## Flujo de Variables: Codigo -> CDK -> Lambda

### Desarrollo Local (dev):

```
.env file --> dotenv config --> process.env.*
```

### Produccion (pre/int/pro):

```
GitHub Secrets --> CI/CD Job env vars --> infra/bin/app.js (lee env) --> infra/lib/ig-api-stack.js --> Lambda Function environment
```

### Detalle del flujo paso a paso:

1. **GitHub Secrets** (configurados en Settings -> Secrets and variables -> Actions):
   - `META_ACCESS_TOKEN`
   - `META_IG_USER_ID`
   - `AUTH_API_KEY`
   - `META_APP_SECRET`
   - `META_VERIFY_TOKEN`

2. **CI/CD Workflow** (`.github/workflows/ci.yml`):
   - Lee secrets y los pasa como env vars al step de CDK Deploy
   - `IG_ENV` se obtiene automaticamente del nombre de la branch (`github.ref_name`)

3. **CDK App** (`infra/bin/app.js`):
   - Lee variables de entorno con `process.env.*`
   - Aplica defaults donde corresponde
   - Pasa todo como `props` al constructor del stack

4. **CDK Stack** (`infra/lib/ig-api-stack.js`):
   - Recibe `props` del constructor
   - Configura `environment: { ... }` en la Lambda function
   - Cada variable se asigna explicitamente

5. **Lambda Function**:
   - Recibe las variables en su entorno de ejecucion
   - El codigo de la app las lee con `process.env.*`

### Variables que Lambda recibe del CDK:

| Variable Lambda | Valor en CDK |
|----------------|--------------|
| `DYNAMODB_TABLE_NAME` | `tableName` (prop) |
| `META_ACCESS_TOKEN` | `metaAccessToken` (prop) |
| `META_IG_USER_ID` | `igUserId` (prop) |
| `AUTH_API_KEY` | `authApiKey` (prop) |
| `POST_VERIFICATION_HOURS` | `verificationHours` (prop, default "24") |
| `APP_LOG_LEVEL` | `logLevel` (prop, default "info") |
| `META_APP_SECRET` | `metaAppSecret` (prop) |
| `META_VERIFY_TOKEN` | `metaVerifyToken` (prop) |
| `NODE_ENV` | Hardcoded: `"production"` |

---

## Variables NO usadas en produccion (solo desarrollo local)

| Variable | Razon |
|----------|-------|
| `APP_PORT` | Lambda/API Gateway maneja el puerto. Solo relevante para `pnpm dev`. |
| `DYNAMODB_ENDPOINT` | En produccion, el SDK de AWS usa el endpoint oficial de la region. Solo para DynamoDB Local. |
| `APP_RATE_LIMIT_WINDOW_MS` | CDK no la pasa a Lambda (usa default de 60000ms). API Gateway tiene su propio throttling. |
| `APP_RATE_LIMIT_MAX` | CDK no la pasa a Lambda (usa default de 100). API Gateway tiene su propio throttling (100 req/s, burst 200). |
| `DYNAMODB_POST_TTL_DAYS` | CDK no la pasa a Lambda (usa default de 90 dias). |

---

## Resumen de Obligatoriedad

### OBLIGATORIAS (la app falla sin ellas):
1. `META_ACCESS_TOKEN` -- Error 500: "META_ACCESS_TOKEN not configured"
2. `META_IG_USER_ID` -- Error 500: "META_IG_USER_ID not configured"
3. `AUTH_API_KEY` -- Error 500: "AUTH_API_KEY not configured"

### RECOMENDADAS (funcionalidad degradada sin ellas):
4. `META_APP_SECRET` -- Webhooks no se pueden verificar (error 500 en POST /webhooks)
5. `META_VERIFY_TOKEN` -- Suscripcion de webhooks falla (default: `ig-api-verify-token` en CDK)

### OPCIONALES (tienen valores por defecto):
6. `APP_PORT` -- Default: `3000`
7. `NODE_ENV` -- Default: `development` (codigo), `production` (CDK)
8. `APP_RATE_LIMIT_WINDOW_MS` -- Default: `60000`
9. `APP_RATE_LIMIT_MAX` -- Default: `100`
10. `APP_LOG_LEVEL` -- Default: `info`
11. `AWS_REGION` -- Default: `us-east-1` (codigo), `eu-west-1` (CDK)
12. `DYNAMODB_ENDPOINT` -- Default: `undefined` (usa endpoint AWS)
13. `DYNAMODB_TABLE_NAME` -- Default: `ig-posts` (codigo), `ig-posts-{env}` (CDK)
14. `DYNAMODB_POST_TTL_DAYS` -- Default: `90`
15. `POST_VERIFICATION_HOURS` -- Default: `24`
16. `IG_ENV` -- Default: `pre`

---

## Ejemplo de Configuracion por Entorno

### Desarrollo Local (.env)

```
META_ACCESS_TOKEN=EAAL4y0pTiUM...
META_IG_USER_ID=17841400...[REDACTED]
AUTH_API_KEY=sk-test-...[REDACTED]
APP_PORT=3000
NODE_ENV=development
APP_RATE_LIMIT_WINDOW_MS=60000
APP_RATE_LIMIT_MAX=100
APP_LOG_LEVEL=debug
AWS_REGION=eu-west-1
DYNAMODB_ENDPOINT=http://localhost:8000
DYNAMODB_TABLE_NAME=ig-posts
DYNAMODB_POST_TTL_DAYS=90
POST_VERIFICATION_HOURS=24
META_APP_SECRET=your_app_secret_here
META_VERIFY_TOKEN=your_verify_token_here
```

### Preproduccion (GitHub Secrets -> CDK -> Lambda)

```
IG_ENV=pre
AWS_REGION=eu-west-1
DYNAMODB_TABLE_NAME=ig-posts-pre
META_ACCESS_TOKEN=<from GitHub Secret>
META_IG_USER_ID=<from GitHub Secret>
AUTH_API_KEY=<from GitHub Secret>
META_APP_SECRET=<from GitHub Secret>
META_VERIFY_TOKEN=<from GitHub Secret>
APP_LOG_LEVEL=info
POST_VERIFICATION_HOURS=24
NODE_ENV=production
```

### Integracion (GitHub Secrets -> CDK -> Lambda)

```
IG_ENV=int
AWS_REGION=eu-west-1
DYNAMODB_TABLE_NAME=ig-posts-int
META_ACCESS_TOKEN=<from GitHub Secret>
META_IG_USER_ID=<from GitHub Secret>
AUTH_API_KEY=<from GitHub Secret>
META_APP_SECRET=<from GitHub Secret>
META_VERIFY_TOKEN=<from GitHub Secret>
APP_LOG_LEVEL=info
POST_VERIFICATION_HOURS=24
NODE_ENV=production
```

### Produccion (GitHub Secrets -> CDK -> Lambda)

```
IG_ENV=pro
AWS_REGION=eu-west-1
DYNAMODB_TABLE_NAME=ig-posts-pro
META_ACCESS_TOKEN=<from GitHub Secret>
META_IG_USER_ID=<from GitHub Secret>
AUTH_API_KEY=<from GitHub Secret>
META_APP_SECRET=<from GitHub Secret>
META_VERIFY_TOKEN=<from GitHub Secret>
APP_LOG_LEVEL=warn
POST_VERIFICATION_HOURS=24
NODE_ENV=production
```

---

## Patrones observados

1. **Prefijos consistentes**: Las variables usan prefijos que indican el ambito (`META_`, `AUTH_`, `APP_`, `AWS_`, `DYNAMODB_`, `POST_`).
2. **Valores por defecto seguros**: Todas las variables opcionales tienen defaults razonables.
3. **Fail-fast en secrets**: Las variables criticas (`META_ACCESS_TOKEN`, `META_IG_USER_ID`, `AUTH_API_KEY`) lanzan error 500 si no estan configuradas.
4. **Separacion dev/prod**: En desarrollo se usa `.env` + dotenv; en produccion se usan GitHub Secrets -> CDK -> Lambda environment.
5. **Variables de infraestructura separadas**: `IG_ENV` solo se usa en CDK/CI-CD, no en el codigo de la app.
6. **DynamoDB endpoint condicional**: `DYNAMODB_ENDPOINT` solo se usa en desarrollo local; en produccion el SDK usa el endpoint oficial.

## Dependencias existentes

- `dotenv` -- Carga variables desde `.env` en desarrollo local
- `@aws-sdk/client-dynamodb` -- Cliente DynamoDB (usa `AWS_REGION`, `DYNAMODB_ENDPOINT`)
- `@aws-sdk/lib-dynamodb` -- Document client de DynamoDB
- `pino` -- Logger (usa `APP_LOG_LEVEL`)
- `express` -- Framework web (usa `APP_PORT`, `APP_RATE_LIMIT_*`)

## Brechas identificadas

1. **No hay validacion de variables al inicio**: La app no valida que todas las variables requeridas esten presentes al arrancar. Los errores se descubren en runtime.
2. **APP_RATE_LIMIT_* no se pasan a Lambda**: CDK no incluye estas variables en el entorno de Lambda, por lo que siempre usa los defaults (60000ms / 100 requests).
3. **DYNAMODB_POST_TTL_DAYS no se pasa a Lambda**: Similar al punto anterior, siempre usa el default de 90 dias.
4. **META_VERIFY_TOKEN tiene default debil en CDK**: El valor `ig-api-verify-token` es predecible. En produccion deberia ser un valor aleatorio almacenado en GitHub Secrets.
5. **No hay documentacion de como rotar tokens**: Falta guia sobre como rotar `META_ACCESS_TOKEN` cuando expira.

## Riesgos potenciales

1. **Exposicion de secrets**: Si `.env` no esta en `.gitignore`, los secrets se comprometen. (Verificado: `.env` esta en `.gitignore`)
2. **Token de Meta expira**: `META_ACCESS_TOKEN` puede expirar; no hay mecanismo de renovacion automatica.
3. **Timing attack en API Key**: Mitigado con `crypto.timingSafeEqual` en `authenticate.js`.
4. **Webhook sin firma**: Si `META_APP_SECRET` no esta configurado, los webhooks no se verifican (error 500).
5. **DynamoDB endpoint hardcodeado en dev**: Si alguien despliega localmente sin cambiar `DYNAMODB_ENDPOINT`, podria apuntar a DynamoDB Local en produccion (mitigado por CDK que no usa esta variable).