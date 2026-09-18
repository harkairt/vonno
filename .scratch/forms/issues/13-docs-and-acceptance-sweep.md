# 13: Fence documentation and phase 1 acceptance sweep

**What to build:** A `form` entry in the fence docs describing the fence format, card states, panel behaviour, merge rule with its known limitation (an edit followed by a `FormUpdated` refetch before the 1500 ms save is lost when the field no longer has focus), and the phase plan. Then walk the fourteen acceptance statements in spec section 20 against the dev gallery and the test suite, and fix any gap found. Confirm the messages for the backend team in spec section 22 are still accurate.

Read spec sections 18 (docs), 20, 21, 22 in `.scratch/forms/spec.md`, and the existing fence docs for structure.

**Blocked by:** 06, 07, 09, 10, 11, 12

**Status:** done

**Acceptance criteria:**
- [x] Fence doc exists and matches the structure of the sibling fence docs.
- [x] Every statement in spec section 20 is checked and true; gaps are fixed in this ticket or recorded as a comment with a follow-up.
- [x] Nothing in the codebase calls `ExecuteFormAction` or reads `needsModal` / `severity`.
- [x] `npm run typecheck`, `npm run lint`, `npm run test:run` pass; coverage thresholds not lowered.

## Comments

**2026-09-16 — branch `forms/13`**

Commits:
- `docs(forms): add the form fence reference`
- `docs(forms): record the phase 1 acceptance sweep`

Files touched:
- `docs/messages/form.md` (new)
- `.scratch/forms/issues/13-docs-and-acceptance-sweep.md`

No production code or test changes were needed — the sweep found no gaps, so nothing was rewritten.

### Fence doc

`docs/messages/form.md` follows the sibling docs' shape (fence tag intro, top-level object, fields,
behaviour sections, a "What Gets Rejected" table, six complete examples in quadruple-backtick
fences, renderer details, unsupported features). It also carries the three sections this ticket
asked for specifically: card states, panel behaviour, the merge rule with its known limitation, and
the phase plan. Deviation from the sibling docs, deliberate: the `form` fence has no visual payload
to document, so the field table is one row and the bulk of the document is behaviour rather than
schema. There is no fence docs index to register the new file in.

### Section 20 sweep — per statement

| # | Statement | Result | Evidence |
|---|---|---|---|
| 1 | `form` message type loads without error | pass | `AIAnswerType.Form = 19` mapped from `'form'` in `types/api/schemas.ts`; `MessageBubble` has no `Form` branch so it falls through to text. Test: *routes the Form message type to the text branch*. |
| 2 | Fence shows markdown + card with name, status, Open | pass | `splitFormFences` + `FormCardRow`/`FormCard`. Tests in `FormCard.test.ts` and `MessageBubble.test.ts`. |
| 3 | Card click opens the panel and focuses; mobile opens the slideover | pass | `sessionId.test.ts`: *desktop: opens the forms sidebar, closes the siblings and focuses the form*, *mobile: opens the slideover and focuses the form*. |
| 4 | Creation order; closed forms dimmed, collapsed, read-only when expanded | pass | `FormsPanel.test.ts`: *renders one row per form in list order and dims closed rows*. `FormPanelItem.test.ts`: *dims a closed item, hides the pin and shows the read-only notice without a footer*. |
| 5 | Focus collapses unpinned others; pinned stay expanded | pass | `stores/forms.test.ts`: *focusForm expands the id, collapses every unpinned other id…*, *togglePinned pins and expands; unpinning keeps the item expanded*. |
| 6 | `FormSelected` moves the marker only | pass | `forms-signalr.test.ts`: *FormSelected moves the marker only and does not refetch a known id*. |
| 7 | 1.5 s pause saves with `lastEditedField`; leaving saves at once | pass | `useFormDraft.test.ts`: *saves 1500 ms after the last change with the last edited field*, *flushes when keyboard focus leaves the body, not when it moves inside*, *flushes on collapse before the query is disabled, and on unmount*. |
| 8 | Sending a chat message waits for the pending save | pass | `useSendMessage.formsFlush.test.ts`: *completes the draft save before issuing the send request*. |
| 9 | `FormUpdated` refreshes an expanded form; focused field keeps the user's text | pass | `forms-signalr.test.ts`: *FormUpdated refetch keeps the focused field via the merge rule*; unit coverage in `formMerge.test.ts`. |
| 10 | Submit shows errors first, else confirms then locks | pass | `FormPanelItem.test.ts`: *hides errors before the first attempt, then shows them and focuses the first erroring control*, *confirms a valid form: submits without lastEditedField, locks the item, invalidates and toasts*. |
| 11 | Discard confirms, removes the form; card shows the deleted state | pass | `FormPanelItem.test.ts`: *confirms, cancels the pending autosave and deletes without saving*; `FormsPanel.test.ts`: *removes the item from the panel and the card shows the deleted state after the refetch*. |
| 12 | Custom controls via Nuxt UI; arrays via the vanilla renderer in the design tokens | pass | `renderers/index.ts` registers 8 controls + 4 layouts. Tests: *renders every control through a custom renderer except the array*, *renders an array control through the vanilla renderers*. Vanilla output is styled by the scoped `.form-renderer` rules in `FormRenderer.vue`, which use `hsl(var(--border))` etc. |
| 13 | All texts exist in Hungarian and English | pass | Flattened key diff of `en.json` / `hu.json` is empty in both directions; 47 keys under `chat.forms.*`. |
| 14 | typecheck, lint, test:run pass; coverage thresholds not lowered | pass | See below. `vitest.config.ts` untouched. |

