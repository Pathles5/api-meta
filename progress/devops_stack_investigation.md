# DevOps Investigation: Stack `ig-api` vs `ig-api-pre` Mismatch

**Date:** 2026-06-06
**Investigated by:** DevOps Agent
**Status:** Root cause identified, fix already in place (next deploy will be correct)

---

## 1. Resumen Ejecutivo

El CI desplegó al stack antiguo `ig-api` (stage `prod`) en lugar del nuevo `ig-api-pre` (stage `pre`) debido a una **inconsistencia temporal entre el CI workflow y el código CDK** introducida en el commit `1e006cf`. El código CDK ya fue corregido en el merge `f0d0511` (HEAD actual). El próximo deploy a `pre` usará correctamente `ig-api-pre`.

---

## 2. Cronología de Commits (Rama `pre`)

| Commit | Fecha | Descripción | CI | CDK (`app.js`) |
|--------|-------|------------|-----|-----------------|
| `2113a44` | ~22:20 | Docs | Old (`main` only) | Old (`CDK_STACK_NAME`) |
| **`1e006cf`** 🔴 | ~22:23 | **ci: multi-env deploy** | **NEW** (`IG_ENV`, health check) | **OLD** (`CDK_STACK_NAME \|\| "ig-api"`) |
| `5660ab9` | ~22:26 | ci: exclude dev | NEW | OLD |
| **`f0d0511`** 🟢 | ~22:33 | **Merge (código CDK corregido)** | NEW | **NEW** (`IG_ENV \|\| "pre"`) |

### El problema: commit `1e006cf` 🔴

El commit `1e006cf` **solo modificó `.github/workflows/ci.yml`** (NO tocó `infra/bin/app.js` ni `infra/lib/ig-api-stack.js`). Esto creó una inconsistencia fatal:

```yaml
# CI workflow (NUEVO - commit 1e006cf)
env:
  IG_ENV: ${{ github.ref_name }}    # ← establece IG_ENV=pre

# Health check (NUEVO)
STACK_NAME="ig-api-${IG_ENV}"       # ← busca "ig-api-pre" → NOT_FOUND → "Clean deploy"
```

```js
// app.js (VIEJO - sin cambios en commit 1e006cf)
const stackName = process.env.CDK_STACK_NAME || "ig-api";
//                                       ^^^^^^
//                    IG_ENV es completamente ignorado
//                    → siempre despliega "ig-api"
```

### Resultado del CI roto:
1. `IG_ENV=pre` ✅ (establecido por CI)
2. Health check busca `ig-api-pre` → `NOT_FOUND` → muestra "Clean deploy" ✅
3. **CDK Deploy ignora `IG_ENV`** → sintetiza stack `ig-api` (nombre antiguo) ❌
4. Stack `ig-api` ya existe → CDK muestra `✅ ig-api (no changes)` ❌
5. API URL: `https://...amazonaws.com/prod/` (stage `prod` del stack antiguo) ❌

### Corrección: merge `f0d0511` 🟢

El merge actualizó `infra/bin/app.js` y `infra/lib/ig-api-stack.js`:

```js
// app.js (NUEVO - commit f0d0511)
const environment = process.env.IG_ENV || "pre";   // ← ahora lee IG_ENV
const stackName = `ig-api-${environment}`;          // → "ig-api-pre"
```

```js
// ig-api-stack.js (NUEVO)
deployOptions: {
  stageName: environment,   // ← dinámico ("pre", "int", "pro")
  // antes: stageName: "prod",  ← hardcodeado
}
```

**El próximo push a `pre` desplegará `ig-api-pre` correctamente.**

---

## 3. ¿Qué Stacks Existen en AWS?

### Stack `ig-api` (antiguo) - EXISTE ✅

| Propiedad | Valor |
|-----------|-------|
| Stack Name | `ig-api` |
| Stack ARN | `arn:aws:cloudformation:eu-west-1:159177056493:stack/ig-api/...` |
| Tabla DynamoDB | `ig-posts` |
| API Gateway Stage | `prod` |
| API URL | `https://p3uon57t46.execute-api.eu-west-1.amazonaws.com/prod/` |
| Origen | Desplegado desde rama `main` (código antiguo) |

### Stack `ig-api-pre` (nuevo) - NO EXISTE ❌

- El health check en el CI anterior mostró `NOT_FOUND`
- Se creará en el próximo deploy exitoso a la rama `pre`

---

## 4. Datos en la Tabla DynamoDB Antigua

