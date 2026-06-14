# DynamoDB Data Model - IG-API

**Feature**: FEAT-022
**Estado**: ✅ Completado
**Última actualización**: 2026-06-13

---

## Overview

Este documento define el modelo de datos para la tabla DynamoDB `ig-posts-{env}` que almacena publicaciones de Instagram y datos relacionados. Incluye campos implementados actualmente y campos planificados para features futuras.

---

## Estructura de la Tabla

### Primary Key

| Atributo | Nombre | Tipo | Descripción |
|----------|--------|------|-------------|
| Partition Key (PK) | `id` | String | Instagram post ID (único por post) |
| Sort Key (SK) | `timestamp` | String | Fecha de publicación ISO-8601 |

### Configuración

| Propiedad | Valor | Descripción |
|-----------|-------|-------------|
| Billing Mode | PAY_PER_REQUEST | On-demand (Free Tier compatible) |
| TTL Attribute | `expiresAt` | Eliminación automática de items expirados |
| TTL Default | 90 días | Configurable via `DYNAMODB_POST_TTL_DAYS` |
| Table Name Pattern | `ig-posts-{env}` | Ej: `ig-posts-pre`, `ig-posts-prod` |

---

## Campos del Item

### Campos Obligatorios (siempre presentes)

| Campo | Tipo | Descripción | Fuente | Validación |
|-------|------|-------------|--------|------------|
| `id` | String | Instagram post ID (PK) | Meta API | No vacío, numérico |
| `timestamp` | String | Fecha publicación ISO-8601 (SK) | Meta API | Formato ISO-8601 válido |
| `mediaType` | String | Tipo de media | Meta API | Enum: `IMAGE`, `VIDEO`, `CAROUSEL_ALBUM` |
| `permalink` | String | URL pública del post | Meta API | URL válida de instagram.com |
| `likeCount` | Number | Cantidad de likes | Meta API | Integer ≥ 0 |
| `commentsCount` | Number | Cantidad de comentarios | Meta API | Integer ≥ 0 |
| `createdAt` | String | Fecha de inserción en DynamoDB (ISO-8601) | Repository | Auto-generado |
| `expiresAt` | Number | TTL en epoch seconds | Repository | Auto-generado (now + 90 días) |

### Campos Opcionales (pueden ser null o no existir)

| Campo | Tipo | Descripción | Fuente | Feature |
|-------|------|-------------|--------|---------|
| `caption` | String/null | Texto del post | Meta API | Actual |
| `mediaUrl` | String/null | URL del media original | Meta API | Actual |
| `thumbnailUrl` | String/null | URL del thumbnail (videos) | Meta API | Actual |
| `lastVerificationDate` | String/null | Última verificación de existencia (ISO-8601) | Repository | FEAT-006 |

### Campos Planificados (features futuras)

| Campo | Tipo | Descripción | Fuente | Feature |
|-------|------|-------------|--------|---------|
| `price` | Number/null | Precio extraído del caption | Grok AI (FEAT-025/026) | FEAT-026 |
| `priceConfidence` | Number/null | Confianza de extracción (0.0-1.0) | Grok AI | FEAT-026 |
| `currency` | String/null | Moneda detectada (EUR, USD, etc.) | Grok AI | FEAT-026 |
| `extractedData` | Map/null | Datos estructurados extraídos por Grok | Grok AI (FEAT-025) | FEAT-025 |
| `s3Keys` | Map/null | Claves S3 por tipo {original, thumbnail} | S3 Service | FEAT-027 |
| `mediaStored` | Boolean/null | Si el media ya se guardó en S3 | S3 Service | FEAT-027 |
| `webhookReceived` | Boolean/null | Si se recibió un webhook para este post | Webhook Processor | FEAT-028 |
| `source` | String/null | Origen de creación: `"api"` o `"webhook"` | Repository | FEAT-028 |
| `status` | String/null | Estado del post: `"active"`, `"deleted"`, `"hidden"` | Repository | Futuro |
| `updatedAt` | String/null | Última actualización de datos (ISO-8601) | Repository | Futuro |

---

## Campo `extractedData` (FEAT-025)

Este campo almacenará la salida estructurada de Grok AI cuando procese el caption de un post. La estructura exacta dependerá de la implementación de FEAT-025, pero se anticipa:

```json
{
  "extractedData": {
    "entities": [
      { "type": "product", "value": "iPhone 13", "confidence": 0.92 },
      { "type": "condition", "value": "used", "confidence": 0.85 }
    ],
    "intent": "sale",
    "rawResponse": "..."
  }
}
```

