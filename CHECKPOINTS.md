# CHECKPOINTS — Evaluación del estado final

> En sistemas multi-agente no se evalúa el camino, se evalúa el destino.
> Estos son los checkpoints objetivos que el Agente Revisor (o un humano) 
> debe usar para decidir si el proyecto está sano y la sesión puede cerrarse.

## C1 — El arnés está completo
- [ ] Existen los archivos base: `OPENCODE.md`, `AGENTS.md`, `init.js`, `feature_list.json`, `progress/current.md`.
- [ ] Existen los docs de reglas: `docs/architecture.md`, `docs/conventions.md`, `docs/verification.md`.
- [ ] Existen los perfiles de Hermes: `leader`, `explorer`, `implementer`, `reviewer`, `devops`, `documentation`.
- [ ] El comando `node init.js` termina con exit code 0 (sin errores críticos).

## C2 — El estado es coherente
- [ ] Hay como máximo 1 o 2 features en estado `in_progress` en `feature_list.json`.
- [ ] Toda feature marcada como `completed` o `done` tiene tests asociados que pasan.
- [ ] `progress/current.md` está limpio: describe la sesión activa o está vacío (no contiene basura de sesiones anteriores).

## C3 — El código respeta la arquitectura y el stack
- [ ] `src/` solo contiene los módulos previstos y respeta la separación de capas (rutas, servicios, repositorios).
- [ ] **No hay dependencias innecesarias** añadidas a `package.json` sin justificación (se prefiere Node.js nativo).
- [ ] **No hay `console.log` o `console.error` sueltos** para debug (se debe usar el logger `pino`).
- [ ] **No hay rutas absolutas** (ej: `/src/...`), solo rutas relativas.
- [ ] **No hay secretos hardcodeados** (API keys, tokens, ARNs) en el código.

## C4 — La verificación es real y ejecutable
- [ ] El directorio `tests/` tiene al menos un test por módulo nuevo o modificado en `src/`.
- [ ] Los tests utilizan el patrón de **Inyección de Dependencias** (Factories) para mockear repositorios o APIs externas, evitando mocks frágiles del sistema de archivos o módulos.
- [ ] El comando `pnpm test` muestra > 0 tests ejecutados y todos en verde.
- [ ] *(Si aplica)* Cambios en `infra/` validados: sintaxis JS correcta y `cdk synth` se ejecutará en CI/CD (no se ejecuta cdk desde local).
- [ ] **Cobertura de tests obligatoria**: Cada tarea de desarrollo (feature, evolución, fix) tiene una tarea de test dependiente en kanban. Verificar con `hermes kanban list` que las tareas de implementer tienen tareas de test enlazadas (parents/children).

## C5 — La sesión se cerró correctamente
- [ ] No hay archivos sin trackear sospechosos en git (ej: `.env` real, `*.tmp`, `cdk.out` si está en `.gitignore`).
- [ ] `progress/history.md` tiene una nueva entrada al final resumiendo la sesión actual.
- [ ] La última feature trabajada tiene su estado actualizado correctamente en `feature_list.json` (`completed`, `blocked` o `in_progress`).
- [ ] **No hay tareas en triage sin revisar**: El Leader debe validar todas las tareas en estado `triage` antes de cerrar la sesión. Promover a `todo` o descartar con justificación.
- [ ] **No hay tareas circulares**: Verificar con `hermes kanban list` que no existen dependencias circulares (A → B → A).
- [ ] **Leader validó completitud estratégica**: Antes de cerrar, el Leader revisó que no falten docs, infra, tests o features relacionadas.

---

**Instrucción para el Agente Revisor:**
Recorre cada checkbox. Marca `[x]` si se cumple o `[ ]` si falla. 
Si queda algún box vacío en C1-C4, el veredicto es **CHANGES_REQUESTED**. 
Solo si todo está en `[x]` el veredicto puede ser **APPROVED**.