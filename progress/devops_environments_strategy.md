# Estrategia de Entornos - IG-API

**Autor:** DevOps Agent
**Fecha:** 2026-06-06
**Estado:** Propuesta (pendiente de aprobación)

---

## 1. Resumen Ejecutivo

Actualmente el proyecto tiene un único stack (`ig-api`) con stage `prod` en API Gateway y despliegue automático desde `main`. Esta estrategia propone migrar a **múltiples entornos con stacks independientes**, siguiendo el principio de simplicidad y sin incurrir en costos adicionales (todo dentro del AWS Free Tier).

---

## 2. Análisis de Opciones

| Opción | Descripción | Pros | Contras | Veredicto |
|--------|-------------|------|---------|-----------|
| **A: Stacks separados** | Un stack CDK por entorno (`ig-api-pre`, `ig-api-pro`) | Aislamiento total, despliegue independiente, fácil de entender | Más stacks que gestionar (pero CDK lo automatiza) | ✅ **RECOMENDADA** |
| **B: Stack único con parámetros** | Mismo stack, diferentes parámetros según entorno | Menos código CDK | No se pueden desplegar múltiples instancias del mismo stack en la misma cuenta+región; no hay aislamiento real | ❌ No viable técnicamente |
| **C: CDK Pipelines + Stages** | CodePipeline con stages y aprobación manual | Automatización completa, gating entre entornos | Complejidad alta, CodePipeline tiene costo (≈$1/mes por pipeline), over-engineering para este proyecto | ❌ Over-engineering |

### Decisión: **Opción A — Un stack por entorno**

Cada entorno de AWS (`pre`, `inte`, `pro`) tendrá su propio stack CDK independiente, con sus propios recursos (Lambda, API Gateway, DynamoDB, CloudWatch). El entorno `dev` es local y no requiere stack CDK.

---

