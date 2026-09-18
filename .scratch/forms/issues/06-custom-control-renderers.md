# 06: Remaining custom control renderers

**What to build:** The fixture form's remaining controls render with Nuxt UI instead of vanilla: `MultilineControl` (`UTextarea`, autoresize, 3 rows), `NumberControl` (`UInputNumber`, step 1 for integers, min/max from schema, empty sets `undefined`), `BooleanControl` (`UCheckbox`, or `USwitch` when `options.toggle`, label inside the control), `EnumControl` (`USelect`, or `URadioGroup` when `options.format === 'radio'`, items from `enum` or `oneOf[].const`/`title`, empty item when not required), `DateControl` (`UInput type="date"`, `YYYY-MM-DD`), `TimeControl` (`UInput type="time"`, `HH:mm`), `DateTimeControl` (`UInput type="datetime-local"`, ISO 8601 without offset both ways). Each wraps `UFormField` per the ticket 05 contract, honours `readonly`, meets the 44 px tap target, and is registered in the renderer index.

Read spec section 14.2 (the seven control rows and the "every renderer must" list) in `.scratch/forms/spec.md`. Decision 26: native date inputs through `UInput`, no Nuxt UI upgrade.

**Blocked by:** 05

**Status:** done-with-notes

**Test first (TDD):**
- One component test per renderer: tester matches the right schema/uischema, renders the right Nuxt UI component, emits the right value shape on change, disabled when `readonly`, `error` shown only when `showErrors`.
- DateTime round trip: ISO in, `datetime-local` value out, and back.

**Acceptance criteria:**
- [x] Seven renderers exported as `{ tester, renderer }` with `rankWith(10, …)` and registered before the vanilla set.
- [x] The MSW fixture `Open` form renders with no vanilla control except the array.
- [x] Both locales for any text a renderer adds itself.
- [x] typecheck, lint, test:run pass; coverage thresholds not lowered.

## Comments

**2026-09-16 — done-with-notes on branch `forms/06` (worktree `.claude/worktrees/forms-06`)**

Commits:
- `1480941` feat(forms): add multiline, number and boolean control renderers
- `3a60ac5` feat(forms): add enum control renderer with select and radio variants
- `d545fd6` feat(forms): add date, time and date-time control renderers (also narrows the `StringControl` tester)
- `0174ca1` test(forms): assert the fixture form uses custom renderers for every non-array control
- ticket notes (this commit)

Built (all in `app/components/forms/renderers/`, following the ticket 05 file conventions and `UFormField` contract):
- `MultilineControl.vue` — `rankWith(10, isMultiLineControl)`; `UTextarea` `rows=3` `autoresize`; empty → `undefined`.
- `NumberControl.vue` — `rankWith(10, or(isNumberControl, isIntegerControl))`; `UInputNumber` with `min`/`max` from `schema.minimum`/`maximum`; integers get `step=1` with step snapping, numbers get no step and `step-snapping=false` (Reka's default snapping would round decimals); `null`/`NaN` → `undefined`. Model value is passed as `null` (not `undefined`) so Reka stays controlled.
- `BooleanControl.vue` — `rankWith(10, isBooleanControl)`; `UCheckbox`, or `USwitch` when `options.toggle === true`; `label` and `required` go on the control, `UFormField` gets no label; writes `true`/`false`; `ui.root = 'min-h-11 items-center'` for the tap target.
- `EnumControl.vue` — `rankWith(10, or(isEnumControl, isOneOfEnumControl))`; `USelect`, or `URadioGroup` when `options.format === 'radio'`; items from `enum` (label = `String(value)`) or `oneOf[].const`/`title`; a leading `chat.forms.noSelection` item when not required, whose value is the sentinel `'__no-selection__'` mapped to `undefined` on write (Reka `SelectItem` throws on `''`).
- `DateControl.vue` — `rankWith(10, isDateControl)`; `UInput type="date"`, `YYYY-MM-DD` both ways.
- `TimeControl.vue` — `rankWith(10, isTimeControl)`; `UInput type="time"` shows `HH:mm`, data is `HH:mm:ss` (see deviations).
- `DateTimeControl.vue` — `rankWith(10, isDateTimeControl)`; `UInput type="datetime-local"` shows `YYYY-MM-DDTHH:mm`, data is `YYYY-MM-DDTHH:mm:ss` (no offset). Incoming `Z`/offset is dropped, not converted.
- `StringControl.vue` — tester now also excludes `isDateControl`, `isTimeControl`, `isDateTimeControl`; without that it tied at rank 10 and, being first in the array, won over the date renderers.
- `index.ts` — the seven entries sit after `StringControl` and before `VerticalLayout`; `fallbackRenderer` unchanged.
- Locales: `chat.forms.noSelection` ("No selection" / "Nincs kiválasztva").
- Tests in `tests/unit/components/forms/renderers/`: `harness.ts` (shared Nuxt UI stubs, `renderForm`, `rank`, `fieldByPath`, `lastChangeData`), `MultilineControl` (5), `NumberControl` (6), `BooleanControl` (6), `EnumControl` (7), `DateControls` (9, incl. DateTime round trip and the no-tie check against `StringControl`), `fixtureForm` (1: renders `openFormSchema`/`openFormUiSchema`, both categories, asserts 14 `data-form-path` fields, `.array-list` present, zero vanilla `.control`).

Decisions / deviations:
- **Time values are stored as `HH:mm:ss`, not `HH:mm`** as the spec row says. ajv-formats' `time` format (used by JSON Forms' `createAjv`) rejects `08:15` and accepts `08:15:00`, so a literal `HH:mm` value would fail validation on every time field. The input still shows `HH:mm`. `date-time` without offset (`YYYY-MM-DDTHH:mm:ss`) is accepted by ajv, so the spec's "no offset" rule holds there.
- Enum item values are typed `string | number` (Nuxt UI/Reka `AcceptableValue`); boolean/null enum members are cast, not specially handled.
- The empty enum item uses a string sentinel instead of `''` because Reka's `SelectItem` throws on an empty-string value.
- Unit tests stub the Nuxt UI inputs (as `FormRenderer.test.ts` already does), so `min-h-11`/`ui` slot names are not asserted; they follow the ticket 05 `StringControl` pattern.
- `vitest.config.ts` untouched (`git diff develop -- vitest.config.ts` empty).

