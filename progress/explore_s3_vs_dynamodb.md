# Research — S3 vs DynamoDB para Almacenamiento de Imágenes de Instagram

## Archivos relevantes
- `src/services/metaApi.js` (L41-53): Normaliza posts incluyendo `mediaUrl` de la Meta API
- `src/repositories/postRepository.js` (L24-39): Guarda posts en DynamoDB con TTL
- `docs/decisions.md` (L537-565): Decisión previa de DIFERIR S3 multimedia storage
- `docs/cost-analysis.md` (L57-76): Análisis de costos DynamoDB actual
- `progress/notes_s3_coverage_tests.md` (L8-54): Notas previas sobre S3 vs DynamoDB
- `feature_list.json` (L186-195): FEAT-017 "Image Storage Strategy" (pending)
- `docs/roadmap.md` (L85): S3 Multimedia Storage en "Futuro (No planificado)"
- `infra/lib/ig-api-stack.js` (L20-25): Stack CDK actual (solo DynamoDB, sin S3)
- `package.json` (L45-52): Dependencias actuales (sin AWS S3 SDK)

---

## 1. Duración de URLs de Instagram (Meta Graph API)

### Hallazgo clave
**Las URLs de `media_url` de Instagram Graph API expiran después de aproximadamente 1 hora.**

### Evidencia en el proyecto
- `docs/decisions.md` L539: _"Instagram media URLs from Meta API expire after ~1 hour"_
- `progress/notes_s3_coverage_tests.md` L11: _"Las URLs de imágenes de Instagram expiran"_

### Detalle técnico (documentación Meta)
- Las URLs de `media_url` son **CDN URLs firmadas** con tokens de acceso temporales
- Contienen parámetros como `oh=`, `oe=`, `ccb=`, `_nc_sid=` que indican expiración
- La URL apunta a `scontent-*.cdninstagram.com` (CDN de Meta)
- **No son URLs permanentes** — son URLs de sesión con expiración
- Duración típica: **60-90 minutos** (varía según la carga del servidor)
- Después de expirar, la URL devuelve HTTP 4xx o redirect a página de login

### Implicación
Si almacenamos solo la URL de IG en DynamoDB, los consumidores del API **no podrán acceder a la imagen** después de ~1 hora. Para cualquier caso de uso que requiera acceso diferido (dashboards, notificaciones, archivado), necesitamos almacenamiento persistente.

---

## 2. Análisis de DynamoDB para Almacenamiento de Imágenes

### Límites de DynamoDB
| Factor | Límite | Impacto |
|--------|--------|---------|
| **Tamaño máximo por item** | **400 KB** | ❌ Imágenes de IG no caben |
| **Tamaño máximo de atributo** | 400 KB (LZ4 compressed) | ❌ Insuficiente |

### Tamaño típico de imágenes de Instagram
| Tipo de contenido | Tamaño típico | ¿Cabe en DynamoDB? |
|-------------------|---------------|---------------------|
| Foto cuadrada (1080x1080) | 200 KB - 1 MB | ⚠️ A veces (comprimida) |
| Foto landscape (1080x566) | 150 KB - 800 KB | ⚠️ A veces |
| Foto portrait (1080x1350) | 300 KB - 1.5 MB | ❌ No |
| Carrusel (hasta 10 fotos) | 2-10 MB | ❌ No |
| Video | 10-100 MB | ❌ No |
| Reels | 10-100 MB | ❌ No |

### Costo de DynamoDB (storage)
| Concepto | Precio | Free Tier |
|----------|--------|-----------|
| Almacenamiento | .25/GB/mes | 25 GB |
| Write (on-demand) | .25/millón | 25 WCU |
| Read (on-demand) | .25/millón | 25 RCU |

### Conclusión DynamoDB
❌ **No es viable almacenar bytes de imágenes en DynamoDB** por:
1. Límite de 400 KB por item (la mayoría de imágenes de IG exceden esto)
2. Costo de storage 11x más caro que S3 (.25/GB vs .023/GB)
3. No se puede servir directamente vía HTTP (requiere Lambda + API Gateway)
4. Consume capacidad de lectura/escritura innecesariamente

---

