# FEAT-0111: Lambda NodejsFunction Migration

## Summary
Migrated Lambda packaging from manual `Code.fromAsset('dist/')` to `NodejsFunction` with integrated esbuild bundling.

## Changes Made

### 1. `infra/lib/ig-api-stack.js`
- Replaced `Function` + `Code.fromAsset()` with `NodejsFunction` from `aws-cdk-lib/aws-lambda-nodejs`
- Added esbuild bundling config: `minify: true`, `sourceMap: false`, `target: "node22"`, `externalModules: ["@aws-sdk/*"]`
- Entry point: `lambda.js` (resolved via `import.meta.dirname`)
- Handler changed from `"lambda.handler"` to `"handler"` (NodejsFunction bundles to `index.js`)
- Preserved: runtime (NODEJS_22_X), architecture (ARM_64), memory (256MB), timeout (30s), all environment variables
- All IAM, DynamoDB, API Gateway, CloudWatch resources unchanged

### 2. `.github/workflows/ci.yml`
- Removed "Build production bundle" step (mkdir dist, cp files, pnpm install --prod)
- CDK deploy now handles bundling automatically via esbuild during synth

### 3. `package.json`
- Moved `aws-cdk-lib` and `constructs` from `dependencies` to `devDependencies` (only needed at synth time)
- Added `esbuild: ^0.25.0` to `devDependencies`

## Results
| Metric | Before | After |
|--------|--------|-------|
| Bundle size | ~12MB | 884.5kb |
| CI steps | Manual build + copy | CDK auto-bundle |
| Build tooling | pnpm install --prod in dist/ | esbuild (integrated) |

## Verification
- `pnpm test`: 93/93 tests passing
- `pnpm lint`: Clean (no errors)
- `pnpm cdk synth --no-staging`: Stack synthesizes successfully, bundle produced at 884.5kb
