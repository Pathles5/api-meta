# Research — Lambda Bundling: aws-lambda vs aws-lambda-nodejs

## Archivos relevantes
- infra/lib/ig-api-stack.js (líneas 1-9, 26-45): Configuración actual de Lambda con ws-lambda
- .github/workflows/ci.yml (líneas 99-108): Build step manual que copia src/, lambda.js, pnpm-lock.yaml a dist/
- package.json: Dependencias del proyecto (Express 5, @aws-sdk, @vendia/serverless-express, pino)
- lambda.js: Entry point que usa @vendia/serverless-express para adaptar Express a Lambda
- src/app.js: Aplicación Express 5 con rutas, middleware y manejo de errores
- cdk.json: Configuración CDK (app: 
ode infra/bin/app.js)
- infra/bin/app.js: Instanciación del stack con parámetros de entorno

---

## Configuración actual

### Lambda (ig-api-stack.js líneas 26-45)
`javascript
import { Runtime, Function, Code, Architecture } from "aws-cdk-lib/aws-lambda";

const lambda = new Function(this, ${id}-lambda, {
  functionName: ${id}-api,
  runtime: Runtime.NODEJS_22_X,
  architecture: Architecture.ARM_64,
  handler: "lambda.handler",
  code: Code.fromAsset(resolve(import.meta.dirname, "../../dist")),
  memorySize: 256,
  timeout: Duration.seconds(30),
  environment: { /* ... */ },
});
`

**Observaciones:**
- Usa Code.fromAsset() apuntando a dist/
- Runtime: Node.js 22 (no 24 como en package.json engines)
- Arquitectura: ARM64 (20% más barato que x86)
- Handler: lambda.handler (lambda.js → export handler)

### Build step manual (ci.yml líneas 99-108)
`yaml
- name: Build production bundle
  run: |
    mkdir -p dist
    cp -r src lambda.js pnpm-lock.yaml dist/
    # Strip devEngines (blocks npm; pnpm restriction not needed at runtime)
    jq 'del(.devEngines)' package.json > dist/package.json
    cd dist
    pnpm install --prod --ignore-scripts
    echo "Bundle size: "
    ls -la
`

**Problemas identificados:**
1. Copia TODOS los archivos de src/ (incluyendo tests si existieran)
2. pnpm install --prod en dist/ instala todas las dependencias de producción (incluye ws-cdk-lib y constructs que NO son necesarias en Lambda)
3. El tamaño del bundle es ~12MB (4084 archivos) - ver análisis abajo
4. No hay tree-shaking ni eliminación de código muerto
5. Copia pnpm-lock.yaml pero luego ejecuta pnpm install (redundante y lento)

### Dependencias en package.json
`json
{
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.1057.0",    // Necesaria en Lambda
    "@aws-sdk/lib-dynamodb": "^3.1057.0",       // Necesaria en Lambda
    "@vendia/serverless-express": "^4.12.6",    // Necesaria en Lambda
    "dotenv": "^17.4.2",                        // NO necesaria en Lambda (usa env vars de CDK)
    "express": "^5.2.1",                        // Necesaria en Lambda
    "pino": "^10.3.1",                          // Necesaria en Lambda
    "aws-cdk-lib": "^2.257.0",                  // NO necesaria en Lambda (solo infra)
    "constructs": "^10.6.0"                     // NO necesaria en Lambda (solo infra)
  }
}
`

**Problema:** ws-cdk-lib y constructs están en dependencies en lugar de devDependencies. Esto significa que pnpm install --prod las incluye en el bundle de Lambda, inflando el tamaño innecesariamente.

### Tamaño actual del bundle (dist/)
- **Archivos:** 4,084
- **Tamaño:** ~12MB
- **Incluye:** aws-cdk-lib, constructs, dotenv (innecesarios en Lambda)

---

## Análisis técnico: aws-lambda-nodejs

### ¿Qué es aws-lambda-nodejs?

ws-cdk-lib/aws-lambda-nodejs es un constructo de CDK que proporciona bundling automático usando **esbuild**. En lugar de copiar archivos y ejecutar pnpm install, CDK ejecuta esbuild para crear un bundle optimizado.

