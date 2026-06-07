# Documentación: Aclaración NODE_ENV vs IG_ENV

**Fecha**: 2026-06-07
**Agente**: Documentation Agent
**Archivo modificado**: `README.md`

## Cambios Realizados

### 1. Nueva sección "Diferencia entre NODE_ENV e IG_ENV"
- Añadida después de la tabla de variables de entorno
- Incluye tabla comparativa con Propósito, Valores y Uso
- Explica por qué NODE_ENV=production en Lambda
- Describe cómo IG_ENV identifica el entorno via branch name
- Incluye analogía con proyectos React

### 2. Actualización de descripciones en tabla de variables
- **NODE_ENV**: Ahora indica explícitamente que en Lambda siempre es "production" y que NO se debe confundir con IG_ENV
- **IG_ENV**: Ahora indica que controla nombres de recursos AWS y que NO se debe confundir con NODE_ENV

### 3. Actualización de descripciones en sección "Categorías de Variables"
- **NODE_ENV**: Descripción actualizada con la aclaración sobre Lambda
- **IG_ENV**: Descripción actualizada con la aclaración sobre recursos AWS

## Propósito
Evitar confusión frecuente entre developers que asumen que NODE_ENV debería cambiar según el entorno de infraestructura (pre/int/pro).

## Verificación
- ✅ Solo se modificó README.md
- ✅ No se modificaron archivos de código fuente
- ✅ No se modificaron workflows CI/CD
- ✅ No se modificaron AGENTS.md ni OPENCODE.md
- ✅ Formato Markdown mantenido correctamente
