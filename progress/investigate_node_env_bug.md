# Research — NODE_ENV Bug Investigation

## Resumen Ejecutivo
**NO hay bug.** `NODE_ENV` e `IG_ENV` son dos variables con propósitos diferentes y ambos funcionan correctamente.

---

## 1. Archivos que usan `NODE_ENV`

| Archivo | Línea | Uso |
|---------|-------|-----|
| `infra/lib/ig-api-stack.js` | 50 | Hardcodea `NODE_ENV: "production"` en Lambda |
| `src/middleware/errorHandler.js` | 16 | Verifica `NODE_ENV === "development"` para incluir stack traces |
| `.env.example` | 15 | Documenta `NODE_ENV=development` para local |

## 2. Archivos que usan `IG_ENV`

| Archivo | Línea | Uso |
|---------|-------|-----|
| `infra/bin/app.js` | 8 | `process.env.IG_ENV \|\| "pre"` - determina el entorno de despliegue |
| `.github/workflows/ci.yml` | 60 | `IG_ENV: ${{ github.ref_name }}` - se obtiene del nombre de la branch |
| `.github/workflows/ci.yml` | 115-116 | Construye nombres de stack y tabla: `ig-api-${IG_ENV}`, `ig-posts-${IG_ENV}` |
| `.github/workflows/ci.yml` | 188 | Pasa `IG_ENV` al step de CDK Deploy |
| `.env.example` | 39 | Documenta `IG_ENV=pre` para local |

## 3. Análisis: Dos Variables con Propósitos Diferentes

### `NODE_ENV` — Modo de Ejecución (Runtime)
- **Valores posibles:** `development`, `production`, `test`
- **Propósito:** Controla comportamientos del runtime de Node.js
- **Uso en este proyecto:** En `errorHandler.js`, si `NODE_ENV === "development"` se incluyen stack traces en la respuesta JSON (útil para debug local). En producción NO se incluyen (seguridad).
- **Asignación:** Hardcodeado como `"production"` en CDK (line 50 de `ig-api-stack.js`) porque Lambda siempre corre en modo producción.

### `IG_ENV` — Entorno de Despliegue (Infrastructure)
- **Valores posibles:** `dev`, `pre`, `int`, `pro`
- **Propósito:** Identifica qué entorno de infraestructura se está desplegando
- **Uso en este proyecto:** Controla el nombre del stack CDK (`ig-api-pre`, `ig-api-int`, `ig-api-pro`), el nombre de la tabla DynamoDB (`ig-posts-pre`, etc.), y el stage de API Gateway.
- **Asignación:** Se obtiene del nombre de la branch en CI (`github.ref_name`).

## 4. Diagrama de Flujo

```
Branch "pre" (push)
    ¦
    +- CI: IG_ENV = "pre" (desde github.ref_name)
    ¦
    +- CDK app.js: lee IG_ENV, crea stack "ig-api-pre"
    ¦
    +- CDK ig-api-stack.js:
    ¦   +- tableName = "ig-posts-pre"  (de app.js)
    ¦   +- environment = "pre"         (de app.js)
    ¦   +- NODE_ENV = "production"     (hardcodeado)
    ¦
    +- Lambda runtime:
        +- IG_ENV = NO disponible (no se pasa a Lambda)
        +- NODE_ENV = "production"
        +- errorHandler: NO incluye stack traces ?
```

## 5. ¿Por qué NO es un Bug?

1. **`NODE_ENV = production` es correcto** para Lambda en TODOS los entornos (pre/int/pro). El modo `production` de Node.js deshabilita ciertas validaciones de seguridad y stack traces. Esto es estándar.

2. **`IG_ENV = pre/int/pro` es correcto** para identificar el entorno de infraestructura. Controla nombres de recursos AWS.

3. **Son conceptos diferentes:**
   - `NODE_ENV` = "¿Estoy en modo desarrollo o producción?" (runtime behavior)
   - `IG_ENV` = "¿En qué entorno de infraestructura estoy?" (resource naming)

4. **Ejemplo análogo:** En un proyecto React, `NODE_ENV=production` se usa para el build de producción, pero podrías tener múltiples entornos (staging, prod) todos con `NODE_ENV=production`.

## 6. Recomendación

**No aplicar corrección.** El diseño actual es correcto y sigue las convenciones estándar de Node.js.

Si el usuario quiere distinguir entornos en el código de la aplicación (no solo en infraestructura), la opción sería:
- Pasar `IG_ENV` como variable de entorno adicional a la Lambda
- Pero actualmente no es necesario porque el código de app no necesita saber qué entorno es

## 7. Documentación Verificada

La documentación en `README.md` (line 74, 98, 529) y `progress/explore_env_variables.md` (line 47) ya documenta correctamente ambas variables y su diferencia.
