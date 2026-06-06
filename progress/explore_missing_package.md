# Research — Missing @vendia/serverless-express in Lambda

## Archivos relevantes
- `package.json` (líneas 42-51): Define dependencies del proyecto
- `.github/workflows/ci.yml` (líneas 97-106): Build step que crea `dist/`
- `lambda.js` (línea 1): Importa `@vendia/serverless-express`
- `infra/lib/ig-api-stack.js` (línea 31): `Code.fromAsset` apunta a `dist/`

## Hallazgo Principal

### 1. ¿Está `@vendia/serverless-express` en dependencies o devDependencies?

**Está en dependencies (línea 45 de package.json):**
`json
"dependencies": {
    "@aws-sdk/client-dynamodb": "^3.1057.0",
    "@aws-sdk/lib-dynamodb": "^3.1057.0",
    "@vendia/serverless-express": "^4.12.6",  ← CORRECTO
    "dotenv": "^17.4.2",
    "express": "^5.2.1",
    "pino": "^10.3.1",
    ...
}
`

**Veredicto:** La ubicación es correcta. `pnpm install --prod` SÍ debería instalarlo.

---

### 2. ¿El build step `pnpm install --prod` instala devDependencies?

**NO.** `pnpm install --prod` solo instala `dependencies`, excluyendo `devDependencies`.

El build step (ci.yml líneas 97-106):
`yaml
- name: Build production bundle
  run: |
    mkdir -p dist
    cp -r src lambda.js dist/
    jq 'del(.devEngines)' package.json > dist/package.json
    cd dist
    pnpm install --prod --ignore-scripts
`

---

### 3. CAUSA RAÍZ IDENTIFICADA: Falta `pnpm-lock.yaml` en `dist/`

**Problema crítico:** El build step NO copia `pnpm-lock.yaml` al directorio `dist/`.

`pnpm install --prod` sin un archivo lock puede fallar o resolver versiones incorrectas porque:
- pnpm necesita el archivo lock para saber las versiones exactas a instalar
- Sin lock, intenta resolver desde cero y puede fallar en entornos aislados

**Línea problemática (ci.yml:100):**
`ash
cp -r src lambda.js dist/   # ← Solo copia src/ y lambda.js
`

**Falta:**
`ash
cp pnpm-lock.yaml dist/     # ← ESTO NO ESTÁ
`

---

### 4. ¿Qué otros paquetes podrían faltar en el bundle de producción?

Todas las dependencies de `package.json` podrían estar afectadas:
- `@aws-sdk/client-dynamodb`
- `@aws-sdk/lib-dynamodb`
- `@vendia/serverless-express`
- `dotenv`
- `express`
- `pino`
- `aws-cdk-lib` ← **PROBLEMA ADICIONAL**: Esto es infraestructura, no runtime
- `constructs` ← **PROBLEMA ADICIONAL**: Esto es infraestructura, no runtime

**Nota:** `aws-cdk-lib` y `constructs` están en `dependencies` pero son solo para infraestructura (CDK). No deberían estar en el bundle de Lambda, pero su presencia no causa el error actual.

---

### 5. ¿Hay algún problema con la estructura de `dist/`?

**Estructura esperada después del build:**
`
dist/
├── lambda.js           ← Punto de entrada
├── src/                ← Código fuente
├── package.json        ← Dependencies (sin devEngines)
└── node_modules/       ← DEBERÍA existir después de pnpm install
`

**Problema:** Sin `pnpm-lock.yaml`, `node_modules/` podría no crearse correctamente o estar incompleto.

---

## Resumen del Problema

| Factor | Estado | Impacto |
|--------|--------|---------|
| `@vendia/serverless-express` en dependencies | ✅ Correcto | Ninguno |
| `pnpm install --prod` | ✅ Correcto | Ninguno |
| `pnpm-lock.yaml` copiado a dist/ | ❌ **FALTA** | **CRÍTICO** |
| `aws-cdk-lib` y `constructs` en dependencies | ⚠️ Innecenario | Bajo (bundle más grande) |

---

## Solución Recomendada

En `ci.yml` línea 100, agregar la copia de `pnpm-lock.yaml`:

`ash
# Línea actual:
cp -r src lambda.js dist/

# Debería ser:
cp -r src lambda.js pnpm-lock.yaml dist/
`

---

## Dependencias existentes
- `pnpm` ^11.5.0 (devEngines)
- `@vendia/serverless-express` ^4.12.6
- `express` ^5.2.1
- `aws-cdk-lib` ^2.257.0

## Brechas identificadas
1. **CRÍTICO:** `pnpm-lock.yaml` no se copia a `dist/` antes de `pnpm install --prod`
2. **MENOR:** `aws-cdk-lib` y `constructs` están en `dependencies` pero son solo para CDK (no runtime)

## Riesgos potenciales
- Modificar el build step podría afectar otros deployments si no se prueba correctamente
- Cambiar `aws-cdk-lib` a `devDependencies` requeriría verificar que CDK CLI funcione correctamente
