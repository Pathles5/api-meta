# DevOps: Resolución Bloqueo Lambda > 250MB

**Fecha:** 2026-06-06
**Estado:** Completado

---

## Problema

El deploy estaba bloqueado porque `Code.fromAsset` en `infra/lib/ig-api-stack.js` empaquetaba el directorio raíz completo, incluyendo todo `node_modules` (~300MB+). Lambda rechaza paquetes > 250MB.

## Solución

Se implementó un **bundle de producción ligero** (`dist/`) con solo las dependencias de runtime. El flujo es:

1. CI construye `dist/` copiando `src/`, `lambda.js` y `package.json` (sin `devEngines`)
2. Instala solo dependencias de producción con `npm install --omit=dev --ignore-scripts`
3. CDK empaqueta solo `dist/` en lugar de todo el repositorio

---

## Archivos Modificados

### 1. `.github/workflows/ci.yml` (líneas 94-101)

**Antes:** No existía el step de build.

**Ahora:** Nuevo step `Build production bundle` después de `Install dependencies` y antes de `CDK Bootstrap`:

```yaml
- name: Build production bundle
  run: |
    mkdir -p dist
    cp -r src lambda.js dist/
    # Strip devEngines (blocks npm; pnpm restriction not needed at runtime)
    jq 'del(.devEngines)' package.json > dist/package.json
    cd dist
    npm install --omit=dev --ignore-scripts
    echo "Bundle size: $(du -sh . | cut -f1)"
    ls -la
```

**Detalles técnicos:**
- `jq 'del(.devEngines)'` elimina la restricción de `pnpm` del `package.json` copiado, permitiendo que `npm install` funcione sin errores
- `--omit=dev` instala solo `dependencies` (no `devDependencies`)
- `--ignore-scripts` previene ejecución de scripts post-install por seguridad y velocidad

### 2. `infra/lib/ig-api-stack.js` (línea 31)

**Antes:**
```js
code: Code.fromAsset(resolve(import.meta.dirname, "../../"), {
  exclude: [
    "infra/**",
    "tests/**",
    "tools/**",
    ".github/**",
    "docs/**",
    "scripts/**",
    ".env",
    ".env.*",
    "*.md",
    "cdk.out/**",
    "node_modules/.cache/**",
  ],
}),
```

**Ahora:**
```js
code: Code.fromAsset(resolve(import.meta.dirname, "../../dist")),
```

**Cambios:**
- Path cambiado de `../../` → `../../dist`
- Eliminado el array `exclude` (ya no necesario porque `dist/` solo contiene lo esencial)
- Código más simple y mantenible

---

## Validación

### Comandos ejecutados localmente

```powershell
# 1. Strip devEngines del package.json copiado a dist/
$pkg = Get-Content -Raw package.json | ConvertFrom-Json
$pkg.PSObject.Properties.Remove('devEngines')
$pkg | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath "dist\package.json"

# 2. Instalar dependencias de producción
npm install --omit=dev --ignore-scripts   # (dentro de dist/)

# 3. Sintetizar CDK
pnpm exec cdk synth --no-lookups
```

### Resultados

| Métrica | Antes | Ahora |
|---------|-------|-------|
| **Tamaño del bundle** | ~300 MB+ | **11.5 MB** |
| **Paquetes instalados** | ~500+ (dev + prod) | **130** (solo prod) |
| **Límite Lambda** | ❌ Excedido (250MB) | ✅ Amplio margen |
| **CDK synth** | ❌ Fallaba | ✅ Exitoso |
| **Vulnerabilidades** | N/A | **0** |

### Asset CDK generado

```
aws:asset:path: asset.1009bb57706ec47c867e9a19a35440ad23fa43fbf8723de408bc0b8698bd298b
aws:asset:is-bundled: false
aws:asset:property: Code
```

---

## Problemas Encontrados y Soluciones

### 1. `devEngines` bloqueaba `npm install`

**Error:** `EBADDEVENGINES: Invalid devEngines.packageManager - Invalid name "pnpm" does not match "npm"`

**Causa:** El `package.json` raíz tiene `"devEngines": { "packageManager": { "name": "pnpm" } }`, lo que bloquea el uso de `npm`.

**Solución:** En el step de CI, se usa `jq 'del(.devEngines)'` para eliminar ese campo antes de ejecutar `npm install`. Localmente en Windows se usó PowerShell equivalente.

---

## Impacto Operacional

- **Costo:** $0 adicional. Todo sigue dentro del Free Tier.
- **Deploy:** El step de build agrega ~10-15 segundos al pipeline (instalación de 130 paquetes).
- **Rollback:** Revertir los dos archivos a su versión anterior en Git.
- **Seguridad:** Sin cambios en secrets o permisos. `dist/` está en `.gitignore`.
