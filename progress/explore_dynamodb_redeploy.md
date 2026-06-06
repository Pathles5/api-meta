# Research - DynamoDB Table Behavior on CDK Redeploy

## Pregunta de investigacion
Que pasa con la tabla DynamoDB `ig-posts` cuando CDK redespliega el stack `ig-api`?

---

## Archivos relevantes

| Archivo | Lineas | Contenido clave |
|---------|--------|-----------------|
| `infra/lib/ig-api-stack.js` | 19-24 | Definicion de la tabla `Table` construct |
| `infra/bin/app.js` | 15 | tableName default: `ig-posts` |
| `cdk.json` | 1-19 | Configuracion del proyecto CDK |
| `.github/workflows/ci.yml` | 125 | `cdk deploy --require-approval never` |
| `package.json` | 49 | `aws-cdk-lib: ^2.257.0` |

## Contexto de la tabla

```javascript
// infra/lib/ig-api-stack.js:19-24
const table = new Table(this, `\-posts-table`, {
  tableName,                                    // "ig-posts" (default)
  billingMode: BillingMode.PAY_PER_REQUEST,
  partitionKey: { name: "id", type: AttributeType.STRING },
  timeToLiveAttribute: "expiresAt",
});
```

**Observaciones:**
- `tableName` es `"ig-posts"` por defecto (hardcoded en `infra/bin/app.js:15`)
- No se especifica `removalPolicy`
- No se usa `Table.fromTableName()` ni `Table.fromTableArn()`

---

## Respuestas a las preguntas

### 1. CDK intenta crear la tabla cada vez que se ejecuta `cdk deploy`?

**No.** CDK no "intenta crear" recursos ciegamente. El flujo es:

1. CDK genera un template CloudFormation (`cdk synth`)
2. CloudFormation compara el template con el estado actual del stack
3. Si el recurso ya existe **en el estado de CloudFormation** -> lo actualiza si hay cambios de propiedades
4. Si el recurso no existe en el template pero si en CloudFormation -> lo elimina (si `removalPolicy` lo permite)

**Conclusion:** CDK solo actua sobre recursos que CloudFormation conoce. Si la tabla ya existe en CloudFormation y no cambio su definicion, `cdk deploy` no hace nada con ella.

### 2. Que pasa si la tabla ya existe en AWS pero NO en el estado de CloudFormation?

**Escenario:** La tabla `ig-posts` fue creada manualmente en AWS Console o con AWS CLI, fuera de CDK.

**Resultado:** CloudFormation intentara crear una tabla con `tableName: "ig-posts"`. DynamoDB rechazara la creacion porque ya existe una tabla con ese nombre. **El deploy falla con un error similar a:**

`
Resource handler returned message: "Table already exists: ig-posts" (Service: DynamoDB, Status Code: 400)
`

**Solucion:** Importar la tabla existente al stack de CloudFormation (ver pregunta 5).

### 3. Que pasa si la tabla existe en CloudFormation pero fue borrada manualmente de AWS?

**Escenario:** La tabla `ig-posts` esta en el estado de CloudFormation como recurso gestionado, pero fue eliminada manualmente desde AWS Console o CLI.

**Resultado:** CloudFormation entra en estado `UPDATE_ROLLBACK_FAILED` o `DELETE_FAILED` porque intenta operar sobre un recurso que ya no existe. Esto puede bloquear todo el stack.

**Solucion:** Usar `aws cloudformation continue-update-rollback` con `--resources-to-skip` para saltar el recurso faltante, o eliminar el stack completo y recrearlo.

**Nota importante:** Este es exactamente el escenario que ocurrio en una sesion anterior, donde el usuario borro manualmente la tabla para desbloquear un deploy. Esto puede haber dejado al stack en un estado inconsistente.

### 4. La propiedad `removalPolicy` afecta el comportamiento? Cual es el default?

**Si, afecta significativamente.** La propiedad `removalPolicy` controla que hace CloudFormation cuando se elimina un recurso del template o se destruye el stack.

**Valores posibles:**

| Valor | Comportamiento |
|-------|----------------|
| `RemovalPolicy.DESTROY` | Elimina el recurso cuando se destruye el stack |
| `RemovalPolicy.RETAIN` | Mantiene el recurso aunque se destruya el stack |
| `RemovalPolicy.SNAPSHOT` | Crea snapshot antes de eliminar (solo para recursos que lo soportan) |

**Default para `Table` en CDK:**

El valor por defecto es **`RemovalPolicy.RETAIN`**. Esto significa que:
- Si ejecutas `cdk destroy`, la tabla NO se elimina
- La tabla permanece en AWS aunque el stack desaparezca
- Para eliminarla, hay que hacerlo manualmente o cambiar a `DESTROY`

**En nuestro codigo (`ig-api-stack.js:19-24`):**
```javascript
const table = new Table(this, `\-posts-table`, {
  tableName,
  billingMode: BillingMode.PAY_PER_REQUEST,
  partitionKey: { name: "id", type: AttributeType.STRING },
  timeToLiveAttribute: "expiresAt",
  // NO se especifica removalPolicy -> default es RETAIN
});
```

**Implicacion:** Si alguien ejecuta `cdk destroy` y luego `cdk deploy`, la tabla seguira existiendo con sus datos intactos. Esto es generalmente lo deseado para tablas con datos importantes.

