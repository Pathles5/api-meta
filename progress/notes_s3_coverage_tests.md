# Notas de Tareas Futuras

**Fecha**: 2026-06-07
**Estado**: Planificación

---

## 1. S3 Multimedia Storage - Consideraciones importantes

### Problema detectado:
**Las URLs de imágenes de Instagram expiran**. Si necesitamos almacenar imágenes de forma persistente, debemos implementar S3.

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
- [ ] ¿Cuánto duran las URLs de IG antes de expirar?
- [ ] ¿Qué tamaño típico tienen las imágenes de IG?
- [ ] ¿Necesitamos almacenar videos o solo imágenes?
- [ ] ¿Cuánto almacenamiento estimamos necesitar?

---

## 2. Cobertura de Tests

### Estado actual:
- 93 tests pasando
- Cobertura: **Desconocida** (no está configurada)

### Tareas:
- [ ] Investigar si tenemos cobertura configurada
- [ ] Si no está configurada, añadir herramienta de cobertura
- [ ] Definir umbral mínimo de cobertura (sugerido: 80%)
- [ ] Integrar cobertura en CI/CD
- [ ] Generar reportes de cobertura

### Herramientas a evaluar:
- **c8**: Nativo de Node.js, soporta ESM, rápido
- **istanbul/nyc**: Clásico, pero puede tener problemas con ESM
- **jest --coverage**: Si usamos Jest (no es el caso, usamos Node test runner)

### Recomendación inicial:
**c8** es la mejor opción porque:
- Nativo de Node.js (sin dependencias externas)
- Soporta ESM nativamente
- Rápido y ligero
- Integración sencilla con Node test runner

---

## 3. Próximos pasos

### Prioridad alta:
1. Investigar cobertura de tests (Explorer)
2. Investigar S3 vs DynamoDB bytes (Explorer)

### Prioridad media:
3. Implementar cobertura de tests si no existe
4. Decidir estrategia de almacenamiento de imágenes

### Prioridad baja:
5. Implementar S3 si se decide necesario
6. Crear entornos int y pro

---

## Notas adicionales

- El usuario es principiante en AWS, así que cualquier decisión de S3 debe explicarse en detalle
- Priorizar Free Tier siempre
- Mantener la simplicidad sobre la optimización prematura
