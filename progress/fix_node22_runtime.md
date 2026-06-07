# Fix: Lambda Runtime Node.js 24 -> Node.js 22

## Summary

Aligned `package.json` engines field with the actual Lambda runtime (Node.js 22).

## Changes Made

### 1. `package.json` (line 35)
- **Before**: `"node": ">=24.0.0"`
- **After**: `"node": ">=22.0.0"`

### 2. `infra/lib/ig-api-stack.js` (line 28)
- **No change needed** — already set to `Runtime.NODEJS_22_X`

## Verification

- `pnpm test`: 93/93 tests pass (0 failures)
- `pnpm lint`: clean (no errors)

## Notes

- The CDK stack was already using `Runtime.NODEJS_22_X`; only `package.json` had a stale `>=24.0.0` engine constraint.
- No changes to `src/`, `tests/`, `.github/workflows/`, `AGENTS.md`, `OPENCODE.md`, or `PROJECT_CONTEXT.md`.
- Documentation files (`README.md`, `docs/conventions.md`) still reference "Node.js 24" — these should be updated by the Documentation Agent.
