# 11: Submit with validation gate and confirmation modal

**What to build:** The open-form footer gets a primary "Submit" button. Clicking it flushes the draft (stop with the inline error on failure), turns on error display for the form, and if validation errors exist scrolls to and focuses the first erroring control without a modal. Otherwise a confirmation modal explains that the form cannot be edited after submitting. Confirming sends `SaveFormInst` with `status: "Submitted"` and no `lastEditedField`, disables both buttons with a spinner while pending, then on success updates the instance, invalidates the list and the chat session query, closes the modal, leaves the item expanded and read-only, and shows a success toast. On error it closes the modal, shows an error toast, sets the inline status to error, and refetches on 400.

Delivers: `FormSubmitModal` following the delete-confirm modal in the session item menu, footer submit button, `showErrors` wiring from ticket 05, i18n `submit`, `submitConfirmTitle`, `submitConfirmBody`, `submitConfirm`, `cancel`, `submitted`.

Read spec sections 13.10, 14.6, 15.1, 16 in `.scratch/forms/spec.md`.

**Blocked by:** 08

**Status:** done-with-notes

**Test first (TDD):**
- Errors hidden before the first submit attempt, shown after; a first attempt with errors focuses the first erroring control and opens no modal.
- Modal: confirm success (status Submitted, item read-only, success toast, list and session invalidated), confirm failure (error toast, inline error status), buttons disabled while pending, request omits `lastEditedField`.

**Acceptance criteria:**
- [x] Acceptance statement 10 of the spec holds (verified by component tests with a stubbed renderer; not verified in a browser — no backend in the worktree).
- [x] The footer is present only for open forms.
- [x] Both locales have the new keys.
- [x] typecheck, lint, test:run pass; coverage thresholds not lowered.

## Comments

**2026-09-16 — done-with-notes on branch `forms/11` (worktree `.claude/worktrees/forms-11`)**

Commits:
- `ba2bbc3` feat(forms): submit flow with validation gate and confirmation modal
- (this commit) docs(forms): record completion notes for issue 11

Files:
- `app/components/forms/FormPanelItem.vue` — `<footer class="flex justify-end gap-2">` as the last child of the loaded body (open forms only) with the primary Submit `UButton`; `FormSubmitModal` mounted after the `UCollapsible`. `handleChange` wraps `onChange` and keeps the latest JSON Forms `errors`. `submit()`: `await flush()` → stop when it returns `'error'` *and the draft is still dirty*; `await nextTick()`; `setShowErrors(true)`; map errors to pointers (`required` → `instancePath/missingProperty`, else `instancePath`; root-level pointers without a control are skipped) and focus the first one that resolves to a `[data-form-path]` element (first focusable inside, `scrollIntoView({ block: 'center' })`, `focus()`); otherwise open the modal. `confirmSubmit()`: `useSaveFormInst().mutateAsync({ agentId, sessionId, instanceId, data, status: 'Submitted' })` (no `lastEditedField`), then invalidate `chatQueryKeys.session(sessionId)` and success toast; on error toast `getUserFriendlyMessage`, `setSaveStatus('error')`, 400 → invalidate list + instance; modal closes in `finally`. `isClosed` now also reads the instance query's status so the item locks as soon as `applySavedInstance` runs (the list summary catches up on its refetch).
- `app/components/forms/FormSubmitModal.vue` — `UModal` (`:open` / `update:open`, `:dismissible="!pending"`) after the SessionItemMenu delete-confirm pattern; Cancel (ghost neutral) + Submit (primary, `:loading`); both `:disabled="pending"`.
- `app/utils/formRendererContext.ts` — `FormFocusRequest { pointer, seq }`, `FORM_FOCUS_REQUEST_KEY`, `scopeToJsonPointer(scope)`.
- `app/components/forms/FormRenderer.vue` — new optional prop `focusRequest`, provided under `FORM_FOCUS_REQUEST_KEY`.
- `app/components/forms/renderers/CategorizationLayout.vue` — `UTabs` gets `v-model="activeTab"` (`'0'` initially); a watcher on the injected focus request finds the visible category whose element tree contains a Control whose scope pointer equals or prefixes the requested pointer and activates that tab.
- Locales: `chat.forms.submit`, `submitConfirmTitle`, `submitConfirmBody`, `submitConfirm`, `cancel`, `submitted` appended at the end of `chat.forms` (en, hu). There is no generic `common.cancel` key in the project, so `chat.forms.cancel` was added as the ticket lists.
- Tests: `tests/unit/components/forms/FormPanelItem.test.ts` (+7 in "FormPanelItem — submit": footer, errors hidden → shown + first-error focus + no modal, flush failure stops, confirm success incl. request body without `lastEditedField` / read-only / list + session invalidation / toast, cancel makes no request, disabled + spinner while pending, 400 failure toast + inline error + instance refetch), `tests/unit/components/forms/FormSubmitModal.test.ts` (4), `tests/unit/components/forms/FormRenderer.layouts.test.ts` (+1: tab switch on focus request).

