# Session Context — 2026-06-04

## Resumen de sesión

Sesión de configuración CI/CD con OIDC, diagnóstico de errores de deploy, y documentación del plan de empaquetado Lambda.

---

## Cambios implementados

### CI/CD — OIDC migration
- ci.yml: Replaced static `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` with OIDC `role-to-assume`
- ci.yml: Added `permissions: id-token: write` for OIDC token exchange
- ci.yml: Added `aws sts get-caller-identity` verification step
- GitHub Secrets eliminados: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`

### Cambios manuales del usuario
- ci.yml: ARN actualizado con AWS Account ID real (`159177056493`)
- ci.yml: pnpm action actualizado de `@v4` a `@v6`
- GitHub ActionsDeployRole creado en AWS console
- `aws-cdk` CLI instalado como devDependency
- `gh` CLI instalado y autenticado

---

## Estado del deploy — Bloqueado

### Error 1: `--require-approval` (RESUELTO por usuario)
- `--require-approval broadening` pide TTY en CI
- **Fix:** Cambiar a `--require-approval never` en `ci.yml:109`

### Error 2: Lambda > 250MB (PENDIENTE)
- `Code.fromAsset` empaqueta todo `node_modules` (dev+prod)
- **Fix documentado abajo en "Plan pendiente"**

---

## Plan pendiente: Lambda Packaging

### Problema
`Code.fromAsset` en `infra/lib/ig-api-stack.js:31` apunta a la raíz del proyecto e incluye todo `node_modules` (~300MB+). Lambda rechaza paquetes > 250MB.

### Solución (2 cambios)

**Cambio 1 — Build step en CI** (`.github/workflows/ci.yml`)

Agregar paso antes de `cdk deploy`:
```yaml
- name: Build Lambda package
  run: |
    mkdir -p dist
    cp -r src/ dist/
    cp lambda.js dist/
    cp package.json dist/
    cd dist
    npm install --omit=dev --ignore-scripts
```

**Cambio 2 — CDK apunta a `dist/`** (`infra/lib/ig-api-stack.js:31`)

```javascript
// Antes:
code: Code.fromAsset(resolve(import.meta.dirname, "../../"), { exclude: [...] })

// Después:
code: Code.fromAsset(resolve(import.meta.dirname, "../../dist"))
```

### Resultado esperado
| Antes | Después |
|-------|---------|
| ~300MB+ | ~5-10MB |
| Incluye aws-cdk, eslint, esbuild | Solo express, dotenv, pino, @aws-sdk |
| Lambda rechaza | Lambda acepta |

### Nota
`@aws-sdk/*` se excluye del empaquete porque ya viene en el runtime de Lambda.

---

## Errores diagnosticados (NO implementar)

| Error | Causa | Fix |
|-------|-------|-----|
| `Command "cdk" not found` | `aws-cdk` CLI no instalado | `pnpm add -D aws-cdk` ✅ ya hecho |
| `--require-approval` TTY | CI no tiene terminal | Cambiar a `never` |
| Lambda > 250MB | node_modules completo | Build step con `--omit=dev` |
| `gh: command not found` | gh no en PATH de bash | Usar `C:\Program Files\GitHub CLI\gh.exe` |

---

## GitHub Integration

### gh CLI
- Instalado en `C:\Program Files\GitHub CLI\gh.exe`
- Autenticado y funcionando
- Para OpenCode: ejecutar vía Bash tool

### Comandos útiles
```bash
# Últimos runs
& "C:\Program Files\GitHub CLI\gh.exe" run list -R Pathles5/api-meta -L 5

# Ver run específico
& "C:\Program Files\GitHub CLI\gh.exe" run view <ID> -R Pathles5/api-meta -v

# Ver log de error
& "C:\Program Files\GitHub CLI\gh.exe" run view <ID> -R Pathles5/api-meta --log-failed
```

---

## Pendiente para próxima sesión

1. **CRÍTICO: Lambda packaging** — Implementar build step + CDK apuntando a `dist/`
2. **CRÍTICO: `--require-approval never`** — Cambiar en `ci.yml:109`
3. **Verificar token Meta** `EAAL4y0p...` — ¿Se usó en producción? Rotar si sí.
4. **Phase 7: Webhooks** — `POST /webhooks`, validación firma Meta, challenge-response
5. **Phase 8: Production Readiness** — OpenAPI/Swagger, CloudWatch dashboard

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
- **Último commit:** `fc8d3dd` (ci: force Node.js 24 for GitHub Actions)
- **Remote:** `https://github.com/Pathles5/api-meta.git`

---

## Archivos clave

```
.github/workflows/ci.yml       # CI/CD pipeline (OIDC, Node.js 24)
infra/lib/ig-api-stack.js       # CDK stack (Lambda, API Gateway, DynamoDB)
lambda.js                       # Lambda handler
src/app.js                      # Express app
```
