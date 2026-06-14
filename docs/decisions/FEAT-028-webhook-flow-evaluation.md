# FEAT-028: Evaluación del Cambio de Flujo de Webhooks

**Fecha**: 2026-06-13
**Estado**: Propuesta / Evaluación
**Autor**: explorer (perfil Hermes)

---

## 1. Contexto del Problema

Instagram Webhooks **no envían eventos de creación de posts**. Los únicos eventos que recibimos son:
- `comments` — nuevo comentario en un post
- `mentions` — mención en story/comment
- `reactions` — reacción a un comment/story

**Problema actual**: Los posts solo se almacenan en DynamoDB cuando un cliente los solicita explícitamente vía `GET /posts`, `GET /posts/:id`, o `POST /posts/sync`. Si un post recibe un comentario pero nunca se consulta vía API, no queda almacenado.

**Objetivo**: Cuando llega un webhook event, verificar si el post asociado existe en DynamoDB. Si no existe, crearlo automáticamente obteniendo los datos de Meta API.

---

## 2. Análisis del Flujo Actual

### 2.1 Pipeline de Webhooks (src/routes/webhooks.js + src/services/webhookProcessor.js)

```
Meta → POST /webhooks
  → express.raw() (body como Buffer)
  → verifyMetaSignature() (HMAC SHA-256)
  → JSON.parse(rawBody)
  → eventProcessor.processEvent(payload)
  → Responde 200 "EVENT_RECEIVED" (siempre, incluso con errores)
```

**Estado actual del processor**: El `webhookProcessor.js` es un **stub de logging**. Itera sobre `entry[].changes[]` y solo registra cada cambio con `logger.info()`. No tiene lógica de negocio, no accede a DynamoDB, no llama a Meta API.

```javascript
// webhookProcessor.js - línea 54-66 (actual)
for (const change of entry.changes) {
  try {
    log.info({ object, entryId, field, value }, "Webhook change processed");
    processed++;
  } catch (err) {
    log.error({ err, change }, "Error processing webhook change");
    errors++;
  }
}
```

### 2.2 Estructura del Payload de Webhook

```json
{
  "object": "instagram",
  "entry": [{
    "id": "ig-user-id",
    "time": 1717700000,
    "changes": [{
      "field": "comments",
      "value": {
        "id": "comment-id",
        "text": "Hello!",
        "from": { "id": "user-1", "username": "testuser" },
        "media": { "id": "POST_ID" }
      }
    }]
  }]
}
```

**Campos relevantes para extraer post ID**:
- `comments`: `value.media.id` o `value.post_id` (depende del tipo de webhook)
- `mentions`: `value.media.id`
- `reactions`: `value.comment_id` → requiere lookup adicional

### 2.3 Flujo Actual de Ingesta de Posts

| Endpoint | Flujo | Cuándo se usa |
|----------|-------|---------------|
| `GET /posts` | Meta API → savePosts → DynamoDB | Listado general |
| `GET /posts/:id` | Cache check → Meta API (si miss) → savePost | Consulta individual |
| `POST /posts/sync` | Meta API → savePosts (batch) | Sincronización manual |

### 2.4 Modelo de Datos Actual (DynamoDB)

- **PK**: `id` (String) — Instagram post ID
- **SK**: `timestamp` (String, ISO-8601)
- **Campos ya planificados para FEAT-028**: `webhookReceived` (Boolean), `source` ("api" | "webhook")
- **Operación disponible**: `getPost(id)` usa `QueryCommand` con `KeyConditionExpression: "id = :id"`

---

## 3. Propuesta del Nuevo Flujo

### 3.1 Diagrama del Flujo Propuesto

```
Meta → POST /webhooks (comment/reaction/mention event)
  → verifyMetaSignature()
  → JSON.parse()
  → eventProcessor.processEvent(payload)
      → Para cada change en entry.changes:
          1. Extraer post_id del change.value
          2. repo.getPost(post_id)
          3. Si post NO existe:
             → metaApi.fetchPost(post_id)
             → repo.savePost(post, { source: "webhook" })
             → Log: "Post created from webhook"
          4. Si post existe:
             → Log: "Post already exists, skipping"
          5. Procesar la lógica del evento (comment/reaction/mention)
  → Responde 200 "EVENT_RECEIVED"
```

### 3.2 Extracción del Post ID por Tipo de Evento

| Field | Estructura de `value` | Post ID location |
|-------|----------------------|------------------|
| `comments` | `{ id, text, from, media: { id } }` | `value.media.id` |
| `mentions` | `{ id, media: { id }, ... }` | `value.media.id` |
| `reactions` | `{ id, reaction, from, comment_id }` | Requiere lookup (no tiene post_id directo) |

