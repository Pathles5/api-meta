# Research — CloudFront como Caché de S3: Análisis de Costo-Efectividad

## Archivos relevantes
- docs/cost-analysis.md: Análisis de costos actual (no incluye S3 ni CloudFront)
- docs/architecture.md (L4): Principio "Serverless First" — menciona S3 como prioridad
- docs/decisions.md (L537-565): Decisión DEFER para S3 multimedia storage
- docs/decisions.md (L558): Mención de CloudFront como opción futura
- docs/decisions.md (L562): Nota de costo CloudFront: $0.085/GB
- progress/explore_s3_vs_dynamodb.md: Investigación previa de S3 vs DynamoDB
- infra/lib/ig-api-stack.js: Stack CDK actual (sin S3, sin CloudFront)
- eature_list.json (L188): FEAT-017 "Image Storage Strategy" (pending)

---

## 1. ¿Qué es CloudFront y cómo funciona con S3?

### Definición
**Amazon CloudFront** es un CDN (Content Delivery Network) que distribuye contenido desde ubicaciones edge (más de 600 en todo el mundo). Cuando se usa con S3 como origin:

`
Usuario → CloudFront Edge (caché local) → S3 (origin)
`

### Flujo de funcionamiento
1. **Primera request**: CloudFront no tiene el objeto en caché → lo obtiene de S3 → lo cachea en el edge → lo sirve al usuario
2. **Requests subsiguientes**: CloudFront tiene el objeto en caché → lo sirve directamente SIN consultar S3
3. **Expiración de caché**: Después de TTL (configurable), CloudFront vuelve a S3 por una copia fresca

### Beneficio clave para nuestro caso
**Cada request servida desde CloudFront es una request que NO llega a S3.** Esto reduce:
- Requests a S3 (costo por request)
- Transferencia de datos desde S3 (costo por GB)

---

## 2. Precios de AWS (Región: eu-west-1)

### S3 Directo (sin CloudFront)

| Concepto | Precio | Free Tier (12 meses) |
|----------|--------|----------------------|
| Almacenamiento Standard | $0.023/GB/mes | 5 GB |
| PUT/COPY/POST/LIST requests | $0.005/1,000 | 2,000/mes |
| GET/SELECT requests | $0.0004/1,000 | 20,000/mes |
| Transferencia de salida (a Internet) | $0.09/GB | 100 GB/mes |
| Transferencia de entrada | Gratis | Ilimitada |

### CloudFront

| Concepto | Precio (Europa) | Free Tier |
|----------|-----------------|-----------|
| **Requests HTTPS** | $0.0120/10,000 | **10M requests/mes** (12 meses) |
| **Transferencia de datos** | $0.085/GB (primeros 10 TB) | **1 TB/mes** (12 meses) |
| Requests a S3 (origin fetches) | $0.0120/10,000 | Incluidos en los 10M |
| Invalidación de caché | $0.005/路径 (primeras 1,000 gratis/mes) | 1,000/mes |
| **Sin costo mínimo** | — | — |

### ⚠️ NOTA IMPORTANTE sobre el Free Tier de CloudFront
**AWS Free Tier para CloudFront (12 meses):**
- **1 TB de transferencia de datos de salida** por mes
- **10 millones de solicitudes HTTP y HTTPS** por mes
- **2 millones de solicitudes de funciones de CloudFront** por mes

**Esto es MASIVO.** Para nuestro caso de uso, CloudFront es esencialmente **gratis** durante el primer año.

---

## 3. Comparación de Costos — Escenarios

### Supuestos comunes
- Tamaño promedio de imagen: **500 KB** (0.0005 GB)
- Región: eu-west-1
- Distribución de requests: 80% GET (lectura), 20% PUT (escritura)
- CloudFront TTL: 24 horas (86,400 segundos)

---

### Escenario 1: 100 imágenes, 1,000 vistas/mes

#### Opción A: S3 directo
| Concepto | Cálculo | Costo |
|----------|---------|-------|
| Almacenamiento | 100 × 500KB = 50 MB | $0 (Free Tier) |
| PUT requests | 100 | $0 (Free Tier) |
| GET requests | 1,000 | $0 (Free Tier) |
| Transferencia salida | 1,000 × 500KB = 500 MB | $0 (Free Tier) |
| **Total** | | **/mes** |