No gaps found, so no follow-up tickets were opened. The merge rule's known limitation (an edit lost
when the field has lost focus and a `FormUpdated` lands inside the remaining debounce window) is
documented in `docs/messages/form.md` rather than filed as a bug — spec section 21 already defers the
per-field dirty tracking that would close it.

### Section 22 — messages for the backend team

All five still accurate:
1. `AIAnswerType.Form` falls to the text branch and is parsed as markdown plus an optional fence. Confirmed.
2. `lib/signalr/types.ts` declares `FormSelected` and `FormUpdated`; `FormService` uses `/api/Form/GetSessionForms`, `GetFormInst`, `SaveFormInst`, `DeleteFormInst`. Confirmed.
3. Repo-wide grep for `needsModal` and `severity` (excluding `node_modules`, `.nuxt`, `.scratch`) finds
   no code reference — the only hits are `docs/API_ENDPOINTS.md`, which documents the backend shape, and
   `docs/messages/form.md`, which states the frontend ignores them. Confirmed.
4. `performSave` in `app/utils/formDraftSave.ts` sends `lastEditedField`; `confirmSubmit` in `FormPanelItem.vue` does not. Confirmed.
5. Repo-wide grep for `ExecuteFormAction` finds no code reference — the only hit is the "Later" list in
   `docs/messages/form.md`. Confirmed.

### Verification

- `npm run typecheck` — clean.
- `npm run lint` — 0 errors, 91 pre-existing warnings.
- `npx vitest run` — 2066 passed, 3 failed. The 3 are the known pre-existing develop failures (2 in `tests/unit/components/chat/ChatMessages.test.ts`, 1 in `tests/unit/lib/validation/barRace.test.ts`), unrelated to forms.

**Review (2026-09-16)**

Reviewed `docs/messages/form.md` line by line against the implementation: `app/utils/formFence.ts`,
`formMerge.ts`, `formStatus.ts`, `app/components/chat/FormCard.vue`, `app/components/forms/*`,
`renderers/index.ts`, `app/composables/useFormDraft.ts`, `useFormQueries.ts`,
`app/utils/formDraftSave.ts`, `app/stores/forms.ts`, `app/plugins/signalr-init.client.ts`,
`lib/signalr/types.ts`, `types/enums/index.ts`. Also re-ran the section 20 sweep independently
rather than trusting the table above, re-grepped for `ExecuteFormAction` / `needsModal` /
`severity`, re-derived the i18n key diff, confirmed every cited test name exists verbatim, and
compared the doc's shape against the sibling fence docs and step 10 of
`.agents/skills/add-fence-type/SKILL.md`.

Two documentation defects found, both minor, both fixed in `docs(forms): correct the FormUpdated
list refetch and the flush triggers`:

1. The SignalR table implied the session forms list is refetched only for an unknown `FormUpdated`
   id. `signalr-init.client.ts:78` invalidates `formQueryKeys.list` on *every* `FormUpdated`; the
   collapsed-item row's "nothing until it expands" was therefore wrong as written. Rewritten as four
   rows that separate the unconditional list invalidation from the instance refetch.
2. The autosave bullet listed "leaving the page" as a flush trigger. There is no `beforeunload` or
   `pagehide` handler anywhere; the real triggers are focusout of the form body, collapse, slideover
   close, send, `onBeforeUnmount`, and the session route watcher in `app/pages/chats/[sessionId].vue`.
   Corrected, and the tab-close gap stated explicitly.

Everything else in the doc checked out, including the fence format and the `instanceId`-only rule,
the five card states with their exact conditions, `FORM_STATUS_COLOR`, the marker dot requiring
`status === 'Open'`, the initial-expansion rule, the pinned/unpinned collapse semantics, read-only
via JSON Forms `readonly` disabling every control, the 1500 ms debounce and 2000 ms `Saved` window,
`lastEditedField` on save but not on submit, the send-flush toast, the merge rule's three steps and
its known limitation, the 8 controls + 4 layouts + unsupported-element fallback, and the phase plan
against spec sections 21 and 22.

Section 20: all fourteen statements verified independently and all hold. No behavioural gap was
found, so no production or test code was changed. Two claims in the table above were phrased too
strongly and have been corrected in place (the greps do return documentation hits, just no code
references). No fence docs index or registry exists, and the skill does not prescribe one —
confirmed, nothing to register.

Verification after the fix: `npm run typecheck` clean; `npm run lint` 0 errors, 91 pre-existing
warnings; `npx vitest run` 2066 passed, 3 failed (the known pre-existing failures only).
`vitest.config.ts` untouched.
