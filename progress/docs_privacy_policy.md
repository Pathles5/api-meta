# Documentación Legal - Política de Privacidad

**Fecha**: 2026-06-07
**Estado**: Completado
**Solicitante**: App Review de Meta

## Objetivo

Crear documentación legal completa para el proyecto IG-API, requerida para el App Review de Meta cuando se solicitan permisos de Instagram Graph API.

## Cambios Realizados

### 1. Archivo Nuevo: `docs/privacy-policy.html`

Página HTML5 completa con Política de Privacidad y Términos de Servicio:

**Política de Privacidad:**
- Datos recopilados: posts de Instagram, comentarios, menciones, metadatos
- Uso de datos: almacenamiento en DynamoDB, análisis, sincronización
- Protección: HTTPS/TLS, cifrado en reposo (AWS), autenticación, rate limiting
- Retención: TTL de 90 días con eliminación automática
- Derechos del usuario: acceso, rectificación, eliminación, portabilidad, oposición
- Compartición: solo con Meta (API oficial) y AWS (infraestructura)

**Términos de Servicio:**
- Uso aceptable: fines legales, cumplimiento de términos de Meta
- Limitaciones: servicio "tal cual", sin garantías de disponibilidad
- Propiedad intelectual: código fuente bajo licencia ISC
- Modificaciones: derecho a actualizar términos

**Características técnicas:**
- HTML5 válido, sin frameworks
- CSS inline (sin archivos externos)
- Diseño responsive (mobile-friendly)
- HTTPS (GitHub Pages automático)
- Accesibilidad básica

### 2. Archivo Nuevo: `docs/index.html`

Página de índice con enlaces a la documentación legal:
- Enlace principal a `privacy-policy.html`
- Información del proyecto (descripción, propósito, stack)
- Enlace al repositorio de GitHub

### 3. Actualizado: `README.md`

Añadida sección "Legal" antes de "Documentation":
- Enlace a la Política de Privacidad y Términos de Servicio
- URL de GitHub Pages para acceso público
- Propósito: requerido para App Review de Meta

## Archivos Modificados

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `docs/privacy-policy.html` | Creado | Política de Privacidad y Términos de Servicio |
| `docs/index.html` | Creado | Índice de documentación legal |
| `README.md` | Modificado | Sección "Legal" añadida |

## Verificación

- [x] HTML5 válido
- [x] CSS inline (sin dependencias externas)
- [x] Responsive (mobile-friendly)
- [x] HTTPS (GitHub Pages automático)
- [x] Contenido completo para App Review de Meta
- [x] Enlaces correctos en README.md
- [x] No se modificaron src/, tests/, infra/ o .github/

## Siguientes Pasos

1. **Habilitar GitHub Pages:**
   - Ir a Settings → Pages
   - Seleccionar source: "Deploy from a branch"
   - Seleccionar branch: `dev` o `pre`
   - Seleccionar carpeta: `/docs`
   - Guardar

2. **Verificar acceso:**
   - URL: `https://pathles5.github.io/api-meta/docs/privacy-policy.html`
   - URL índice: `https://pathles5.github.io/api-meta/docs/`

3. **Usar en App Review de Meta:**
   - Copiar la URL de la Política de Privacidad
   - Pegar en el formulario de App Review
   - Asegurar que la política cubra todos los permisos solicitados

## Notas

- El email `pathles5@example.com` es un placeholder que debe ser reemplazado con un email real
- La política está redactada para cubrir los permisos típicos de Instagram Graph API
- Se recomienda revisar la política con un abogado antes de la producción real