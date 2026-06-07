# Documentación README.md - Variables de Entorno

## Fecha: 2026-06-07

## Resumen de Cambios

### 1. Sección "Variables de Entorno" (actualizada)
- **Tabla completa de 16 variables** con clasificación por categoría (META, AUTH, APP, AWS, DYNAMODB, POST)
- **Indicador de obligatoria/opcional** para cada variable (✅ **Sí** / ❌ No)
- **Ejemplo de archivo .env** completo para desarrollo local con emojis por categoría
- **Explicación detallada** de cada categoría con descripciones completas
- **Tabla de resumen** con: Variable, Categoría, Obligatoria, Descripción, Valor por defecto, Ejemplo

### 2. Sección "Configuración de GitHub Secrets" (nueva)
- **Instrucciones paso a paso** para crear GitHub Environment "pre"
- **Lista de 5 secrets necesarios**: META_ACCESS_TOKEN, META_IG_USER_ID, META_APP_SECRET, META_VERIFY_TOKEN, AUTH_API_KEY
- **Tabla de secrets** con descripción y ejemplos
- **Explicación detallada** de cómo CI/CD lee automáticamente los secrets
- **Proceso de creación** para environments "pre", "int" y "pro"
- **Seguridad de secretos**: buenas prácticas y recomendaciones

### 3. Sección "Entornos" (actualizada)
- **Tabla completa** de 4 entornos: dev, pre, int, pro
- **Recursos por entorno**: Lambda, API Gateway, DynamoDB, CloudWatch Dashboard
- **Explicación de IG_ENV** y cómo se obtiene del nombre de la branch
- **Diferencias entre entornos**: tabla comparativa de características
- **Flujo de despliegue** detallado con diagrama ASCII

### 4. Sección "Despliegue" (actualizada)
- **Flujo completo**: push a branch → CI/CD → deploy a AWS
- **Explicación de que dev** es solo local (no despliega a AWS)
- **Proceso automático** para pre/int/pro
- **Approval manual** para producción
- **Pipeline de GitHub Actions** con código YAML de ejemplo
- **Variables de entorno en despliegue**: tabla con fuente y uso

## Archivos Modificados

| Archivo | Acción | Líneas añadidas |
|---------|--------|-----------------|
| `README.md` | Actualizado | ~230 líneas nuevas |
| `progress/docs_readme_env_vars.md` | Creado | 122 líneas |

## Variables de Entorno Identificadas (16 total)

### Obligatorias (4):
1. `META_ACCESS_TOKEN` - Token de acceso Meta/Facebook
2. `META_IG_USER_ID` - ID de cuenta de Instagram Business
3. `AUTH_API_KEY` - API key para autenticación de clientes
4. `META_APP_SECRET` - Secret de la app Meta (para HMAC webhooks)

### Opcionales (12):
5. `META_VERIFY_TOKEN` - Token de verificación de webhooks
6. `APP_PORT` - Puerto del servidor (default: 3000)
7. `NODE_ENV` - Entorno de ejecución (default: development)
8. `APP_RATE_LIMIT_WINDOW_MS` - Ventana de rate limit en ms (default: 60000)
9. `APP_RATE_LIMIT_MAX` - Máximo de requests por ventana (default: 100)
10. `APP_LOG_LEVEL` - Nivel de log (default: info)
11. `AWS_REGION` - Región AWS (default: eu-west-1)
12. `DYNAMODB_ENDPOINT` - Endpoint DynamoDB (local: http://localhost:8000)
13. `DYNAMODB_TABLE_NAME` - Nombre de tabla DynamoDB (default: ig-posts)
14. `DYNAMODB_POST_TTL_DAYS` - TTL de posts en días (default: 90)
15. `POST_VERIFICATION_HOURS` - Horas antes de re-verificación (default: 24)
16. `IG_ENV` - Entorno de despliegue (dev/pre/int/pro)

## Categorías de Variables

### META (4 variables)
- `META_ACCESS_TOKEN` - Obligatoria
- `META_IG_USER_ID` - Obligatoria
- `META_APP_SECRET` - Obligatoria
- `META_VERIFY_TOKEN` - Opcional

### AUTH (1 variable)
- `AUTH_API_KEY` - Obligatoria

### APP (5 variables)
- `APP_PORT` - Opcional
- `NODE_ENV` - Opcional
- `APP_RATE_LIMIT_WINDOW_MS` - Opcional
- `APP_RATE_LIMIT_MAX` - Opcional
- `APP_LOG_LEVEL` - Opcional

### AWS (1 variable)
- `AWS_REGION` - Opcional

### DYNAMODB (3 variables)
- `DYNAMODB_ENDPOINT` - Opcional
- `DYNAMODB_TABLE_NAME` - Opcional
- `DYNAMODB_POST_TTL_DAYS` - Opcional

### POST (1 variable)
- `POST_VERIFICATION_HOURS` - Opcional

### ENTORNO (1 variable)
- `IG_ENV` - Opcional

## GitHub Environment Setup

### Environment "pre" (Preproducción)
**Secrets necesarios:**
1. `META_ACCESS_TOKEN` - Token de acceso Meta
2. `META_IG_USER_ID` - ID de Instagram Business
3. `META_APP_SECRET` - Secret de app Meta
4. `META_VERIFY_TOKEN` - Token de verificación webhooks
5. `AUTH_API_KEY` - API key para autenticación

**Proceso:**
1. Ir a Settings → Environments → New environment
2. Nombrar "pre"
3. Añadir cada secret con su valor
4. El CI/CD lee automáticamente estos secrets al desplegar

### Environment "pro" (Producción)
**Configuración adicional:**
1. Activar "Required reviewers"
2. Añadir reviewers para approval manual
3. Secrets mismos que "pre" (pueden tener valores diferentes)

## Flujo de Despliegue

```
desarrollo local (dev) → push a branch dev
                         ↓
                    CI/CD se activa
                         ↓
                 lint → test → deploy
                         ↓
              (si branch es pre/int/pro)
                         ↓
               deploy a AWS automáticamente
                         ↓
              (si branch es pro)
                         ↓
            approval manual requerido
```

## Impacto
- **Documentación**: README.md actualizado con información completa y clara
- **Experiencia de usuario**: Fácil configuración de entornos y variables
- **Seguridad**: Secretos manejados correctamente via GitHub Environments
- **Mantenibilidad**: Información centralizada y organizada
- **Consistencia**: Alineado con AGENTS.md y PROJECT_CONTEXT.md