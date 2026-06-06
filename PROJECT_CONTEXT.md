# PROJECT_CONTEXT.md

## 📌 Identidad del Proyecto
- **Nombre**: Instagram REST API (IG-API)
- **Propósito**: Integración con la API de Meta para recuperar publicaciones de Instagram y datos relacionados, y recibir eventos (webhooks) de nuevas publicaciones.
- **Objetivo Primario**: Aprender cómo operan los agentes de desarrollo de software en un proyecto del mundo real, priorizando cambios pequeños e iterativos.

## 🎯 Estado Actual y Hoja de Ruta
- **Completado**: Todas las fases (0-8), incluyendo webhooks y production readiness
- **Estado actual**: Desplegado en AWS (entorno `pre`), stack `ig-api-pre`
- **Próximo**: Configurar webhooks en Meta for Developers, probar en producción
- **Entornos**: `dev` (local), `pre` (AWS), `int` (AWS), `pro` (AWS)

## ⚠️ Restricciones No Negociables
1. **Alcance**: Mantener el proyecto pequeño. Claridad sobre complejidad.
2. **Costos**: Prioridad absoluta al **Costo Cero** (AWS Free Tier). Cualquier recurso con costo potencial debe ser advertido y aprobado previamente.
3. **Iteración**: El agente debe analizar antes de actuar, explicar decisiones importantes y mantener la consistencia arquitectónica.