## 3. Análisis de S3 para Almacenamiento de Imágenes

### AWS Free Tier de S3
| Concepto | Free Tier (12 meses) |
|----------|----------------------|
| Almacenamiento | **5 GB** |
| PUT/COPY/POST/LIST requests | **2,000/mes** |
| GET/SELECT requests | **20,000/mes** |
| Transferencia de salida | **100 GB/mes** |
| Transferencia de entrada | Ilimitada |

### Costo después del Free Tier
| Concepto | Precio |
|----------|--------|
| Almacenamiento Standard | .023/GB/mes (primeros 50 TB) |
| PUT requests | .005/1,000 requests |
| GET requests | .0004/1,000 requests |
| Transferencia de salida | .09/GB (primeros 10 TB) |

### Complejidad de implementación
| Componente | Nivel | Descripción |
|------------|-------|-------------|
| **Bucket creation** | Fácil | 1 recurso CDK (`new Bucket(...)`) |
| **IAM permissions** | Medio | Lambda necesita `s3:PutObject` y `s3:GetObject` |
| **CORS configuration** | Fácil | Solo si el frontend accede directamente |
| **Lifecycle policies** | Fácil | Opcional: mover a Glacier después de X días |
| **Bucket policy** | Fácil | Default: privado, acceso solo vía IAM |
| **URLs de acceso** | Medio | URLs firmadas (temporales) o CloudFront (permanentes) |

### Tipos de URLs en S3
| Tipo | Duración | Seguridad | Complejidad |
|------|----------|-----------|-------------|
| **URL firmada (presigned)** | Configurable (min-horas) | Media | Baja |
| **URL pública** | Permanente | Baja (acceso abierto) | Muy baja |
| **CloudFront** | Permanente | Alta | Media-alta |

---

## 4. Comparación de Opciones

### Opción A: Guardar URL de IG en DynamoDB (actual)
| Factor | Evaluación |
|--------|------------|
| **Costo** | ✅  (solo metadata) |
| **Complejidad** | ✅ Ninguna (ya implementado) |
| **Persistencia** | ❌ URL expira en ~1 hora |
| **Acceso diferido** | ❌ Imposible |
| **Caso de uso** | Solo para consumo inmediato (dashboards en tiempo real) |

### Opción B: Descargar imagen y guardar bytes en DynamoDB
| Factor | Evaluación |
|--------|------------|
| **Costo** | ❌ Alto (.25/GB vs .023/GB en S3) |
| **Complejidad** | ⚠️ Media (lógica de descarga) |
| **Persistencia** | ✅ Permanente (con TTL) |
| **Viabilidad técnica** | ❌ **No viable** — Límite 400KB por item |
| **Caso de uso** | Ninguno (bloqueado por límite técnico) |

### Opción C: Descargar imagen y guardar en S3, URL en DynamoDB
| Factor | Evaluación |
|--------|------------|
| **Costo** | ✅ Bajo (Free Tier: 5GB, después .023/GB) |
| **Complejidad** | ⚠️ Media (S3 bucket + IAM + lógica de descarga) |
| **Persistencia** | ✅ Permanente |
| **Acceso diferido** | ✅ URLs firmadas o CloudFront |
| **Caso de uso** | Archivado, dashboards, notificaciones diferidas |

### Opción D: Guardar URL de IG + descargar a S3 como backup
| Factor | Evaluación |
|--------|------------|
| **Costo** | ✅ Bajo |
| **Complejidad** | ⚠️ Media-alta (dos fuentes de verdad) |
| **Persistencia** | ✅ Permanente (backup en S3) |
| **Consistencia** | ⚠️ Riesgo de desincronización |
| **Caso de uso** | Migración gradual, redundancia |

---

## 5. Estado del Código Actual

### ¿Cómo se manejan las URLs actualmente?
- `metaApi.js` L46: `mediaUrl: data.media_url || null` — Guarda la URL directa de Meta CDN
- `postRepository.js` L24-39: `savePost(post)` — Guarda el objeto completo (incluyendo `mediaUrl`) en DynamoDB
- **No hay descarga de imágenes** — Solo se almacena la URL
- **No hay lógica de expiración de URLs** — La URL se guarda tal cual
- **No hay S3** — Ni en dependencias (`package.json`), ni en CDK (`ig-api-stack.js`), ni en código