**Nota**: Para `reactions` sobre comentarios, se necesitaría una llamada adicional a Meta API para obtener el `media_id` del comentario padre. Esto añade complejidad y latencia.

---

## 4. Pros y Contras

### 4.1 Ventajas (Pros)

| # | Ventaja | Impacto |
|---|---------|---------|
| 1 | **Posts se almacenan automáticamente** cuando reciben interacción | Elimina la necesidad de sync manual para posts activos |
| 2 | **Datos más frescos**: el post se guarda en el momento de la primera interacción | Mejor para análisis en tiempo real |
| 3 | **Reduce llamadas innecesarias a Meta API**: solo se fetch si el post no existe | Ahorra rate limits |
| 4 | **Alineado con el modelo de datos**: los campos `webhookReceived` y `source` ya están planificados | Sin cambios de schema |
| 5 | **Complementa el flujo existente**: no reemplaza `GET /posts` ni `POST /sync` | Backward compatible |
| 6 | **Trazabilidad**: campo `source: "webhook"` permite distinguir origen del post | Auditoría |

### 4.2 Desventajas (Contras)

| # | Desventaja | Severidad | Mitigación |
|---|------------|-----------|------------|
| 1 | **Race conditions**: múltiples webhooks simultáneos para el mismo post pueden causar escrituras duplicadas | Media | DynamoDB PutCommand es idempotente (overwrite). Usar `ConditionExpression` si se necesita detectar colisiones |
| 2 | **Latencia añadida al webhook**: fetch a Meta API + write a DynamoDB dentro del handler | Media | Meta exige respuesta < 20s. El handler actual es síncrono. Si Meta API tarda, podríamos exceder timeout |
| 3 | **Rate limits de Meta API**: si llegan muchos webhooks de golpe, podríamos agotar el rate limit | Alta | Implementar cola (SQS) o throttling. Alternativa: solo fetch si no existe (check primero) |
| 4 | **Webhook events para posts eliminados**: Meta API devolverá 404 | Baja | Manejar error 404 gracefully, log y continuar |
| 5 | **Extracción de post_id no trivial**: la estructura varía por tipo de evento | Media | Crear función `extractPostId(change)` con manejo por campo |
| 6 | **Dependencia en servicios externos dentro del handler**: si Meta API o DynamoDB fallan, el evento se pierde | Media | Siempre respondemos 200 a Meta (no retry). Implementar dead-letter o re-intentable queue |
| 7 | **Reactions no tienen post_id directo**: necesitan lookup adicional | Alta | Evaluar si vale la pena procesar reactions o solo comments/mentions |

---

## 5. Cambios Necesarios en Código

### 5.1 Archivos a Modificar

| Archivo | Cambio | Complejidad |
|---------|--------|-------------|
| `src/services/webhookProcessor.js` | **Principal**: Añadir lógica de negocio (check post → fetch if missing → save) | Alta |
| `src/services/webhookProcessor.js` | Crear factory con inyección de dependencias: `createWebhookProcessor({ repo, metaApi, logger })` | Media |
| `src/routes/webhooks.js` | Pasar `repo` y `metaApi` al processor (o usar defaults) | Baja |
| `src/services/metaApi.js` | Ningún cambio necesario (`fetchPost` ya existe) | N/A |
| `src/repositories/postRepository.js` | Opcionalmente: añadir `postExists(id)` optimizado (solo verifica existencia sin traer todo) | Baja |
| `tests/webhookProcessor.test.js` | Reescribir tests con mocks de repo y metaApi | Media |
| `tests/webhooks.test.js` | Actualizar tests de integración | Baja |

### 5.2 Nueva Función: `extractPostId(change)`

```javascript
/**
 * Extrae el Instagram post ID de un webhook change.
 * @param {{ field: string, value: object }} change
 * @returns {string|null} Post ID o null si no se puede extraer
 */
function extractPostId(change) {
  const { field, value } = change;

  if (field === "comments" || field === "mentions") {
    return value?.media?.id || null;
  }

  if (field === "reactions") {
    // reactions no tienen post_id directo
    // value.comment_id existe pero necesitaría lookup
    return null; // No soportado inicialmente
  }

  return null;
}
```

### 5.3 Nuevo Flujo en `processEvent`

```javascript
function processEvent(payload) {
  // ... validaciones existentes ...

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const postId = extractPostId(change);

      if (postId) {
        // Check-exists-then-fetch pattern
        const existing = await repo.getPost(postId);
        if (!existing) {
          try {
            const post = await metaApi.fetchPost(postId);
            await repo.savePost({ ...post, source: "webhook", webhookReceived: true });
            log.info({ postId }, "Post created from webhook event");
          } catch (err) {
            if (err.statusCode === 404) {
              log.warn({ postId }, "Post no longer exists on Instagram");
            } else {
              log.error({ postId, err }, "Failed to fetch post from Meta API");
            }
          }
        } else {
          log.debug({ postId }, "Post already exists, skipping creation");
        }
      }

      // Procesar la lógica específica del evento (futuro)
      processed++;
    }
  }
}
```

