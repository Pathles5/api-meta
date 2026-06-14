# Historial de Sesiones

## 2026-06-13: Migración de OpenCode a Hermes Agent + FEAT-022

### Tareas completadas

#### 1. Validación inicial del proyecto
- Corregido BOM en feature_list.json
- Corregidas inconsistencias: Node.js 24 → 22 en README.md e init.js
- Tests: 95 pasando, 0 fallos

#### 2. Política de infraestructura (CDK)
- Actualizados 8 archivos para prohibir comandos CDK desde local
- Archivos modificados: AGENTS.md, OPENCODE.md, HERMES.md, CHECKPOINTS.md, docs/verification.md, docs/dynamo-data-model.md, README.md
- Todos los comandos cdk (synth, deploy, destroy, diff, bootstrap) ahora están como "deny" en permisos
- Despliegue exclusivamente via GitHub Actions CI/CD (push a branches pre/int/pro)

#### 3. Migración de subagentes OpenCode → Hermes Agent
**Problema detectado:** El proyecto tenía configuración de OpenCode CLI (`.opencode/agents/*.md`) que no funciona en Hermes Agent.

**Archivos de agentes migrados (6 roles):**
- `.opencode/agents/leader.md` → skill `role-leader`
- `.opencode/agents/explorer.md` → skill `role-explorer`
- `.opencode/agents/implementer.md` → skill `role-implementer`
- `.opencode/agents/reviewer.md` → skill `role-reviewer`
- `.opencode/agents/devops.md` → skill `role-devops`
- `.opencode/agents/documentation.md` → skill `role-documentation`

**Cambios realizados:**
1. Creados 6 skills en `~/AppData/Local/hermes/skills/roles/`
2. Cada skill contiene: protocolo, reglas, formato de respuesta, toolsets Hermes equivalentes
3. Actualizado AGENTS.md con sección "Ejecución de Roles en Hermes Agent"
4. Actualizado CHECKPOINTS.md para verificar existencia de skills
5. Actualizado init.js para no buscar `.opencode/opencode.jsonc`
6. Eliminado directorio `.opencode/` completamente (configuración + node_modules)

**Mapeo de permissions OpenCode → Hermes toolsets:**

| Rol | OpenCode permissions | Hermes toolsets |
|-----|---------------------|-----------------|
| Leader | edit (feature_list, progress), bash (ask) | terminal, file |
| Explorer | edit (deny), bash (allow), write (allow) | terminal, file, web |
| Implementer | edit (allow), bash (allow), write (allow) | terminal, file, coding |
| Reviewer | edit (allow), bash (lint/test), write (allow) | terminal, file |
| DevOps | edit (allow), bash (allow), write (allow) | terminal, file |
| Documentation | edit (allow), bash (deny), write (allow) | file |

**Cómo usar los roles en Hermes:**
```javascript
// Cargar skill del rol
skill_view(name='role-explorer')

// Delegar tarea con el rol
delegate_task({
  goal: "Investiga X. Escribe hallazgos en progress/research_X.md",
  context: "Carga el skill role-explorer para seguir el protocolo.",
  toolsets: ["terminal", "file", "web"]
})
```

#### 4. FEAT-022: Define DynamoDB Data Model (iniciado)
- Creado docs/dynamo-data-model.md con esquema completo
- Actualizado infra/lib/ig-api-stack.js: añadido Sort Key (timestamp) + 3 GSIs
- Actualizado src/repositories/postRepository.js: ScanCommand → QueryCommand
- Actualizados tests para reflejar cambios en repositorio
- Tests: 95 pasando

### Estado del proyecto
- Phase 0-8: Completadas
- Phase 9: En progreso (FEAT-022 iniciado)
- Tests: 95 pasando
- Validación: ✅ exitosa
- Skills de roles: 6 creados en perfil `ig-api` (role-leader, role-explorer, role-implementer, role-reviewer, role-devops, role-documentation)
- Directorio .opencode/: Eliminado
- Perfil Hermes: `ig-api` creado con skills aisladas del perfil global