### Dependencias AWS actuales
`
@aws-sdk/client-dynamodb: ^3.1057.0
@aws-sdk/lib-dynamodb: ^3.1057.0
`
❌ No hay `@aws-sdk/client-s3`

---

## 6. Recomendación Técnica

### Veredicto: **Opción C — S3 como almacenamiento persistente**

### Justificación

1. **Las URLs de IG expiran (~1 hora)**: Esto es un hecho documentado tanto en la documentación de Meta como en nuestro proyecto (`docs/decisions.md` L539). Cualquier acceso diferido a imágenes fallará.

2. **DynamoDB no es viable para bytes de imágenes**: El límite de 400KB por item descarta almacenar la mayoría de imágenes de Instagram directamente.

3. **S3 es el estándar de la industria**: Para almacenamiento de objetos (imágenes, videos, archivos), S3 es el servicio diseñado específicamente para esto.

4. **Free Tier suficiente**: 5 GB de almacenamiento gratis cubre ~1,000-5,000 imágenes de Instagram (típicas 200KB-1MB cada una).

5. **Costo mínimo**: Después del Free Tier, S3 cuesta .023/GB/mes — 11x más barato que DynamoDB storage.

6. **Alineado con la arquitectura**: `docs/architecture.md` L4 dice _"Priorizar Lambda, API Gateway, DynamoDB, S3"_.

### Cuándo NO implementar S3 todavía
- Si los consumidores del API **solo** necesitan acceso inmediato a las URLs (la URL de IG funciona mientras no expire)
- Si no hay requisito de archivado a largo plazo
- Si el volumen de posts es muy bajo y se puede obtener la URL fresca cada vez

### Cuándo SÍ implementar S3
- Si hay dashboards que muestran imágenes de posts pasados
- Si hay notificaciones que incluyen imágenes
- Si se necesita archivado o backup de contenido
- Si los consumidores del API no pueden hacer fetch antes de que expire la URL

---

## 7. Pasos para Implementar Opción C (si se decide)

### Paso 1: Dependencia AWS S3
`ash
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
`
- `@aws-sdk/client-s3`: Cliente para operaciones S3
- `@aws-sdk/s3-request-presigner`: Para generar URLs firmadas

### Paso 2: Recurso CDK — S3 Bucket
En `infra/lib/ig-api-stack.js`:
`javascript
import { Bucket } from "aws-cdk-lib/aws-s3";

const mediaBucket = new Bucket(this, `-media-bucket`, {
  bucketName: `ig-api-media-`,
  // Opciones: lifecycle rules, CORS, encryption
});
mediaBucket.grantReadWrite(lambda);
`

### Paso 3: Servicio de almacenamiento — `src/services/mediaStorage.js`
- Función `downloadAndStore(mediaUrl, postId)`: Descarga imagen de IG URL y sube a S3
- Función `getPresignedUrl(s3Key)`: Genera URL firmada temporal
- Key pattern: `media/{postId}/{timestamp}.jpg`

### Paso 4: Integración en flujo de guardado
- En `postRepository.js` o en la ruta `POST /posts/sync`:
  1. Obtener post de Meta API (con `mediaUrl`)
  2. Descargar imagen y subir a S3
  3. Guardar en DynamoDB: `mediaUrl` → URL de S3 (o key de S3)
  4. Opcionalmente: guardar también la URL original de IG para referencia

### Paso 5: Endpoint para servir imágenes
- Opción A: URL firmada de S3 (expira en X horas/días)
- Opción B: Endpoint proxy en Lambda que lee de S3 y retorna la imagen
- Opción C: CloudFront distribution (más complejo, mejor performance)

### Paso 6: Variables de entorno
`
S3_MEDIA_BUCKET=ig-api-media-pre
S3_PRESIGN_URL_EXPIRY=86400  # 24 horas en segundos
`

### Paso 7: Tests
- Test unitario: `mediaStorage.test.js` con mock de S3 client
- Test de integración: Verificar flujo completo de descarga → S3 → URL firmada

---

## 8. Análisis de Costos — Opción C

