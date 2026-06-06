# Documentación: Estrategia de Entornos

## Fecha: 2026-06-06

## Cambios Realizados

### 1. AGENTS.md
- ✅ Agregada sección "Estrategia de Entornos" con tabla de 4 entornos (dev, pre, int, pro)
- ✅ Agregadas reglas específicas por agente (DevOps, Implementer, Reviewer, Explorer)
- ✅ Agregado flujo de despliegue por branches
- ✅ Actualizado Leader Agent con "REGLA DE ORO" explícita
- ✅ Agregado protocolo de delegación numerado
- ✅ Agregada lista de "Qué NO hace el Leader"

### 2. OPENCODE.md
- ✅ Agregada sección "Estrategia de Entornos" después de "Regla de Oro de Costos"
- ✅ Agregada variable de entorno `IG_ENV`
- ✅ Actualizada sección "Planificar (Leader Agent)" con:
  - "ESPERA aprobación explícita"
  - "NUNCA implementa directamente"

### 3. docs/decisions.md
- ✅ Agregado ADR: "Estrategia de Entornos - Stacks CDK Independientes por Entorno"
- ✅ Incluye: Context, Decision, Rationale, Alternatives considered, Implementation, Consequences

### 4. docs/roadmap.md
- ✅ Fase 7 actualizada a "✅ Completado (Junio 2026)"
- ✅ Fase 8 actualizada a "✅ Completado (Junio 2026)"

### 5. PROJECT_CONTEXT.md
- ✅ Actualizado estado a "Todas las fases (0-8), incluyendo webhooks y production readiness"
- ✅ Agregado estado actual: desplegado en AWS (entorno `pre`)
- ✅ Agregado sección de entornos

### 6. README.md
- ✅ Agregada sección "🌍 Entornos" después de "Deployment"
- ✅ Incluye tabla de entornos, comandos de deploy, flujo de trabajo con branches

### 7. .env.example
- ✅ Agregada variable `IG_ENV=pre` al final

## Verificación

- ✅ Todos los archivos mencionan los 4 entornos (dev, pre, int, pro)
- ✅ AGENTS.md y OPENCODE.md tienen la regla de oro del Leader
- ✅ docs/decisions.md tiene la decisión de entornos
- ✅ docs/roadmap.md muestra Fases 7 y 8 como completadas
- ✅ No se modificaron archivos de código fuente, tests, infraestructura ni CI/CD

## Archivos Modificados

1. `AGENTS.md`
2. `OPENCODE.md`
3. `docs/decisions.md`
4. `docs/roadmap.md`
5. `PROJECT_CONTEXT.md`
6. `README.md`
7. `.env.example`
8. `progress/docs_environment_strategy.md` (este archivo)