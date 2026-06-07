# Research � Seguridad del Token Meta en IG-API

## Archivos relevantes
- `.env`: Contiene el token real (no tracked por git)
- `.env.example`: Template con placeholders (tracked por git)
- `.gitignore`: Excluye `.env` y variantes
- `.github/workflows/ci.yml`: CI/CD pipeline con secrets
- `infra/bin/app.js`: Entry point CDK, lee token de env vars
- `infra/lib/ig-api-stack.js`: CDK stack, pasa token a Lambda
- `src/services/metaApi.js`: Servicio Meta, lee token de process.env
- `src/middleware/authenticate.js`: Autenticaci�n API key

---

## 1. Git History � An�lisis de Exposici�n

### Commits analizados
```
df4e49a fix: update agent configs (deprecated tools ? permission, model format) + session context
d13c13f FIX: Agents
e26f85c INIT Harness
4f66b1c docs: update session context with Lambda packaging plan and deploy status
86ab7aa --require-approval never
fc8d3dd ci: force Node.js 24 for GitHub Actions
cc1e72d fix: install aws-cdk CLI and use pnpm exec cdk
b106cfe docs: update session context with user manual changes
19a1c44 pnpm
252ed98 arn github
a5af688 docs: add OIDC decision and update session context
f49984f ci: switch to OIDC for AWS credentials
7a0905a feat: Instagram REST API - Phases 0-6 complete
```

### Resultados de b�squeda de exposici�n
| Comando | Resultado |
|---------|-----------|
| `git log --all --diff-filter=A -- .env` | ? Sin resultados � `.env` NUNCA fue agregado al repo |
| `git log --all -- .env` | ? Sin resultados � `.env` nunca fue modificado en el repo |
| `git log --all -p -- .env` | ? Sin resultados � No hay contenido de `.env` en el historial |
| `git log --all -p -S "EAAL"` | ? Sin resultados � El prefijo del token no aparece en ning�n commit |
| `git log --all -p -S "EAAB"` | ? Sin resultados |
| `git log --all -p -S "EAAL4y0pTiUMBR"` | ? Sin resultados � El token espec�fico nunca fue commiteado |
| `git ls-files -- .env` | ? Sin resultados � `.env` no est� tracked por git |

### Veredicto Git History
**? SEGURO: El token NUNCA fue expuesto en el historial de git.**

---

## 2. Gitignore � Protecci�n del Archivo `.env`

### Contenido de `.gitignore` (l�neas relevantes)
```gitignore
# Environment
.env
.env.local
.env.*.local
.env.*
!.env.example
```

### An�lisis
- ? `.env` est� excluido expl�citamente
- ? Variantes como `.env.local`, `.env.*.local`, `.env.*` tambi�n excluidas
- ? Solo `.env.example` est� permitido (patr�n `!.env.example`)
- ? `.env.example` contiene solo placeholders, no valores reales

### Veredicto Gitignore
**? CORRECTO: La configuraci�n de `.gitignore` es robusta y sigue mejores pr�cticas.**

---

## 3. CI/CD Secrets � GitHub Actions

### Archivo: `.github/workflows/ci.yml`

#### Configuraci�n de Secrets (l�neas 114-119)
```yaml
- name: CDK Deploy
  env:
    META_ACCESS_TOKEN: ${{ secrets.META_ACCESS_TOKEN }}
    META_IG_USER_ID: ${{ secrets.META_IG_USER_ID }}
    AUTH_API_KEY: ${{ secrets.AUTH_API_KEY }}
    APP_LOG_LEVEL: info
    POST_VERIFICATION_HOURS: "24"
  run: pnpm exec cdk deploy --require-approval never --outputs-file cdk-outputs.json
```

#### An�lisis
- ? `META_ACCESS_TOKEN` se pasa como `${{ secrets.META_ACCESS_TOKEN }}` � NO hardcodeado
- ? `META_IG_USER_ID` se pasa como `${{ secrets.META_IG_USER_ID }}` � NO hardcodeado
- ? `AUTH_API_KEY` se pasa como `${{ secrets.AUTH_API_KEY }}` � NO hardcodeado
- ? Solo valores no sensibles est�n hardcodeados (`APP_LOG_LEVEL`, `POST_VERIFICATION_HOURS`)
- ? Usa OIDC para AWS credentials (l�neas 55-57, 63-67)

### Veredicto CI/CD
**? SEGURO: Los tokens se pasan correctamente como GitHub Secrets. No hay hardcoding.**

---

## 4. CDK Stack � Infraestructura como C�digo

### Archivo: `infra/bin/app.js` (Entry Point)
```javascript
import "dotenv/config";

new IgApiStack(app, stackName, {
  env,
  metaAccessToken: process.env.META_ACCESS_TOKEN,  // ? Lee de env var
  igUserId: process.env.META_IG_USER_ID,            // ? Lee de env var
  authApiKey: process.env.AUTH_API_KEY,              // ? Lee de env var
  // ...
});
```

### Archivo: `infra/lib/ig-api-stack.js` (Lambda Environment)
```javascript
environment: {
  DYNAMODB_TABLE_NAME: tableName,
  META_ACCESS_TOKEN: metaAccessToken,  // ? Pasa el valor recibido
  META_IG_USER_ID: igUserId,           // ? Pasa el valor recibido
  AUTH_API_KEY: authApiKey,            // ? Pasa el valor recibido
  // ...
},
```

