# Fix CI/CD: Node.js 24 → Node.js 22

## Summary

Corrected the GitHub Actions CI/CD workflow to use Node.js 22 instead of Node.js 24, aligning with the project's `package.json` engines field (`>=22.0.0`).

## Changes Made

### `.github/workflows/ci.yml` (3 changes)

| Line | Before | After |
|------|--------|-------|
| 10 | `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` | `FORCE_JAVASCRIPT_ACTIONS_TO_NODE22: true` |
| 23 | `node-version: "24"` (lint-and-test job) | `node-version: "22"` |
| 77 | `node-version: "24"` (deploy job) | `node-version: "22"` |

### `package.json` (no change needed)

- `engines.node` was already `">=22.0.0"` (previously fixed by an earlier Implementer).

## Verification

- `pnpm test`: 93/93 tests passed, 0 failures
- `pnpm lint`: clean, no errors

## Files NOT modified (per restrictions)

- `src/` — untouched
- `tests/` — untouched
- `infra/` — untouched
- `AGENTS.md`, `OPENCODE.md`, `PROJECT_CONTEXT.md` — untouched
