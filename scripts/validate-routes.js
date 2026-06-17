#!/usr/bin/env node
/**
 * scripts/validate-routes.js
 * Compares Express routes against OpenAPI spec paths.
 * Reports mismatches and exits with code 1 if any are found.
 *
 * Runs without external dependencies — uses only Node.js built-ins.
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── 1. Extract Express routes from source ────────────────────────────

function getExpressRoutes() {
  const routesDir = join(ROOT, "src", "routes");
  const rawApp = readFileSync(join(ROOT, "src", "app.js"), "utf8");
  // Normalize Windows line endings
  const appCode = rawApp.replace(/\r\n/g, "\n");

  // Map router variable → mount prefix (e.g., postsRouter → "/posts")
  const prefixByVar = new Map();
  const lines = appCode.split("\n");
  for (const line of lines) {
    // Prefixed mount: app.use("/prefix", ..., routerName)
    const prefixed = line.match(
      /app\.use\(\s*["']([^"']+)["'].*?(\w+Router)\)/,
    );
    if (prefixed) {
      prefixByVar.set(prefixed[2], prefixed[1]);
      continue;
    }
    // Root mount: app.use(routerName) — no prefix
    const rootMounted = line.match(/app\.use\((\w+Router)\)/);
    if (rootMounted) {
      prefixByVar.set(rootMounted[1], "");
    }
  }

  // Map router variable → route file basename (e.g., postsRouter → "posts")
  const fileByVar = new Map();
  const importPattern =
    /import\s+\{\s*(\w+Router)\s*\}\s+from\s+["']\.\/routes\/(\w+)\.js["']/g;
  let im;
  while ((im = importPattern.exec(appCode)) !== null) {
    fileByVar.set(im[1], im[2]);
  }

  const routes = [];
  const methodRegex =
    /\w+\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/g;

  for (const [routerVar, fileBase] of fileByVar) {
    // Skip docs routes — they serve Swagger UI, not the API itself
    if (fileBase === "docs") continue;

    const prefix = prefixByVar.get(routerVar) || "";
    const filePath = join(routesDir, `${fileBase}.js`);

    let code;
    try {
      code = readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
    } catch {
      console.warn(`⚠️  Could not read route file: ${filePath}`);
      continue;
    }

    let m;
    while ((m = methodRegex.exec(code)) !== null) {
      const method = m[1].toUpperCase();
      let path = prefix + m[2];

      // Convert Express :param to OpenAPI {param}
      path = path.replace(/:(\w+)/g, "{$1}");

      // Normalize trailing slash (e.g., "/posts/" → "/posts")
      if (path !== "/" && path.endsWith("/")) {
        path = path.slice(0, -1);
      }

      routes.push(`${method} ${path}`);
    }
  }

  return routes;
}

// ── 2. Extract paths + methods from OpenAPI YAML ─────────────────────

function getOpenApiRoutes() {
  const raw = readFileSync(join(ROOT, "docs", "openapi.yaml"), "utf8");
  // Normalize Windows line endings
  const content = raw.replace(/\r\n/g, "\n");
  const lines = content.split("\n");
  const routes = [];

  let inPaths = false;
  let currentPath = null;

  for (const line of lines) {
    // Detect start of paths section
    if (line === "paths:") {
      inPaths = true;
      continue;
    }
    if (!inPaths) continue;

    // Detect end of paths section (next top-level key)
    if (/^[a-z]/.test(line) && !line.startsWith("  ")) {
      break;
    }

    // Path entries at 2-space indentation
    const pathMatch = line.match(/^  (\/[\w\-/{}.]+):$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }

    // HTTP methods at 4-space indentation under current path
    if (currentPath && line.match(/^    (get|post|put|delete|patch):$/)) {
      const method = line.trim().replace(":", "").toUpperCase();
      routes.push(`${method} ${currentPath}`);
    }
  }

  return routes;
}

// ── 3. Compare and report ─────────────────────────────────────────────

function compare() {
  const expressRoutes = getExpressRoutes();
  const openApiRoutes = getOpenApiRoutes();

  const expressSet = new Set(expressRoutes);
  const openApiSet = new Set(openApiRoutes);

  const missingInSpec = [...expressSet]
    .filter((r) => !openApiSet.has(r))
    .sort();
  const extraInSpec = [...openApiSet]
    .filter((r) => !expressSet.has(r))
    .sort();

  console.log("=== Express Routes (from source) ===");
  if (expressRoutes.length === 0) {
    console.log("  (none found)");
  } else {
    [...expressSet].sort().forEach((r) => console.log(`  ${r}`));
  }

  console.log("\n=== OpenAPI Spec Paths (from docs/openapi.yaml) ===");
  if (openApiRoutes.length === 0) {
    console.log("  (none found)");
  } else {
    [...openApiSet].sort().forEach((r) => console.log(`  ${r}`));
  }

  let exitCode = 0;

  if (missingInSpec.length > 0) {
    console.log(
      "\n❌ ROUTES IN CODE BUT MISSING FROM OpenAPI SPEC:"
    );
    missingInSpec.forEach((r) =>
      console.log(`  - ${r}  (add to docs/openapi.yaml paths section)`)
    );
    exitCode = 1;
  }

  if (extraInSpec.length > 0) {
    console.log(
      "\n⚠️  ROUTES IN OpenAPI SPEC BUT NOT IN CODE (dead docs?):"
    );
    extraInSpec.forEach((r) => console.log(`  - ${r}`));
    exitCode = 1;
  }

  if (exitCode === 0) {
    console.log("\n✅ All Express routes match OpenAPI spec paths.");
  } else {
    const total = missingInSpec.length + extraInSpec.length;
    console.log(`\n🔴 ${total} mismatch(es) found.`);
  }

  return exitCode;
}

process.exit(compare());