### Próximas tareas
1. Completar FEAT-022: Tests de migración + ADR en docs/decisions.md
2. FEAT-019: META Token Management from AWS Systems Manager
3. FEAT-020: Evaluate META Token Strategy

---

## 2026-06-07: Phase 8 Completion - Production Readiness

### Tareas completadas

#### FEAT-012: CloudWatch Monitoring con SNS
- Creado SNS Topic ig-api-pre-alarm-topic con suscripción email
- Configuradas 6 alarmas: Lambda errors/throttles/duration, API Gateway 5xx/latency, DynamoDB throttles
- Todas las alarmas conectadas a SNS para notificaciones
- Email: antonio.lopez.sarmiento@gmail.com
- Costo: $0.10/mes (1 alarma fuera del Free Tier)
- Resumen: progress/feat_012_sns_implementation.md

#### FEAT-013: API Documentation (OpenAPI fixes)
- Corregido schema POST /posts/verify (estructura {summary, results})
- Corregido schema Error (eliminado statusCode, añadido stack)
- Añadidos campos faltantes: 	humbnailUrl, createdAt en Post schema
- Añadido 	imestamp en GET /health response
- Añadido WebhookPayload schema
- Añadidas respuestas 429, 502, 500 en endpoints correspondientes
- Añadidos tags, examples, license info, server variables completadas
- Resumen: progress/feat_013_openapi_fixes.md

#### FEAT-014: Cost Review & Optimization
- Configurado CloudWatch Logs retention (30 días) para evitar acumulación infinita
- Reducido Lambda timeout de 30s a 15s (optimización conservadora)
- Actualizada documentación de costos
- Resumen: progress/feat_014_cost_optimization.md

### Mejoras de seguridad

#### IAM Policy Restringida
- Reemplazado rol AdministratorAccess por política IAM específica
- Permisos limitados a recursos del proyecto (prefijo ig-api-*)
- Permisos para CDK Bootstrap (CloudFormation, S3, IAM roles)
- Permisos para despliegue (Lambda, API Gateway, DynamoDB, CloudWatch, SNS)
- Limitado a región eu-west-1
- **Nota**: Política no documentada en el repo por seguridad

#### AWS Budgets
- Configurado manualmente en AWS Console
- Alerta cuando el costo global de la cuenta supere 3€
- Notificación via SNS Topic existente
- Documentado en docs/architecture.md

### Organización del proyecto

#### Backlog creado
- Nueva sección acklog en eature_list.json
- Tareas diferidas:
  - FEAT-015: Load & Stress Testing (hasta que la app esté cerca de release)
  - FEAT-017: Image Storage Strategy (pendiente de decisión)
- 
ext_actions actualizado con tareas de Phase 9

### Estado final de Phase 8
- ✅ FEAT-011: Webhook Processing
- ✅ FEAT-0111: aws-lambda-nodejs evaluation
- ✅ FEAT-012: CloudWatch Monitoring
- ✅ FEAT-013: API Documentation
- ✅ FEAT-014: Cost Review & Optimization
- ✅ FEAT-016: Test Coverage Configuration
- ⏸️ FEAT-015: Load & Stress Testing (backlog)
- ⏸️ FEAT-017: Image Storage Strategy (backlog)

### Próximas tareas (Phase 9)
1. FEAT-022: Define DynamoDB Data Model
2. FEAT-019: META Token Management from AWS Systems Manager
3. FEAT-020: Evaluate META Token Strategy
4. FEAT-023: API Endpoint - Get Post by ID
5. FEAT-024: API Endpoint - Get N Posts
6. FEAT-025: Grok AI Integration
7. FEAT-026: Extract Price from Posts with Grok
8. FEAT-028: Evaluate Webhook Flow Change
9. FEAT-021: Automatic META Token Rotation
10. FEAT-027: Implement S3 Multimedia Storage

---

## 2026-06-07: FEAT-016 — Test Coverage Configuration
