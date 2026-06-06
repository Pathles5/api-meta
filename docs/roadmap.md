# Roadmap - IG-API

## Visión General
API REST para integrar con Meta/Instagram, con persistencia en DynamoDB y despliegue serverless en AWS.

---

## Fase 0: Foundation ✅
**Estado**: Completado (Mayo 2026)
- Proyecto inicializado con PNPM, ESLint, estructura base
- CI/CD básico con GitHub Actions

---

## Fase 1: Basic REST API ✅
**Estado**: Completado (Mayo 2026)
- Express.js 5 con ESM
- Health check, error handling, validación
- Tests unitarios iniciales

---

## Fase 2: Meta API Integration ✅
**Estado**: Completado (Mayo 2026)
- Integración con Graph API v24.0
- Endpoints para listar y obtener posts
- Manejo de rate limits y errores
- Logger con pino

---

## Fase 3: Security ✅
**Estado**: Completado (Mayo 2026)
- API Key authentication
- Rate limiting configurable
- CORS y request logging

---

## Fase 4: Data Persistence ✅
**Estado**: Completado (Mayo 2026)
- DynamoDB on-demand
- Repository pattern con inyección de dependencias
- TTL para optimización de costos

---

## Fase 5: Post Management ✅
**Estado**: Completado (Mayo 2026)
- Verificación on-demand de posts
- Manejo de posts eliminados en Instagram
- Batch verification endpoint

---

## Fase 6: Infrastructure & Deployment ✅
**Estado**: Completado (Junio 2026)
- AWS CDK con Lambda + API Gateway
- GitHub Actions con OIDC (sin claves estáticas)
- CloudWatch alarms y throttling
- Security hardening completo

---

## Fase 7: Webhooks ✅
**Estado**: Completado (Junio 2026)
- Endpoint POST /webhooks con validación HMAC-SHA256
- Challenge-response para suscripción
- Procesador de eventos de Instagram
- 22 tests pasando

---

## Fase 8: Production Readiness ✅
**Estado**: Completado (Junio 2026)
- OpenAPI spec (`docs/openapi.yaml`)
- CloudWatch Dashboard con 6 widgets
- Análisis de costos (`docs/cost-analysis.md`)
- Pre-deploy health check en CI/CD
- Estrategia de entornos (dev, pre, int, pro)

---

## Futuro (No planificado)
- **S3 Multimedia Storage**: Almacenamiento persistente de imágenes/videos si el caso de uso lo requiere
- **GraphQL API**: Alternativa o complemento a REST
- **Admin Dashboard**: Interfaz para gestionar posts y ver métricas