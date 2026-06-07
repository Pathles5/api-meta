# Research — Test Coverage Analysis

## Resumen Ejecutivo

| Métrica | Valor |
|---------|-------|
| **Herramienta usada** | Node.js nativo (`--experimental-test-coverage`) |
| **Tests totales** | 93 (93 pass, 0 fail) |
| **Suites totales** | 30 |
| **Cobertura de líneas** | **94.03%** |
| **Cobertura de branches** | **89.37%** |
| **Cobertura de funciones** | **96.36%** |
| **Estado** | ✅ Funcional sin configuración adicional |

---

## 1. Estado Actual de la Configuración

### Scripts en package.json
```json
"test": "node --test tests/**/*.test.js",
"test:watch": "node --test --watch tests/**/*.test.js"
```

**NO existen:**
- ❌ Script `test:coverage` o `coverage`
- ❌ Dependencias de cobertura (c8, istanbul, nyc, jest)
- ❌ Archivos de configuración `.nycrc`, `nyc.config.js`, `c8.config.js`

### Cobertura Nativa de Node.js 22
Node.js 22 soporta cobertura nativa via flag `--experimental-test-coverage`. **No requiere dependencias adicionales.**

Comando para ejecutar:
```bash
node --test --experimental-test-coverage tests/**/*.test.js
```

---

## 2. Resultados de Cobertura por Archivo

### Archivos con cobertura PERFECTA (100% líneas)
| Archivo | Líneas | Branches | Funciones |
|---------|--------|----------|-----------|
| `src/app.js` | 100% | 100% | 100% |
| `src/middleware/authenticate.js` | 100% | 100% | 100% |
| `src/middleware/cors.js` | 100% | 100% | 100% |
| `src/repositories/postRepository.js` | 100% | 94.74% | 100% |
| `src/routes/health.js` | 100% | 100% | 100% |
| `src/services/postVerification.js` | 100% | 100% | 100% |
| `src/utils/logger.js` | 100% | 100% | 100% |

### Archivos con cobertura ALTA (≥90%)
| Archivo | Líneas | Branches | Funciones | Líneas sin cubrir |
|---------|--------|----------|-----------|-------------------|
| `src/middleware/errorHandler.js` | 100% | 90% | 100% | — |
| `src/middleware/requestLogger.js` | 100% | 85.71% | 100% | — |
| `src/middleware/verifyMetaSignature.js` | 97.06% | 94.12% | 100% | 42-43 |
| `src/services/metaApi.js` | 97.62% | 81.48% | 100% | 37-38 |
| `src/services/webhookProcessor.js` | 96.20% | 93.75% | 100% | 67-69 |
| `src/config/dynamodb.js` | 100% | 75% | 100% | — |
| `src/middleware/validate.js` | 90.48% | 88.24% | 100% | 27-30 |
| `src/routes/webhooks.js` | 94.19% | 87.50% | 100% | 62-64, 75-76 |

### ⚠️ Archivos con cobertura BAJA (<90%)
| Archivo | Líneas | Branches | Funciones | Líneas sin cubrir |
|---------|--------|----------|-----------|-------------------|
| **`src/middleware/rateLimit.js`** | **68.63%** | 75% | 75% | 18-21, 26-29, 35-42 |
| **`src/routes/posts.js`** | **76.58%** | 83.33% | 80% | 37-38, 53-60, 76-77, 87-88, 92-103 |

---

## 3. Análisis de Brechas Críticas

### 3.1 `src/middleware/rateLimit.js` — 68.63% líneas
**Líneas no cubiertas:**
- **Líneas 18-21**: Reset del contador cuando expira la ventana de tiempo (`now > client.resetTime`)
- **Líneas 26-29**: Respuesta 429 con header `Retry-After` cuando se excede el límite
- **Líneas 35-42**: Función `cleanupClients()` que limpia IPs expiradas del Map

**Causa**: No hay tests dedicados para `rateLimit.js`. Solo se usa indirectamente en `posts.test.js` como middleware de la app, pero sin probar los escenarios de rate limiting (expiración de ventana, límite excedido, cleanup).

**Riesgo**: 🔴 **ALTO** — El rate limiting es un mecanismo de protección. Sin tests, podríamos tener:
- Falsa sensación de protección (rate limit no funciona)
- Memory leak si `cleanupClients` no funciona correctamente

### 3.2 `src/routes/posts.js` — 76.58% líneas
**Líneas no cubiertas:**
- **Líneas 37-38**: Validación de Post ID vacío (`id.trim().length === 0`)
- **Líneas 53-60**: Flujo de verificación de post stale (cuando `result.status === "verified"` o `"deleted"`)
- **Líneas 76-77**: Validación de limit en POST `/posts/sync`
- **Líneas 87-88**: Error handling en POST `/posts/sync`
- **Líneas 92-103**: **Toda la ruta POST `/posts/verify`** — sin tests

