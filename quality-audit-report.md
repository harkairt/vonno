# Quality Audit Report

**Project**: vonno (InnoChat) — TypeScript + Nuxt 4 + Vue 3 + TanStack Query + Pinia
**Date**: 2026-05-16
**quality-toolkit**: v0.1.1

## Session Summary

- **Applied**: 5/8 changes
- **Skipped**: 2 suggestions (CI parallelization, CI coverage gate)
- **Remaining**: 0 suggestions
- **TODOs**: Enable GitHub push protection (Settings → Code security)

## Progress Since Last Audit

**Last audit**: 2026-05-13
**Score change**: 45/90 → 59/90 (+14)

| Dimension             | Previous | Current | Change |
|-----------------------|----------|---------|--------|
| Linting               | 7/10     | 9/10    | +2     |
| Formatting            | 7/10     | 8/10    | +1     |
| Type checking         | 8/10     | 8/10    | —      |
| Complexity limits     | 8/10     | 8/10    | —      |
| Duplication detection | 5/10     | 7/10    | +2     |
| Test coverage gate    | 6/10     | 6/10    | —      |
| Pre-commit hooks      | 6/10     | 6/10    | —      |
| CI quality gates      | 0/10     | 5/10    | +5     |
| Security scanning     | 3/10     | 2/10    | -1     |

### Quality Gate Maturity: 59/90 → 6.6/10 (Solid)

| Dimension             | Score | Status | Details                                                              |
|-----------------------|-------|--------|----------------------------------------------------------------------|
| Linting               | 9/10  | ✅     | ESLint type-aware + sonarjs + tanstack-query + regexp. 0 issues      |
| Formatting            | 8/10  | ✅     | Prettier + lint-staged + format:check script. 49 files need formatting |
| Type checking         | 8/10  | ✅     | strict: true, no-explicit-any error, enforced in CI. 0 TS errors    |
| Complexity limits     | 8/10  | ✅     | cognitive-complexity 15, max-depth 4, max-params 4, max-lines 80    |
| Duplication detection | 7/10  | ⚠️     | jscpd configured (3% threshold, tightened from 5%). Actual: 1.54%   |
| Test coverage gate    | 6/10  | ⚠️     | Ratcheted thresholds (branches 76%, lines 41%). Not enforced in CI   |
| Pre-commit hooks      | 6/10  | ⚠️     | Husky + lint-staged: prettier --write + eslint --fix on staged files |
| CI quality gates      | 5/10  | ⚠️     | CI: lint + typecheck + tests + build. E2E has concurrency group      |
| Security scanning     | 2/10  | ❌     | npm audit script local only. TODO: enable GitHub push protection     |

## Current Issues Snapshot

- **ESLint**: 0 errors, 0 warnings across 166 files
- **Prettier**: 49 files with formatting drift (run `npm run format:fix`)
- **TypeScript**: 0 errors
- **Duplication**: 1.54% (16 clones) — well under 3% threshold
- **Coverage**: Ratcheted at branches 76%, fns 52%, lines 41%, stmts 41%
- **Tests**: 1 failing test (`tests/unit/lib/errors/utils.test.ts` — logError signature changed)
- **Knip**: 13 unused files, 8 unused deps, 125 unused exports (needs config tuning for Nuxt auto-imports)

## Test Pyramid

```
        /\
       /  \        E2E: 11 specs (Playwright, 3 browsers)
      /    \
     /------\
    /        \     Integration: 0 — gap
   /----------\
  /            \   Unit: 30 files, ~382 tests (Vitest + Testing Library + MSW)
 /--------------\
/                \ Static: ESLint (type-aware + sonarjs + tanstack-query + regexp) + TypeScript strict + Zod + Knip
------------------
```

| Layer       | Tool                    | Count     | Notes                              |
|-------------|-------------------------|-----------|------------------------------------|
| Static      | ESLint + TypeScript + Knip | —      | Type-aware, sonarjs, query, regexp |
| Unit        | Vitest + MSW            | ~382      | Stores, composables, lib, utils    |
| Integration | —                       | 0         | Gap between unit and E2E           |
| E2E         | Playwright              | 11 specs  | Auth, diagnostics, 3 browser prjs  |

## What Changed This Session

1. **jscpd threshold**: Tightened from 5% → 3% (actual 1.54%, locks in current level)
2. **Prettier scripts**: Added `format:check` and `format:fix` npm scripts
3. **Knip**: Installed for dead code detection (`npm run knip`)
4. **eslint-plugin-regexp**: Added flat/recommended config, fixed 3 real regex issues
5. **E2E concurrency**: Added concurrency group to e2e.yml

## Next Steps

1. Run `npm run format:fix` as standalone "style: format codebase" commit
2. Fix failing test (`logError` signature changed — prefix `[ErrorUtils]` added)
3. Tune Knip config for Nuxt auto-imports (reduce false positives)
4. Review Knip's unused deps findings — remove confirmed unused packages
5. Enable GitHub push protection (Settings → Code security)
6. Add `format:check` + `test:coverage` to CI when ready
7. Run `quality-audit` again after cleanup
