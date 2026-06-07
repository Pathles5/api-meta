# Notas de Tareas Futuras

**Fecha**: 2026-06-07
**Estado**: Planificación

---

## 1. S3 Multimedia Storage - Consideraciones importantes

### Problema detectado:
**Las URLs de imágenes de Instagram expiran después de ~1 hora**. Si necesitamos almacenar imágenes de forma persistente, debemos implementar S3.

### Decisiones pendientes:

#### Opción A: Guardar en S3
- **Ventajas**:
  - URLs persistentes (no expiran)
  - CDN integrado con CloudFront (opcional)
  - Escalabilidad ilimitada
  - Costo bajo en Free Tier (5GB gratis)
- **Desventajas**:
  - Complejidad adicional (permisos IAM, bucket policy)
  - Latencia adicional al subir/descargar
  - Costo después del Free Tier (.023/GB/mes)

#### Opción B: Guardar bytes en DynamoDB
- **Ventajas**:
  - Todo en un solo lugar (simplicidad)
  - Sin servicios adicionales
  - Menos puntos de fallo
- **Desventajas**:
  - Límite de DynamoDB: 400KB por item
  - Imágenes grandes no caben (típicamente 1-10MB)
  - Costo alto de almacenamiento en DynamoDB (.25/GB/mes vs .023/GB/mes en S3)
  - No se puede servir directamente vía HTTP (necesita API Gateway + Lambda)

#### Opción C: Híbrido (metadata en DynamoDB + bytes en S3)
- **Ventajas**:
  - URLs persistentes
  - Metadata rápida en DynamoDB
  - Escalabilidad
- **Desventajas**:
  - Complejidad de sincronización
  - Dos servicios que mantener

### Recomendación inicial:
**Opción A (S3)** es la más práctica para imágenes. Las URLs de IG expiran, así que si necesitamos persistencia, S3 es el estándar de la industria.

### Investigación necesaria:
- [x] ¿Cuánto duran las URLs de IG antes de expirar? → ~1 hora
- [x] ¿Qué tamaño típico tienen las imágenes de IG? → 200KB-10MB
- [x] ¿Necesitamos almacenar videos o solo imágenes? → Ambos
- [x] ¿Cuánto almacenamiento estimamos necesitar? → <1000 imágenes

### Conclusión investigación:
- **DynamoDB NO es viable** para imágenes (límite 400KB)
- **S3 es la opción recomendada** (Free Tier 5GB, bajo costo después)
- **CloudFront NO es necesario ahora** (ahorro insignificante, complejidad alta)
- **Implementar solo si hay caso de uso concreto** que requiera persistencia

---

## 2. Cobertura de Tests

### Estado actual:
- 93 tests pasando
- Cobertura: **94.03% líneas, 89.37% branches, 96.36% funciones**
- Configuración: ✅ Completada (FEAT-016)
- Umbral mínimo: 80% (configurado en CI/CD)

### Archivos con cobertura baja:
- ateLimit.js: 68.63% (falta tests de rate limiting activo)
- posts.js: 76.58% (falta tests de POST /posts/verify)

### Próximos pasos:
- [ ] Implementar 7-8 tests faltantes para alcanzar 95% cobertura
- [ ] Priorizar tests de ateLimit.js (mecanismo de seguridad)
- [ ] Tests de POST /posts/verify (endpoint completo sin cobertura)

### Nota sobre tiempos en tests:
**SÍ es buena práctica usar tiempos reducidos en tests**. Para ateLimit.js:
- Usar windowMs=100ms en lugar de 60000ms (1 minuto)
- Usar max=2 en lugar de 100 requests
- Esto acelera los tests de minutos a milisegundos
- Es una técnica estándar llamada "parameterized configuration"

---

## 3. Entornos int y pro

### Estado:
- **Branches**: int y pro no creadas
- **Stacks CDK**: ig-api-int y ig-api-pro no configurados
- **Prioridad**: BAJA

### Análisis:
Al ser un **proyecto educativo**, probablemente **no necesitaremos** los entornos int y pro. El flujo actual es:
- dev: Desarrollo local (sin AWS)
- pre: Pre-producción (AWS) — usado para testing

### Recomendación:
**No implementar int/pro a menos que haya una necesidad concreta**. El costo de mantener múltiples entornos (aunque sea bajo en Free Tier) no justifica la complejidad adicional para un proyecto educativo.

### Si en el futuro se necesita:
1. Crear branch int desde pre
2. Crear branch pro desde int
3. Configurar stacks CDK ig-api-int y ig-api-pro
4. Actualizar .github/workflows/ci.yml para incluir triggers para int/pro
5. Configurar webhooks en Meta para Developers apuntando a int/pro

---

## 4. Integración con Meta App

### Estado:
- **Configuración de Meta App**: En progreso (usuario configurando)
- **Webhooks**: Implementados y funcionando (22 tests pasando)
- **Endpoint**: POST /webhooks con validación HMAC-SHA256

### Próximos pasos:
- [ ] Usuario configura Meta App para enviar webhooks a nuestro endpoint
- [ ] Verificar que los webhooks llegan correctamente
- [ ] Validar que la firma HMAC-SHA256 se verifica correctamente
- [ ] Procesar eventos de Instagram (publications, notifications)
- [ ] Ajustar lógica de procesamiento según eventos reales recibidos

### URLs de webhook para Meta:
- **pre**: https://0kp591p5k7.execute-api.eu-west-1.amazonaws.com/pre/webhooks
- **int**: (pendiente de crear)
- **pro**: (pendiente de crear)

### Variables de entorno necesarias en Meta App:
- META_APP_ID: ID de la app de Meta
- META_APP_SECRET: Secret de la app (para validar firma HMAC-SHA256)
- META_VERIFY_TOKEN: Token personalizado para verificar suscripción de webhook

---

## 5. Próximos pasos generales

### Prioridad alta:
1. Completar integración con Meta App (cuando usuario termine configuración)
2. Implementar tests faltantes para alcanzar 95% cobertura

### Prioridad media:
3. Evaluar si necesitamos S3 (depende de caso de uso real)
4. Probar webhooks en producción con datos reales

### Prioridad baja:
5. Crear entornos int/pro (solo si hay necesidad concreta)
6. Implementar CloudFront (solo si hay >50K vistas/mes)

---

## Notas adicionales

- El usuario es principiante en AWS, así que cualquier decisión de S3/CloudFront debe explicarse en detalle
- Priorizar Free Tier siempre
- Mantener la simplicidad sobre la optimización prematura
- Proyecto educativo: priorizar aprendizaje sobre producción
