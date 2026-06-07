# Arquitectura e Infraestructura (AWS)

## Principios Rectores
1. **Serverless First**: Priorizar Lambda, API Gateway, DynamoDB, S3. Evitar EC2 o servicios gestionados costosos.
2. **Costo Cero**: Diseñar siempre dentro de los límites de AWS Free Tier.
3. **Menor Privilegio**: Las políticas de IAM deben ser lo más restrictivas posible.
4. **Simplicidad**: El usuario es principiante en AWS CDK. La infraestructura debe ser fácil de leer, entender y explicar.

## Reglas de AWS CDK
- **Región**: `eu-west-1` (Irlanda).
- **Convención de Nombres**: Usar `IG-API` o `IG_API` (dependiendo de las restricciones de caracteres del recurso).
- **Explicación**: Cada nuevo recurso o patrón de CDK introducido debe ser explicado en detalle en el chat y documentado en `docs/decisions.md`.

## Seguridad y CI/CD (GitHub)
- **Repositorio**: GitHub es la fuente de verdad del código.
- **CI/CD**: GitHub Actions para pruebas y despliegue.
- **Secretos**: NUNCA hardcodear credenciales, tokens o identificadores sensibles. Usar exclusivamente GitHub Secrets y AWS Secrets Manager / Parameter Store.

## Sistema de Monitoreo y Alarmas

### CloudWatch Alarms (6 alarmas)

| Alarma | Métrica | Threshold | Periodo | Evaluación |
|--------|---------|-----------|---------|------------|
| `lambda-errors` | Lambda Errors | ≥ 1 | 5 min | 1 periodo |
| `lambda-throttles` | Lambda Throttles | ≥ 1 | 5 min | 1 periodo |
| `lambda-duration` | Lambda Duration p95 | ≥ 5s | 5 min | 2 periodos |
| `api-5xx-errors` | API Gateway 5XX | ≥ 10 | 5 min | 1 periodo |
| `api-latency` | API Gateway Latency p95 | ≥ 1s | 5 min | 2 periodos |
| `dynamodb-read-throttle` | DynamoDB ThrottledRequests (GetItem) | > 0 | 5 min | 1 periodo |

### SNS Notifications

- **Topic**: `ig-api-{environment}-alarm-topic`
- **Suscripción**: Email (configurable via `ALARM_EMAIL`)
- **Comportamiento**: Todas las alarmas notifican tanto en estado `ALARM` como en `OK` (resolución)
- **Costo**: $0/mes (dentro del Free Tier de SNS: 1,000 emails/mes)

### AWS Budgets (Configuración Manual)

- **Nombre del budget**: `ig-api-cost-alert`
- **Tipo**: Fixed (presupuesto fijo mensual)
- **Monto**: 3€ (equivalente en USD según tipo de cambio)
- **Periodo**: Mensual (se reinicia cada mes)
- **Alerta**: Se dispara cuando el gasto real alcanza 100% del presupuesto (3€)
- **Notificación**: Email via SNS Topic `ig-api-pre-alarm-topic`
- **Configuración**: Manual en AWS Console → Billing → Budgets
- **Costo**: Gratis (2 presupuestos gratuitos en Free Tier)

**Nota**: Este budget monitorea el costo global de toda la cuenta AWS, no solo del proyecto IG-API.

### CloudWatch Dashboard

- **Nombre**: `ig-api-{environment}-monitoring`
- **Widgets**: Invocaciones, Duración (p95), Errores, Throttles (Lambda), 4XX, 5XX (API Gateway)