#### Opción B: S3 + CloudFront
| Concepto | Cálculo | Costo |
|----------|---------|-------|
| Almacenamiento S3 | 50 MB | $0 (Free Tier) |
| PUT requests a S3 | 100 | $0 (Free Tier) |
| Requests CloudFront | 1,000 | $0 (Free Tier: 10M) |
| Transferencia CloudFront | 500 MB | $0 (Free Tier: 1TB) |
| Origin fetches (CF→S3) | ~40 (cache hit ratio 96%) | $0 (Free Tier) |
| **Total** | | **/mes** |

#### Diferencia: ** — Ambas opciones son gratis**

---

### Escenario 2: 1,000 imágenes, 10,000 vistas/mes

#### Opción A: S3 directo
| Concepto | Cálculo | Costo |
|----------|---------|-------|
| Almacenamiento | 1,000 × 500KB = 500 MB | $0 (Free Tier) |
| PUT requests | 1,000 | $0 (Free Tier) |
| GET requests | 10,000 | $0 (Free Tier: 20K) |
| Transferencia salida | 10,000 × 500KB = 5 GB | $0 (Free Tier: 100GB) |
| **Total** | | **/mes** |

#### Opción B: S3 + CloudFront
| Concepto | Cálculo | Costo |
|----------|---------|-------|
| Almacenamiento S3 | 500 MB | $0 (Free Tier) |
| PUT requests a S3 | 1,000 | $0 (Free Tier) |
| Requests CloudFront | 10,000 | $0 (Free Tier: 10M) |
| Transferencia CloudFront | 5 GB | $0 (Free Tier: 1TB) |
| Origin fetches (CF→S3) | ~500 (cache hit ratio 95%) | $0 (Free Tier) |
| **Total** | | **/mes** |

#### Diferencia: ** — Ambas opciones son gratis**

---

### Escenario 3: 10,000 imágenes, 100,000 vistas/mes

#### Opción A: S3 directo
| Concepto | Cálculo | Costo |
|----------|---------|-------|
| Almacenamiento | 10,000 × 500KB = 5 GB | $0.12/mes |
| PUT requests | 10,000 | $0.05/mes |
| GET requests | 100,000 | $0.04/mes (80K × $0.0004/1K) |
| Transferencia salida | 100,000 × 500KB = 50 GB | $0 (Free Tier: 100GB) |
| **Total** | | **~.21/mes** |

#### Opción B: S3 + CloudFront
| Concepto | Cálculo | Costo |
|----------|---------|-------|
| Almacenamiento S3 | 5 GB | $0.12/mes |
| PUT requests a S3 | 10,000 | $0.05/mes |
| Requests CloudFront | 100,000 | $0 (Free Tier: 10M) |
| Transferencia CloudFront | 50 GB | $0 (Free Tier: 1TB) |
| Origin fetches (CF→S3) | ~5,000 (cache hit ratio 95%) | $0 (Free Tier) |
| **Total** | | **~.17/mes** |

#### Diferencia: **.04/mes de ahorro con CloudFront**

---

### Escenario 4: Post-Free Tier (después de 12 meses), 100,000 vistas/mes

#### Opción A: S3 directo
| Concepto | Cálculo | Costo |
|----------|---------|-------|
| Almacenamiento | 5 GB | $0.12/mes |
| GET requests | 100,000 | $0.04/mes |
| Transferencia salida | 50 GB | $4.50/mes (50 × $0.09) |
| **Total** | | **~.66/mes** |

#### Opción B: S3 + CloudFront
| Concepto | Cálculo | Costo |
|----------|---------|-------|
| Almacenamiento S3 | 5 GB | $0.12/mes |
| Requests CloudFront | 100,000 | $0.12/mes (100K × $0.012/10K) |
| Transferencia CloudFront | 50 GB | $4.25/mes (50 × $0.085) |
| Origin fetches (CF→S3) | ~5,000 | $0.006/mes |
| **Total** | | **~.50/mes** |

#### Diferencia: **.16/mes de ahorro con CloudFront**

---

## 4. Tabla Resumen de Escenarios