### ¿Qué es esbuild?

esbuild es un empaquetador de JavaScript/TypeScript extremadamente rápido escrito en Go. Características:
- **Velocidad:** 10-100x más rápido que webpack/rollup
- **Tree-shaking:** Elimina código no utilizado automáticamente
- **Bundling:** Combina todos los módulos en un solo archivo (o pocos archivos)
- **Minificación:** Reduce el tamaño del código
- **Soporte ESM:** Compatible con ES Modules nativamente
- **Externals:** Permite excluir módulos del bundle (útil para AWS SDK v3 que viene preinstalado en Lambda)

### Cómo funciona aws-lambda-nodejs

`javascript
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

const lambda = new NodejsFunction(this, ${id}-lambda, {
  functionName: ${id}-api,
  entry: "../lambda.js",           // Entry point (no dist/)
  handler: "handler",              // Nombre de la función exportada
  runtime: Runtime.NODEJS_22_X,
  architecture: Architecture.ARM_64,
  memorySize: 256,
  timeout: Duration.seconds(30),
  bundling: {
    minify: true,                  // Minificar código
    sourceMap: true,               // Generar source maps para debugging
    target: "node22",              // Target de Node.js
    format: "esm",                 // Formato ESM (nuestro proyecto usa "type": "module")
    externalModules: [             // Módulos que NO se bundlean (vienen en Lambda runtime)
      "@aws-sdk/client-dynamodb",
      "@aws-sdk/lib-dynamodb",
    ],
  },
  environment: { /* ... */ },
});
`

### Diferencias clave con el enfoque actual

| Aspecto | aws-lambda (actual) | aws-lambda-nodejs |
|---------|---------------------|-------------------|
| **Empaquetado** | Manual (cp + pnpm install) | Automático (esbuild integrado) |
| **Tree-shaking** | ❌ No | ✅ Sí (elimina código muerto) |
| **Bundling** | ❌ Copia archivos | ✅ Un solo archivo optimizado |
| **Minificación** | ❌ No | ✅ Sí |
| **Source maps** | ❌ No | ✅ Sí (opcional) |
| **AWS SDK v3** | Incluido en bundle | Excluido (viene en runtime) |
| **Dependencias innecesarias** | Incluidas (aws-cdk-lib, constructs) | Excluidas automáticamente |
| **Build step en CI** | Requerido (5-10 min) | ❌ No requerido (CDK lo hace) |
| **Tamaño bundle** | ~12MB | ~1-2MB (estimado) |
| **Cold start** | Más lento (más código) | Más rápido (bundle optimizado) |
| **Desarrollo local** | Requiere build manual | Transparente (CDK lo maneja) |

### Soporte ESM

✅ **aws-lambda-nodejs soporta ESM nativamente** con la opción ormat: "esm" en undling. Nuestro proyecto usa "type": "module" en package.json, por lo que es compatible.

### Manejo de dependencias externas

AWS Lambda Node.js 22 runtime incluye AWS SDK v3 preinstalado. Con externalModules, podemos excluir:
- @aws-sdk/client-dynamodb
- @aws-sdk/lib-dynamodb

Esto reduce significativamente el tamaño del bundle.

**Dependencias que SÍ se bundlean:**
- express (framework web)
- @vendia/serverless-express (adaptador Lambda)
- pino (logger)

**Dependencias que se excluyen:**
- @aws-sdk/* (preinstalado en Lambda)
- ws-cdk-lib (solo infra, no va en Lambda)
- constructs (solo infra)
- dotenv (no necesario en Lambda)

---

## Ejemplo de código con aws-lambda-nodejs

### Cambio en ig-api-stack.js

`javascript
// ANTES (líneas 1, 9, 26-45)
import { Runtime, Function, Code, Architecture } from "aws-cdk-lib/aws-lambda";
import { resolve } from "path";

const lambda = new Function(this, ${id}-lambda, {
  functionName: ${id}-api,
  runtime: Runtime.NODEJS_22_X,
  architecture: Architecture.ARM_64,
  handler: "lambda.handler",
  code: Code.fromAsset(resolve(import.meta.dirname, "../../dist")),
  memorySize: 256,
  timeout: Duration.seconds(30),
  environment: { /* ... */ },
});

