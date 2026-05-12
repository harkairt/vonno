# Quality Audit Report

**Project**: vonno (InnoChat) — TypeScript + Nuxt 4 + Vue 3 + TanStack Query + Pinia
**Date**: 2026-05-13
**quality-toolkit**: v0.1.1

## Session Summary

- **Applied**: 7/7 changes
- **Skipped**: 0 suggestions
- **Remaining**: 0 suggestions

## Updated Quality Gate Maturity: 45/90 → 5.0/10 (Solid)

Previous: 31/90 → 3.4/10 (Basic) — **+14 points**

| Dimension            | Previous | Current | Change | Status | Details                                                    |
|----------------------|----------|---------|--------|--------|------------------------------------------------------------|
| Linting              | 6/10     | 7/10    | +1     | ⚠️     | Added @tanstack/eslint-plugin-query, sonarjs rules, no-console always-on |
| Formatting           | 1/10     | 7/10    | +6     | ✅     | Prettier configured + eslint-config-prettier + lint-staged |
| Type checking        | 8/10     | 8/10    | —      | ✅     | strict: true, strictNullChecks, no-explicit-any error      |
| Complexity limits    | 5/10     | 8/10    | +3     | ✅     | Cognitive complexity (sonarjs), max-depth 4, max-params 4  |
| Duplication detection| 0/10     | 5/10    | +5     | ⚠️     | jscpd configured (threshold 5%, minLines 10, minTokens 50) |
| Test coverage gate   | 6/10     | 6/10    | —      | ⚠️     | Ratcheted thresholds (branches 76%, lines 41%). No CI enforcement |
| Pre-commit hooks     | 5/10     | 6/10    | +1     | ⚠️     | Husky + lint-staged now runs prettier --write + eslint --fix |
| CI quality gates     | 0/10     | 0/10    | —      | ❌     | No CI pipeline found                                       |
| Security scanning    | 0/10     | 3/10    | +3     | ⚠️     | npm audit script added (audit:security). No CI enforcement |

## Current Issues Snapshot

- **ESLint**: 106 errors, 275 warnings (381 total — was 249 before new rules)
- **New warnings from this session**: ~132 (sonarjs rules, no-console, max-depth, max-params)
- **Formatter**: Prettier configured but codebase not yet formatted (run `npx prettier --write .`)
- **Coverage**: Ratcheted thresholds (branches 76%, fns 52%, lines 41%, stmts 41%)
- **Duplication**: jscpd configured, not yet run
- **Security**: `npm run audit:security` available

## Test Pyramid

```
        /\
       /  \        E2E: 11 files, ~81 tests (Playwright, 3 browsers)
      /    \
     /------\
    /        \     Integration: 0 — gap
   /----------\
  /            \   Unit: 30 files, ~407 tests (Vitest + Testing Library + MSW)
 /--------------\
/                \ Static: ESLint (type-aware + sonarjs + tanstack-query) + TypeScript strict + Zod
------------------
```

| Layer       | Tool                    | Count     | Notes                          |
|-------------|-------------------------|-----------|--------------------------------|
| Static      | ESLint + TypeScript     | —         | Type-aware, sonarjs, query plugin |
| Unit        | Vitest + MSW            | ~407      | Stores, composables, components|
| Integration | —                       | 0         | Gap between unit and E2E       |
| E2E         | Playwright              | ~81       | 3 browser projects             |

## What Changed This Session

1. **Prettier** — `.prettierrc` + `eslint-config-prettier` + lint-staged integration
2. **@tanstack/eslint-plugin-query** — flat/recommended config for query-specific rules
3. **eslint-plugin-sonarjs** — cognitive-complexity, no-nested-conditional, slow-regex, etc. (all warn)
4. **jscpd** — `.jscpd.json` + `npm run duplication` script
5. **no-console** — now `warn` in all environments (was production-only)
6. **max-depth/max-params** — structural complexity guards (warn, threshold 4)
7. **npm audit** — `npm run audit:security` script

## Next Steps

1. Run `npx prettier --write .` as isolated "format codebase" commit
2. Run `quality-fix` to address 106 existing ESLint errors
3. Run `npm run duplication` to baseline duplication level
4. Set up CI pipeline (lint, typecheck, test, coverage, audit)
5. Run `quality-audit` again after fixing existing issues — next round: CI setup, pre-commit typecheck, secret scanning
