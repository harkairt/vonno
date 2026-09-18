# 07: Horizontal, Group, and Categorization layout renderers

**What to build:** Forms whose uischema uses `HorizontalLayout`, `Group`, or `Categorization` render with the project's layout: horizontal becomes a responsive grid (one column per element at ≥ 480 px, single column below), group becomes a `--card` box with border, padding and a heading from `uischema.label`, categorization becomes `UTabs` with one tab per category and a vertical layout inside. Each dispatches children through `DispatchRenderer`, is registered with `rankWith(5, uiTypeIs(...))`, and passes `readonly` through.

Read spec section 14.2 (the three layout rows) in `.scratch/forms/spec.md`.

**Blocked by:** 05

**Status:** done-with-notes

**Test first (TDD):**
- One component test per layout: tester matches, children render via dispatch, group heading text, one tab per category, grid column count follows element count.

**Acceptance criteria:**
- [x] Three layout renderers exported and registered.
- [x] A fixture uischema combining all three renders without any vanilla layout.
- [x] typecheck, lint, test:run pass; coverage thresholds not lowered.

## Comments

**2026-09-16 — done-with-notes on branch `forms/07` (worktree `.claude/worktrees/forms-07`)**

Commits:
- `46052fe` feat(forms): add horizontal, group and categorization layout renderers — renderers, `renderers/index.ts`, `FormRenderer.vue`, `tests/unit/components/forms/FormRenderer.layouts.test.ts`
- (this commit) docs(forms): record completion notes for issue 07

Built (all follow the ticket 05 conventions: one SFC per renderer, plain `<script lang="ts">` exporting `tester` and holding every import, import-free `<script setup>`, `rendererProps<…>()` + the matching `useJsonForms*` composable, `DispatchRenderer` per child with `layout.enabled` passed through):
- `app/components/forms/renderers/HorizontalLayout.vue` — `rankWith(5, uiTypeIs('HorizontalLayout'))`. `grid grid-cols-1 gap-4 @min-[480px]:grid-cols-(--form-columns)` with an inline `--form-columns: repeat(<n>, minmax(0, 1fr))`, `n` = `uischema.elements.length`. `data-testid="horizontal-layout"`.
- `app/components/forms/renderers/GroupLayout.vue` — `rankWith(5, uiTypeIs('Group'))`. `<section>` with `rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 flex flex-col gap-4`; `<h3 class="text-sm font-medium">` from `uischema.label`, omitted when the label is empty. `data-testid="group-layout"`.
- `app/components/forms/renderers/CategorizationLayout.vue` — `rankWith(5, uiTypeIs('Categorization'))`, `useJsonFormsCategorization`. `UTabs variant="link" color="neutral" class="w-full gap-4"`; one item per *visible* category (`value` = category index, `label` = `Category.label`), the `#content` slot renders the category's elements in a `flex flex-col gap-4` with the category's own `path`/`enabled`. `data-testid="categorization-layout"`.
- `app/components/forms/renderers/index.ts` — the three entries appended to `customRenderers` after `VerticalLayout`; the fallback stays last.
- `app/components/forms/FormRenderer.vue` — the loaded root gets the `@container` class (one-word change, see the first decision below). Scoped vanilla stylesheet untouched.
- `tests/unit/components/forms/FormRenderer.layouts.test.ts` (6 tests): grid column count follows element count, group heading text and card classes, group without label, one tab per category with the right children, the combined fixture (Categorization → Category → Group → HorizontalLayout) renders none of `.vertical-layout, .horizontal-layout, .group, .categorization`, and `readonly` disables all four inputs across the nested layouts. Every "Test first" item has a test.
- No new i18n keys: every text the layouts show comes from the uischema (`Group.label`, `Category.label`).

