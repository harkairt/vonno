# 10: Flush dirty forms before sending a message, on slideover close, and on session change

**What to build:** Sending a chat message first saves every dirty form of the session in parallel and only then issues the send. If any flush fails, one toast "Form changes could not be saved." appears and the message is still sent; the inline status stays. After a successful send, all form queries of the session are invalidated so mounted instances refresh. Closing the mobile slideover and leaving the session (route change or page unmount) also flush every dirty form, using the plain save function from ticket 08 so collapsed-but-dirty drafts are covered.

Read spec sections 9.4 (`useSendMessage` success), 14.4 (the "before send", slideover, and session-change triggers), 16, 17 (`flushFailed`) in `.scratch/forms/spec.md`.

**Blocked by:** 08

**Status:** done

**Test first (TDD):**
- `useSendMessage` integration: a dirty form's save request is issued and completes before the send request (assert request order via MSW); a flush failure shows exactly one toast and the send still happens; success invalidates the form key root.
- `FormsSlideover` close flushes dirty forms.
- Page: switching session flushes the old session's dirty forms.

**Acceptance criteria:**
- [x] Acceptance statement 8 of the spec holds.
- [x] Flush runs without a mounted `useFormDraft` for collapsed dirty drafts.
- [x] Both locales have `flushFailed`.
- [x] typecheck, lint, test:run pass; coverage thresholds not lowered.

## Comments

**2026-09-16 — done on branch `forms/10` (worktree `.claude/worktrees/forms-10`)**

Commits:
- `747f05b` feat(forms): flush dirty drafts before send, on slideover close and on session leave
- docs commit (this file)

Files:
- `app/utils/formDraftSave.ts` — `flushSessionFormDrafts(sessionId, agentId | undefined, deps): Promise<FormSaveStatus[]>`; `Promise.all` over `store.dirtyInstanceIds(sessionId)` with `saveFormDraft`; returns `[]` when `agentId` is undefined (no forms can be loaded without one). Shared by all three triggers.
- `app/composables/useChatMutations.ts` — `useSendMessage` `mutationFn` awaits the flush before `chatService.sendQuestion` (after `onMutate`, so the optimistic bubble is already visible); one `chat.forms.flushFailed` error toast when any status is `'error'`; `onSuccess` invalidates `formQueryKeys.all(sessionId)` after `confirmSend`.
- `app/components/forms/FormsSlideover.vue` — `watch(open)` true → false flushes.
- `app/pages/chats/[sessionId].vue` — `watch(route.params.sessionId)` flushes when it moves away from the page's own `sessionId`; `onBeforeUnmount` flushes too.
- Locales: `chat.forms.flushFailed` in `en`/`hu`.
- Tests: `tests/unit/composables/useSendMessage.formsFlush.test.ts` (4: save completes before send via MSW order, no save when clean, two failing flushes → exactly one toast + send still happens + drafts stay dirty, success invalidates the key root), `tests/unit/components/forms/FormsSlideover.test.ts` (2), `tests/unit/pages/chats/sessionId.test.ts` (+2: reactive route param change, unmount).

Decisions / deviations:
- The page reads `route.params.sessionId` once at setup and remounts per path, so in practice `onBeforeUnmount` covers navigation; the route watcher is kept as the ticket asks and is harmless (the second flush finds clean drafts or coalesces with the in-flight save).
- Inline statuses are left to `saveFormDraft`; `useSendMessage` only adds the toast. Failed drafts stay dirty and are retried by the next trigger.
- Invalidation uses the default `refetchType: 'active'`: mounted instance/list queries refetch, collapsed instance queries are marked stale.
- Not verified in a browser (no backend).

Verification: `npm run typecheck` clean; `npm run lint` 0 errors (90 pre-existing warnings, none in touched files); `npm run test:run` 2010 passed / 3 failed (the known develop failures in `ChatMessages.test.ts` ×2 and `barRace.test.ts`), 180 files. Coverage thresholds untouched.

**Review (2026-09-16)**

Fixed: `flushSessionFormDrafts` used `Promise.all`, so a save that *rejected* (as opposed to resolving `'error'`) would have escaped `mutationFn`, failed the send, rolled back the optimistic bubble and reported a flush problem as a send error — against 14.4/16 ("the message is sent"). Now `Promise.allSettled`, rejections map to `'error'` (one toast, send proceeds). Covered by two new `flushSessionFormDrafts` tests in `tests/unit/utils/formDraftSave.test.ts` (a rejecting save is reported as `'error'` next to the successful one, both requests still hit MSW; no request without an `agentId`). Accepted: (a) `agentId` sourced from the session query — drafts only come from `useFormDraft` inside `FormPanelItem`, whose queries need the `agentId`, and on close/leave the session data is still cached; the residual case (session fetch fails on a later visit while an old dirty draft exists) skips the flush and the next trigger retries, and moving `agentId` onto the draft would reopen ticket 08's store shape. (b) The invalidation test uses a `queryClient` spy; the order, failure-toast and leave tests are behavioural at the MSW boundary, so this is fine. (c) The route watcher plus `onBeforeUnmount` double flush is harmless: the second call coalesces into the in-flight save and its follow-up `performSave` finds a clean draft (no extra request). Confirmed: all `useSendMessage` callers are in setup context; flush runs after `onMutate`, so the optimistic bubble is visible during the wait; a flush `'error'` never throws into the send error path; both locales carry `flushFailed`.