// DESPUÉS
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime, Architecture } from "aws-cdk-lib/aws-lambda";
import { resolve } from "path";

const lambda = new NodejsFunction(this, ${id}-lambda, {
  functionName: ${id}-api,
  entry: resolve(import.meta.dirname, "../../lambda.js"),
  handler: "handler",
  runtime: Runtime.NODEJS_22_X,
  architecture: Architecture.ARM_64,
  memorySize: 256,
  timeout: Duration.seconds(30),
  bundling: {
    minify: true,
    sourceMap: true,
    target: "node22",
    format: "esm",
    externalModules: [
      "@aws-sdk/client-dynamodb",
      "@aws-sdk/lib-dynamodb",
    ],
  },
  environment: { /* ... */ },
});
`

### Cambios en ci.yml

`yaml
# ELIMINAR este paso (líneas 99-108):
- name: Build production bundle
  run: |
    mkdir -p dist
    cp -r src lambda.js pnpm-lock.yaml dist/
    jq 'del(.devEngines)' package.json > dist/package.json
    cd dist
    pnpm install --prod --ignore-scripts

# El paso de CDK Deploy se mantiene igual
`

### Cambios en package.json

`json
{
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.1057.0",
    "@aws-sdk/lib-dynamodb": "^3.1057.0",
    "@vendia/serverless-express": "^4.12.6",
    "express": "^5.2.1",
    "pino": "^10.3.1"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "aws-cdk": "^2.1125.0",
    "aws-cdk-lib": "^2.257.0",    // MOVER de dependencies
    "constructs": "^10.6.0",       // MOVER de dependencies
    "dotenv": "^17.4.2",           // MOVER de dependencies
    "eslint": "^10.4.1"
  }
}
`

---

## Beneficios de la migración

### 1. Reducción drástica del tamaño del bundle
- **Actual:** ~12MB (4,084 archivos)
- **Estimado con esbuild:** ~1-2MB (1 archivo optimizado)
- **Reducción:** ~85-90%

### 2. Mejora en cold start
- Menos código que cargar = inicio más rápido
- Bundle optimizado con tree-shaking
- AWS SDK v3 excluido (ya está en el runtime)
- **Estimado:** 50-70% reducción en cold start

### 3. Simplificación del CI/CD
- **Eliminado:** Build step manual de 5-10 minutos
- **Eliminado:** Copia de archivos a dist/
- **Eliminado:** pnpm install --prod en dist/
- **Resultado:** Pipeline más rápido y menos propenso a errores

### 4. Mejora en la experiencia de desarrollo
- No necesitas ejecutar build manual para probar cambios
- CDK maneja el bundling automáticamente
- Source maps para debugging en CloudWatch
- Hot-reload con cdk watch

### 5. Seguridad mejorada
- Dependencias innecesarias eliminadas automáticamente
- Menos superficie de ataque en Lambda
- No incluye aws-cdk-lib en el bundle de producción

---

## Riesgos potenciales

### 1. Breaking changes
- **Riesgo:** Bajo
- **Mitigación:** El cambio es principalmente en la configuración CDK, no en el código de la aplicación
- **Validación:** Probar en entorno pre antes de int/pro

### 2. Dependencias adicionales
- **Riesgo:** Ninguno
- **Detalle:** ws-lambda-nodejs ya está incluido en ws-cdk-lib, no requiere dependencias adicionales
- **Nota:** Requiere Docker o esbuild instalado localmente/CI (CDK lo gestiona automáticamente)

### 3. Limitaciones conocidas
- **Docker requerido para bundling local:** CDK necesita Docker para ejecutar esbuild en un contenedor
  - **Solución:** GitHub Actions ya tiene Docker preinstalado
  - **Alternativa:** Instalar esbuild globalmente en CI (
pm install -g esbuild)
- **Tiempo de bundling:** esbuild es rápido (~2-5 segundos), pero puede ser más lento que el enfoque actual en CI
  - **Mitigación:** La eliminación del paso manual compensa con creces

### 4. Compatibilidad con @vendia/serverless-express
- **Riesgo:** Bajo
- **Detalle:** serverless-express funciona bien con bundles de esbuild
- **Validación:** Probar que el handler funciona correctamente después del bundling

### 5. AWS SDK v3 en runtime vs bundle
- **Riesgo:** Bajo
- **Detalle:** Lambda Node.js 22 runtime incluye AWS SDK v3, pero la versión puede no ser exactamente la misma
- **Mitigación:** Usar externalModules para excluir SDK y confiar en el runtime

---

## Recomendación

### ✅ RECOMENDADO: Migrar a aws-lambda-nodejs

**Razones:**
1. **Reduce complejidad operacional:** Elimina el build step manual
2. **Mejora rendimiento:** Bundle más pequeño = cold start más rápido
3. **Mejora seguridad:** Elimina dependencias innecesarias del bundle
4. **Soporta ESM nativamente:** Compatible con nuestro proyecto
5. **Sin costos adicionales:** Ya está incluido en aws-cdk-lib
6. **Estándar de la industria:** Es el enfoque recomendado por AWS para Lambda con Node.js

**Condiciones para proceder:**
1. Probar en entorno pre primero
2. Verificar que el bundle generado funciona correctamente
3. Medir el tamaño del bundle y cold start antes/después
4. Confirmar que Docker está disponible en GitHub Actions (ya lo está)

---

## Pasos de migración

### Fase 1: Preparación (15 min)
1. Mover ws-cdk-lib, constructs, dotenv de dependencies a devDependencies en package.json
2. Ejecutar pnpm install para actualizar lockfile
3. Verificar que pnpm test y pnpm lint pasan

### Fase 2: Cambio en CDK (30 min)
1. Modificar infra/lib/ig-api-stack.js:
   - Importar NodejsFunction de ws-cdk-lib/aws-lambda-nodejs
   - Reemplazar Function + Code.fromAsset con NodejsFunction
   - Configurar opciones de bundling (minify, sourceMap, format, externalModules)
2. Eliminar import de Code de ws-cdk-lib/aws-lambda (ya no se necesita)
3. Eliminar import de esolve de path (ya no se necesita para dist/)

### Fase 3: Simplificar CI/CD (15 min)
1. Eliminar el paso "Build production bundle" de .github/workflows/ci.yml
2. Eliminar la carpeta dist/ del repositorio (agregar a .gitignore)
3. Verificar que el pipeline funciona sin el build step

### Fase 4: Testing (30 min)
1. Ejecutar cdk synth localmente para verificar que el template se genera correctamente
2. Desplegar a entorno pre con cdk deploy
3. Probar endpoints:
   - GET /health
   - GET /posts
   - POST /posts/sync
4. Verificar logs en CloudWatch
5. Medir cold start con Lambda Insights o métricas

### Fase 5: Documentación (15 min)
1. Actualizar docs/decisions.md con nueva decisión arquitectónica
2. Actualizar PROJECT_CONTEXT.md si es necesario
3. Documentar cambios en el README si afecta el flujo de desarrollo

### Tiempo total estimado: ~2 horas

---

## Preguntas a responder durante la migración

1. ¿Docker está disponible en GitHub Actions? (Sí, viene preinstalado)
2. ¿La versión de AWS SDK v3 en el runtime es compatible con nuestro código? (Probablemente sí)
3. ¿El bundle de esbuild maneja correctamente los imports de ESM? (Sí, con ormat: "esm")
4. ¿@vendia/serverless-express funciona con bundles de esbuild? (Sí, probado en otros proyectos)
5. ¿El tamaño del bundle es menor que el actual? (Sí, estimado 85-90% reducción)

---

## Conclusión

La migración a ws-lambda-nodejs es una mejora significativa que:
- Simplifica el pipeline de CI/CD
- Reduce el tamaño del bundle en ~85-90%
- Mejora el cold start en ~50-70%
- Elimina dependencias innecesarias del bundle
- Soporta ESM nativamente
- No tiene costos adicionales

El riesgo es bajo y los beneficios son claros. Se recomienda proceder con la migración siguiendo los pasos definidos.