| Escenario | Imágenes | Vistas/mes | S3 solo | S3+CF | Diferencia |
|-----------|----------|------------|---------|-------|------------|
| 1 (bajo) | 100 | 1,000 | $0 | $0 | $0 |
| 2 (medio) | 1,000 | 10,000 | $0 | $0 | $0 |
| 3 (alto) | 10,000 | 100,000 | $0.21 | $0.17 | -.04 |
| 4 (post-FT) | 10,000 | 100,000 | $4.66 | $4.50 | -.16 |
| 5 (muy alto) | 10,000 | 1M | $90 | $85 | - |

### Conclusión de costos
**CloudFront ahorra entre  y /mes dependiendo del volumen.** El ahorro es marginal para nuestro caso de uso.

---

## 5. ¿Cuándo tiene sentido usar CloudFront vs S3 directo?

### ✅ CloudFront tiene sentido cuando:
1. **Alto volumen de lecturas** (>1M requests/mes) — El ahorro en transferencia de datos se acumula
2. **Usuarios globales** — Edge locations reducen latencia significativamente
3. **URLs permanentes necesarias** — CloudFront genera URLs estáticas que no cambian
4. **HTTPS obligatorio** — CloudFront provee HTTPS gratis con certificado gestionado
5. **Protección del origen** — S3 no se expone directamente a Internet
6. **Free Tier disponible** — 1TB transferencia + 10M requests/mes es generoso

### ❌ CloudFront NO tiene sentido cuando:
1. **Volumen bajo** (<100K requests/mes) — S3 directo es suficiente y igual de barato
2. **Solo accesos internos** — Lambda a S3 dentro de AWS no necesita CDN
3. **Principiante en AWS** — Añade complejidad significativa (DNS, certificados, invalidaciones)
4. **URLs temporales aceptables** — Si URLs firmadas de S3 con expiración de 24h son suficientes
5. **Costo es prioridad absoluta** — CloudFront tiene costo después del Free Tier

---

## 6. Análisis de Complejidad

### Componentes adicionales necesarios

| Componente | Nivel | Descripción | Tiempo estimado |
|------------|-------|-------------|-----------------|
| **CloudFront Distribution** | Medio | Recurso CDK con configuración de origin, cache behavior, SSL | 2-3 horas |
| **Origin Access Identity (OAI)** | Medio | Permite que CloudFront acceda a S3 privado de forma segura | 30 min |
| **S3 Bucket Policy** | Fácil | Modificar bucket policy para permitir solo CloudFront | 15 min |
| **Certificado SSL** | Medio | ACM certificate en us-east-1 (requerido por CloudFront) | 30 min |
| **Dominio custom (opcional)** | Alto | Route53 + alias record + dominio propio | 1-2 horas |
| **Invalidación de caché** | Fácil | Para actualizar imágenes sin esperar TTL | 30 min |

### Cambios en CDK necesarios

`javascript
// Nuevo: infra/lib/ig-api-stack.js
import { Distribution, OriginAccessIdentity } from "aws-cdk-lib/aws-cloudfront";
import { S3Origin } from "aws-cdk-lib/aws-cloudfront-origins";

// 1. Crear OAI
const oai = new OriginAccessIdentity(this, ${id}-oai);

// 2. Crear Distribution
const distribution = new Distribution(this, ${id}-cdn, {
  defaultBehavior: {
    origin: new S3Origin(mediaBucket, { originAccessIdentity: oai }),
    viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
    cachePolicy: CachePolicy.CACHING_OPTIMIZED,
  },
});

// 3. Permitir acceso desde CloudFront a S3
mediaBucket.grantRead(oai);
`

### Cambios en código necesarios
**Ninguno.** CloudFront es transparente para el código de aplicación. Solo cambia la URL base que se devuelve al cliente.

### Tiempo total de implementación estimado
- **Sin dominio custom**: 3-4 horas
- **Con dominio custom**: 5-6 horas

---

## 7. Beneficios Adicionales de CloudFront

### 7.1 Performance (Latencia)
| Origen | Latencia típica (Europa) | Latencia típica (fuera de Europa) |
|--------|--------------------------|-----------------------------------|
| S3 directo (eu-west-1) | 50-100ms | 150-300ms |
| CloudFront (edge) | 5-20ms | 20-50ms |

**Mejora**: 5-10x más rápido para usuarios lejos de eu-west-1.

