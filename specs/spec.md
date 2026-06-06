# Spec: [Nombre de la Feature]
- **ID**: FEAT-XXX
- **Estado**: `draft` | `approved` | `in_progress` | `completed` | `deprecated`
- **Agente Líder Asignado**: [Nombre/Rol]
- **Fecha de última actualización**: YYYY-MM-DD

## 1. Contexto y Objetivo
- **Problema**: [¿Qué problema resuelve esto?]
- **Objetivo**: [¿Qué debe lograr el sistema al finalizar?]
- **Out of Scope (Fuera del alcance)**: [Lista explícita de lo que NO se hará en esta iteración para evitar que el agente se desvíe].

## 2. Requisitos Funcionales (RF)
*Lista numerada y atómica. El Reviewer Agent usará esto como checklist.*
- **RF-01**: El sistema debe permitir [acción] cuando [condición].
- **RF-02**: El sistema debe validar [dato] y retornar [error específico] si falla.

## 3. Requisitos No Funcionales (RNF)
- **RNF-01 (Rendimiento)**: La respuesta de la API debe ser < 200ms en el p95.
- **RNF-02 (Seguridad)**: Las contraseñas deben hashearse con bcrypt (costo 12).
- **RNF-03 (Testing)**: Cobertura mínima del 85% en los archivos modificados.

## 4. Diseño Técnico y Contratos
### 4.1. Cambios en la Arquitectura
- [ ] Crear nuevo módulo en `/src/modules/[nombre]`
- [ ] Actualizar esquema de base de datos (ver 4.2)

### 4.2. Modelo de Datos / Schema
```typescript
// Ejemplo de contrato explícito para el Implementer
interface User {
  id: string; // UUID v4
  email: string; // Validado con regex estándar
  passwordHash: string; // Nunca exponer en respuestas API
  createdAt: Date;
}