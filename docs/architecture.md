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