# Resumen de Fixes — CI/CD y Nomenclatura de Entornos

## Fix 1: Paquete faltante en Lambda (CRITICO)

**Archivo:** `.github/workflows/ci.yml` (linea 100)

**Cambio:** Se agrego `pnpm-lock.yaml` al comando `cp` del paso "Build production bundle":

```yaml
# Antes:
cp -r src lambda.js dist/

# Despues:
cp -r src lambda.js pnpm-lock.yaml dist/
```

**Razon:** Sin `pnpm-lock.yaml` en `dist/`, el `pnpm install --prod` dentro del bundle no puede resolver el lockfile y falla al instalar `@vendia/serverless-express`, causando un error de modulo no encontrado en Lambda.

---

## Fix 2: Nomenclatura de entornos (`prod` → `pre`)

### Archivo 1: `infra/bin/app.js`

- Se agrego la variable `environment` leida de `IG_ENV` (default: `"pre"`).
- Stack name ahora es dinamico: `` `ig-api-${environment}` ``.
- Se pasa `environment` como prop al stack.
- TableName por defecto ahora es `` `ig-posts-${environment}` ``.

### Archivo 2: `infra/lib/ig-api-stack.js`

- Se extrae `environment` de los props.
- `stageName` cambiado de `"prod"` a `environment` (resuelve a `"pre"` por defecto).

### Archivo 3: `.github/workflows/ci.yml`

- Se agrego `IG_ENV: pre` en el bloque `env` del job "CDK Deploy".

---

## Validacion

| Criterio | Resultado |
|---|---|
| `pnpm cdk synth --no-lookups` | ✅ Template generado sin errores |
| Stage name = `pre` | ✅ Confirmado en template (`StageName: pre`) |
| Stack name = `ig-api-pre` | ✅ Confirmado en template (metadata paths) |

---

## Nota importante (fuera de scope)

El paso "Pre-deploy health check" en `ci.yml` (lineas 126, 134, 143, 161, 172) aun referencia `--stack-name ig-api` y `--table-name ig-posts` (nombres antiguos). Con los nuevos nombres (`ig-api-pre`, `ig-posts-pre`), este paso necesitara actualizarse para que el health check funcione correctamente en CI. Esto no se incluyo en el scope de estos fixes.