Decisions / deviations:
- **480 px is a container query, not a viewport breakpoint.** The forms panel is a sidebar with its own `minWidth` (`FormsSidebar.vue`), so a `min-[480px]:` viewport variant would give a 360 px-wide panel on a 1280 px desktop three columns. The FormRenderer root is now `@container` and the grid uses Tailwind v4's `@min-[480px]:` container variant. Verified in `npm run build` output: `@container (min-width:480px){.\@min-\[480px\]\:grid-cols-\(--form-columns\){grid-template-columns:var(--form-columns)}`. The project had no container queries before; this is the first one.
- `Group` renders as `<section>` + `<h3>` rather than `<fieldset>` + `<legend>` — a bordered fieldset floats the legend into the border line, which is not the card look the spec asks for.
- The vanilla `.horizontal-layout` / `.group` rules in the `FormRenderer.vue` scoped stylesheet are now unreachable for layouts (the custom rank-5 renderers always win) but were left in place: `.group` shares its rule with `.array-list`, which the vanilla array renderer still uses, and removing the rest is outside this ticket.
- Tabs keep Nuxt UI's default `unmountOnHide` (inactive tab bodies are unmounted); form data lives in the JSON Forms store, so nothing is lost on switching. Flip to `:unmount-on-hide="false"` if ticket 08's field-focus tracking needs every input mounted.
- `layout.uischema` from `useJsonFormsLayout` is typed as plain `Layout`, so `GroupLayout` reads the label from `props.uischema` (typed `GroupLayout`) and `CategorizationLayout` casts each category's uischema to `Category`.
- Not verified in a browser: the forms panel needs the backend (`:8082`) to produce a form instance, which was not available in this worktree. CSS output was verified via the production build instead.
- `vitest.config.ts` untouched (`git diff develop -- vitest.config.ts` empty).

Verification (worktree):
- `npm run typecheck`: no errors.
- `npm run lint`: 0 errors, 73 warnings (67 on ticket 05; the 6 new ones are the repo-wide "error typed value" warnings type-aware ESLint emits for `.vue` imports in `renderers/index.ts`, two per new entry).
- `npx knip`: 5 findings, identical to the `develop` baseline; nothing from this ticket.
- `npm run test:run`: 168 files, 1907 tests → 1904 passed, 3 failed. The 3 failures pre-exist on `develop` (2 in `tests/unit/components/chat/ChatMessages.test.ts`, 1 in `tests/unit/lib/validation/barRace.test.ts`).
- `npx vitest run tests/unit/components/forms/`: 5 files, 43 tests, all passing.
- `npm run build`: exit 0; container-query grid rule present in `.output/public/_nuxt/entry.*.css`.

**Review (2026-09-16)** — reviewed `bac2e0f..31f2a13` against spec 14.2 and the ticket; fixes live in the commit that carries this note.
- Fixed (bug): `CategorizationLayout` used the category's *original* index as the tab `value`, while `UTabs` defaults `defaultValue` to `"0"`. With the first category rule-hidden, no tab was active and the body was blank. Tabs now take their `value` from their position in the visible list. Test: "skips hidden categories and keeps the first visible tab as the default".
- Fixed (spec gap): tab triggers were Nuxt UI `md` height (~32 px), below the "minimum tap target 44 px" rule that 14.2 applies to every renderer. `UTabs` gets `:ui="{ trigger: 'min-h-11' }"`, the same idiom as `StringControl`'s input. Test added.
- Fixed (test gap): nothing exercised `layout.visible`; added a rule-hidden `Group` test. `FormRenderer.layouts.test.ts` now has 9 tests.
- Accepted: the 480 px threshold as a `@container` query. The spec's "width" is the form's width; the panel is a sidebar much narrower than the viewport, so a viewport breakpoint would give a 360 px panel three columns. Correct reading.
- Accepted: `<section>` + `<h3>` for Group. A `fieldset` legend sits in the border line, not the card look asked for; `h3` nests under the panel's `h2` (`FormsSidebar.vue`) and picks up the Elemtár display font like every other heading.
- Accepted: default `unmountOnHide`. Ticket 08's focus tracker (`focusin` → closest `data-form-path`) only ever sees the active tab. Ticket 11's "scroll to and focus the first erroring control" needs the tab *activated*, not merely mounted — a hidden `TabsContent` is `display: none` either way, so `unmountOnHide: false` would not help. Note for ticket 11: when the first erroring control lives in an inactive category, `CategorizationLayout` must switch to that tab first (e.g. drive `UTabs` `v-model` from `showErrors` + the error paths).
- Accepted: the `as Category` cast. `useJsonFormsCategorization` types each category as plain `Layout`; the cast mirrors the vanilla renderer. `GroupLayout` needs none.
- Noted, not changed: `HorizontalLayout` counts rule-hidden children as columns (same as vanilla); tab labels `truncate` rather than scroll when many categories meet a narrow panel — revisit if a real form hits it.
- Verification after fixes: typecheck clean; lint 0 errors / 73 warnings (unchanged); `tests/unit/components/forms/` 5 files, 46 tests passing; `test:run` 1910 tests → 1907 passed, the same 3 pre-existing failures.