**Nota**: El campo `price` es un extracto de `extractedData` promovido a atributo de primer nivel para habilitar el GSI `by-price`.

---

## Global Secondary Indexes (GSIs)

### GSI: `by-timestamp`

| Propiedad | Valor |
|-----------|-------|
| Partition Key | `timestamp` (String) |
| Sort Key | `id` (String) |
| Proyección | ALL |
| Estado | ✅ Implementado en CDK |

**Casos de uso**:
- `listPosts(limit)`: Listar posts ordenados por fecha (más recientes primero)
- `listPostsNeedingVerification(hours, limit)`: Posts con filtro de verificación
- FEAT-024: GET /posts?limit=N con paginación eficiente
- Consultas por rango de fechas

**Justificación**: Reemplaza el Scan ineficiente que se usaba anteriormente. Permite ordenamiento natural por fecha de publicación.

### GSI: `by-mediaType`

| Propiedad | Valor |
|-----------|-------|
| Partition Key | `mediaType` (String) |
| Sort Key | `timestamp` (String) |
| Proyección | ALL |
| Estado | ✅ Implementado en CDK |

**Casos de uso**:
- Listar solo imágenes: `Query(mediaType="IMAGE")`
- Listar solo videos: `Query(mediaType="VIDEO")`
- Listar solo carruseles: `Query(mediaType="CAROUSEL_ALBUM")`

**Justificación**: Permite filtrar por tipo de media sin Scan. Útil para mostrar galerías separadas por tipo.

### GSI: `by-price`

| Propiedad | Valor |
|-----------|-------|
| Partition Key | `price` (Number) |
| Sort Key | `timestamp` (String) |
| Proyección | ALL |
| Estado | ✅ Implementado en CDK |

**Casos de uso**:
- FEAT-026: Buscar posts con precio extraído por Grok
- Filtrar posts por rango de precios
- Ordenar productos por precio

**Justificación**: Habilita búsquedas eficientes por precio. Solo items con `price` definido aparecen en este índice (DynamoDB omite items sin el atributo PK del GSI).

---

## Patrones de Acceso

| # | Patrón | Operación DynamoDB | Índice | Feature | Implementado |
|---|--------|-------------------|--------|---------|--------------|
| 1 | Obtener post por ID | Query (PK) | Tabla principal | Actual | ✅ |
| 2 | Listar N posts por fecha | Query | `by-timestamp` | FEAT-024 | ✅ |
| 3 | Posts que necesitan verificación | Query + Filter | `by-timestamp` | FEAT-006 | ✅ |
| 4 | Posts por tipo de media | Query | `by-mediaType` | Futuro | ⏳ CDK listo |
| 5 | Posts con precio | Query | `by-price` | FEAT-026 | ⏳ CDK listo |
| 6 | Verificar si post existe | Query (PK, Limit 1) | Tabla principal | FEAT-028 | ✅ |
| 7 | Guardar post individual | PutItem | Tabla principal | Actual | ✅ |
| 8 | Guardar posts en batch | BatchWriteItem | Tabla principal | Actual | ✅ |
| 9 | Actualizar fecha verificación | UpdateItem | Tabla principal | FEAT-006 | ✅ |
| 10 | Eliminar post | DeleteItem | Tabla principal | FEAT-006 | ✅ |

---

## Ejemplos de Items

### Post básico (de Meta API) — Estado actual

```json
{
  "id": "18064467956158130",
  "timestamp": "2026-06-07T10:30:00+0000",
  "caption": "Nuevo producto disponible 🛍️",
  "mediaType": "IMAGE",
  "mediaUrl": "https://scontent.cdninstagram.com/v/t51.2885-15/...",
  "permalink": "https://www.instagram.com/p/DRhKRJajORk/",
  "thumbnailUrl": null,
  "likeCount": 42,
  "commentsCount": 5,
  "createdAt": "2026-06-07T11:00:00.000Z",
  "expiresAt": 1725580800,
  "lastVerificationDate": "2026-06-07T11:00:00.000Z"
}
```

### Post con precio extraído (FEAT-026)

