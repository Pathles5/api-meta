# Current Work

## Feature en curso: FEAT-027 — Implement S3 Multimedia Storage

**Status**: review-required
**Started**: 2026-06-14
**Completed**: 2026-06-14

## Resultado
- ✅ `src/config/s3.js` creado — S3 client singleton (patrón igual que dynamodb.js)
- ✅ `src/services/mediaStorageService.js` creado — descarga media de Instagram y sube a S3
- ✅ `infra/lib/ig-api-stack.js` actualizado — S3 bucket + IAM + env var
- ✅ `tests/mediaStorageService.test.js` creado — 27 tests
- ✅ `tests/s3Config.test.js` creado — 4 tests
- ✅ 199/199 tests pasan
- ✅ `node init.js` validación exitosa

## Archivos modificados
- `src/config/s3.js` (nuevo)
- `src/services/mediaStorageService.js` (nuevo)
- `infra/lib/ig-api-stack.js` (añadido S3 bucket, IAM grant, env var, tags)
- `tests/mediaStorageService.test.js` (nuevo)
- `tests/s3Config.test.js` (nuevo)
- `package.json` (añadido @aws-sdk/client-s3)

## Decisiones
- S3 key format: `media/{postId}/{filename}` para organización por post
- Bucket lifecycle: 90 días (alineado con DynamoDB TTL)
- RemovalPolicy: RETAIN (no borrar media accidentalmente)
- Soporta IMAGE, VIDEO (con thumbnail), CAROUSEL_ALBUM
