# Tarea en Curso

## Phase 7: Webhooks (FEAT-008 a FEAT-011)

**Features**: FEAT-008, FEAT-009, FEAT-010, FEAT-011
**Estado**: REVIEW
**Fecha de ultima actualizacion**: 2026-06-06

### Implementacion completada

#### Archivos CREADOS
- `src/middleware/verifyMetaSignature.js` - HMAC-SHA256 con crypto.timingSafeEqual, factory function con appSecret opcional
- `src/routes/webhooks.js` - GET (challenge-response) + POST (eventos), factory function con processor inyectable
- `src/services/webhookProcessor.js` - Procesa eventos Meta (instagram/page), retorna { processed, errors }
- `tests/verifyMetaSignature.test.js` - 7 tests unitarios (firma valida, missing, invalida, formato, 500, env, timing-safe)
- `tests/webhookProcessor.test.js` - 7 tests unitarios (instagram, no-instagram, multiples, sin changes, vacio, page)
- `tests/webhooks.test.js` - 8 tests integracion (GET challenge 200/403, POST 200/401/malformed/missing-sig)

#### Archivos MODIFICADOS
- `src/app.js` - Monta /webhooks con express.raw() ANTES de express.json() y authenticate
- `infra/lib/ig-api-stack.js` - Agrega metaAppSecret/metaVerifyToken a props, env vars, y recurso /webhooks (GET+POST)
- `infra/bin/app.js` - Pasa metaAppSecret y metaVerifyToken al stack
- `.env.example` - Documenta META_APP_SECRET y META_VERIFY_TOKEN
- `.github/workflows/ci.yml` - Agrega META_APP_SECRET y META_VERIFY_TOKEN al CDK Deploy env

#### Decisiones de diseno
- verifyMetaSignature se aplica SOLO a POST /webhooks (GET no tiene body ni firma)
- El middleware vive dentro del router (no en app.js) para aplicar solo a POST
- Webhooks siempre responden 200 a Meta (incluso con JSON malformado) para evitar reintentos
- Raw body via express.raw() en app.js, parseo manual en el router

### Verificacion
- [x] pnpm lint - 0 errores
- [x] pnpm test - 93 tests pasan (71 existentes + 22 nuevos)
- [x] Sin nuevas dependencias (solo node:crypto)
- [x] Tests en tests/ (regla estricta)
- [x] JSDoc en funciones publicas
- [x] Factory functions con dependencias inyectables

### Pendiente
- [ ] Reviewer approval
- [ ] Marcar features como completed en feature_list.json
