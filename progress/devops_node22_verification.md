# Verificación de compatibilidad CI/CD con Node.js 22

> **Fecha:** 2026-06-07
> **Agente:** DevOps
> **Tarea:** Verificar que el CI/CD y las dependencias son compatibles con Node.js 22

---

## 1. Estado actual del CI/CD

### Pipeline (`ci.yml`)

El workflow tiene **dos jobs** que se ejecutan secuencialmente:

| Job | Gatillo | Propósito |
|-----|---------|-----------|
| `lint-and-test` | Push/PR a `pre`, `int`, `pro` | Lint, tests, audit de dependencias |
| `deploy` | Solo push a `pre`, `int`, `pro` (no PRs, no `dev`) | Build + CDK deploy a AWS |

### Lo que está bien configurado ✓

- **pnpm:** Correctamente configurado via `pnpm/action-setup@v6`.
- **Caching:** `actions/cache@v4` cachea el store de pnpm correctamente.
- **CDK CLI:** Se instala correctamente con `npm install -g aws-cdk`.
- **AWS Credentials:** Usa OIDC (`aws-actions/configure-aws-credentials@v4`) con rol IAM.
- **Pre-deploy health check:** Validación robusta del estado de CloudFormation y DynamoDB antes de desplegar.
- **Lambda Runtime (infra):** El stack CDK ya usa `Runtime.NODEJS_22_X` y bundling target `node22`. Perfecto.
- **Dependencias en pnpm-lock.yaml:** Los paquetes del lockfile declaran soporte para `^22.13.0`, por lo que son compatibles con Node 22.

---

## 2. Problemas encontrados

### 🔴 CRÍTICO — Bloquea la migración a Node 22

Estos problemas **deben corregirse** para que el CI/CD funcione con Node 22:

#### 2.1 `ci.yml` — `node-version: "24"` en ambos jobs

| Ubicación | Línea | Valor actual | Valor esperado |
|-----------|-------|--------------|----------------|
| `lint-and-test` job | 23 | `"24"` | `"22"` |
| `deploy` job | 77 | `"24"` | `"22"` |

**Impacto:** Los jobs instalarán Node.js 24 en el runner, anulando el propósito de la migración. Cualquier código que use APIs exclusivas de Node 22 (o que no funcione en Node 24 por la ruptura de compatibilidad con `--experimental-require-module` eliminado) podría fallar o dar falsos positivos.

#### 2.2 `ci.yml` — `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`

| Ubicación | Línea | Valor actual |
|-----------|-------|--------------|
| `env` global | 10 | `true` |

**Impacto:** Esta variable de entorno fuerza a las GitHub Actions (checkout, setup-node, cache, etc.) a ejecutarse en Node.js 24 en lugar del runtime por defecto de GitHub Actions. Con Node 22 como target, esta variable **ya no es necesaria** y podría causar comportamientos inesperados en las actions. Debe eliminarse o establecerse a `false`.

#### 2.3 `package.json` — `engines.node: ">=24.0.0"`

| Ubicación | Línea | Valor actual | Valor esperado |
|-----------|-------|--------------|----------------|
| `engines.node` | 35 | `">=24.0.0"` | `">=22.0.0"` |

**Impacto:** Si se usa `pnpm install --frozen-lockfile` (como hace el CI), pnpm verificará el campo `engines` y **fallará** si la versión de Node no cumple `>=24.0.0`. Esto rompería el paso `Install dependencies` al cambiar a Node 22.

---

### 🟡 MEDIO — No bloquea, pero debe corregirse

#### 2.4 `init.js` — Mensaje de versión recomendada desactualizado

| Ubicación | Línea | Contenido actual |
|-----------|-------|------------------|
| `init.js` | 42 | `Se recomienda Node.js 24+. Versión actual: ${nodeVersion}` |

Además, la lógica de la línea 39 (`if (majorVersion >= 20)`) dará `success` con Node 22 (porque 22 >= 20), pero nunca llegará a mostrar el warning correcto recomendando Node 22. Esto es confuso.

---

### 🔵 INFORMATIVO — Referencias stale en documentación

Estos archivos contienen referencias a Node 24 que conviene actualizar para evitar confusión, pero no afectan al funcionamiento del CI/CD:

| Archivo | Línea(s) | Contenido |
|---------|----------|-----------|
| `README.md` | 13, 236 | `Runtime: Node.js 24`, `Node.js 24+` |
| `docs/decisions.md` | 34, 490 | `Node.js 24 supports ESM natively`, `isn't stable in Node.js 24` |
| `docs/conventions.md` | 4 | `Runtime: Node.js 24` |
| `.opencode/agents/implementer.md` | 45 | `Node.js 24` |

---

## 3. Dependencias — Verificación de compatibilidad con Node 22

Se revisó el `pnpm-lock.yaml` para verificar los `engines` declarados por cada dependencia directa:

| Dependencia | Versión | Engines declarados | Compatible con Node 22 |
|-------------|---------|--------------------|------------------------|
| `@aws-sdk/client-dynamodb` | ^3.1057.0 | `^20.19.0 \|\| ^22.13.0 \|\| >=24` | ✅ Sí |
| `@aws-sdk/lib-dynamodb` | ^3.1057.0 | `^20.19.0 \|\| ^22.13.0 \|\| >=24` | ✅ Sí |
| `@vendia/serverless-express` | ^4.12.6 | (no declara engines restrictivos) | ✅ Sí |
| `dotenv` | ^17.4.2 | `>=20` | ✅ Sí |
| `express` | ^5.2.1 | `>=18` | ✅ Sí |
| `pino` | ^10.3.1 | `>=20` | ✅ Sí |
| `aws-cdk-lib` | ^2.257.0 | (no declara engines restrictivos) | ✅ Sí |
| `constructs` | ^10.6.0 | (no declara engines restrictivos) | ✅ Sí |

**Conclusión:** Todas las dependencias de producción y desarrollo son compatibles con Node.js 22. No hay paquetes que requieran exclusivamente Node 24.

---

## 4. Infraestructura CDK — Verificación

El stack CDK en `infra/lib/ig-api-stack.js` ya está correctamente configurado para Node 22:

- **Lambda Runtime:** `Runtime.NODEJS_22_X` ✅
- **Bundling target:** `"node22"` ✅
- **Arquitectura:** `ARM_64` (Graviton) ✅

No se requieren cambios en la infraestructura.

---

## 5. Recomendaciones

### Acciones inmediatas (orden de prioridad)

1. **Cambiar `node-version` en `ci.yml`:**
   - Línea 23: `"24"` → `"22"`
   - Línea 77: `"24"` → `"22"`

2. **Eliminar `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`:**
   - Línea 10: Eliminar o comentar esta variable de entorno.

3. **Actualizar `engines` en `package.json`:**
   - Línea 35: `">=24.0.0"` → `">=22.0.0"`

4. **Actualizar `init.js`:**
   - Línea 42: `Node.js 24+` → `Node.js 22+`
   - Opcional: Ajustar la lógica de la línea 39 para advertir si `majorVersion < 22` en lugar de `< 20`.

### Mejoras opcionales

- **Documentación:** Actualizar `README.md`, `docs/decisions.md`, `docs/conventions.md` y `.opencode/agents/implementer.md` para reflejar Node.js 22 como runtime.
- **Matrix testing:** Considerar añadir un `matrix` en el job `lint-and-test` con `node-version: [22, 24]` para verificar compatibilidad en ambas versiones durante la transición.

### Nota sobre `audit` (línea 49)

El paso `pnpm audit --audit-level=critical` usa `pnpm audit`. Tener en cuenta que este comando puede fallar si hay vulnerabilidades críticas en las dependencias. Si se desea que el pipeline no se bloquee por un audit, se podría considerar `|| true` o moverlo a una step separada con `continue-on-error: true`.

---

## 6. Resumen

| Aspecto | Estado |
|---------|--------|
| CI/CD pipeline (estructura general) | ✅ Correcto |
| Node version en CI | 🔴 **24** (debe ser 22) |
| `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` | 🔴 **Debe eliminarse** |
| `package.json` engines | 🔴 **>=24** (debe ser >=22) |
| Dependencias (compatibilidad Node 22) | ✅ Todas compatibles |
| CDK Lambda Runtime | ✅ `NODEJS_22_X` |
| CDK Bundling target | ✅ `node22` |
| pnpm caching | ✅ Correcto |
| AWS OIDC auth | ✅ Correcto |
| Pre-deploy health check | ✅ Correcto |

**Conclusión:** El CI/CD **NO está listo para Node.js 22** — hay 3 problemas críticos que deben corregirse antes de que la migración sea efectiva. La infraestructura CDK ya está correcta. Las dependencias son compatibles.
