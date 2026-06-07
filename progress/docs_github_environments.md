# Documentación GitHub Environments

**Fecha**: 2026-06-07
**Estado**: Completado

## Cambios Realizados

### 1. Archivo Nuevo: `docs/github-environments.md`

Documentación completa sobre GitHub Environments:
- Explicación de qué son y sus ventajas
- Pasos para crear un environment
- Lista de secrets por entorno (pre, int, pro)
- Cómo el CI/CD lee los secrets
- Protection rules (aprobación manual)
- Diferencia con Repository Secrets
- Solución de problemas

### 2. Actualizado: `.github/workflows/ci.yml`

Añadida la directiva `environment: ${{ github.ref_name }}` al job `deploy`:
- Esto permite que GitHub Actions lea los secrets del environment correspondiente
- El nombre del environment se deriva automáticamente del branch (pre, int, pro)

### 3. Actualizado: `README.md`

Reemplazada la sección "Required GitHub Secrets" con:
- Explicación de que los secrets se organizan por environments
- Pasos para configurar los environments
- Lista de secrets necesarios
- Enlace a la documentación completa

## Archivos Modificados

| Archivo | Acción |
|---------|--------|
| `docs/github-environments.md` | Creado |
| `.github/workflows/ci.yml` | Modificado (línea 58) |
| `README.md` | Modificado (sección Deployment) |

## Verificación

- [x] Workflow usa `environment: ${{ github.ref_name }}`
- [x] README enlaza a documentación completa
- [x] No se modificaron src/, tests/ o infra/
