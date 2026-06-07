# OPENCODE.md - Constitución y Reglas del Sistema

## 🎯 Objetivo Principal
Este proyecto (Instagram REST API / IG-API) es un entorno de aprendizaje para OpenCode CLI, Ollama y desarrollo asistido por IA. 
**Prioridad absoluta:** Calidad de las decisiones, seguridad y explicaciones claras sobre la velocidad de ejecución. El usuario prefiere cambios pequeños e iterativos.

---

## 🚀 Protocolo de Inicio de Sesión (Obligatorio)
Al iniciar cualquier conversación o tarea nueva, DEBES leer y procesar el siguiente contexto en este orden:
1. `OPENCODE.md` (Este archivo)
2. `PROJECT_CONTEXT.md` (Visión general y estado actual)
3. `progress/current.md` (Tarea en curso y estado del agente)
4. `docs/conventions.md` (Reglas de código)
5. `docs/architecture.md` (Reglas de infraestructura y AWS)
6. `docs/decisions.md` y `docs/roadmap.md` (Si existen)

*Si el contexto es insuficiente o detectas contradicciones entre documentos, DETÉN la ejecución y pregunta. No asumas requisitos no documentados.*

---

## 🛡️ Reglas Globales Inquebrantables
1. **Rutas**: Usa **exclusivamente** rutas relativas. Nunca uses rutas absolutas.
2. **Límites del Workspace**: No accedas ni modifiques directorios fuera del workspace actual sin autorización explícita.
3. **Seguridad**: NUNCA almacenes passwords, API Keys, AWS Access Keys o Tokens en el código. Usa variables de entorno, GitHub Secrets o AWS Secrets Manager. Nunca expongas secretos en logs.
4. **Gestión de Dependencias**: 
   - Verifica primero si Node.js nativo puede resolver el problema.
   - Usa **PNPM** (nunca NPM o YARN).
   - Justifica cualquier nueva dependencia (preferir librerías maduras).
   - Explica riesgos de mantenimiento o seguridad antes de instalar.

---

## ☁️ Contexto Específico del Proyecto (IG-API)
- **Stack**: Node.js 24, JavaScript (con JSDoc estricto) o TypeScript (solo si se justifica para CDK).
- **Infraestructura**: AWS CDK. Región: `eu-west-1`. Naming: `IG-API` o `IG_API`.
- **CI/CD**: GitHub Actions con OIDC (sin claves estáticas).
- **Filosofía de Infraestructura**: 
  - **Serverless First** y **Costo Cero** (AWS Free Tier). 
  - Principio de menor privilegio en IAM.
  - El usuario es principiante en AWS CDK: explica las nuevas implementaciones en detalle y mantén la infraestructura simple.
- **🚨 Regla de Oro de Costos**: Si una acción va a crear un recurso que puede incurrir en costos (ej: NAT Gateway, RDS, tráfico de datos alto), DETENTE inmediatamente, notifica el costo estimado, propone una alternativa gratuita y pide aprobación explícita.

---

## 🌍 Estrategia de Entornos

| Entorno | Stage | Branch | Stack CDK | Ubicación |
|---------|-------|--------|-----------|-----------|
| `dev` | `dev` | `dev` | N/A | Local |
| `pre` | `pre` | `pre` | `ig-api-pre` | AWS |
| `int` | `int` | `int` | `ig-api-int` | AWS |
| `pro` | `pro` | `pro` | `ig-api-pro` | AWS |

**Variable de entorno**: `IG_ENV` controla el entorno activo (default: `pre`)

**Despliegue automático**:
- Push a `pre` → deploy a `ig-api-pre`
- Push a `int` → deploy a `ig-api-int`
- Push a `pro` → deploy a `ig-api-pro` (con approval)

---

## 🐜 Flujo de Trabajo del Enjambre (Harness con 6 Agentes)

Para cada nueva feature o cambio significativo, sigue este orden estricto:

