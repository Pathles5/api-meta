# AWS Cost Analysis — IG-API

## Resumen

Todos los recursos están dentro del **AWS Free Tier** para uso moderado.

| Servicio | Free Tier | Uso estimado | Costo |
|----------|-----------|--------------|-------|
| Lambda | 1M requests/mes + 400,000 GB-seconds | < 100K requests | **$0** |
| API Gateway | 1M requests/mes | < 100K requests | **$0** |
| DynamoDB | 25 GB storage + 25 WCU/25 RCU | < 1 GB | **$0** |
| CloudWatch | 10 métricas + 5 alarms + 3 dashboards | 9 métricas + 6 alarms + 1 dashboard | **$0.10** (1 alarma excede Free Tier) |
| CloudWatch Logs | 5 GB ingestión + 5 GB storage | < 1 GB | **$0** |
| SNS | 1,000 email notifications/mes | < 100 (solo alarmas) | **$0** |

**Total mensual estimado: $0** (dentro de Free Tier)

---

## Detalle por servicio

### AWS Lambda

**Free Tier:**
- 1,000,000 requests/mes
- 400,000 GB-seconds de cómputo
- 1 GB de almacenamiento de código

**Configuración actual:**
- Memoria: 256 MB
- Timeout: 30 segundos
- Bundle size: ~12 MB

**Uso estimado:**
- Requests: < 100,000/mes (10% del Free Tier)
- Duración promedio: ~500ms
- GB-seconds: 256 MB × 0.5s × 100,000 = 12,800 GB-seconds (3% del Free Tier)

**Costo si excede Free Tier:**
- $0.20 por 1M requests
- $0.0000166667 por GB-second

### API Gateway (REST API)

**Free Tier:**
- 1,000,000 requests/mes

**Configuración actual:**
- Regional endpoint
- Throttling: 100 req/s rate, 200 burst

**Uso estimado:**
- Requests: < 100,000/mes (10% del Free Tier)

**Costo si excede Free Tier:**
- $3.50 por 1M requests (primeros 300M)

### DynamoDB

**Free Tier:**
- 25 GB de almacenamiento
- 25 WCU (Write Capacity Units) provisionadas
- 25 RCU (Read Capacity Units) provisionadas

**Configuración actual:**
- Billing mode: PAY_PER_REQUEST (on-demand)
- TTL habilitado (posts expiran a 30 días)

**Uso estimado:**
- Storage: < 1 GB (4% del Free Tier)
- WCU/RCU: On-demand pricing, pero dentro de límites Free Tier para uso moderado

**Costo si excede Free Tier:**
- $0.25 por GB-mes de almacenamiento
- $1.25 por WCU-mes
- $0.25 por RCU-mes
- On-demand: $1.25 por millón de writes, $0.25 por millón de reads

### CloudWatch

**Free Tier:**
- 10 métricas custom
- 5 alarms
- 3 dashboards
- 5 GB de logs (ingestión + storage)

**Configuración actual:**
- Métricas: 9 (Lambda: Invocations, Duration, Errors, Throttles + API Gateway: 4XX, 5XX, Latency + DynamoDB: ThrottledRequests)
- Alarms: 6 (Lambda: errors, throttles, duration + API: 5XX, latency + DynamoDB: read throttles)
- Dashboards: 1 (ig-api-monitoring)

**Nota:** 6 alarms excede el Free Tier de 5 por 1 alarma → **$0.10/mes** extra.

**Uso estimado:**
- Métricas: 9/10 (90% del Free Tier)
- Alarms: 6/5 (120% del Free Tier — 1 alarma cuesta $0.10/mes)
- Dashboards: 1/3 (33% del Free Tier)

**Costo si excede Free Tier:**
- $0.30 por métrica/mes
- $0.10 por alarma/mes
- $3.00 por dashboard/mes

### CloudWatch Logs

**Free Tier:**
- 5 GB de ingestión
- 5 GB de almacenamiento

**Configuración actual:**
- API Gateway access logs: INFO level
- Lambda logs: Pino logger (APP_LOG_LEVEL=info)

**Uso estimado:**
- Ingestión: < 1 GB/mes (20% del Free Tier)
- Storage: < 1 GB (20% del Free Tier)

**Costo si excede Free Tier:**
- $0.50 por GB de ingestión
- $0.03 por GB de almacenamiento

### Amazon SNS

**Free Tier:**
- 1,000,000 publishes/mes
- 1,000 email notifications/mes

**Configuración actual:**
- 1 SNS Topic (`ig-api-${environment}-alarm-topic`)
- 1 suscripción de email (antonio.lopez.sarmiento@gmail.com)
- Uso: solo notificaciones de alarma (eventos raros)

**Uso estimado:**
- Publicaciones: < 100/mes (solo cuando se disparan alarmas)
- Notificaciones email: < 100/mes
- Ambos muy por debajo del Free Tier

**Costo si excede Free Tier:**
- $0.50 por 1M publishes
- $2.00 por 100,000 email notifications

---

## Escenarios de costo

### Escenario 1: Uso normal (< 100K requests/mes)
**Costo: $0/mes** — Todo dentro de Free Tier

### Escenario 2: Uso moderado (500K requests/mes)
**Costo: $0/mes** — Aún dentro de Free Tier

### Escenario 3: Uso alto (2M requests/mes)
**Costo estimado: ~$5/mes**
- Lambda: $0.20 (1M requests extra)
- API Gateway: $3.50 (1M requests extra)
- DynamoDB: $0 (storage aún bajo)
- CloudWatch: $0 (métricas sin cambio)

### Escenario 4: Uso muy alto (10M requests/mes)
**Costo estimado: ~$35/mes**
- Lambda: $1.80 (9M requests extra)
- API Gateway: $31.50 (9M requests extra)
- DynamoDB: $2-5 (más storage + WCU/RCU)
- CloudWatch: $0 (métricas sin cambio)

---

## Recomendaciones

1. **Monitorear uso mensual** — Revisar AWS Cost Explorer cada mes
2. **Configurar budget alerts** — Crear alerta en AWS Budgets para > $1/mes
3. **Optimizar Lambda** — Si duración > 1s, considerar reducir memoria o optimizar código
4. **DynamoDB TTL** — Ya configurado, posts expiran automáticamente a 30 días
5. **API Gateway caching** — Si uso crece, considerar habilitar caching para reducir llamadas a Lambda

---

## Recursos adicionales

- [AWS Free Tier](https://aws.amazon.com/free/)
- [AWS Pricing Calculator](https://calculator.aws/)
- [AWS Cost Explorer](https://console.aws.amazon.com/cost-management/home)
