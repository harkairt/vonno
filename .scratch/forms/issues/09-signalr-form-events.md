# 09: SignalR `FormUpdated`, `FormSelected`, and list refresh on `ReceiveMessage`

**What to build:** The panel reacts to the agent. `FormUpdated` for an expanded form refetches it and the merge rule keeps the focused field's text; for a collapsed form nothing fetches until expand; for an unknown id the list refetches and the new form appears at the end, collapsed, and the header badge updates. `FormSelected` moves the marker only (dot on the card, the header toggle, and the item), refetching the list once if the id is unknown; `FormSelected(null)` clears it. Every `ReceiveMessage` also refetches the forms list. Malformed payloads log a warning and are ignored.

Delivers: registry entries for the two events, handler registration next to `ReceiveMessage` respecting the `listenersRegistered` guard, the extra list invalidation in the `ReceiveMessage` handler.

Read spec sections 4.7, 9.4, 11, 19.5 in `.scratch/forms/spec.md`. Use the fake hub test utility.

**Blocked by:** 08

**Status:** done

**Test first (TDD, using the fake hub):**
- `FormUpdated` expanded refetches; collapsed fetches nothing until expand; unknown id refetches the list and the item appears.
- `FormSelected` sets the marker without changing `expandedIds`; `null` clears; unknown id refetches the list once.
- `ReceiveMessage` refetches the forms list and keeps the existing invalidations.
- The merge rule keeps the focused field on a `FormUpdated` refetch.
- Invalid `sessionId` / `instanceId` payloads warn and return.

**Acceptance criteria:**
- [x] Spec 11.3 effects on screen hold.
- [x] Nothing expands, collapses, or scrolls on `FormSelected`.
- [x] typecheck, lint, test:run pass; coverage thresholds not lowered.

## Comments

**2026-09-16 — done on branch `forms/09` (worktree `.claude/worktrees/forms-09`)**

Commits:
- `c306843` feat(forms): handle FormUpdated and FormSelected hub events — `lib/signalr/types.ts`, `app/plugins/signalr-init.client.ts`, `tests/unit/plugins/signalr-init.test.ts`
- `5191376` test(forms): cover hub form events end to end with the fake hub — `tests/integration/forms-signalr.test.ts`
- docs commit (this file)

Built:
- `lib/signalr/types.ts` — `SignalREventRegistry` gains `FormUpdated: [sessionId: string, instanceId: string]` and `FormSelected: [sessionId: string, instanceId: string | null]`.
- `app/plugins/signalr-init.client.ts` — two handlers registered inside `setupChatEventListeners`, right after `ReceiveMessage`, so the existing `listenersRegistered` guard covers them. Payloads are validated with zod tuples (`z.string().min(1)`, nullable for the selected id); a failed parse logs `logger.warn('Invalid FormUpdated/FormSelected payload:', args)` and returns. `FormUpdated` invalidates `formQueryKeys.instance(sessionId, instanceId)` and `formQueryKeys.list(sessionId)`. `FormSelected` calls `useFormsStore().setSelected(sessionId, instanceId)`; when the id is not null and not in the cached list (`queryClient.getQueryData(formQueryKeys.list(sessionId))`, also when no list is cached) it invalidates the list once. `ReceiveMessage` additionally invalidates `formQueryKeys.list(sessionId)` after the existing three invalidations.

Decisions / deviations:
- The warning for malformed payloads is unconditional (not gated on `import.meta.dev` like the neighbouring `ReceiveMessage` warning) so the ticket's "log a warning" is observable in production logs and in tests.
- No new store API: `setSelected` from ticket 03 is exactly the marker write spec 11.2 asks for; `expandedIds` and `focusForm` are never touched.
- "Header badge count updates" is verified through the list cache (`forms.length` grows by one after the refetch) and the panel rows; the badge text itself derives from `data.forms.length` in `FormsSidebar`, which is not re-rendered in the test.
- Pre-existing advisory lint warning `max-lines-per-function` on the plugin setup function (was already ~102 lines before this ticket; now 104). Left as is.

Verification: `npm run typecheck` clean; `npm run lint` 0 errors (91 warnings, all pre-existing apart from the line-count one above); `npm run test:run` 2026 passed / 3 failed (the known develop failures in `ChatMessages.test.ts` ×2 and `barRace.test.ts` ×1), 179 files. New tests: `tests/unit/plugins/signalr-init.test.ts` +16 (28 total: list invalidation on `ReceiveMessage`, `FormUpdated` invalidations, 5 malformed `FormUpdated` and 4 malformed `FormSelected` payloads warn and return, marker set/clear without touching `expandedIds`, unknown id and no-cache invalidate the list once, dedupe guard covers the form listeners); `tests/integration/forms-signalr.test.ts` 8 (fake hub + real QueryClient + MSW: expanded refetch, collapsed fetches nothing until expand, unknown id appends the form to the list and renders the new row last and collapsed in `FormsPanel`, merge rule keeps the focused `/company/taxId` on a `FormUpdated` refetch, `FormSelected` known id moves the marker with no refetch, unknown id refetches once, `null` clears, `ReceiveMessage` refetches the list). Coverage thresholds untouched. Not verified in a browser (no backend).

**Review (2026-09-16)** — spec (4.7, 9.4, 11, 19.5) and standards pass; the code matches the invalidation map and 11.2 step by step, the event names and tuple arity match 11.1, and the handlers sit under the `listenersRegistered` guard (dedupe test covers reconnect). Fixed (low): the acceptance criterion "nothing scrolls on `FormSelected`" was not asserted anywhere — the unit and integration `FormSelected` tests now also check `formsStore.lastFocusSeq` (the transient scroll/highlight trigger) is unchanged. Accepted: (a) `FormSelected` invalidating the list when no list is cached — spec 11.2 step 4 reads literally as "not in the cached list", and `invalidateQueries` on an absent key is a no-op; (b) the unconditional `logger.warn` for malformed payloads — spec 11.2 asks for a warning, a backend contract violation is worth a production log line, and the dev-gated `ReceiveMessage` warning is pre-existing and out of scope; (c) `fake.setState('connected')` to trigger registration — same pattern as `chat-mutations-cache.test.ts` and `session-refetch-duplication.test.ts`; (d) `FormSelected` rejects an empty-string `instanceId`, stricter than 11.2 step 2 ("not null and not a string") — an empty id would set a bogus marker and refetch, so the stricter guard is preferable; (e) the new registry entries have no JSDoc unlike their neighbours — the labelled tuple names already state the contract, no comment added. "Badge count updates" is verified via the list cache and panel rows only (noted by the implementer); acceptable since the badge is a pure derivation of `forms.length`. Verification after the fix: targeted files 36/36; typecheck clean; lint 0 errors / 91 warnings; `test:run` 2026 passed / 3 failed (known develop failures only).
