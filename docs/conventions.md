# Convenciones de Desarrollo (JavaScript / Node.js)

## Stack Tecnológico
- **Runtime**: Node.js 24
- **Package Manager**: PNPM (Nunca usar NPM o YARN)
- **Lenguaje**: JavaScript (con JSDoc estricto para tipado) o TypeScript (si el agente lo sugiere y justifica para CDK).

## Reglas de Código
1. **Funciones**: Mantenerlas pequeñas y con una única responsabilidad (SRP).
2. **Documentación**: Agregar JSDoc útil en funciones y módulos. No agregar comentarios redundantes que expliquen lo obvio.
3. **Pruebas**: TODOS los archivos de prueba deben ubicarse exclusivamente en el directorio `tests/`.
4. **Dependencias**: Evitar dependencias innecesarias. Favorecer módulos nativos de Node.js.

## Estructura de Directorios (Estricta)
```text
/
├── src/            # Lógica de la aplicación
├── tests/          # Pruebas unitarias y de integración
├── docs/           # Documentación del proyecto (SDD, decisiones, convenciones)
├── infra/          # Código de infraestructura (AWS CDK)
├── scripts/        # Scripts de utilidad (ej: init.js, despliegues)
├── tools/          # Herramientas de desarrollo locales
└── .github/        # Workflows de CI/CD y templates
```