```json
{
  "id": "18064467956158131",
  "timestamp": "2026-06-08T14:20:00+0000",
  "caption": "Vendo iPhone 13 por 500€",
  "mediaType": "IMAGE",
  "mediaUrl": "https://scontent.cdninstagram.com/v/t51.2885-15/...",
  "permalink": "https://www.instagram.com/p/ABC123/",
  "likeCount": 15,
  "commentsCount": 8,
  "price": 500,
  "priceConfidence": 0.95,
  "currency": "EUR",
  "extractedData": {
    "entities": [
      { "type": "product", "value": "iPhone 13", "confidence": 0.92 }
    ],
    "intent": "sale"
  },
  "createdAt": "2026-06-08T15:00:00.000Z",
  "expiresAt": 1725667200,
  "lastVerificationDate": "2026-06-08T15:00:00.000Z"
}
```

### Post con media en S3 (FEAT-027)

```json
{
  "id": "18064467956158132",
  "timestamp": "2026-06-09T09:15:00+0000",
  "caption": "Video tutorial de cocina",
  "mediaType": "VIDEO",
  "mediaUrl": "https://scontent.cdninstagram.com/v/t50.2886-16/...",
  "permalink": "https://www.instagram.com/p/XYZ789/",
  "thumbnailUrl": "https://scontent.cdninstagram.com/v/t51.2885-15/...",
  "likeCount": 120,
  "commentsCount": 25,
  "s3Keys": {
    "original": "videos/18064467956158132.mp4",
    "thumbnail": "thumbnails/18064467956158132.jpg"
  },
  "mediaStored": true,
  "createdAt": "2026-06-09T10:00:00.000Z",
  "expiresAt": 1725753600,
  "lastVerificationDate": "2026-06-09T10:00:00.000Z"
}
```

### Post creado desde webhook (FEAT-028)

```json
{
  "id": "18064467956158133",
  "timestamp": "2026-06-10T16:45:00+0000",
  "caption": "Miren lo que encontré hoy!",
  "mediaType": "IMAGE",
  "mediaUrl": "https://scontent.cdninstagram.com/v/t51.2885-15/...",
  "permalink": "https://www.instagram.com/p/DEF456/",
  "likeCount": 8,
  "commentsCount": 3,
  "webhookReceived": true,
  "source": "webhook",
  "createdAt": "2026-06-10T17:00:00.000Z",
  "expiresAt": 1725840000,
  "lastVerificationDate": "2026-06-10T17:00:00.000Z"
}
```

---