### 5. Hay alguna forma de hacer que CDK importe una tabla existente?

**Si, hay dos metodos:**

#### Metodo A: `cdk import` (recomendado)

CDK tiene un comando `cdk import` que permite importar recursos existentes al stack de CloudFormation sin recrearlos.

**Pasos:**
1. Agregar el recurso al template CDK (ya esta hecho)
2. Ejecutar `cdk import` (o `cdk deploy --import`)
3. CDK preguntara a que recurso fisico debe mapear el recurso logico
4. El recurso queda gestionado por CloudFormation sin interrupcion

**Limitacion:** El recurso importado debe tener las mismas propiedades que la definicion en CDK. Si hay diferencias, CDK intentara actualizarlas.

#### Metodo B: `Table.fromTableName()` (referencia externa)

Si no se quiere que CDK gestione la tabla, se puede usar `Table.fromTableName()`:

```javascript
const table = Table.fromTableName(this, `\-posts-table`, tableName);
```

**Diferencias con `new Table()`:**

| Aspecto | `new Table()` | `Table.fromTableName()` |
|---------|-----------------|---------------------------|
| CDK gestiona el recurso | Si | No |
| CDK puede modificar | Si | No (read-only reference) |
| CDK puede eliminar | Segun removalPolicy | Nunca |
| Grants (grantReadWriteData) | Funciona | Funciona |
| Definicion de esquema | Requerida | No necesaria |

**Para nuestro caso:** Si la tabla ya existe y queremos que CDK la gestione, usar `cdk import`. Si queremos simplemente referenciar una tabla existente sin gestionarla, usar `fromTableName()`.

---

## Estado actual del stack y riesgos

### Analisis del codigo actual

1. **`removalPolicy` no esta definido** -> usa default `RETAIN` (seguro para datos)
2. **`tableName` esta hardcoded** como `"ig-posts"` -> conflicto si la tabla existe fuera de CloudFormation
3. **El stack usa `--require-approval never`** en CI (`ci.yml:125`) -> no hay aprobacion manual para cambios destructivos
4. **No hay `DeletionProtection`** habilitado en la tabla

### Escenarios de riesgo

| Escenario | Resultado | Severidad |
|-----------|-----------|-----------|
| Deploy limpio (no existe tabla) | Crea tabla nueva | N/A |
| Redeploy (tabla en CloudFormation, sin cambios) | No hace nada | N/A |
| Redeploy (tabla en CloudFormation, con cambios) | Puede intentar recrear segun el cambio | Media |
| Deploy con tabla existente fuera de CloudFormation | Error: "Table already exists" | Alta |
| Tabla en CloudFormation pero borrada manualmente | Stack bloqueado | Critica |

### Recomendaciones de investigacion (NO son propuestas)

1. Verificar el estado actual de CloudFormation para el stack `ig-api`
2. Verificar si la tabla `ig-posts` existe en DynamoDB y quien la creo
3. Considerar agregar `removalPolicy: RemovalPolicy.RETAIN` explicitamente para documentar la intencion
4. Considerar `pointInTimeRecovery: true` para backups automaticos
5. Evaluar si `cdk import` es necesario para reconciliar estado

---

## Comandos utiles para diagnostico

`ash
# Verificar estado del stack en CloudFormation
aws cloudformation describe-stacks --stack-name ig-api --region eu-west-1

# Verificar si la tabla existe en DynamoDB
aws dynamodb describe-table --table-name ig-posts --region eu-west-1

# Ver recursos gestionados por el stack
aws cloudformation list-stack-resources --stack-name ig-api --region eu-west-1

# Ver drift (diferencia entre CloudFormation y realidad)
aws cloudformation detect-stack-drift --stack-name ig-api --region eu-west-1
`

---

## Dependencias relevantes

- `aws-cdk-lib`: ^2.257.0 (CDK v2, soporta `cdk import`)
- `constructs`: ^10.6.0
- `aws-cdk`: ^2.1125.0 (CLI)

## Patrones observados

- CDK v2 con ESM imports (`import { Table } from "aws-cdk-lib/aws-dynamodb"`)
- Factory pattern para Lambda y repositorio
- Stack define todos los recursos en un solo archivo (`ig-api-stack.js`)
- No hay separacion de stacks (app, data, monitoring)
- Variables de entorno pasadas desde GitHub Secrets a Lambda via CDK

---

## Brechas identificadas

1. **Sin `removalPolicy` explicito** - depende del default implicito de CDK
2. **Sin `DeletionProtection`** - la tabla puede ser eliminada accidentalmente
3. **Sin `pointInTimeRecovery`** - no hay backups automaticos de DynamoDB
4. **Sin `cdk import` documentado** - no hay proceso para reconciliar recursos existentes
5. **Sin `stackName` explicito en CDK** - usa el construct ID (`ig-api`) que puede cambiar
6. **`--require-approval never` en CI** - permite cambios destructivos sin aprobacion manual

## Riesgos potenciales

- Si el stack esta en estado inconsistente (recurso en CloudFormation pero borrado de AWS), cualquier operacion de CDK puede fallar
- Cambiar `tableName` en el codigo sin migrar datos puede causar perdida de datos
- Ejecutar `cdk destroy` accidentalmente no borra la tabla (por default RETAIN) pero si borra Lambda, API Gateway, y alarms