### Escenario: 100 posts/mes con imágenes
| Concepto | Cálculo | Costo |
|----------|---------|-------|
| Almacenamiento S3 | 100 imágenes × 500KB = 50 MB |  (Free Tier: 5 GB) |
| PUT requests | 100 requests |  (Free Tier: 2,000) |
| GET requests | 1,000 requests |  (Free Tier: 20,000) |
| Transferencia | 50 MB |  (Free Tier: 100 GB) |
| **Total mensual** | | **** |

### Escenario: 1,000 posts/mes con imágenes
| Concepto | Cálculo | Costo |
|----------|---------|-------|
| Almacenamiento S3 | 1,000 × 500KB = 500 MB |  (Free Tier: 5 GB) |
| PUT requests | 1,000 requests |  (Free Tier: 2,000) |
| GET requests | 10,000 requests |  (Free Tier: 20,000) |
| Transferencia | 500 MB |  (Free Tier: 100 GB) |
| **Total mensual** | | **** |

### Escenario: 10,000 posts/mes (después de Free Tier)
| Concepto | Cálculo | Costo |
|----------|---------|-------|
| Almacenamiento S3 | 10,000 × 500KB = 5 GB | .12/mes |
| PUT requests | 10,000 requests | .05/mes |
| GET requests | 100,000 requests | .04/mes |
| Transferencia | 5 GB |  (Free Tier) |
| **Total mensual** | | **~.21/mes** |

---

## 9. Riesgos Potenciales

### Riesgo 1: Lambda timeout durante descarga de imagen
- **Probabilidad**: Media
- **Impacto**: Alto (post no se guarda)
- **Mitigación**: Descarga asíncrona, timeout de 5s para la descarga, retry con backoff

### Riesgo 2: URLs de IG expiran antes de descargar
- **Probabilidad**: Baja (1 hora es suficiente)
- **Impacto**: Alto (imagen no disponible)
- **Mitigación**: Descargar inmediatamente al recibir el post, no diferir

### Riesgo 3: Costos inesperados en S3
- **Probabilidad**: Muy baja
- **Impacto**: Bajo
- **Mitigación**: Budget alerts en AWS, lifecycle rules para eliminar objetos antiguos

### Riesgo 4: Complejidad adicional
- **Probabilidad**: Alta
- **Impacto**: Medio (más código que mantener)
- **Mitigación**: Mantener el servicio de S3 aislado (`mediaStorage.js`), no mezclar con lógica de negocio

---

## 10. Decisión Recomendada

### Para AHORA (sin cambio)
**Mantener la estrategia actual**: Guardar solo la URL de IG en DynamoDB.
- Razón: No hay caso de uso concreto que requiera persistencia de imágenes todavía
- El proyecto está en fase educativa, priorizar simplicidad
- `docs/decisions.md` L553: _"DEFER S3 implementation until a concrete use case requires persistent media storage"_

### Para el FUTURO (cuando se necesite)
**Implementar Opción C**: S3 como almacenamiento persistente.
- Crear bucket S3 con CDK
- Servicio `mediaStorage.js` para descargar y almacenar
- URLs firmadas para acceso temporal
- Integrar en el flujo de guardado de posts

### Señales para activar S3
1. ✅ Dashboards que necesitan mostrar imágenes de posts pasados
2. ✅ Notificaciones push que incluyen imágenes
3. ✅ Requisito de archivado/backup de contenido
4. ✅ Consumidores del API que no pueden hacer fetch antes de que expire la URL

---

## Resumen Ejecutivo

| Pregunta | Respuesta |
|----------|-----------|
| ¿Duración de URLs de IG? | ~1 hora (CDN URLs firmadas) |
| ¿Caben imágenes en DynamoDB? | ❌ No (límite 400KB, imágenes típicas 200KB-10MB) |
| ¿S3 es viable? | ✅ Sí (Free Tier 5GB, bajo costo después) |
| ¿Recomendación? | Diferir S3 hasta que haya caso de uso concreto |
| ¿Cuándo implementar? | Cuando se necesite acceso diferido a imágenes |
| ¿Costo estimado de S3? |  para uso moderado (dentro de Free Tier) |