**Causa**: Faltan tests para:
1. POST endpoint de verificación (`/posts/verify`)
2. Validación de límites en POST `/sync`
3. Escenarios de post ID vacío
4. Flujo completo de verificación de posts stale

**Riesgo**: 🟡 **MEDIO** — La ruta `/posts/verify` es funcionalidad de verificación periódica. Sin tests, no sabemos si maneja correctamente errores y edge cases.

### 3.3 Otras brechas menores
| Archivo | Líneas | Descripción |
|---------|--------|-------------|
| `verifyMetaSignature.js` | 42-43 | Error cuando el body no es Buffer (caso edge) |
| `metaApi.js` | 37-38 | Error genérico de Meta API (código no 190/4/100) |
| `webhookProcessor.js` | 67-69 | Error en procesamiento individual de cambio |
| `validate.js` | 27-30 | Validación de `maxLength` |

---

## 4. Estado del CI/CD

### Configuración actual en `.github/workflows/ci.yml`
```yaml
- name: Run tests
  run: pnpm test
```

**NO incluye:**
- ❌ Ejecución de cobertura en CI
- ❌ Umbrales mínimos de cobertura
- ❌ Reporte de cobertura en PR comments
- ❌ Upload de reportes de cobertura (Codecov, Coveralls)

---

## 5. Recomendaciones

### 5.1 Herramienta Recomendada: Node.js Nativo
**Razón**: Node.js 22 ya soporta cobertura nativa con `--experimental-test-coverage`. No necesitamos dependencias adicionales.

**Ventajas:**
- ✅ Cero dependencias adicionales
- ✅ Soporte nativo del test runner
- ✅ Output claro y formateado
- ✅ Compatible con el stack actual (ESM, Node 22)

**Alternativa (si se necesita más features):** `c8` como wrapper que usa V8 coverage nativo pero añade reportes LCOV, umbrales, etc.

### 5.2 Scripts Propuestos para package.json
```json
{
  "scripts": {
    "test": "node --test tests/**/*.test.js",
    "test:watch": "node --test --watch tests/**/*.test.js",
    "test:coverage": "node --test --experimental-test-coverage tests/**/*.test.js",
    "test:coverage:threshold": "node --test --experimental-test-coverage --test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=80 tests/**/*.test.js"
  }
}
```

### 5.3 Umbrales Mínimos Propuestos
| Métrica | Umbral Mínimo | Actual | Estado |
|---------|---------------|--------|--------|
| Líneas | 80% | 94.03% | ✅ PASS |
| Branches | 80% | 89.37% | ✅ PASS |
| Funciones | 80% | 96.36% | ✅ PASS |

**Conclusión**: El proyecto YA supera los umbrales recomendados del 80%.

### 5.4 Integración en CI/CD
Paso 1: Añadir script `test:coverage` a package.json
Paso 2: Modificar `.github/workflows/ci.yml`:
```yaml
- name: Run tests with coverage
  run: pnpm test:coverage:threshold
```

### 5.5 Tests Faltantes Recomendados (Prioridad)
1. **ALTA**: Tests dedicados para `rateLimit.js` (expiración, límite, cleanup)
2. **ALTA**: Tests para POST `/posts/verify`
3. **MEDIA**: Tests para POST `/posts/sync` con validación de limit
4. **BAJA**: Tests para edge cases de `verifyMetaSignature` (body no-Buffer)

---

## 6. Archivos Relevantes

- `package.json`: Configuración de scripts y dependencias
- `.github/workflows/ci.yml`: Pipeline CI/CD (no incluye cobertura)
- `src/middleware/rateLimit.js`: Archivo con menor cobertura (68.63%)
- `src/routes/posts.js`: Archivo con segunda menor cobertura (76.58%)
- `tests/`: 14 archivos de test, 93 tests totales

## 7. Dependencias Existentes

- **No hay dependencias de cobertura** — Node.js 22 lo incluye nativamente
- `eslint`: Linting (configurado)
- `node:test`: Test runner nativo (en uso)

## 8. Riesgos Potenciales

- Añadir `c8` como dependencia es innecesario dado que Node.js 22 nativo ya ofrece cobertura
- El flag `--experimental-test-coverage` podría cambiar en futuras versiones de Node.js (bajo riesgo)
- `rateLimit.js` tiene un `setInterval` global que puede interferir entre tests (ya se maneja con `stopCleanup()`)
- El 6% de líneas sin cubrir son principalmente edge cases y rutas nuevas (`/verify`)

---

## Conclusión

El proyecto tiene una **cobertura excelente (94% líneas)** a pesar de no tener configuración formal de cobertura. Los únicos archivos con cobertura significativamente baja son `rateLimit.js` (68.63%) y `posts.js` (76.58%), principalmente porque faltan tests para la ruta `/posts/verify` y para los escenarios de rate limiting activo.

La recomendación principal es:
1. Añadir el script `test:coverage` usando el flag nativo de Node.js 22
2. Añadir umbral mínimo del 80% en CI
3. Priorizar tests para `rateLimit.js` y `POST /posts/verify`
