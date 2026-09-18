# 05: JSON Forms core: lazy loader, FormRenderer, first control, fallback, read-only

**What to build:** An expanded open form renders its schema with JSON Forms inside the item body. This slice ships the minimum renderer set to prove the pipeline end to end: `VerticalLayout` and `StringControl` (text, email, url) as custom Nuxt UI renderers, the lowest-rank `UnsupportedElement` fallback, vanilla renderers as fallback styled with the design tokens, `readonly` for closed forms (inputs disabled), and the validation plumbing: `validationMode` driven by `showErrors` (hidden by default), `showErrors` provided to renderers via inject, and the `i18n.translate` mapping of ajv keywords to `chat.forms.validation.*` in both locales. Edits update a component-local data ref only; persistence comes in ticket 08.

Delivers: dependencies `@jsonforms/core`, `@jsonforms/vue`, `@jsonforms/vue-vanilla` (same 3.x major), `useJsonForms` lazy loader with a module-level cached promise and one shared `createAjv({ useDefaults: true })`, `FormRenderer` with skeleton until loaded, renderer index, the `UFormField` wrapper contract (`label`, `description`, `error`, `required`, `data-form-path`), i18n `unsupportedElement` and `validation.*` keys.

Read spec sections 14.1, 14.2 (rows `StringControl`, `VerticalLayout`, `UnsupportedElement`, vanilla styling, the "every renderer must" list), 14.6, 17 in `.scratch/forms/spec.md`. Follow the existing lazy fence-library loaders (for example `useMermaid`, `useECharts`) for the loader pattern.

**Blocked by:** 04

**Status:** done-with-notes

**Test first (TDD):**
- `FormRenderer`: shows skeleton then renders; `StringControl` renders `UInput` with the right `type` per format; `VerticalLayout` renders children; unknown element renders the muted fallback and the rest of the form stays usable; an array control renders via vanilla.
- `readonly: true` disables inputs.
- Errors hidden with `ValidateAndHide`, shown with `ValidateAndShow`; the `required` message is translated.

**Acceptance criteria:**
- [x] Libraries load on first expand only (dynamic import), promise cached at module level, no direct `ajv` dependency.
- [x] Custom renderers use `rankWith(10, …)` for controls and `rankWith(5, …)` for layouts; vanilla ranks below; the fallback is `rankWith(1, () => true)`.
- [x] Every `UFormField` root carries `data-form-path` with the JSON Pointer.
- [x] Vanilla output uses `--card`, `--border`, `--muted-foreground`, and the `UInput` radius/height via a scoped stylesheet.
- [x] Closed forms render read-only with the closed notice and no footer.
- [x] typecheck, lint, test:run pass; coverage thresholds not lowered. (test:run has 3 failures that pre-exist on `develop` and are unrelated to forms; see Comments.)

## Comments

**2026-09-16 — done on branch `forms/05-json-forms-core` (worktree `.claude/worktrees/forms-05`)**

Commits:
- `94d8e86` chore(deps): add @jsonforms core, vue and vue-vanilla — `package.json`, `package-lock.json`
- `24df66d` feat(forms): render forms with JSON Forms core renderers — everything below

Installed: `@jsonforms/core`, `@jsonforms/vue`, `@jsonforms/vue-vanilla` all `^3.8.0` (resolved 3.8.0). `ajv` is only a transitive dependency; `grep -rn "from 'ajv'" app lib` is empty.

