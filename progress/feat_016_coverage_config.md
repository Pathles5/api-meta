# FEAT-016: Test Coverage Configuration

**Fecha**: 2026-06-07
**Estado**: completed
**Agente**: Implementer

## Resumen

Configuracion de cobertura de tests usando el soporte nativo de Node.js 22 (`--experimental-test-coverage`). Sin dependencias externas anadidas.

## Cambios realizados

### 1. `package.json` — Scripts de cobertura anadidos

```json
"test:coverage": "node --test --experimental-test-coverage tests/**/*.test.js",
"test:coverage:threshold": "node --test --experimental-test-coverage --test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=80 tests/**/*.test.js"
```

- `test:coverage`: Genera reporte de cobertura sin thresholds (uso local/desarrollo)
- `test:coverage:threshold`: Genera reporte con thresholds minimos del 80% en lines, branches y functions (uso CI)

### 2. `.github/workflows/ci.yml` — Paso de cobertura en CI

Anadido nuevo paso despues de "Run tests":

```yaml
- name: Run tests with coverage
  run: pnpm test:coverage:threshold
```

Esto asegura que cualquier PR o push a `pre`, `int` o `pro` debe mantener la cobertura por encima del 80% en todas las metricas.

## Verificacion

```
$ pnpm test:coverage
  tests 93
  pass 93
  fail 0

  all files | 94.03% lines | 89.37% branches | 96.36% functions
```

```
$ pnpm test:coverage:threshold
  tests 93
  pass 93
  fail 0
  (thresholds 80% superados en todas las metricas)
```

## Cobertura actual por archivo

| Archivo | Line % | Branch % | Funcs % |
|---------|--------|----------|---------|
| app.js | 100.00 | 100.00 | 100.00 |
| config/dynamodb.js | 100.00 | 75.00 | 100.00 |
| middleware/authenticate.js | 100.00 | 100.00 | 100.00 |
| middleware/cors.js | 100.00 | 100.00 | 100.00 |
| middleware/errorHandler.js | 100.00 | 90.00 | 100.00 |
| middleware/rateLimit.js | 68.63 | 75.00 | 75.00 |
| middleware/requestLogger.js | 100.00 | 85.71 | 100.00 |
| middleware/validate.js | 90.48 | 88.24 | 100.00 |
| middleware/verifyMetaSignature.js | 97.06 | 94.12 | 100.00 |
| repositories/postRepository.js | 100.00 | 94.74 | 100.00 |
| routes/health.js | 100.00 | 100.00 | 100.00 |
| routes/posts.js | 76.58 | 83.33 | 80.00 |
| routes/webhooks.js | 94.19 | 87.50 | 100.00 |
| services/metaApi.js | 97.62 | 81.48 | 100.00 |
| services/postVerification.js | 100.00 | 100.00 | 100.00 |
| services/webhookProcessor.js | 96.20 | 93.75 | 100.00 |
| utils/logger.js | 100.00 | 100.00 | 100.00 |
| **all files** | **94.03** | **89.37** | **96.36** |

## Notas

- No se anadieron dependencias externas (Node.js 22 lo soporta nativamente)
- No se modifico codigo fuente (src/), tests ni infraestructura (infra/)
- El threshold del 80% es conservador; la cobertura actual esta muy por encima
