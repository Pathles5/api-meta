# Session Context — 2026-06-06

## Resumen de sesión

Sesión de diagnóstico y corrección de agentes OpenCode + planificación con Leader Agent.

---

## Cambios implementados

### Fix de agentes OpenCode

**Problema:** El agente `leader` (y otros) no estaban disponibles como `subagent_type` en el task tool.

**Causa raíz:** Los archivos `.opencode/agents/*.md` tenían dos problemas:
1. `model: MiMo v2.5 Free` — formato inválido (debe ser `provider/model-id`)
2. `tools:` — deprecated en OpenCode (debe usarse `permission:`)

**Fix aplicado a 6 agentes:**

| Agente | Cambios |
|--------|---------|
| `leader.md` | model → `opencode/mimo-v2.5-free`, `tools` → `permission`, `name` eliminado |
| `implementer.md` | model → `opencode/mimo-v2.5-free`, `tools` → `permission` |
| `reviewer.md` | model → `opencode/mimo-v2.5-free`, `tools` → `permission`, `name` eliminado |
| `devops.md` | model → `opencode/mimo-v2.5-free`, `tools` → `permission` |
| `documentation.md` | model → `opencode/mimo-v2.5-free`, `tools` → `permission`, `name` eliminado |
| `explorer.md` | model → `opencode/mimo-v2.5-free`, `tools` → `permission`, `name` eliminado |

**Resultado:** 6/6 agentes operativos.

---

## Plan del Leader — Próximas sesiones

### 🔴 PRIORIDAD 1 — Lambda > 250MB (BLOQUEADOR DE DEPLOY)

**Problema:** `Code.fromAsset` en `ig-api-stack.js:31` empaqueta todo `node_modules` (~300MB+)

| Archivo | Cambio |
|---------|--------|
| `.github/workflows/ci.yml` | Agregar build step: crear `dist/` con src/, lambda.js, package.json + `npm install --omit=dev` |
| `infra/lib/ig-api-stack.js:31` | Cambiar a `Code.fromAsset(resolve(import.meta.dirname, "../../dist"))` |

### 🔴 PRIORIDAD 2 — Token Meta (SEGURIDAD)

Token `EAAL4y0p...` en `.env`. Verificar si se usó en producción → rotar si sí.

### 🟡 PRIORIDAD 3 — Phase 7: Webhooks

| Archivo | Acción |
|---------|--------|
| `src/middleware/verifyMetaSignature.js` | CREAR — HMAC-SHA256 con `META_APP_SECRET` |
| `src/routes/webhooks.js` | CREAR — GET challenge + POST events |
| `src/services/webhookProcessor.js` | CREAR — Procesar eventos Meta |
| `src/app.js` | MODIFICAR — Montar webhooks antes de authenticate |
| `infra/lib/ig-api-stack.js` | MODIFICAR — Agregar ruta /webhooks |
| `.env`, `.env.example` | MODIFICAR — Agregar `META_APP_SECRET` |

### 🟢 PRIORIDAD 4 — OpenAPI docs
- Crear `docs/openapi.yaml`

### 🟢 PRIORIDAD 5 — CloudWatch Dashboard
- Modificar `ig-api-stack.js`

### 🟢 PRIORIDAD 6 — Cost Review
- Crear `docs/cost-analysis.md`

---

## Estado del proyecto

| Fase | Estado |
|------|--------|
| Phase 0: Foundation | ✅ Completado |
| Phase 1: Basic REST API | ✅ Completado |
| Phase 2: Meta API Integration | ✅ Completado |
| Phase 3: Security | ✅ Completado |
| Phase 4: Data Persistence | ✅ Completado |
| Phase 5: Post Management | ✅ Completado |
| Phase 6: Infrastructure & Deployment | ⚠️ Deploy bloqueado (Lambda > 250MB) |
| Phase 7: Webhooks | 🔜 Pendiente |
| Phase 8: Production Readiness | ⏳ Pendiente |

---

## Métricas

- **Tests:** 71/71 pasan
- **Lint:** Limpio
- **Región AWS:** eu-west-1
- **Cuenta AWS:** 159177056493
- **Stack:** ig-api
- **Remote:** https://github.com/Pathles5/api-meta.git

---

## Agentes disponibles

| Agente | Rol | Estado |
|--------|-----|--------|
| Leader | Orquestador | ✅ |
| Explorer | Investigación | ✅ |
| Implementer | Constructor | ✅ |
| Reviewer | Auditor | ✅ |
| DevOps | Infraestructura | ✅ |
| Documentation | Documentación | ✅ |