## 3. Estructura de Entornos Propuesta

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ENTORNOS IG-API                              │
├──────────┬──────────────┬──────────────┬──────────────┬─────────────┤
│          │     dev      │     pre      │     inte     │     pro     │
├──────────┼──────────────┼──────────────┼──────────────┼─────────────┤
│ Ubicación│ Localhost    │ AWS Cloud    │ AWS Cloud    │ AWS Cloud   │
│ Stack    │ N/A          │ ig-api-pre   │ ig-api-inte  │ ig-api-pro  │
│ Stage    │ N/A          │ pre          │ inte         │ pro         │
│ Tabla    │ ig-posts     │ ig-posts-pre │ ig-posts-inte│ ig-posts-pro│
│ Branch   │ (cualquiera) │ main         │ release/*    │ production  │
│ Secrets  │ .env local   │ GitHub Env   │ GitHub Env   │ GitHub Env  │
│ Free Tier│ N/A          │ ✅ Sí        │ ⚠️ Opcional  │ ✅ Sí       │
└──────────┴──────────────┴──────────────┴──────────────┴─────────────┘
```

### 3.1 Entorno `dev` (Desarrollo Local)

- **No requiere despliegue en AWS**
- Usa DynamoDB Local (puerto 8000) y Express.js local (puerto 3000)
- Variables de entorno desde `.env`
- Sin cambios necesarios — ya funciona correctamente

### 3.2 Entorno `pre` (Preproducción)

- **Reemplaza al actual stack `ig-api` con stage `prod`**
- Primer entorno en la nube, validación antes de producción
- Despliegue automático desde `main`
- Mismos secrets que producción o tokens de prueba

### 3.3 Entorno `inte` (Integración)

- **⚠️ Opcional para proyecto educativo**
- Útil si se necesita probar integraciones con sistemas externos
- Puede compartir secrets con `pre` o tener tokens de sandbox de Meta
- Si no es necesario, se puede omitir y ahorrar recursos

### 3.4 Entorno `pro` (Producción)

- Entorno "real", despliegue con aprobación manual
- Tokens de Meta de producción
- Mayor retención de datos (TTL más largo)
- Rate limiting más estricto

---

## 4. Implementación CDK

### 4.1 Cambios en `infra/bin/app.js`

```javascript
#!/usr/bin/env node
import "dotenv/config";
import { App } from "aws-cdk-lib";
import { IgApiStack } from "../lib/ig-api-stack.js";

const app = new App();

// Entorno: pre (default), inte, pro
const environment = process.env.IG_ENV || "pre";
const stackName = `ig-api-${environment}`;
const env = {
  region: process.env.AWS_REGION || "eu-west-1",
};

new IgApiStack(app, stackName, {
  env,
  environment,  // ← NUEVO: se pasa al stack para nombrar recursos
  tableName: process.env.DYNAMODB_TABLE_NAME || `ig-posts-${environment}`,
  metaAccessToken: process.env.META_ACCESS_TOKEN,
  igUserId: process.env.META_IG_USER_ID,
  authApiKey: process.env.AUTH_API_KEY,
  verificationHours: process.env.POST_VERIFICATION_HOURS || "24",
  logLevel: process.env.APP_LOG_LEVEL || "info",
  metaAppSecret: process.env.META_APP_SECRET,
  metaVerifyToken: process.env.META_VERIFY_TOKEN || "ig-api-verify-token",
});
```

**Qué cambia:**
- Nueva variable `IG_ENV` (default: `"pre"`)
- Stack name dinámico: `ig-api-${environment}`
- Table name dinámico: `ig-posts-${environment}`
- Se pasa `environment` como prop al stack

### 4.2 Cambios en `infra/lib/ig-api-stack.js`

Cambios necesarios:

```javascript
// En el constructor, extraer environment:
const {
  tableName, metaAccessToken, igUserId, authApiKey,
  verificationHours, logLevel, metaAppSecret, metaVerifyToken,
  environment,  // ← NUEVO
} = props;

// ... 

// API Gateway stage name dinámico:
deployOptions: {
  stageName: environment,  // "pre", "inte", o "pro" en vez de "prod" hardcodeado
  loggingLevel: MethodLoggingLevel.INFO,
  throttlingRateLimit: 100,
  throttlingBurstLimit: 200,
},

// Dashboard name único por entorno:
dashboardName: `${id}-monitoring`,  // Ya usa ${id} = ig-api-pre, único automáticamente

// Lambda function name:
functionName: `${id}-api`,  // Ya usa ${id}, único automáticamente

// RestApi name:
restApiName: `${id}-api`,  // Ya usa ${id}, único automáticamente
```

**Qué NO cambia:**
- La mayoría de resource names ya usan `${id}` (el stack name), por lo que son únicos automáticamente
- La estructura de recursos (Lambda, DynamoDB, API Gateway, CloudWatch) es idéntica entre entornos
- Los `props` existentes se mantienen

**Qué SÍ cambia:**
- `stageName: "prod"` → `stageName: environment` (línea 68)
- Se agrega `environment` a los props extraídos
- `tableName` ya se pasa como prop, solo cambia su valor

### 4.3 Resumen de Nombres por Entorno

| Recurso | `pre` | `inte` | `pro` |
|---------|-------|--------|-------|
| Stack CloudFormation | `ig-api-pre` | `ig-api-inte` | `ig-api-pro` |
| API Gateway Name | `ig-api-pre-api` | `ig-api-inte-api` | `ig-api-pro-api` |
| API Stage | `pre` | `inte` | `pro` |
| Lambda Function | `ig-api-pre-api` | `ig-api-inte-api` | `ig-api-pro-api` |
| DynamoDB Table | `ig-posts-pre` | `ig-posts-inte` | `ig-posts-pro` |
| CloudWatch Dashboard | `ig-api-pre-monitoring` | `ig-api-inte-monitoring` | `ig-api-pro-monitoring` |

---

## 5. Estrategia de Secretos

### 5.1 GitHub Secrets por Entorno

Usar **GitHub Environments** (no solo Secrets globales):

```
GitHub Repo → Settings → Environments:
  ├── pre
  │   ├── META_ACCESS_TOKEN
  │   ├── META_IG_USER_ID
  │   ├── AUTH_API_KEY
  │   ├── META_APP_SECRET
  │   └── META_VERIFY_TOKEN
  ├── inte (opcional)
  │   └── (mismos nombres, diferentes valores)
  └── pro
      └── (mismos nombres, valores de producción)
```

**Ventajas de GitHub Environments:**
- Secrets con scope por entorno (no se pueden usar accidentalmente en otro entorno)
- Reglas de protección (required reviewers, wait timer)
- Deployment tracking en GitHub UI
- Mismos nombres de secret en todos los entornos (el workflow selecciona el environment)

### 5.2 Tokens de Meta por Entorno

| Entorno | Token Meta | App de Meta |
|---------|-----------|-------------|
| `dev` | Token de desarrollo (sandbox) | App de prueba |
| `pre` | Token de prueba o mismo de dev | App de prueba |
| `inte` | Token de sandbox de integración | App de prueba |
| `pro` | Token de producción | App de producción |

> **Recomendación:** Para un proyecto pequeño, `pre` e `inte` pueden compartir el mismo token de prueba. Solo `pro` necesita un token de producción diferente.

### 5.3 Runtime: Variables de Entorno en Lambda

Cada stack inyecta las variables en `Lambda.environment`. Los nombres son los mismos en todos los entornos (`META_ACCESS_TOKEN`, `AUTH_API_KEY`, etc.), solo cambian los valores. Esto significa que el código de la aplicación **NO necesita cambios** para soportar múltiples entornos.

---

## 6. Estrategia CI/CD

### 6.1 Workflow Propuesto

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  main    │────▶│   pre    │     │          │
└──────────┘     └──────────┘     │          │
                                  │ GitHub   │
┌──────────┐     ┌──────────┐     │ Actions  │
│ release/*│────▶│   inte   │     │          │
└──────────┘     └──────────┘     │          │
                                  │          │
┌──────────┐     ┌──────────┐     │          │
│production│────▶│   pro    │     │          │
└──────────┘     └──────────┘     └──────────┘
```

### 6.2 Reglas de Branch → Entorno

| Branch | Entorno | Trigger | Aprobación |
|--------|---------|---------|------------|
| `main` | `pre` | Push automático | No (post-test) |
| `release/*` | `inte` | Push automático | No (post-test) |
| `production` | `pro` | Push automático | ✅ Manual (vía GitHub Environment protection rules) |

### 6.3 Workflow Simplificado (`.github/workflows/ci.yml`)

Se refactoriza el job `deploy` actual para que sea un **reusable workflow** o se usa **matrix con environments**. La opción más simple y recomendada:

**Un workflow con environment dinámico:**

```yaml
name: CI

on:
  push:
    branches: [main, production]
  pull_request:
    branches: [main]

jobs:
  lint-and-test:
    # ... (sin cambios)

  deploy:
    needs: lint-and-test
    runs-on: ubuntu-latest
    if: github.event_name == 'push'
    # Determinar el environment según el branch
    environment: ${{ github.ref == 'refs/heads/main' && 'pre' || github.ref == 'refs/heads/production' && 'pro' || '' }}
    # ... resto del deploy, usando secrets del environment
```

Para `inte` (release/*), se puede agregar otro trigger:

```yaml
on:
  push:
    branches: [main, production, 'release/*']
```

---

## 7. Cambios Inmediatos (Quick Wins)

Estos cambios se pueden implementar **ahora mismo** con bajo riesgo:

### 7.1 Cambiar `stageName: "prod"` → `stageName: "pre"`

- **Archivo:** `infra/lib/ig-api-stack.js`, línea 68
- **Razón:** El stack actual es preproducción, no producción real
- **Riesgo:** Bajo. Solo cambia el nombre del stage en API Gateway
- **Rollback:** Revertir a `"prod"`

### 7.2 Renombrar stack a `ig-api-pre`

- **Archivo:** `infra/bin/app.js`, línea 8
- **Razón:** Alinear con la nomenclatura de entornos
- **Riesgo:** Medio. CloudFormation interpreta un cambio de stack name como un stack nuevo. **Requiere eliminación del stack anterior (`ig-api`) o deploy fresh.**
- **Alternativa segura:** Mantener el stack name actual como `ig-api` y solo cambiar el stage name. Hacer el rename cuando se migre a entornos completos.

### 7.3 Actualizar GitHub Secrets

- Agregar `IG_ENV=pre` como variable de entorno en el workflow
- No es necesario renombrar secrets existentes si usamos el mismo nombre

### 7.4 Orden recomendado de implementación

1. ✅ **Paso 1 (AHORA):** Cambiar `stageName` de `"prod"` a `"pre"` en el stack. Esto es seguro y no requiere destruir recursos.
2. ⏳ **Paso 2 (Próximo deploy):** Agregar `IG_ENV` al workflow y hacer dinámico el `stageName`.
3. ⏳ **Paso 3 (Cuando se cree `pro`):** Crear el stack `ig-api-pro` desde cero.
4. ⏳ **Paso 4 (Migración):** Cuando ambos entornos estén estables, eliminar el stack `ig-api` original.

---

## 8. Estrategia de Rollback

### Rollback de un deploy fallido

```bash
# 1. Identificar el stack en problemas
aws cloudformation describe-stacks --stack-name ig-api-pre --region eu-west-1

# 2. Si el stack está en ROLLBACK_COMPLETE:
aws cloudformation continue-update-rollback --stack-name ig-api-pre --region eu-west-1

# 3. Si se necesita deploy de una versión anterior:
git checkout <commit-anterior>
git push  # Triggers redeploy
```

### Rollback de cambio de stage name

Si el cambio de `"prod"` a `"pre"` causa problemas:
- Revertir la línea 68 a `stageName: "prod"`
- Hacer deploy
- API Gateway permite cambiar el stage name en una actualización de stack

### Aislamiento entre entornos

- Cada entorno tiene su propia tabla DynamoDB → los datos no se mezclan
- Cada entorno tiene su propia Lambda → las configuraciones no se pisan
- Cada entorno tiene su propio API Gateway → las URLs son diferentes
- **No hay riesgo de que un deploy en `pre` afecte a `pro`**

---

## 9. Consideraciones de AWS Free Tier

### Recursos por entorno y su impacto

| Recurso | Free Tier | 1 entorno | 2 entornos (pre+pro) | 3 entornos |
|---------|-----------|-----------|---------------------|------------|
| Lambda | 1M requests/mes | ✅ | ✅ (2M → 1M free + 1M ≈ $0.20) | ⚠️ |
| API Gateway | 1M requests/mes | ✅ | ✅ (2M → 1M free + 1M ≈ $1.00) | ⚠️ |
| DynamoDB | 25 GB storage | ✅ | ✅ | ✅ |
| CloudWatch | 5 GB logs | ✅ | ✅ | ⚠️ (monitorear) |
| CloudFormation | Gratis | ✅ | ✅ | ✅ |

**Conclusión:** Dos entornos (`pre` + `pro`) son seguros dentro del Free Tier para tráfico bajo. Tres entornos (`pre` + `inte` + `pro`) empiezan a superar los límites gratuitos de Lambda y API Gateway. **Recomendación: implementar solo `pre` y `pro` inicialmente.**

---

## 10. Recomendación Final

### Para este proyecto (educativo, bajo tráfico):

```
✅ IMPLEMENTAR AHORA:
   dev (local) + pre (AWS cloud)

⏳ IMPLEMENTAR DESPUÉS (si es necesario):
   pro (AWS cloud, producción real)

❌ NO IMPLEMENTAR (a menos que haya necesidad real):
   inte (AWS cloud, integración)
```

### Resumen de cambios en archivos

| Archivo | Cambio | Prioridad |
|---------|--------|-----------|
| `infra/lib/ig-api-stack.js` | `stageName: "prod"` → recibir `environment` como prop | Alta |
| `infra/bin/app.js` | Agregar `IG_ENV`, stack name dinámico | Alta |
| `.github/workflows/ci.yml` | Soportar múltiples environments, usar `IG_ENV` | Media |
| `docs/decisions.md` | Documentar estrategia de entornos | Media |
| GitHub Secrets | Crear environment `pre` | Media |

---

## 11. Validación Local

Comandos para validar los cambios localmente (sin desplegar):

```bash
# 1. Sintetizar el stack para pre (default)
pnpm cdk synth --no-lookups

# 2. Sintetizar como si fuera pro
IG_ENV=pro pnpm cdk synth --no-lookups

# 3. Verificar que los nombres de recursos son diferentes
#    (API Gateway stage, DynamoDB table, Lambda function)

# 4. Listar stacks existentes
aws cloudformation list-stacks --region eu-west-1 --query "StackSummaries[?StackStatus!='DELETE_COMPLETE'].StackName"

# 5. Diff del stack actual antes de deploy
pnpm cdk diff --no-lookups
```
