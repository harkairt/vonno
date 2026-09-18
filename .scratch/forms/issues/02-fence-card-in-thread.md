# 02: Form fence renders a card in the message bubble

**What to build:** When an agent message contains a ```` ```form ```` fence with `{ "instanceId": "…" }`, the bubble shows the surrounding markdown and, below it, a card with the form icon, name (or "untitled"), status badge, marker dot, and an "Open" call to action. A fence-only message shows just the card. Unknown ids show the faint "deleted" state; a failed list query shows "not available"; an invalid fence body renders nothing and removes the fence text. Clicking the card (or pressing Enter/Space) emits `openForm`, which `ChatMessages` forwards to the page. The page does not handle it yet.

Delivers: `splitFormFences` utility, `formQueryKeys` + `useSessionForms`, a minimal `useFormsStore` (`ensureSession`, `setSelected`, `initSelectedFromList`, `reset`, wired into the global test state reset), `FormCard`, `FormCardRow`, `MessageBubble` routing, `ChatMessages` forwarding, card i18n keys in both locales, and the dev gallery fixtures (text + fence, fence only, two fences, unknown id, invalid body) in the markdown and thread fixtures.

Read spec sections 9.1, 9.2 (`useSessionForms` only), 10 (marker parts only), 12, 17, 18 (fixtures) in `.scratch/forms/spec.md`. Keep the `MarkdownContent` instance stable while streaming; the fence must not go through the Teleport pipeline.

**Blocked by:** 01

**Status:** done-with-notes

**Test first (TDD):**
- `splitFormFences` unit cases from spec 19.1 (empty, none, one, two, duplicates, invalid JSON, non-object, missing id, unclosed at end, mid-text, whitespace collapse, other fences untouched).
- `useSessionForms`: disabled without `agentId`, fetches with both, throws on error.
- `FormCard`: loading, found per status, marker dot, missing, error, click and keyboard emit `openForm`.
- `MessageBubble`: text + fence, fence only, `Form` type falls to the text branch, existing messages unchanged.

**Acceptance criteria:**
- [x] Card states loading / found / missing / error render as specified (section 12.3); the whole card is one accessible button.
- [x] `openForm(instanceId)` bubbles from card to `ChatMessages`.
- [x] Form query keys live under their own `['forms', sessionId]` root, not under the chat session key.
- [x] `hu.json` and `en.json` both have the card keys (`untitled`, `open`, `deleted`, `unavailable`, `agentSelected`, `status.*`).
- [x] Dev gallery thread shows all five fixture messages.
- [x] typecheck, lint, test:run pass; coverage thresholds not lowered. (test:run has 3 failures that pre-exist on `develop` and are out of scope; see Comments.)

## Comments

**2026-09-16 — implemented and verified on branch `forms/02-fence-card-in-thread` (worktree `.claude/worktrees/forms-02`).**

Built:
- New: `app/utils/formFence.ts` (`splitFormFences`, `hasFormFence`), `app/composables/useFormQueries.ts` (`formQueryKeys`, `useSessionForms`, `shouldRetryFormQuery`), `app/stores/forms.ts` (`useFormsStore`: `sessions`, `ensureSession`, `setSelected`, `initSelectedFromList`, `reset`), `app/components/chat/FormCard.vue`, `app/components/chat/FormCardRow.vue`.
- Modified: `app/components/chat/MessageBubble.vue` (fallback branch splits fences, `agentId` prop, `openForm` emit), `app/components/chat/ChatMessages.vue` (passes `agentId`, forwards `openForm`), `i18n/locales/{en,hu}.json` (`chat.forms.*`), `tests/utils/resetAllState.ts` (`useFormsStore().reset()`), dev gallery: `app/dev/fixtures/markdown.ts`, `app/dev/fixtures/thread.ts`, `app/pages/dev/gallery.vue`.
- Tests: `tests/unit/utils/formFence.test.ts`, `tests/unit/composables/useFormQueries.test.ts`, `tests/unit/app/stores/forms.test.ts`, `tests/unit/components/chat/FormCard.test.ts`, and a new `MessageBubble — form fences` block in `tests/unit/components/chat/MessageBubble.test.ts` (incl. `Form` type falls to text branch, invalid body renders nothing, `MarkdownContent` instance kept while a streaming message grows a fence).

Decisions / deviations visible in the code:
- `useSessionForms` accepts `MaybeRefOrGetter` for both ids (spec says `Ref`); callers pass getters. Key is exactly `['forms', sessionId, 'list']`; `agentId` is a fetch param only, so the `@tanstack/query/exhaustive-deps` rule is disabled on that call with the same justification comment used in `useChatQueries.ts`.
- `useSessionForms` sets `staleTime` to 5 min because every card in a thread observes the same list query; mutations/SignalR (later tickets) are expected to invalidate it. It also seeds `formsStore.initSelectedFromList` from the first response (`watch(query.data, ..., { immediate: true })`).
- `useFormsStore` is keyed per session (`sessions[sessionId]`) and already carries `expandedIds`, `pinnedIds`, `drafts` fields (empty) so ticket 03/04 do not need to reshape it. The marker check in `FormCard` reads `sessions[sessionId]?.selectedInstanceId`.
- `FormCard` and `FormCardRow` take an optional `agentId` prop in addition to `sessionId`/`instanceId`; `MessageBubble` gets it from `ChatMessages` (`props.agentId`). Without an `agentId` the query is disabled and the card stays in the skeleton state.
- `MessageBubble` only calls `splitFormFences` when `hasFormFence` is true, so existing messages take the unchanged path; the `MarkdownContent` element has no fence-dependent key.
- Fixture ids used by the gallery: `form-inst-open`, `form-inst-submitted`, `form-inst-cancelled`, `form-inst-deleted` (unknown), plus an invalid-body fence.

Verification (worktree, 2026-09-16):
- `npm run typecheck`: 0 errors.
- `npm run lint`: 0 errors, 60 warnings (all pre-existing, none introduced). Two lint errors were fixed during verification: unused capturing group in `formFence.ts` (`(?:\r?\n){3,}`) and the `exhaustive-deps` disable comment placement in `useFormQueries.ts`.
- `npm run test:run`: 161 files, 1840 tests — 1837 passed, 3 failed. The 3 failures pre-exist on `develop` and are out of scope: `tests/unit/components/chat/ChatMessages.test.ts` (2 × copying an options message) and `tests/unit/lib/validation/barRace.test.ts` (1 × oversize body).
- `git diff develop -- vitest.config.ts` is empty (thresholds untouched).

Commits (on `forms/02-fence-card-in-thread`):
- `2f98945` feat(forms): render form fence cards in message bubbles
- `e54ca2f` chore(dev): add form fence fixtures to the gallery thread

Notes for ticket 03 (panel shell):
- Consume `useSessionForms(sessionId, agentId)` from `@/app/composables/useFormQueries` for the list; add `useFormInstance` next to it using `formQueryKeys.instance(...)` and `shouldRetryFormQuery`.
- `useFormsStore()` already has per-session `expandedIds`/`pinnedIds`/`drafts`/`selectedInstanceId`; extend it with the panel actions rather than creating a second store. It is reset in the global test `beforeEach`.
- Reuse the `chat.forms` i18n namespace (`untitled`, `open`, `deleted`, `unavailable`, `agentSelected`, `status.*`) and add panel keys under it in both locales.
- The page (`pages/chats/[id].vue`) does not yet handle `ChatMessages`'s `openForm` event; ticket 03 wires it to open/expand the panel item.