### 5.4 Inyección de Dependencias

El `createWebhookProcessor` debe aceptar `repo` y `metaApi`:

```javascript
function createWebhookProcessor(options = {}) {
  const log = options.logger || defaultLogger;
  const repo = options.repo || defaultRepo;
  const metaApi = options.metaApi || defaultMetaApi;
  // ...
}
```

El `createWebhooksRouter` debe pasar estas dependencias:

```javascript
function createWebhooksRouter(processor) {
  const eventProcessor = processor || createWebhookProcessor({
    repo: defaultRepo,
    metaApi: defaultMetaApi,
  });
  // ...
}
```

### 5.5 Optimización Opcional: `postExists(id)`

Para evitar traer todo el item de DynamoDB solo para verificar existencia:

```javascript
async function postExists(id) {
  const result = await client.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "id = :id",
      ExpressionAttributeValues: { ":id": id },
      ProjectionExpression: "id",  // Solo traer el ID
      Limit: 1,
    }),
  );
  return (result.Items?.length || 0) > 0;
}
```

**Nota**: El ahorro es mínimo (traer 1 campo vs todo el item), pero semánticamente más claro.

---

## 6. Edge Cases y Consideraciones

### 6.1 Race Conditions

**Escenario**: Dos webhooks llegan simultáneamente para el mismo post (ej: dos comentarios en rápido).

**Análisis**:
- Ambos ejecutan `getPost(id)` → ambos ven que no existe
- Ambos llaman a `metaApi.fetchPost(id)` → ambos obtienen el mismo post
- Ambos ejecutan `savePost(post)` → DynamoDB PutCommand es overwrite (idempotente)
- **Resultado**: El post se guarda dos veces, pero el estado final es correcto

**Mitigación**: Si se quiere evitar la doble llamada a Meta API:
- Opción A: Usar `ConditionExpression: "attribute_not_exists(id)"` en PutCommand (falla si ya existe)
- Opción B: Distributed lock con DynamoDB (overkill para este caso)
- Opción C: Aceptar la duplicación (es inofensiva, PutCommand es overwrite)

**Recomendación**: Opción C — aceptar la duplicación. Es inofensiva y simple.

### 6.2 Posts Eliminados

**Escenario**: Webhook llega para un comentario en un post que fue eliminado.

**Flujo**:
1. `getPost(id)` → null (no existe)
2. `metaApi.fetchPost(id)` → Error 404
3. Log warning y continuar

**Manejo**: Ya contemplado en `handleMetaError` (code 100 → 404).

### 6.3 Rate Limiting de Meta API

**Escenario**: Llegan 50 webhooks en 1 minuto, todos para posts diferentes.

**Impacto**: 50 llamadas a Meta API en 1 minuto.

**Límites de Meta API**:
- Instagram Graph API: ~200 calls/hour/user (varía)
- Con 1 webhook = 1 call, estamos bien para carga normal

**Mitigación**:
- Solo fetch si el post NO existe (check primero)
- En caso de rate limit (429), log y continuar (no reintentar dentro del webhook)
- El post se obtendrá en el próximo sync o GET /:id

### 6.4 Webhook Timeout

**Meta exige**: Respuesta HTTP 200 en < 20 segundos.

**Análisis de latencia**:
- `getPost(id)`: ~5ms (DynamoDB)
- `fetchPost(id)`: ~200-500ms (Meta API)
- `savePost(post)`: ~5ms (DynamoDB)
- **Total**: ~210-510ms por evento

**Conclusión**: Dentro del límite de 20s incluso con múltiples events en un payload.

### 6.5 Estructura Variable de Payloads

**Riesgo**: Meta puede cambiar la estructura de `value` entre versiones de API.

**Mitigación**:
- Función `extractPostId` con fallback a null
- Logging de payloads no reconocidos para debugging
- Tests con payloads reales de diferentes tipos

### 6.6 Reactions sin Post ID Directo

**Problema**: El campo `reactions` tiene `comment_id` pero no `media.id`.

**Opciones**:
1. No procesar reactions (solo comments y mentions) — **Recomendado inicialmente**
2. Hacer lookup: `GET /{comment_id}` → obtener `media.id` → luego fetch post
3. Suscribirse a webhooks de `feed` (Page webhooks) que sí incluyen post creation

**Recomendación**: Opción 1 para MVP. Evaluar opción 2 en iteración posterior.

---

## 7. Alternativas Consideradas

