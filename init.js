#!/usr/bin/env node

// const fs = require('fs');
import fs from 'fs';
// const path = require('path');
import path from 'path';
// const { execSync } = require('child_process');
import { execSync } from 'child_process';

// Colores para terminal (funciona en Windows Terminal, VS Code y Hermes Agent)
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  section: (msg) => console.log(`\n${colors.cyan}═══════════════════════════════════════════════════${colors.reset}\n${colors.blue}🚀 ${msg}${colors.reset}\n${colors.cyan}═══════════════════════════════════════════════════${colors.reset}`)
};

let errors = 0;
let warnings = 0;

// ============================================================================
// 1. VALIDACIÓN DEL ENTORNO
// ============================================================================
log.section('1. Verificando entorno de ejecución...');

try {
  const nodeVersion = execSync('node -v', { encoding: 'utf8' }).trim();
  const majorVersion = parseInt(nodeVersion.replace('v', '').split('.')[0]);
  if (majorVersion >= 20) {
    log.success(`Node.js instalado: ${nodeVersion}`);
  } else {
    log.warn(`Se recomienda Node.js 22+. Versión actual: ${nodeVersion}`);
    warnings++;
  }
} catch (e) {
  log.error('Node.js no está instalado o no está en el PATH.');
  errors++;
}

try {
  const pnpmVersion = execSync('pnpm -v', { encoding: 'utf8' }).trim();
  log.success(`PNPM instalado: v${pnpmVersion}`);
} catch (e) {
  log.error('PNPM no está instalado. (Regla: No usar NPM/YARN). Ejecuta: corepack enable pnpm');
  errors++;
}

// ============================================================================
// 2. VALIDACIÓN DE ESTRUCTURA DE DIRECTORIOS
// ============================================================================
log.section('2. Verificando estructura de directorios...');
const requiredDirs = ['src', 'tests', 'docs', 'infra'];
const optionalDirs = ['.github', 'scripts', 'tools', 'progress', 'specs'];

[...requiredDirs, ...optionalDirs].forEach(dir => {
  if (fs.existsSync(dir)) {
    if (requiredDirs.includes(dir)) log.success(`Directorio encontrado: ${dir}/`);
    else log.info(`Directorio encontrado: ${dir}/`);
  } else {
    if (requiredDirs.includes(dir)) {
      log.error(`Faltante (Crítico): ${dir}/`);
      errors++;
    } else {
      log.warn(`Faltante (Opcional): ${dir}/`);
      warnings++;
    }
  }
});

// ============================================================================
// 3. VALIDACIÓN DE ARCHIVOS DE CONTEXTO Y HARNESS
// ============================================================================
log.section('3. Verificando archivos de contexto y reglas...');
const requiredFiles = [
  'OPENCODE.md', 'AGENTS.md', 'PROJECT_CONTEXT.md', 'README.md',
  'CHECKPOINTS.md', 'feature_list.json',
  'docs/conventions.md', 'docs/architecture.md', 'docs/verification.md',
  'progress/current.md', 'progress/history.md'
];

requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    log.success(`Encontrado: ${file}`);
  } else {
    log.error(`Faltante: ${file}`);
    errors++;
  }
});

// ============================================================================
// 4. VALIDACIÓN DE feature_list.json
// ============================================================================
log.section('4. Validando feature_list.json...');
if (fs.existsSync('feature_list.json')) {
  try {
    const rawData = fs.readFileSync('feature_list.json', 'utf8');
    const data = JSON.parse(rawData);
    log.success('feature_list.json es un JSON válido.');

    const validStatuses = data.valid_statuses || ['pending', 'in_progress', 'review', 'completed', 'blocked'];
    let inProgressCount = 0;
    let invalidStatusFound = false;

    if (Array.isArray(data.features)) {
      data.features.forEach(feature => {
        if (!validStatuses.includes(feature.status)) {
          log.error(`Feature ${feature.id} tiene un estado inválido: '${feature.status}'`);
          invalidStatusFound = true;
          errors++;
        }
        if (feature.status === 'in_progress') {
          inProgressCount++;
        }
      });
    }

    if (!invalidStatusFound) {
      log.success('Todos los estados de las features son válidos.');
    }

    if (inProgressCount > 2) {
      log.warn(`Límite WIP: Hay ${inProgressCount} tareas 'in_progress'. El límite recomendado es 1-2.`);
      warnings++;
    } else {
      log.success(`Límite WIP respetado (Tareas en progreso: ${inProgressCount}).`);
    }

  } catch (e) {
    log.error('feature_list.json no es un JSON válido o está corrupto.');
    errors++;
  }
} else {
  log.warn('feature_list.json no existe. Se omitió la validación.');
}

// ============================================================================
// 5. VALIDACIÓN DE DEPENDENCIAS Y TESTS
// ============================================================================
log.section('5. Verificando estado del proyecto Node.js...');
if (fs.existsSync('package.json')) {
  if (fs.existsSync('node_modules')) {
    log.success('node_modules presente.');
  } else {
    log.warn('node_modules no encontrado. Ejecuta "pnpm install" antes de continuar.');
    warnings++;
  }

  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    if (pkg.scripts && pkg.scripts.test) {
      log.info('Ejecutando tests rápidos... (esto puede tardar unos segundos)');
      try {
        execSync('pnpm run test', { encoding: 'utf8', stdio: 'pipe' });
        log.success('Tests pasaron correctamente.');
      } catch (e) {
        log.error('Los tests fallaron. Revisa la salida de "pnpm run test".');
        errors++;
      }
    } else {
      log.warn('No se encontró script "test" en package.json. Omitido.');
    }
  } catch (e) {
    log.error('No se pudo leer package.json.');
    errors++;
  }
} else {
  log.warn('package.json no encontrado. Omitiendo validación de dependencias.');
}

// ============================================================================
// 6. RESUMEN FINAL
// ============================================================================
log.section('Resumen Final');
if (errors === 0) {
  log.success('VALIDACIÓN EXITOSA: El proyecto está listo para Hermes Agent.');
  if (warnings > 0) {
    log.warn(`Se encontraron ${warnings} advertencia(s) no bloqueantes. Revísalas arriba.`);
  }
  log.info('💡 Sugerencia: Revisa progress/current.md para conocer la siguiente tarea.');
  process.exit(0);
} else {
  log.error(`VALIDACIÓN FALLIDA: Se encontraron ${errors} error(es) crítico(s).`);
  log.error('🛠️ Por favor, corrige los problemas antes de invocar al agente.');
  process.exit(1);
}