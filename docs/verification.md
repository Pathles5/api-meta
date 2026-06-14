# Verificación — Cómo demostrar que el trabajo funciona

> **Regla de oro**: El agente no dice "funciona", **lo demuestra**. 
> Toda feature termina con evidencia ejecutable, no con afirmaciones.

## Niveles de verificación

### Nivel 1 — Tests Unitarios (Obligatorio)
Toda función pública o método de repositorio en `src/` debe tener al menos un test en el directorio `tests/` que:
1. Cubra el **camino feliz** (happy path).
2. Cubra al menos **un camino de error** (ej: Meta API devuelve 404, DynamoDB falla, validación de schema rechazada).

**Comando de ejecución**:
```bash
pnpm test
# o equivalentemente: node --test tests/**/*.test.js
```
### Nivel 2 — Tests de Integración de API (Obligatorio para nuevas rutas)
Las features que añaden o modifican endpoints REST (src/routes/) deben verificarse probando la aplicación Express real (no solo la función aislada), inyectando dependencias mockeadas (ej: repositorio de DynamoDB o cliente de Meta API).

**Ejemplo de patrón esperado:**

```javascript
import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import request from 'supertest'; // O la librería de testing HTTP que se use
import { createApp } from '../src/app.js';
import { createPostRepository } from '../src/repositories/postRepository.js';

describe('GET /posts/:id', () => {
  it('debe retornar 404 si el post no existe en Meta API', async () => {
    const mockRepo = { getPost: mock.fn(() => null) };
    const app = createApp(mockRepo);
    const response = await request(app).get('/posts/123').set('X-API-Key', 'test-key');
    
    assert.strictEqual(response.status, 404);
    assert.strictEqual(response.body.error, 'Post not found');
  });
});
```
## Nivel 3 — Validación de Infraestructura (Obligatorio para cambios en infra/)

Los cambios en infraestructura (directorio `infra/`) se validan automáticamente en CI/CD mediante GitHub Actions. **NO se ejecutan comandos CDK desde local.**

**Flujo de validación:**
1. El agente escribe/modifica archivos en `infra/` siguiendo las convenciones del proyecto
2. Verifica que la sintaxis JS es correcta (lint, imports, etc.)
3. Hace commit y push → GitHub Actions ejecuta `cdk synth` y `cdk deploy` automáticamente
4. Si el deploy falla, el agente revisa los logs del workflow y corrige

**⚠️ Regla estricta:**
- ❌ NUNCA ejecutar `pnpm cdk synth`, `pnpm cdk deploy`, `pnpm cdk diff`, `pnpm cdk destroy` desde local
- ✅ La infraestructura se despliega EXCLUSIVAMENTE desde el workflow de GitHub Actions
- ✅ El agente solo necesita asegurar que el código en `infra/` sea sintácticamente correcto

**Comandos permitidos desde local:**
```bash
# Solo validación de sintaxis y lint (NO cdk)
pnpm lint
node -c infra/lib/ig-api-stack.js
```

## Anti-patrones (NO HACER)
- ❌ "He añadido el endpoint, debería funcionar." → Falta test ejecutable que lo demuestre.
- ❌ Test que solo verifica que no lanza excepción (assert.doesNotThrow). → Debe comprobar el resultado concreto (status code, forma del JSON, campos específicos).
- ❌ Mockear el sistema de archivos o módulos de forma frágil. → Usa el patrón de Inyección de Dependencias (Factory) definido en docs/decisions.md para inyectar mocks limpios.
- ❌ Usar rutas absolutas (/src/...) en los imports de los tests.
- ❌ Marcar la feature como done sin pasar ./init.js.

## Verificación final antes de cerrar
El **Implementer** y el **Reviewer** DEBEN ejecutar este comando como último paso:
```bash
./init.js           # debe terminar con [OK] Entorno listo
```

**Reglas estrictas de salida:**
1. Si `./init.js` termina en **VERDE** (`[OK]` o `✅ VALIDACIÓN EXITOSA`): El trabajo está listo para ser marcado como done.
2. Si `./init.js` termina en **ROJO** (`[FALLÓ]` o `❌ VALIDACIÓN FALLIDA`): **NO** marques nada como done.
* Detén la ejecución.
* Anota el motivo del fallo en progress/current.md.
* Cambia el estado de la feature en feature_list.json a blocked.
* Informa al Líder.
