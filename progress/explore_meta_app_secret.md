# Research — META_APP_SECRET Usage Analysis

## Archivos relevantes

### Código fuente (src/)
- **src/middleware/verifyMetaSignature.js** (Linea 19): const secret = appSecret || process.env.META_APP_SECRET;
  - Lee META_APP_SECRET de variables de entorno como fallback
  - Lo usa para calcular HMAC-SHA256 de la firma del webhook
- **src/routes/webhooks.js** (Linea 56): outer.post("/", verifyMetaSignature(), (req, res) => {
  - Usa verifyMetaSignature() como middleware en POST /webhooks
  - Llama sin argumentos, por lo que usara process.env.META_APP_SECRET

### Infraestructura (infra/)
- **infra/bin/app.js** (Linea 23): metaAppSecret: process.env.META_APP_SECRET,
  - Lee META_APP_SECRET del entorno local y lo pasa como prop al stack CDK
- **infra/lib/ig-api-stack.js** (Linea 48): META_APP_SECRET: metaAppSecret,
  - Pasa metaAppSecret como variable de entorno a la Lambda function

### CI/CD (.github/workflows/)
- **.github/workflows/ci.yml** (Linea 191): META_APP_SECRET de GitHub Secrets
  - Lee el secreto de GitHub y lo pasa como variable de entorno a CDK deploy

### Configuracion
- **.env.example** (Linea 33): META_APP_SECRET=your_app_secret_here
  - Documentado como variable requerida para webhooks
- **.env**: NO contiene META_APP_SECRET (razon probable de la confusion)

### Tests
- **tests/verifyMetaSignature.test.js** (Lineas 111-128): Tests que verifican el comportamiento cuando META_APP_SECRET no esta configurado
- **tests/webhooks.test.js** (Linea 20): process.env.META_APP_SECRET = TEST_SECRET

## Patrones observados

### Flujo completo de META_APP_SECRET
GitHub Secrets -> ci.yml -> CDK app.js -> ig-api-stack.js -> Lambda env -> verifyMetaSignature.js

1. En CI/CD, se lee de GitHub Secrets
2. Se pasa como variable de entorno al proceso CDK
3. infra/bin/app.js lo lee de process.env.META_APP_SECRET
4. Se pasa como prop metaAppSecret al stack CDK
5. infra/lib/ig-api-stack.js lo asigna al environment de Lambda
6. En Lambda, verifyMetaSignature.js lo lee de process.env.META_APP_SECRET
7. Se usa para verificar la firma HMAC-SHA256 de los webhooks de Meta

### Uso en verifyMetaSignature.js
function verifyMetaSignature(appSecret) {
  return (req, res, next) => {
    const secret = appSecret || process.env.META_APP_SECRET;  // USA META_APP_SECRET
    if (!secret) {
      return next(createError(500, "META_APP_SECRET not configured"));
    }
    // usa secret para HMAC-SHA256
  };
}

### Uso en webhooks.js
router.post("/", verifyMetaSignature(), (req, res) => {
  // verifyMetaSignature() sin argumentos = usa process.env.META_APP_SECRET
});

## Dependencias existentes
- node:crypto: Usado para HMAC-SHA256 en verifyMetaSignature.js
- express: Framework web
- vendia/serverless-express: Adaptador Lambda

## Brechas identificadas

### 1. META_APP_SECRET falta en .env local
- El archivo .env NO contiene META_APP_SECRET
- Esto causara error 500 en POST /webhooks en desarrollo local
- Sin embargo, .env.example si lo documenta

### 2. No hay validacion de presencia en CI/CD
- Si META_APP_SECRET no esta configurado en GitHub Secrets, CDK deploy fallara silenciosamente
- La Lambda se desplegara sin la variable, causando errores 500 en webhooks

## Riesgos potenciales

### Si se eliminara META_APP_SECRET:
1. verifyMetaSignature.js (Linea 19): Fallaria con error 500 META_APP_SECRET not configured
2. webhooks.js (Linea 56): POST /webhooks retornaria 500 en lugar de verificar firma
3. Seguridad: Webhooks no se verificarian, permitiendo payloads falsificados
4. Tests: Tests en verifyMetaSignature.test.js y webhooks.test.js fallarian

### Si se modificara verifyMetaSignature.js:
- Afectaria a webhooks.js (unico consumidor)
- Afectaria a tests en verifyMetaSignature.test.js y webhooks.test.js

## Conclusion

### Se usa META_APP_SECRET? -> SI, SE USA ACTIVAMENTE

META_APP_SECRET se usa en el proyecto para verificar la autenticidad de los webhooks de Meta/Instagram mediante HMAC-SHA256.

### Cadena de uso completa:
1. .env.example — Documentado
2. .github/workflows/ci.yml — Leido de GitHub Secrets
3. infra/bin/app.js — Pasado como prop al stack CDK
4. infra/lib/ig-api-stack.js — Asignado a Lambda environment
5. src/middleware/verifyMetaSignature.js — Usado para HMAC-SHA256
6. src/routes/webhooks.js — Usado como middleware en POST /webhooks
7. Tests — Verificado en tests unitarios

### Por que el usuario cree que no se usa?
- Hipotesis: El archivo .env local NO contiene META_APP_SECRET
- Esto puede llevar a pensar que no se necesita
- Pero en produccion (Lambda), la variable se inyecta via CDK desde GitHub Secrets

### Recomendacion:
- NO eliminar META_APP_SECRET de ningun archivo
- AGREGAR META_APP_SECRET al .env local para desarrollo (con valor de prueba)
- Verificar que el secreto este configurado en GitHub Secrets para los entornos pre/int/pro

---

## Referencias
- src/middleware/verifyMetaSignature.js:19
- src/routes/webhooks.js:56
- infra/bin/app.js:23
- infra/lib/ig-api-stack.js:48
- .github/workflows/ci.yml:191
- .env.example:33