### 7.2 HTTPS Automático
- CloudFront provee certificado SSL **gratis** (*.cloudfront.net)
- No necesitas comprar ni gestionar certificados
- HTTPS obligatorio con redirect automático de HTTP→HTTPS

### 7.3 URLs Permanentes
- URLs de CloudFront no expiran (son estáticas)
- Formato: https://d111111abcdef8.cloudfront.net/media/{postId}/{timestamp}.jpg
- No necesitas generar URLs firmadas para cada request
- **Esto resuelve directamente el problema de URLs que expiran**

### 7.4 Seguridad Mejorada
- S3 bucket permanece **privado** (no accesible directamente)
- Solo CloudFront puede acceder a S3 (vía OAI o OAC)
- Protección contra acceso directo no autorizado

### 7.5 Free Tier Generoso
- **1 TB de transferencia/mes** (vs 100 GB de S3 directo)
- **10M requests/mes** (vs 20K de S3 directo)
- **Duración**: 12 meses desde creación de cuenta AWS

---

## 8. Análisis de Costo-Beneficio para Nuestro Caso

### Contexto del proyecto
- **Fase**: Educativa / desarrollo
- **Volumen estimado**: <1,000 posts con imágenes
- **Tráfico**: <10,000 vistas/mes
- **Usuarios**: Principalmente Europa (servidor en eu-west-1)
- **Experiencia AWS**: Principiante

### Matriz de decisión

| Factor | Peso | S3 directo | S3+CloudFront |
|--------|------|------------|---------------|
| **Costo (primer año)** | Alto | ✅ $0 | ✅ $0 (Free Tier) |
| **Costo (post-Free Tier)** | Alto | ⚠️ $4-5/mes | ⚠️ $4-5/mes (similar) |
| **Complejidad** | Alto | ✅ Baja | ❌ Media-alta |
| **URLs permanentes** | Medio | ❌ Expiran (firmadas) | ✅ Permanentes |
| **HTTPS** | Medio | ⚠️ Manual | ✅ Automático |
| **Performance** | Bajo | ✅ Suficiente | ✅ Mejor |
| **Seguridad** | Medio | ⚠️ S3 expuesto o URLs firmadas | ✅ S3 privado |
| **Curva de aprendizaje** | Alto | ✅ Simple | ❌ Complejo |

---

## 9. Recomendación Técnica

### Veredicto: **NO implementar CloudFront ahora — DEFERIR a futuro**

### Justificación

#### Razones para NO implementar ahora:

1. **El ahorro de costos es insignificante**
   - Para nuestro volumen (<10K vistas/mes), S3 y CloudFront cuestan lo mismo: $0
   - Incluso post-Free Tier, la diferencia es <.20/mes
   - No justifica la inversión de tiempo

2. **CloudFront añade complejidad significativa**
   - Requiere OAI/OAC, bucket policies, distribución, posiblemente certificado
   - Para un principiante en AWS, esto es una barrera de aprendizaje alta
   - El debugging de CloudFront (cache hits/misses, invalidaciones) es más complejo que S3

3. **S3 directo resuelve el problema actual**
   - URLs firmadas con expiración de 24h son suficientes para la mayoría de casos
   - Si la URL expira, se genera una nueva (Lambda puede hacerlo)
   - No necesitamos URLs "permanentemente válidas" en este momento

4. **El proyecto está en fase educativa**
   - Priorizar simplicidad y aprendizaje
   - docs/decisions.md L553: "DEFER S3 implementation until a concrete use case"
   - CloudFront es un paso más allá de S3

5. **S3 ya tiene Free Tier generoso**
   - 100 GB de transferencia/mes es suficiente para ~200,000 vistas de imágenes de 500KB
   - 20,000 GET requests/mes cubre nuestro volumen estimado

#### Cuándo SÍ implementar CloudFront:

1. **Después de implementar S3 primero** — S3 es prerequisito
2. **Cuando haya >50,000 vistas/mes** — El beneficio de caché se vuelve significativo
3. **Cuando haya usuarios fuera de Europa** — La latencia mejora notablemente
4. **Cuando se necesiten URLs permanentes** — URLs firmadas no son suficientes
5. **Cuando se requiera proteger S3** — S3 no debe estar público
6. **Cuando haya dominio propio** — cdn.midominio.com requiere CloudFront

