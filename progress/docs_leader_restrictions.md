# Resumen: Refuerzo de Restricciones del Leader Agent

**Fecha**: 2026-06-07
**Agentes involucrados**: Documentation Agent (ejecución directa)

## Cambios Realizados

### 1. AGENTS.md - Sección Leader Agent

**Archivo**: `AGENTS.md` (líneas 44-67)

**Cambios**:
- Se añadieron dos nuevas reglas de restricción:
  - **REGLA PLATINO**: NUNCA lee, busca ni revisa archivos de código fuente. Para eso delega al Explorer, Implementer, Reviewer o DevOps.
  - **REGLA DIAMANTE**: NUNCA actualiza documentación de agentes ni harness (AGENTS.md, OPENCODE.md, .opencode/). Para eso delega al Documentation Agent.
- Se actualizaron los pasos del Protocolo de Delegación para ser más específicos (ej: "investigación y análisis de código").
- Se amplió la lista de "Qué NO hace el Leader" con 3 nuevas restricciones:
  - ❌ Leer o buscar en archivos de código fuente
  - ❌ Revisar código o hacer comprobaciones técnicas
  - ❌ Actualizar documentación de agentes ni harness

### 2. OPENCODE.md - Sección "Planificar (Leader Agent)"

**Archivo**: `OPENCODE.md` (líneas 74-82)

**Cambios**:
- Se añadieron dos nuevas restricciones explícitas:
  - **NUNCA lee ni busca en archivos de código fuente. Para eso delega al Explorer.**
  - **NUNCA actualiza documentación de agentes ni harness. Para eso delega al Documentation.**

## Justificación

Estos cambios refuerzan la separación de responsabilidades del enjambre de agentes, asegurando que el Leader Agent:

1. **No contaminen el flujo de trabajo** leyendo o modificando código directamente.
2. **No cree dependencias circulares** actualizando su propia documentación.
3. **Mantenga su rol de orquestador puro**, delegando siempre a los agentes especializados.

## Impacto

- **Seguridad**: Menor riesgo de que el Leader ejecute acciones no autorizadas.
- **Claridad**: Cada agente tiene un rol claramente definido sin solapamientos.
- **Mantenimiento**: La documentación del harness solo puede ser modificada por el Documentation Agent, evitando inconsistencias.

## Archivos Modificados

- `AGENTS.md` (líneas 44-67)
- `OPENCODE.md` (líneas 74-82)

## Próximos Pasos

Ninguno. Los cambios están completos y alineados con la arquitectura del enjambre.