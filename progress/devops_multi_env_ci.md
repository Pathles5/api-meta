# DevOps: Multi-Environment CI/CD Pipeline

**Fecha:** 2026-06-06
**Estado:** Completado

---

## Problema

El workflow `.github/workflows/ci.yml` solo soportaba una branch (`main`) y desplegaba únicamente al entorno `pre` con `IG_ENV` hardcodeado. Era necesario extenderlo para soportar despliegue automático en 4 entornos (`dev`, `pre`, `int`, `pro`) mapeados a branches con el mismo nombre.

## Solución

Se realizaron 5 modificaciones puntuales en `.github/workflows/ci.yml`, sin tocar código fuente, tests ni infraestructura CDK.

### Cambios realizados

| # | Archivo | Línea(s) | Cambio | Razón |
|---|---------|----------|--------|-------|
| 1 | `ci.yml` | 5, 7 | `[main]` → `[dev, pre, int, pro]` | Trigger en push/PR a las 4 branches de entorno |
| 2 | `ci.yml` | 54 | `refs/heads/main` → `refs/heads/dev` (con `!=`)  | El deploy se salta en `dev`, corre en `pre`/`int`/`pro` |
| 3 | `ci.yml` | 55-56 | Nuevo `env.IG_ENV: ${{ github.ref_name }}` a nivel de job | `IG_ENV` se deriva automáticamente del nombre de la branch |
| 4 | `ci.yml` | 117-118 | Eliminado `env.IG_ENV: pre` del step health check | Hereda `IG_ENV` del job (evita duplicación) |
| 5 | `ci.yml` | 193-195 | Eliminado `IG_ENV: pre` del step CDK Deploy | Hereda `IG_ENV` del job (evita duplicación) |

### Lógica de despliegue por branch

| Branch | `IG_ENV` | Stack CDK | `lint-and-test` | `deploy` |
|--------|----------|-----------|:---:|:---:|
| `dev` | `dev` | — | ✅ | ❌ (skipped) |
| `pre` | `pre` | `ig-api-pre` | ✅ | ✅ |
| `int` | `int` | `ig-api-int` | ✅ | ✅ |
| `pro` | `pro` | `ig-api-pro` | ✅ | ✅ |

### Mecanismo de `IG_ENV` dinámico

```yaml
deploy:
  if: github.ref != 'refs/heads/dev' && github.event_name == 'push'
  env:
    IG_ENV: ${{ github.ref_name }}
```

- `github.ref_name` resuelve al nombre de la branch (ej: `pre`, `int`, `pro`)
- El health check construye `STACK_NAME="ig-api-${IG_ENV}"` y `TABLE_NAME="ig-posts-${IG_ENV}"` automáticamente
- CDK deploy usa `--require-approval never` con el contexto del stack correspondiente

### Branch `dev`

- Solo ejecuta `lint-and-test` (linter, tests unitarios, audit de dependencias)
- NO despliega a AWS (el conditional `if` impide que el job `deploy` corra)
- Esto mantiene el entorno `dev` como puramente local/CI, sin costo de infraestructura cloud

## Validación

1. **CDK Synth**: `pnpm cdk synth --no-lookups` → ✅ Template CloudFormation válido (207 líneas de YAML output)
2. **YAML sintaxis**: Workflow YAML estructuralmente correcto (sin bloques `env:` vacíos)
3. **Lógica de branches**:
   - Push a `dev` → `lint-and-test` ✅, `deploy` skipped por `if` ✅
   - Push a `pre` → `lint-and-test` ✅, `deploy` ejecuta con `IG_ENV=pre` ✅
   - Push a `int` → `lint-and-test` ✅, `deploy` ejecuta con `IG_ENV=int` ✅
   - Push a `pro` → `lint-and-test` ✅, `deploy` ejecuta con `IG_ENV=pro` ✅
   - Pull request a cualquier branch → `lint-and-test` ✅, `deploy` skipped por `event_name == 'push'` ✅

## Costos

- **Sin impacto**: No se agregaron nuevos recursos AWS. El cambio es puramente de CI/CD (GitHub Actions).
- Los stacks `ig-api-int` y `ig-api-pro` se crearán bajo demanda con el primer deploy a sus respectivas branches, usando exactamente la misma infraestructura serverless (Lambda + DynamoDB + API Gateway) del stack `ig-api-pre`.

## Rollback

Para revertir, restaurar las 5 líneas modificadas a sus valores originales (branch `main`, `IG_ENV: pre` hardcodeado). No hay migración de estado ni datos que revertir en AWS.

## Comandos de validación local

```bash
# Validar sintaxis CDK
pnpm cdk synth --no-lookups

# Validar YAML del workflow (requiere yamllint instalado)
yamllint .github/workflows/ci.yml
```
