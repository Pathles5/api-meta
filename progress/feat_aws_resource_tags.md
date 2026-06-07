# AWS Resource Tags — Billing Identification

**Fecha**: 2026-06-07
**Estado**: Completado
**Archivo modificado**: `infra/lib/ig-api-stack.js`

## Objetivo
Añadir tags a TODOS los recursos AWS en el CDK stack para identificarlos en el billing y evitar fugas de dinero/créditos.

## Cambios Realizados

### 1. Import añadido
```javascript
import { Duration, Stack, Tags } from "aws-cdk-lib";
```

### 2. Tags globales del stack (propagan a TODOS los recursos hijos)
```javascript
Tags.of(this).add("Stack", `ig-api-${environment}`);
Tags.of(this).add("Environment", environment);
Tags.of(this).add("Project", "IG-API");
Tags.of(this).add("ManagedBy", "CDK");
```

### 3. Tags específicos por recurso
| Recurso | Tag `Resource` | Tag `Name` |
|---------|---------------|------------|
| DynamoDB Table | `DynamoDB` | `ig-posts-{env}` |
| Lambda Function | `Lambda` | `ig-api-{env}-api` |
| API Gateway | `APIGateway` | `ig-api-{env}-api` |
| CloudWatch Dashboard | `CloudWatch` | `ig-api-{env}-monitoring` |

## Recursos que heredan los tags (verificado con `pnpm cdk synth`)

| Recurso AWS | Tags globales (4) | Tags específicos (2) |
|-------------|-------------------|---------------------|
| DynamoDB Table | ✅ | ✅ Resource + Name |
| Lambda Function | ✅ | ✅ Resource + Name |
| Lambda IAM Role | ✅ | ✅ (hereda de Lambda) |
| Lambda IAM Policy | ✅ | ✅ (hereda de Lambda) |
| API Gateway REST API | ✅ | ✅ Resource + Name |
| API Gateway IAM Role | ✅ | ✅ (hereda de APIGateway) |
| API Gateway Deployment | ✅ | ✅ (hereda de APIGateway) |
| API Gateway Stage | ✅ | ✅ (hereda de APIGateway) |
| CloudWatch Dashboard | ✅ | ✅ Resource + Name |
| CloudWatch Alarm (errors) | ✅ | — (solo globales) |
| CloudWatch Alarm (throttles) | ✅ | — (solo globales) |
| CloudWatch Log Group | ✅ | — (solo globales) |

## Verificación
- `pnpm cdk synth --no-staging` ejecutado correctamente
- Todos los tags aparecen en el template de CloudFormation generado
- Los 4 tags globales se propagan automáticamente a todos los recursos hijos
- Los tags específicos se aplican solo al recurso objetivo (y sus sub-recursos)

## Cómo funciona `Tags.of(scope)`
- `Tags.of(this)` aplica tags al stack completo → todos los recursos hijos los heredan
- `Tags.of(table)` aplica tags solo a la tabla DynamoDB (y sus sub-recursos si los tuviera)
- CDK propaga los tags automáticamente en el template de CloudFormation como `AWS::Tags`

## Impacto en costos
- **Costo de los tags**: $0 (los tags son gratuitos en AWS)
- **Beneficio**: Permite filtrar el billing por Stack, Environment, Project, Resource
- **Activación**: Los tags deben activarse en AWS Cost Explorer (AWS Console → Billing → Cost Allocation Tags)
