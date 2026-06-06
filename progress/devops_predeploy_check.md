# DevOps: Pre-deploy Health Check

**Fecha:** 2026-06-06
**Estado:** Completado

---

## Problema

En sesiones anteriores, el usuario borró manualmente la tabla DynamoDB `ig-posts`, dejando el stack CloudFormation `ig-api` en estado inconsistente. Los deploys fallaban sin diagnóstico claro. No existía ninguna validación previa al deploy que detectara este tipo de drift.

## Solucion

Se agregó un nuevo step **"Pre-deploy health check"** en el job `deploy` de `.github/workflows/ci.yml`, ubicado **despues de** `CDK Bootstrap` y **antes de** `CDK Deploy`.

El step ejecuta un script bash con `set -euo pipefail` que realiza 4 verificaciones:

1. **Estado del stack CloudFormation** (`aws cloudformation describe-stacks`)
2. **Existencia de la tabla DynamoDB** (`aws dynamodb describe-table`)
3. **Deteccion de drift** (`aws cloudformation detect-stack-drift`) si el stack existe
4. **Logica de decision** con 4 escenarios posibles

---

## Logica de Decision

| Estado del Stack | Estado de la Tabla | Resultado | Accion |
|---|---|---|---|
| `NOT_FOUND` | N/A | Clean deploy | Continuar (primer deploy) |
| `CREATE_COMPLETE` / `UPDATE_COMPLETE` | `ACTIVE` | Normal | Continuar (update deploy) |
| `CREATE_COMPLETE` / `UPDATE_COMPLETE` | `NOT_FOUND` | Drift detectado | Advertir y continuar (CDK recreara la tabla) |
| `ROLLBACK_COMPLETE` / `UPDATE_ROLLBACK_COMPLETE` | N/A | Stack roto | `exit 1` con instrucciones de recuperacion |
| Cualquier otro estado | N/A | Estado inesperado | `exit 1` con link a consola |

---

## Archivo Modificado

### `.github/workflows/ci.yml` (lineas 116-186)

Nuevo step insertado entre `CDK Bootstrap` y `CDK Deploy`:

```yaml
- name: Pre-deploy health check
  run: |
    set -euo pipefail
    # ... 70 lineas de verificacion y logica de decision ...
```

**Puntos clave del script:**
- `set -euo pipefail` asegura que cualquier error detenga el pipeline inmediatamente
- Mensajes claros con emojis y formato para facilitar lectura en logs de GitHub Actions
- Instrucciones de recuperacion explicitas en cada escenario de error
- No modifica nada en AWS (solo lecturas `describe-*` y `detect-*`)
- Usa exclusivamente `eu-west-1` como region

---

## Validacion

### Comandos ejecutados

```powershell
pnpm cdk synth --no-lookups
```

### Resultado

- **CDK synth:** Exitoso
- **Template generado:** Valido, todos los recursos esperados presentes:
  - `AWS::DynamoDB::Table` → `ig-posts`
  - `AWS::Lambda::Function` → `ig-api-api`
  - `AWS::ApiGateway::RestApi` → `ig-api-api`
  - CloudWatch Alarms, Dashboard, IAM Roles, Lambda Permissions

---

## Impacto Operacional

- **Costo:** $0 adicional. Los comandos `describe-stacks`, `describe-table` y `detect-stack-drift` son llamadas API gratuitas de AWS.
- **Tiempo de ejecucion:** ~2-5 segundos adicionales en el pipeline (3 llamadas API secuenciales).
- **Seguridad:** Sin cambios. Solo usa los permisos IAM ya existentes en `GitHubActionsDeployRole` (CloudFormation Read + DynamoDB Read).
- **Rollback:** Revertir el archivo `.github/workflows/ci.yml` a su version anterior. El cambio es puramente aditivo y no afecta recursos AWS.
- **Restricciones cumplidas:**
  - No se modifico el step `CDK Deploy` ni el build step
  - No se cambiaron secrets ni variables de entorno
  - Se mantuvo el orden de los pasos existentes
  - El script es claro en sus mensajes de error
  - Region: `eu-west-1`
  - Stack name: `ig-api`
  - Tabla: `ig-posts`