### An�lisis
- ? El token se lee de `process.env.META_ACCESS_TOKEN` en el entry point
- ? Se pasa como prop al stack de CDK
- ? Se asigna como environment variable de Lambda
- ? NO hay valores hardcodeados en ning�n punto de la cadena
- ? `dotenv/config` permite usar `.env` localmente para desarrollo

### Veredicto CDK
**? SEGURO: El token fluye correctamente desde env vars ? CDK ? Lambda sin hardcoding.**

---

## 5. Source Code � B�squeda de Tokens Hardcodeados

### Patrones buscados en `src/`
| Patr�n | Resultado |
|--------|-----------|
| `EAAL` | ? No encontrado |
| `EAAB` | ? No encontrado |
| `EAA[A-Z]` | ? No encontrado |
| `EAA[0-9]` | ? No encontrado |
| Cadenas largas (>100 chars) | ? No encontrado |
| `secret`, `password`, `api.key`, `apikey` | Solo referencia leg�tima en `authenticate.js` |

### Archivo: `src/services/metaApi.js`
```javascript
function getAccessToken() {
  const token = process.env.META_ACCESS_TOKEN;  // ? Lee de env var
  if (!token) {
    throw createError(500, "META_ACCESS_TOKEN not configured");  // ? Error claro
  }
  return token;
}
```

### An�lisis
- ? El token se lee exclusivamente de `process.env.META_ACCESS_TOKEN`
- ? Hay validaci�n y error claro si no est� configurado
- ? No hay tokens hardcodeados en ning�n archivo de `src/`
- ?? NOTA: El token se pasa como query parameter en la URL (l�nea 59, 74), no como header. Esto es el comportamiento est�ndar de Meta Graph API, pero el token podr�a aparecer en logs de servidor si se loguean las URLs completas.

### Veredicto Source Code
**? SEGURO: No hay tokens hardcodeados. Se usa correctamente `process.env`.**

---

## 6. Estado Actual del Archivo `.env`

### Contenido actual de `.env` (LOCAL, no tracked)
```
META_ACCESS_TOKEN=EAAL4y0pTiUM...[REDACTED]
META_IG_USER_ID=17841400...[REDACTED]
AUTH_API_KEY=sk-test-...[REDACTED]
```

### An�lisis
- ? El archivo existe localmente pero NO est� tracked por git
- ? El token tiene el prefijo `EAAL` (v�lido para tokens de larga duraci�n de Meta)
- ?? El `AUTH_API_KEY` parece ser un valor de test (`sk-test-abc123def456`)

---

## Veredicto Final

### ?? Estado de Seguridad del Token Meta

| Criterio | Estado | Detalle |
|----------|--------|---------|
| **�El token fue expuesto en el repo?** | ? NO | Nunca fue commiteado al historial de git |
| **�El `.gitignore` protege el token?** | ? S� | `.env` y variantes est�n excluidos |
| **�El CI/CD usa secrets seguros?** | ? S� | Usa `${{ secrets.META_ACCESS_TOKEN }}` |
| **�El CDK hardcodea el token?** | ? NO | Usa `process.env.META_ACCESS_TOKEN` |
| **�El source code hardcodea el token?** | ? NO | Usa `process.env.META_ACCESS_TOKEN` |
| **�Necesita rotaci�n?** | ? DEPENDS | Ver an�lisis abajo |

### �Necesita Rotaci�n del Token?

**Escenarios donde S� necesitar�as rotar:**
1. Si el token fue compartido por canales inseguros (email, chat, etc.)
2. Si alguien con acceso al `.env` local ya no deber�a tener acceso
3. Si el token tiene permisos excesivos y quieres reducir el scope
4. Como pr�ctica preventiva peri�dica (recomendado: cada 6-12 meses)

**Escenarios donde NO necesitas rotar:**
1. ? El token nunca fue expuesto en el repo
2. ? El token est� correctamente protegido por `.gitignore`
3. ? El CI/CD usa GitHub Secrets
4. ? No hay hardcoding en el c�digo

### Recomendaciones de Mejora (Opcionales)

1. **Logging seguro**: En `metaApi.js`, el token pasa como query parameter en URLs. Asegurar que el middleware de logging no capture URLs completas con tokens.

2. **Rotaci�n peri�dica**: Implementar un proceso documentado de rotaci�n de tokens cada 6-12 meses como buena pr�ctica.

3. **Validaci�n de scopes**: Verificar que el token de Meta tenga solo los permisos necesarios (`instagram_basic`, `instagram_content_publish`, `pages_read_engagement`).

4. **Monitoreo de uso**: Revisar peri�dicamente el dashboard de Meta Developers para detectar uso an�malo del token.

---

## Conclusi�n

**El token Meta de este proyecto est� bien protegido.** No hubo exposici�n en el historial de git, el `.gitignore` es correcto, el CI/CD usa secrets apropiados, y el c�digo fuente lee el token exclusivamente de variables de entorno. 

La rotaci�n del token es una decisi�n operacional, no una respuesta a una brecha de seguridad. Si el token fue manejado solo por el desarrollador principal y no hay sospecha de compromiso, no es urgente rotarlo.