---

## 10. Alternativas Intermedias (si se quiere algo más simple)

### Alternativa A: URLs firmadas de S3 (recomendada para ahora)
- **Costo**: $0 (dentro de Free Tier)
- **Complejidad**: Baja (solo código, sin CDK adicional)
- **Duración URL**: Configurable (1h, 24h, 7 días)
- **Desventaja**: URLs expiran (pero se pueden regenerar)

### Alternativa B: S3 con bucket público
- **Costo**: $0
- **Complejidad**: Muy baja
- **Ventaja**: URLs permanentes sin CloudFront
- **Desventaja**: ⚠️ **Seguridad** — Cualquiera puede acceder a las imágenes

### Alternativa C: Lambda proxy para imágenes
- **Costo**: $0 (dentro de Free Tier Lambda)
- **Complejidad**: Media
- **Ventaja**: S3 privado, control total
- **Desventaja**: Lambda consume recursos para cada imagen

### Alternativa D: CloudFront + S3 (futuro)
- **Costo**: $0 (Free Tier) → $4-5/mes después
- **Complejidad**: Media-alta
- **Ventaja**: URLs permanentes, HTTPS, seguridad, performance
- **Desventaja**: Más componentes que gestionar

---

## 11. Resumen Ejecutivo

| Pregunta | Respuesta |
|----------|-----------|
| ¿CloudFront ahorra dinero? | Marginalmente (-5/mes dependiendo del volumen) |
| ¿CloudFront es gratis? | ✅ Sí, durante 12 meses (Free Tier generoso) |
| ¿Reduce requests a S3? | ✅ Sí, 95-99% de cache hit ratio |
| ¿Mejora performance? | ✅ Sí, 5-10x más rápido globalmente |
| ¿Ofrece HTTPS? | ✅ Automático y gratis |
| ¿URLs permanentes? | ✅ No expiran |
| ¿Complejidad? | ❌ Media-alta (OAI, distribution, cache behavior) |
| ¿Tiempo implementación? | 3-6 horas |
| **¿Implementar ahora?** | **❌ NO — Deferir a futuro** |
| **¿Implementar cuándo?** | Después de S3, cuando haya >50K vistas/mes o necesidad de URLs permanentes |

### Recomendación final

**Para el proyecto actual (fase educativa, bajo volumen, principiante en AWS):**

1. **Primero**: Implementar S3 con URLs firmadas (Opción C del análisis previo)
2. **Después**: Evaluar si las URLs firmadas son suficientes
3. **Futuro**: Implementar CloudFront cuando haya necesidad concreta:
   - >50K vistas/mes
   - Usuarios fuera de Europa
   - Necesidad de URLs permanentes
   - Dominio propio para CDN

**CloudFront es una optimización, no una necesidad.** Para nuestro caso de uso actual, S3 directo con URLs firmadas es suficiente, más simple y igual de costo-efectivo.

---

## 12. Riesgos de implementar CloudFront ahora

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Configuración incorrecta de OAI | Media | Alto (S3 accesible públicamente) | Testing exhaustivo, seguir guías AWS |
| Cache no se invalida cuando se actualiza imagen | Baja | Medio (imágenes desactualizadas) | Usar versioned keys ({postId}/{timestamp}.jpg) |
| Costos inesperados por invalidaciones | Muy baja | Bajo | Usar versioned keys en lugar de invalidaciones |
| Certificado SSL expira | Muy baja | Alto (HTTPS falla) | ACM auto-renueva certificados |
| Debugging complejo | Alta | Medio | Documentar configuración, usar CloudFront logs |

---

## 13. Referencias

- [AWS CloudFront Pricing](https://aws.amazon.com/cloudfront/pricing/)
- [AWS S3 Pricing](https://aws.amazon.com/s3/pricing/)
- [AWS Free Tier - CloudFront](https://aws.amazon.com/free/?all-free-tier.sort-by=item.additionalFields.SortRank&all-free-tier.sort-order=asc&awsf.Free+Tier+Types=tier%2312-not-applicable)
- [CloudFront + S3 Best Practices](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistS3AndCustomOrigins.html)
- [Origin Access Control](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