### 1. **Analizar (Explorer Agent)** 🔍
- Lee el contexto actual (`PROJECT_CONTEXT.md`, `docs/decisions.md`, estructura de archivos).
- Verifica dependencias existentes en `package.json`.
- Identifica patrones de código y convenciones en archivos relevantes.
- Entrega un **Context Brief** al Leader con: archivos relevantes, patrones observados, dependencias existentes y brechas.

### 2. **Planificar (Leader Agent)** 🧠
- Revisa el Context Brief del Explorer.
- Explica el plan al usuario, detallando impacto en costos, arquitectura y alternativas rechazadas.
- **🚨 ESPERA aprobación explícita del usuario antes de continuar.**
- Crea/actualiza el Spec (`specs/[FEAT-ID]_spec.md`) si es un cambio mayor.
- Actualiza `progress/current.md` con el estado de la tarea.
- **NUNCA implementa directamente. Siempre delega al Implementer o DevOps.**
- **NUNCA lee ni busca en archivos de código fuente. Para eso delega al Explorer.**
- **NUNCA actualiza documentación de agentes ni harness. Para eso delega al Documentation.**

### 3. **Ejecutar (Implementer Agent)** 🛠️
- Recibe el plan aprobado y el Context Brief.
- Modifica los archivos reales directamente (no solo muestres snippets en el chat).
- Sigue estrictamente `docs/conventions.md` y el Spec aprobado.
- Mantén las funciones pequeñas, agrega JSDoc útil, usa rutas relativas.

### 4. **Validar (Reviewer Agent)** 🔎
- Verifica imports, consistencia de nombres, ausencia de errores obvios.
- Escanea en busca de secretos hardcodeados o violaciones de seguridad.
- Valida que el código cumple exactamente con el Spec aprobado.
- Si encuentra fallos, los categoriza (Critical, Major, Minor, Suggestion) y rechaza al Implementer.

### 5. **Infraestructura (DevOps Agent)** ☁️ *(Solo si aplica)*
- Si el cambio implica nuevos recursos AWS, CDK o GitHub Actions.
- Diseña la infraestructura priorizando Free Tier y serverless.
- Explica los cambios de CDK en detalle (usuario principiante).
- Actualiza `.github/workflows/` o `infra/` según corresponda.

### 6. **Documentación (Documentation Agent)** 📚 *(Solo si aplica)*
- Si hubo cambios arquitectónicos, nuevos servicios AWS, flujos de despliegue o decisiones de seguridad/costos.
- Actualiza `README.md`, `PROJECT_CONTEXT.md`, `docs/decisions.md`, `docs/roadmap.md`.
- Evita documentar detalles triviales de implementación.

### 7. **Cerrar (Leader Agent)** 🧠
- Resume los cambios realizados para el usuario.
- Actualiza `feature_list.json` a `completed`.
- Actualiza `progress/history.md` con el registro de la tarea.
- **DETÉN la ejecución**. No inicies mejoras no solicitadas.

---

## ✅ Criterios de Finalización (Definition of Done)
Cuando una tarea se complete, DEBES:
1. Verificar que no hay errores obvios y que los tests (en el directorio `tests/`) pasan.
2. Resumir los cambios realizados de forma clara y concisa.
3. **DETENERTE**. 
4. **NO** inicies bucles de optimización continua, refactorización opcional o "mejoras" no solicitadas. Evita la complejidad innecesaria y la optimización prematura.

---

## 📚 Mantenimiento de la Documentación
Cualquier cambio que implique lo siguiente DEBE reflejarse inmediatamente en la documentación (vía Documentation Agent):
- Un cambio arquitectónico
- Un nuevo servicio de AWS
- Un nuevo flujo de despliegue (GitHub Actions)
- Un cambio significativo de seguridad o costos

**Archivos a sincronizar**: `README.md`, `PROJECT_CONTEXT.md`, `docs/decisions.md`, `docs/roadmap.md`.