# 12: Discard with confirmation and deleted-card state

**What to build:** The open-form footer gets a ghost, error-coloured "Discard" button. Clicking it opens a confirmation modal warning that the form and its data are deleted permanently. Confirming cancels any pending autosave timer (no flush), calls `DeleteFormInst`, disables the buttons while pending, and on success removes the instance query, invalidates the list, removes the form from the store, closes the modal, and the item disappears from the panel; the card in the thread shows the deleted state after the list refetch. On error the modal closes, an error toast shows, and a 400 refetches list and instance.

Delivers: `useDeleteFormInst` mutation, `FormDiscardModal`, footer discard button, i18n `discard`, `discardConfirmTitle`, `discardConfirmBody`, `discardConfirm`.

Read spec sections 9.3 (`useDeleteFormInst`), 13.10, 15.2, 16 in `.scratch/forms/spec.md`.

**Blocked by:** 08

**Status:** done-with-notes

**Test first (TDD):**
- Discard confirm success: delete request issued, no save request issued even with a pending timer, item removed, card shows the missing state after the list refetch.
- Discard confirm failure: error toast, item stays; buttons disabled while pending.

**Acceptance criteria:**
- [x] Acceptance statement 11 of the spec holds.
- [x] Both locales have the new keys.
- [x] typecheck, lint, test:run pass; coverage thresholds not lowered.

## Comments

**2026-09-16 — done-with-notes on branch `forms/12` (worktree `.claude/worktrees/forms-12`)**

Commits:
- `db89a00` feat(forms): expose cancelPendingSave on useFormDraft — `app/composables/useFormDraft.ts`, `tests/unit/composables/useFormDraft.test.ts`
- `d0faf74` feat(forms): add useDeleteFormInst mutation — `app/composables/useFormMutations.ts`, `tests/unit/composables/useFormMutations.test.ts`
- `00ac162` feat(forms): add FormDiscardModal and discard i18n keys — `app/components/forms/FormDiscardModal.vue`, `tests/unit/components/forms/FormDiscardModal.test.ts`, `i18n/locales/en.json`, `i18n/locales/hu.json`
- `7d0d0f7` feat(forms): discard button and confirmation flow in FormPanelItem — `app/components/forms/FormPanelItem.vue`, `tests/unit/components/forms/FormPanelItem.test.ts`
- `05c5b1d` test(forms): cover discard removing the panel item and the card deleted state — `tests/unit/components/forms/FormsPanel.test.ts`
- docs commit (this file)

Built:
- `useFormDraft.cancelPendingSave()` — clears the debounce timer without saving; `flush()` now reuses it.
- `useDeleteFormInst()` — `formService.deleteFormInst` (already present from ticket 01, MSW handler too); `onSuccess`: `removeQueries(instance)`, invalidate list, `formsStore.removeForm`.
- `FormDiscardModal` — props `open`, `pending`; emits `update:open`, `confirm`. `UModal` with `:dismissible="!pending"`, ghost neutral Cancel and `color="error"` Discard (`:loading`/`:disabled` while pending).
- `FormPanelItem` — `<footer class="flex justify-end gap-2">` at the end of the loaded body for open forms only, Discard (`variant="ghost" color="error"`) as the first child. Confirm → `cancelPendingSave()`, `mutateAsync`; error → toast (`common.error` + `getUserFriendlyMessage`), 400 → invalidate list + instance; modal closed in `finally`.
- Locales: `chat.forms.discard`, `cancel`, `discardConfirmTitle`, `discardConfirmBody`, `discardConfirm` as one block at the end of `chat.forms` in both files.

Decisions / deviations:
- Footer uses `justify-end gap-2` with Discard first (agreed layout for the ticket 11 merge) instead of the spec 13.10 left/right split; ticket 11 adds the Submit button to the same footer.
- `chat.forms.cancel` added (spec 17 lists it): the only existing cancel key is `chat.sessionMenu.cancel`, which is not generic. Ticket 11 may add the same key; the merge should keep one.
- Discard with an undefined `agentId` closes the modal and does nothing (mirrors `saveFormDraft` skipping); `FormsPanel` always passes a numeric `agentId` in practice.
- After a successful delete the item collapses through `removeForm` before the list refetch unmounts it; both the collapse and unmount flush find no draft in the store, so no save request is issued (asserted by the "cancels the pending autosave" test with a real pending timer).
- The unit test can only observe the instance refetch on 400 (no list observer in an item-level render); list refetch is covered by the panel integration test on the success path.

Verification: `npm run typecheck` clean; `npm run lint` 0 errors (pre-existing `max-lines-per-function` warning on `useFormDraft`); `npm run test:run` 2015 passed / 3 failed (the known develop failures: 2 in `ChatMessages.test.ts`, 1 in `barRace.test.ts`), 179 files. New tests: `useFormDraft` +1 (20), `useFormMutations` +2 (6), `FormDiscardModal` 4, `FormPanelItem` +5 (23), `FormsPanel` +1 (13, panel + `FormCard` rendered together: item disappears, card shows `chat.forms.deleted`). Coverage thresholds untouched. Not verified in a browser (no backend).

**Review (2026-09-16)** — spec 9.3/13.10/15.2/16/17 and standards checked; `dismissible` verified against the installed Nuxt UI `Modal.vue` (`Boolean`, default `true`); locale key sets identical; modal mirrors the `SessionItemMenu` delete-confirm pattern. Fixed (commit `fix(forms): issue 12 review findings`): (1) medium — the footer sits inside the body's `@focusout` handler, so the dialog's focus trap moving focus into the teleported modal counted as "leaving the form" and flushed the dirty draft the moment the modal opened, issuing the save the spec says not to issue and racing the delete; `FormPanelItem` now skips the focus-out flush while `discardOpen` is set (test: focus-out into the open modal sends no save, after cancel it does). The unit tests stub `UModal`, which is why this was invisible. (2) low — a save already in flight when Discard is confirmed resolved after `removeForm`; `performSave` re-wrote the stale instance into the cache via `applySavedInstance` and, on a late 400, invalidated the removed instance. It now returns `idle` without touching cache or queries when the draft is gone after the response (2 tests in `formDraftSave.test.ts`). (3) info — the `UModal` stub now carries `dismissible` and the modal test asserts it flips with `pending`. Accepted: `removeForm` before the list refetch is a sound ordering for the collapse/unmount flushes (draft removal is synchronous, watchers run in the next flush); the in-flight save is not awaited before the delete (spec says no flush, and `saveFormDraft` would schedule a follow-up save), so server-side ordering of a save landing after a delete is the backend's call — the client now ignores that response either way. Discard/modal buttons are default `md` size (~36 px) like the `SessionItemMenu` modal; the 44 px touch guidance is left for the ticket 11 footer merge so both buttons get the same treatment. Verification after fixes: typecheck clean, lint 0 errors, `test:run` 2018 passed / 3 known failures.