### Tabla `ig-posts` (stack `ig-api`)

- **Estructura**: partition key `id` (String), TTL `expiresAt`
- **Riesgo de pérdida**: **NINGUNO**. El nuevo stack `ig-api-pre` creará una tabla NUEVA (`ig-posts-pre`), sin tocar la tabla `ig-posts` del stack antiguo.
- **Coexistencia**: Ambas tablas pueden coexistir sin problemas (son recursos independientes).
- **Migración**: Si se desean migrar datos, se puede usar un script de export/import entre tablas. Pero para el entorno `pre` (pruebas), probablemente no es necesario.

### Comandos para verificar (cuando haya credenciales AWS):

```bash
# Verificar stacks existentes
aws cloudformation list-stacks --region eu-west-1 \
  --query "StackSummaries[?StackStatus!='DELETE_COMPLETE'].StackName"

# Ver detalles del stack antiguo
aws cloudformation describe-stacks --stack-name ig-api --region eu-west-1

# Ver items en tabla antigua
aws dynamodb scan --table-name ig-posts --region eu-west-1 --max-items 5

# Ver tabla nueva (si ya existe)
aws dynamodb describe-table --table-name ig-posts-pre --region eu-west-1
```

---

## 5. Rama `main` - AÚN ROTA ⚠️

La rama `main` (remota) tiene el **mismo problema** que tenía `pre` antes del merge:

| Componente | Estado en `main` |
|-----------|-----------------|
| CI workflow | NEW (`IG_ENV`, multi-env triggers) |
| `app.js` | OLD (`CDK_STACK_NAME \|\| "ig-api"`) ❌ |
| `ig-api-stack.js` | OLD (`stageName: "prod"` hardcodeado) ❌ |

**Si se hace push a `main` o `dev`**, el CI de `main` desplegará incorrectamente al stack `ig-api`.

### Acción requerida: Actualizar `main` con el código CDK corregido.

---

## 6. Recomendaciones

### 6.1 Inmediata - Ya corregida en `pre`
- ✅ `app.js` usa `IG_ENV` en lugar de `CDK_STACK_NAME`
- ✅ `ig-api-stack.js` usa `stageName: environment` en lugar de `"prod"`
- ✅ El próximo deploy a `pre` creará `ig-api-pre` correctamente

### 6.2 Seguridad - Hacer explícito `IG_ENV` en el paso CDK Deploy

Aunque GitHub Actions hereda variables del job al step, es **mejor práctica** ser explícito para evitar sorpresas:

```yaml
# Actual: .github/workflows/ci.yml línea ~193
- name: CDK Deploy
  env:
    IG_ENV: ${{ github.ref_name }}        # ← AÑADIR esta línea
    META_ACCESS_TOKEN: ${{ secrets.META_ACCESS_TOKEN }}
    # ... resto de variables
  run: cdk deploy --require-approval never --outputs-file cdk-outputs.json
```

### 6.3 Rama `main`

Actualizar `infra/bin/app.js` y `infra/lib/ig-api-stack.js` en `main` para que coincidan con `pre`. Esto evita que un futuro deploy desde `main` sobreescriba el stack equivocado.

### 6.4 Rollback / Limpieza del stack antiguo

Cuando `ig-api-pre` esté funcionando correctamente:
1. Verificar que `ig-posts` no tenga datos críticos
2. Destruir el stack antiguo: `cdk destroy ig-api --region eu-west-1` (requiere credenciales)

---

## 7. Comandos de Validación Local

```bash
# Sintetizar el stack actual (pre) sin conectarse a AWS
pnpm cdk synth --no-lookups

# Verificar que el template generado tiene el nombre correcto
pnpm cdk list

# Output esperado:
# ig-api-pre
```

---

## 8. Conclusión

| Pregunta | Respuesta |
|----------|-----------|
| ¿Qué stacks existen en AWS? | Solo `ig-api` (antiguo). `ig-api-pre` no existe aún. |
| ¿Por qué CDK desplegó a `ig-api`? | El commit `1e006cf` actualizó el CI pero NO el código CDK. `app.js` ignoraba `IG_ENV` y usaba el nombre hardcodeado `ig-api`. |
| ¿`ig-api-pre` existe en AWS? | No. Se creará en el próximo deploy (código ya corregido). |
| ¿Se pueden perder datos de `ig-posts`? | No. La tabla `ig-posts-pre` será nueva e independiente. El stack antiguo no se modifica. |