Decisions / deviations:
- Validation errors come from the JSON Forms change event (spec 14.3/15.1 "local `errors` list"), kept in a plain module variable in `FormPanelItem`; no ajv re-validation. The one `await nextTick()` after `flush()` lets a merged save response re-emit `change` before the errors are read.
- Flush failure only blocks the submit when the draft is still dirty. A clean draft with a stale `'error'` status (edit → failed save → revert, the accepted limitation (3) of ticket 08) would otherwise lock the user out of submitting with nothing left to retry.
- Tab switching uses a provide/inject focus request from `FormRenderer` rather than tracking error paths inside the categorization: the panel item already knows the pointer, and the same mechanism works for any future "focus this control" need. `seq` makes repeated requests for the same pointer observable.
- `isClosed` considering the instance status is a small behavioural addition beyond the ticket text; without it the item stays editable between the submit response and the list refetch.
- Not verified in a browser (no backend). The real `UTabs` re-renders the newly active tab's content in the same flush, so the single `nextTick` before the DOM query should be enough; if a real Categorization form shows the focus landing nowhere, a second `nextTick` in `focusControl` is the place to look.

Verification (worktree): `npm run typecheck` clean; `npm run lint` 0 errors / 90 warnings (all pre-existing repo-wide type-aware warnings); `npm run test:run` 179 files, 2017 tests → 2014 passed, 3 failed (the known develop failures in `ChatMessages.test.ts` ×2 and `barRace.test.ts`); `npx vitest run tests/unit/components/forms/{FormPanelItem,FormRenderer.layouts,FormSubmitModal}.test.ts` 39 passed. `vitest.config.ts` untouched.

**Review (2026-09-16)** — spec 13.10/14.6/15.1/16/17 and standards checked against `c8e3a22..892bfe1`. Fixed (medium): `confirmSubmit` sent the request without re-flushing, so an edit landing after `submit()`'s flush (a `change` re-emitted after the merge with ajv `useDefaults`, or any edit while the modal is open) left a pending debounce timer / dirty draft that could race the submit with a late `status: Open` save; `confirmSubmit` now does `await flush()` first (cancels the timer, coalesces with an in-flight autosave). Test: edit after the modal opened → autosave request precedes the `Submitted` request (fails without the fix). Fixed (low): the footer Submit button gets `min-h-11` like every forms control (footer layout unchanged for ticket 12). Verified flagged point (c) with a real-renderer test: a pristine form with a missing required field shows the error, focuses the control and opens no modal on the first Submit — JSON Forms emits its initial `change` with `errors` on mount. Accepted: (a) a clean draft with a stale `error` status may submit — its data equals the server's, and the closed item hides the status anyway; (b) `isClosed` reading the instance status is required for "read-only immediately"; (d) the single `nextTick` after the tab switch is covered by the `FormRenderer.layouts` test and the same-flush re-render argument; `confirmSubmit` returning early without `agentId` leaves the modal open but is unreachable (the footer renders only after the instance query, which needs `agentId`); the `#content` slot modal mirrors `SessionItemMenu` exactly. Locale key sets identical. Verification after the fix: typecheck clean, lint 0 errors / 90 warnings, forms dir 12 files / 101 tests passed, full suite 2016 passed / 3 known develop failures.
