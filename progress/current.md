# Tarea en Curso

## 🚨 Bloqueo Crítico: Lambda Deployment

**Feature ID**: FEAT-007 (Infrastructure & Deployment)
**Agente Responsable**: DevOps Agent
**Estado**: BLOCKED - Lambda package > 250MB
**Fecha de última actualización**: 2026-06-06

### Problema
`Code.fromAsset` en `infra/lib/ig-api-stack.js:31` empaqueta todo `node_modules` (~300MB+). Lambda rechaza paquetes > 250MB.

### Plan de Solución (Aprobado)
**Cambio 1**: Build step en CI (`.github/workflows/ci.yml`)
- Agregar paso antes de `cdk deploy` que cree `dist/` con solo dependencias de producción
- Usar `npm install --omit=dev --ignore-scripts`

**Cambio 2**: CDK apunta a `dist/` (`infra/lib/ig-api-stack.js:31`)
- Cambiar `Code.fromAsset(resolve(..., "../../"))` a `Code.fromAsset(resolve(..., "../../dist"))`

### Resultado Esperado
- Tamaño: ~300MB+ → ~5-10MB
- Solo dependencias de producción (express, dotenv, pino, @aws-sdk)
- `@aws-sdk/*` se excluye porque ya viene en el runtime de Lambda

### Próximos Pasos Inmediatos
1. Implementar build step en `ci.yml`
2. Actualizar `ig-api-stack.js` para apuntar a `dist/`
3. Probar deploy local con `cdk synth`
4. Push a main y verificar deploy en GitHub Actions

### Otros Pendientes de Sesión Anterior
- [ ] Verificar token Meta `EAAL4y0p...` — ¿Se usó en producción? Rotar si sí.
- [ ] Phase 7: Webhooks — `POST /webhooks`, validación firma Meta, challenge-response
- [ ] Phase 8: Production Readiness — OpenAPI/Swagger, CloudWatch dashboard