Verification (worktree):
- `npm run typecheck`: no errors.
- `npm run lint`: 0 errors, 82 warnings (67 on `develop`; the 15 new ones are the known "error typed value" warnings for `.vue` imports in `renderers/index.ts`).
- `npm run test:run`: 173 files, 1935 tests → 1932 passed, 3 failed; the 3 are the pre-existing `develop` failures (2 in `ChatMessages.test.ts`, 1 in `barRace.test.ts`).

**Review (2026-09-16)**

Fixed:
- `NumberControl` tester tied at rank 10 with `EnumControl` for numeric enums (`{ type: 'integer', enum: [1, 2, 3] }`, `{ type: 'number', oneOf: [{ const, title }] }`) and, being first in the array, won: a rating enum rendered as a free number input. The tester now excludes `isEnumControl`/`isOneOfEnumControl`, mirroring `StringControl`. Test added in `NumberControl.test.ts`.
- `isEnumControl` in `@jsonforms/core` 3.8 also matches `const` schemas, so `EnumControl` claimed `{ type: 'string', const: 'x' }` but `itemsFromSchema` produced no items (no `enum`, no `oneOf`) — an empty select. It now offers the const as the single option. Test added in `EnumControl.test.ts`. (The spec lists `const` under "vanilla handles", but its own `EnumControl` tester row claims it; handling it is the smaller change.)

Accepted after verification:
- `HH:mm:ss` for time values: confirmed with `createAjv` from `@jsonforms/core` — `format: 'time'` rejects `08:15`, accepts `08:15:00`; `date-time` rejects `2026-09-16T10:30`, accepts `...T10:30:00`. Backend note: time fields arrive as `HH:mm:ss`, date-time as `YYYY-MM-DDTHH:mm:ss` without offset; any offset the backend sends is dropped on display, not converted.
- `'__no-selection__'` sentinel: exists only in the item list and the display-side `selectedValue`; `onInput` maps it to `undefined` before `handleChange`, and ajv `useDefaults` only writes schema `default`s, so it cannot reach form data. `chat.forms.noSelection` is in both locales.
- `NumberControl`: `null` model value keeps Reka controlled; `null`/`NaN` → `undefined`; integers get `step=1` with snapping, numbers no step and `step-snapping=false`.
- `StringControl` tester still claims plain text, `format: email` and `format: uri` (checked directly against the testers).
- `ui` slot names match Nuxt UI 4.1 theme: `root` on Checkbox/Switch, `item` on RadioGroup, `base` on Select/Input/Textarea/InputNumber.
- Remaining rank-10 ties left alone: `boolean` + `enum` → `BooleanControl` (still a checkbox), `format: date` + `enum` → `DateControl` (first in array). Both are edge cases with a sensible outcome.
- Tests render through the real `FormRenderer` + JSON Forms and assert emitted `change` data, so they fail if a renderer stops writing the right shape.