Built:
- `app/composables/useJsonForms.ts` — `loadJsonForms()`; module-level cached promise (reset on failure so a retry can reload), dynamic `import()` of the three packages, one shared `createAjv({ useDefaults: true })`, returns `{ JsonForms, renderers, ajv }`.
- `app/components/forms/FormRenderer.vue` — props `schema`, `uischema`, `data`, `readonly`, `showErrors`; emits `change(JsonFormsChangeEvent)`. Skeleton (3 `USkeleton` rows) until the loader resolves, `chat.forms.unavailable` notice if it rejects. `validationMode` = `ValidateAndShow` when `showErrors` else `ValidateAndHide`. `i18n.translate` maps `*.error.<keyword>` to `chat.forms.validation.<keyword>` (ajv params passed as named i18n params). Provides `showErrors` under `FORM_SHOW_ERRORS_KEY`. Scoped `:deep()` stylesheet restyles the vanilla class names (`.vertical-layout`, `.horizontal-layout`, `.group`, `.array-list`, `.control .input/.select/.text-area`, `.description`, `.error`, …) with `--card`, `--border`, `--muted-foreground`, `--destructive`, `var(--radius-md)` and `min-height: 2.75rem` (= `UInput` `min-h-11`).
- `app/components/forms/renderers/StringControl.vue` — `rankWith(10, and(isStringControl, not(isMultiLineControl), not(isEnumControl), not(isOneOfEnumControl)))`; `UFormField` (`label`, `description`, `error`, `required`, `data-form-path`) wrapping `UInput` (`type` `email` for `format: email`, `url` for `format: uri`, else `text`; `disabled` when not enabled; `min-h-11`). Empty input writes `undefined` so `required` fires.
- `app/components/forms/renderers/VerticalLayout.vue` — `rankWith(5, uiTypeIs('VerticalLayout'))`, `DispatchRenderer` per child in a `flex flex-col gap-4`.
- `app/components/forms/renderers/UnsupportedElement.vue` — `rankWith(1, () => true)`, muted `chat.forms.unsupportedElement` line.
- `app/components/forms/renderers/index.ts` — exports `customRenderers` (StringControl, VerticalLayout) and `fallbackRenderer`.
- `app/utils/formRendererContext.ts` — `FORM_SHOW_ERRORS_KEY: InjectionKey<Ref<boolean>>`.
- `app/utils/jsonPointer.ts` — `toJsonPointer('a.b')` → `/a/b` (escapes `~` and `/`, `''` → `''`).
- `app/components/forms/FormPanelItem.vue` — mounts `FormRenderer` in the loaded body with `readonly = isClosed`; local `formData` ref seeded from `instance.data` once, updated by `@change`; `showErrors` ref (always `false` here, ticket 08 flips it). Closed notice kept, no footer.
- Locales (`en`/`hu`): `chat.forms.unsupportedElement`, `chat.forms.validation.{required,minLength,maxLength,minimum,maximum,pattern,format,enum,type,const,minItems,maxItems,default}`; key sets identical.
- Tests: `tests/unit/components/forms/FormRenderer.test.ts` (10), `tests/unit/composables/useJsonForms.test.ts` (2), `tests/unit/utils/jsonPointer.test.ts` (3), `FormPanelItem.test.ts` extended (read-only + no footer). Every "Test first" item has a test.

Decisions / deviations visible in the code:
- Renderer order is `[...customRenderers, ...vanillaRenderers, fallbackRenderer]`, i.e. the rank-1 fallback sits *after* the vanilla set rather than with the custom set. JSON Forms resolves rank ties to the first entry and several vanilla testers are also rank 1, so a leading catch-all would shadow them.
- The renderer module is loaded with `const { customRenderers, fallbackRenderer } = await import(...)` after the `Promise.all` of the three packages, not inside it. knip only follows dynamic-import member usage in that destructured shape; inside `Promise.all` it reported both exports as unused. Cost: one extra small chunk fetch on the first expand.
- Renderer SFCs keep every `import` in the plain `<script lang="ts">` block (next to `export const tester`) and leave `<script setup>` import-free; otherwise ESLint `import/first` fails on the concatenated blocks.
- The `translate` regex accepts any `*.error.<keyword>` key and falls back to ajv's default message for keywords outside the mapped set; `validation.default` exists in the locales but is not used yet.
- `vitest.config.ts` untouched (`git diff develop -- vitest.config.ts` empty).

Verification (worktree, after the fixes above):
- `npm run typecheck`: no errors.
- `npm run lint`: 0 errors, 67 warnings (the ones on `renderers/index.ts` are the repo-wide "error typed value" warnings type-aware ESLint emits for `.vue` imports from `.ts`).
- `npx knip`: 5 findings, identical to the `develop` baseline (2 unused files, 1 unused devDependency, 2 unlisted dependencies); nothing from this ticket.
- `npm run test:run`: 166 files, 1898 tests → 1895 passed, 3 failed. The 3 failures pre-exist on `develop` and are out of scope: 2 in `tests/unit/components/chat/ChatMessages.test.ts` (copying an options message) and 1 in `tests/unit/lib/validation/barRace.test.ts`.
- `npm ci --dry-run`: lockfile in sync.

Notes for tickets 06 / 07 (more controls and layouts):
- One file per renderer in `app/components/forms/renderers/`, with a plain `<script lang="ts">` that exports `tester` (use `rankWith(10, …)` for controls, `rankWith(5, …)` for layouts) and holds all imports, plus a `<script setup>` using `rendererProps` and the matching `useJsonForms*` composable. Register it in `renderers/index.ts` (`customRenderers` array); the fallback stays last.
- `UFormField` contract: pass `label`, `description` (`|| undefined`), `error`, `required`, and `:data-form-path="toJsonPointer(control.path)"` on the root. Inputs get `:disabled="!control.enabled"` and a `min-h-11` base for touch targets.
- Errors: `inject(FORM_SHOW_ERRORS_KEY, ref(false))` from `app/utils/formRendererContext.ts` and only surface `control.errors` when it is true (`StringControl.vue` is the reference).

Notes for ticket 08 (drafts / persistence):
- `FormPanelItem.vue` owns the edit buffer today: `formData` ref (seeded from `instance.data` once by a watcher) and `onFormChange(event: JsonFormsChangeEvent)` which stores `event.data`; `showErrors` is a local `ref(false)`. `FormRenderer.vue` re-emits JSON Forms' `@change` as `change` and takes `data`/`showErrors` as props, so moving the buffer into the store means replacing those two refs and the handler in `FormPanelItem`.