### 7.1 Alternativa A: Cola SQS + Worker (Rechazada)

**Descripción**: Webhook → SQS queue → Lambda worker procesa asíncronamente.

**Pros**: Desacopla webhook de procesamiento, retry automático, maneja picos.
**Contras**: Añade complejidad, costo SQS (~$0.50/mes para nuestro volumen), nuevo recurso AWS.

**Razón de rechazo**: Over-engineering para el volumen actual (< 100 webhooks/día).

### 7.2 Alternativa B: Polling Periódico (Rechazada)

**Descripción**: Cada N minutos, hacer `GET /{ig-user-id}/media` y comparar con DynamoDB.

**Pros**: Simple, no depende de webhooks.
**Contras**: Gasta rate limits, latencia alta (hasta N minutos), no es real-time.

**Razón de rechazo**: Ya tenemos `POST /sync` para esto. Los webhooks son más eficientes.

### 7.3 Alternativa C: Webhook-First (Propuesta actual, Recomendada)

**Descripción**: Webhook trigger → check-exists → fetch-if-missing → save.

**Pros**: Real-time, eficiente en rate limits, simple de implementar.
**Contras**: Race conditions (mitigables), dependencia de que Meta envíe webhooks correctamente.

---

## 8. Recomendación Final

### ✅ RECOMENDADO: Implementar Flujo Webhook-First (Alternativa C)

**Justificación**:
1. **Simplicidad**: Solo modifica `webhookProcessor.js` y añade DI. Sin nuevos recursos AWS.
2. **Eficiencia**: Solo llama a Meta API cuando el post no existe (minimiza rate limits).
3. **Complementario**: No reemplaza flujos existentes (`GET /posts`, `POST /sync`).
4. **Coste $0**: No añade servicios AWS nuevos.
5. **Alineado con el data model**: Los campos `webhookReceived` y `source` ya están planificados.

### 8.1 Plan de Implementación Sugerido

| Paso | Descripción | Archivo(s) |
|------|-------------|------------|
| 1 | Crear `extractPostId(change)` | `src/services/webhookProcessor.js` |
| 2 | Añadir DI al processor (`repo`, `metaApi`) | `src/services/webhookProcessor.js` |
| 3 | Implementar lógica check-exists-fetch-save | `src/services/webhookProcessor.js` |
| 4 | Actualizar `createWebhooksRouter` para pasar deps | `src/routes/webhooks.js` |
| 5 | Manejo de errores (404, 429, network) | `src/services/webhookProcessor.js` |
| 6 | Tests unitarios con mocks | `tests/webhookProcessor.test.js` |
| 7 | Tests de integración | `tests/webhooks.test.js` |
| 8 | Logging estructurado de nuevos posts | `src/services/webhookProcessor.js` |

### 8.2 Criterios de Aceptación

- [ ] Cuando llega un webhook con `field: "comments"` y post no existe → se crea en DynamoDB
- [ ] Cuando llega un webhook con `field: "comments"` y post ya existe → no se hace nada
- [ ] Cuando llega un webhook con `field: "mentions"` → mismo comportamiento
- [ ] Cuando llega un webhook con `field: "reactions"` → se ignora (sin post_id directo)
- [ ] Si Meta API devuelve 404 → se loguea warning, no se rompe el flujo
- [ ] Si Meta API devuelve 429 → se loguea warning, no se reintenta
- [ ] Respuesta a Meta siempre es 200 "EVENT_RECEIVED" (incluso con errores internos)
- [ ] Todos los tests existentes siguen pasando
- [ ] Nuevos tests cubren: post existe, post no existe, error 404, error 429, payload sin post_id

### 8.3 Riesgos Residuales

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Meta cambia estructura de payload | Baja | Alta | Logging + tests con payloads reales |
| Rate limit en picos de webhooks | Media | Media | Solo fetch si no existe + no retry |
| Post eliminado entre webhook y fetch | Baja | Baja | Manejo 404 graceful |
| DynamoDB write failure | Muy baja | Media | Log error, post se obtendrá en próximo sync |

---

## 9. Dependencias y Prerequisitos

- **FEAT-024** (DynamoDB Data Model con SK + GSIs): Los campos `webhookReceived` y `source` están definidos en el data model pero aún no implementados en el repositorio.
- **Infraestructura**: No se requieren cambios en CDK/infra.
- **Variables de entorno**: No se requieren nuevas variables.

---

## 10. Conclusión

El cambio de flujo propuesto es **viable, simple y de bajo riesgo**. Transforma el webhook processor de un stub de logging a un componente activo que garantiza que todo post con interacción queda almacenado en DynamoDB automáticamente. La implementación se centra en un solo archivo (`webhookProcessor.js`) con cambios menores en `webhooks.js` para inyección de dependencias.
