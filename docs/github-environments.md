# GitHub Environments para Secrets

## ¿Qué son los GitHub Environments?

Los GitHub Environments son una funcionalidad de GitHub Actions que permite organizar los secrets (credenciales, tokens, etc.) por entorno de despliegue. En lugar de tener todos los secrets en un solo lugar, puedes tener secrets separados para `pre`, `int` y `pro`.

**Ventajas:**
- **Aislamiento**: Cada entorno tiene sus propios secrets
- **Seguridad**: Puedes restringir qué secrets están disponibles en cada branch
- **Protection Rules**: Puedes requerir aprobación manual antes de deployar a producción
- **Historial**: GitHub registra qué secrets se usaron en cada deploy

## Configuración

### 1. Crear un Environment

1. Ve a tu repositorio en GitHub
2. **Settings** → **Environments** → **New environment**
3. Escribe el nombre (ej: `pre`, `int`, `pro`)
4. Haz clic en **Configure environment**

### 2. Añadir Secrets al Environment

Una vez creado el environment:

1. En la página del environment, busca la sección **Environment secrets**
2. Haz clic en **Add secret**
3. Introduce el nombre y valor del secret
4. Repite para cada secret necesario

### 3. Secrets por Entorno

#### Entorno `pre` (Preproducción)

| Secret | Descripción |
|--------|-------------|
| `META_ACCESS_TOKEN` | Token de acceso a la API de Meta/Facebook |
| `META_IG_USER_ID` | ID de la cuenta de Instagram Business |
| `META_APP_SECRET` | Secret de la aplicación de Meta |
| `META_VERIFY_TOKEN` | Token de verificación de webhooks |
| `AUTH_API_KEY` | API key para autenticación de clientes |

#### Entorno `int` (Integración)

*(Configurar cuando se cree el entorno)*

| Secret | Descripción |
|--------|-------------|
| `META_ACCESS_TOKEN` | Token de acceso a la API de Meta/Facebook |
| `META_IG_USER_ID` | ID de la cuenta de Instagram Business |
| `META_APP_SECRET` | Secret de la aplicación de Meta |
| `META_VERIFY_TOKEN` | Token de verificación de webhooks |
| `AUTH_API_KEY` | API key para autenticación de clientes |

#### Entorno `pro` (Producción)

*(Configurar cuando se cree el entorno)*

| Secret | Descripción |
|--------|-------------|
| `META_ACCESS_TOKEN` | Token de acceso a la API de Meta/Facebook |
| `META_IG_USER_ID` | ID de la cuenta de Instagram Business |
| `META_APP_SECRET` | Secret de la aplicación de Meta |
| `META_VERIFY_TOKEN` | Token de verificación de webhooks |
| `AUTH_API_KEY` | API key para autenticación de clientes |

> **Nota**: En producción, usa tokens con permisos mínimos y considera usar roles de IAM más restrictivos.

## Cómo lee los secrets el CI/CD

El workflow de GitHub Actions (`.github/workflows/ci.yml`) accede a los secrets del environment mediante la directiva `environment`:

```yaml
deploy:
  runs-on: ubuntu-latest
  environment: ${{ github.ref_name }}  # Usa el nombre del branch como environment
  steps:
    - name: CDK Deploy
      env:
        META_ACCESS_TOKEN: ${{ secrets.META_ACCESS_TOKEN }}
        META_IG_USER_ID: ${{ secrets.META_IG_USER_ID }}
        # ... otros secrets
```

**Flujo:**
1. Se hace push al branch `pre`
2. GitHub Actions detecta el environment `pre`
3. Lee los secrets configurados en ese environment
4. Los pasa como variables de entorno al paso de deploy

## Protection Rules (Opcional)

Puedes configurar reglas de protección para entornos críticos:

### Requerir Aprobación para Producción

1. En el environment `pro`, busca **Deployment protection rules**
2. Activa **Required reviewers**
3. Añade los usuarios que deben aprobar los deploys

**Resultado:** Antes de deployar a `pro`, GitHub pedirá aprobación manual.

### Otras Opciones de Protección

- **Wait timer**: Esperar X minutos antes de permitir el deploy
- **Branch restrictions**: Solo permitir deploys desde ciertos branches

## Diferencia con Repository Secrets

| Característica | Repository Secrets | Environment Secrets |
|----------------|-------------------|---------------------|
| Alcance | Todos los workflows | Solo workflows que usen el environment |
| Organización | Sin separación | Por entorno (pre, int, pro) |
| Protection Rules | No disponibles | Disponibles |
| Uso recomendado | Secrets compartidos | Secrets específicos por entorno |

## Solución de Problemas

### Error: "Secret no encontrado"

1. Verifica que el secret existe en el environment correcto
2. Verifica que el workflow usa `environment: <nombre>`
3. Verifica que el nombre del secret coincide exactamente (case-sensitive)

### Error: "Environment not found"

1. Verifica que el environment existe en **Settings → Environments**
2. Verifica que el nombre en el workflow coincide con el nombre del environment

## Referencias

- [GitHub Docs: Environments](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
- [GitHub Docs: Encrypted Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
