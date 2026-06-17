# Current Task

Feature en curso: t_b708a536 — Implementar endpoint de Swagger UI

## Plan
- Instalar swagger-ui-express + swagger-jsdoc
- Crear src/config/swagger.js con definición OpenAPI y config de jsdoc
- Crear src/routes/docs.js con endpoint /docs (UI) y /docs/json (spec)
- Anotar rutas existentes (health, posts, webhooks) con JSDoc OpenAPI
- Registrar router docs en app.js
- Escribir tests en tests/docs.test.js
- Verificar con pnpm test y node init.js
