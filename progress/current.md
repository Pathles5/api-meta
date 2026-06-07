# Current Task

Feature en curso: FEAT-013 — API Documentation (OpenAPI fixes)

Plan:
- Fix POST /posts/verify response schema (wrap in summary + add results array)
- Fix Error schema (remove statusCode, add stack)
- Add thumbnailUrl and createdAt to Post schema
- Add timestamp to GET /health response
- Add WebhookPayload schema
- Add 429 to all endpoints, 502 to Meta API endpoints, 500 to POST /webhooks
- Add tags, examples, license info, complete server variables