## Flujo de Datos por Campo

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Meta Graph API v24.0                         │
│  id, caption, media_type, media_url, permalink, thumbnail_url,     │
│  timestamp, like_count, comments_count                              │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ normalizePost()
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    postRepository.savePost()                         │
│  + createdAt (auto), expiresAt (auto)                               │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     DynamoDB: ig-posts-{env}                         │
│  PK: id | SK: timestamp                                             │
│  GSIs: by-timestamp, by-mediaType, by-price                         │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Grok AI      │  │ S3 Service   │  │ Webhook      │
│ (FEAT-025)   │  │ (FEAT-027)   │  │ (FEAT-028)   │
│              │  │              │  │              │
│ + price      │  │ + s3Keys     │  │ + webhook-   │
│ + priceCon-  │  │ + media-     │  │   Received   │
│   fidence    │  │   Stored     │  │ + source     │
│ + currency   │  │              │  │              │
│ + extracted- │  │              │  │              │
│   Data       │  │              │  │              │
└──────────────┘  └──────────────┘  └──────────────┘
```

---

## Estrategia de Migración

### Estado Actual vs Target

| Aspecto | Antes (FEAT-005) | Ahora (FEAT-022) |
|---------|-------------------|-------------------|
| Partition Key | `id` (String) | `id` (String) ✅ |
| Sort Key | — | `timestamp` (String) ✅ |
| TTL | `expiresAt` | `expiresAt` ✅ |
| GSIs | — | `by-timestamp`, `by-mediaType`, `by-price` ✅ |
| Billing | PAY_PER_REQUEST | PAY_PER_REQUEST ✅ |

### Nota sobre la migración

DynamoDB **no permite** modificar el Primary Key de una tabla existente. La migración de "sin SK" a "con SK + GSIs" requiere recrear la tabla.

**Para entorno `pre`**: Los datos son cache de Meta API y se regeneran automáticamente vía `POST /posts/sync`. Se puede destruir y recrear sin impacto.

**Para entorno `prod`** (futuro): Considerar tabla nueva con swap de nombres si los datos son críticos.

---

## Costo Estimado

### Free Tier (12 meses)
- 25 GB almacenamiento
- 25 WCU (Write Capacity Units)
- 25 RCU (Read Capacity Units)

### Impacto de GSIs
Cada GSI consume RCU/WCU adicionales para replicar datos. Con PAY_PER_REQUEST, solo se paga por lo que se usa.

### Estimación mensual (pre)
- Datos: ~100 posts × 1 KB = 100 KB (<< 25 GB)
- Lecturas: ~1000/mes (<< 25 RCU × 730 horas)
- Escrituras: ~100/mes (<< 25 WCU × 730 horas)
- GSIs: 3 × 100 KB = 300 KB replication (negligible)
- **Costo estimado**: $0/mes (dentro del Free Tier)

---

## Consideraciones de Diseño

### ¿Por qué SK = timestamp?

1. **Consultas por fecha**: Permite Query eficiente por rango de fechas
2. **Ordenamiento natural**: Posts más recientes primero (ScanIndexForward: false)
3. **Paginación**: Soporta paginación eficiente con `ExclusiveStartKey`
4. **Unicidad**: Combinación `id + timestamp` es única (aunque `id` ya es único por post)

### ¿Por qué estos GSIs?

| GSI | Justificación | Alternativa rechazada |
|-----|---------------|----------------------|
| `by-timestamp` | Reemplaza Scan ineficiente; habilita FEAT-024 | Scan con Filter (lento, caro) |
| `by-mediaType` | Filtrar por IMAGE/VIDEO/CAROUSEL sin Scan | FilterExpression en by-timestamp (ineficiente) |
| `by-price` | Habilita FEAT-026 (buscar por precio) | Scan + Filter (no soporta rangos numéricos eficientemente) |

### Alternativas de diseño rechazadas

| Opción | Razón de rechazo |
|--------|-----------------|
| SK = `createdAt` | Menos útil que `timestamp` (fecha de publicación real de Instagram) |
| GSI `by-likeCount` | Los likes cambian constantemente; causaría writes excesivos al GSI |
| GSI `by-caption` | DynamoDB no soporta búsqueda de texto completo (full-text search) |
| Single-table design | Over-engineering para una sola entidad (posts) |
| SK = `mediaType` | Limitaría consultas por fecha; mejor como GSI separado |

### TTL y ciclo de vida

- **TTL**: 90 días por defecto (configurable via `DYNAMODB_POST_TTL_DAYS`)
- **Renovación**: Cada `savePost()` o `savePosts()` renueva `expiresAt`
- **Verificación**: Posts no verificados en > 24h se re-verifican contra Meta API
- **Eliminación**: DynamoDB elimina automáticamente items cuyo `expiresAt` < tiempo actual (puede tardar hasta 48h)

---

## Estado de Implementación

| Componente | Archivo | Estado |
|------------|---------|--------|
| Definición CDK (PK + SK + GSIs) | `infra/lib/ig-api-stack.js` | ✅ Completado |
| Repository pattern | `src/repositories/postRepository.js` | ✅ Completado |
| Normalización Meta API | `src/services/metaApi.js` | ✅ Completado |
| Documentación del modelo | `docs/dynamo-data-model.md` | ✅ Este archivo |
| Tests de integración | `tests/posts.test.js` | ✅ 121 tests passing |
| Campos futuros (price, s3Keys, etc.) | — | ⏳ Pendiente de features dependientes |

---

## Dependencias de Features

| Feature | Campos que utiliza | Estado |
|---------|-------------------|--------|
| FEAT-023 (Get Post by ID) | `id` (PK) | ✅ Depende de este modelo |
| FEAT-024 (Get N Posts) | `by-timestamp` GSI | ✅ Depende de este modelo |
| FEAT-025 (Grok AI Integration) | `extractedData` | ⏳ Usa campos planificados |
| FEAT-026 (Extract Price) | `price`, `priceConfidence`, `currency`, `by-price` GSI | ⏳ Usa campos planificados |
| FEAT-027 (S3 Storage) | `s3Keys`, `mediaStored` | ⏳ Usa campos planificados |
| FEAT-028 (Webhook Flow) | `webhookReceived`, `source` | ⏳ Usa campos planificados |

---

## Referencias

- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
- [Choosing the Right Primary Key](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.CoreComponents.html#HowItWorks.CoreComponents.PrimaryKey)
- [Global Secondary Indexes](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html)
- [Time to Live (TTL)](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html)
- Meta Graph API: [IG Media endpoint](https://developers.facebook.com/docs/instagram-api/reference/ig-media)
