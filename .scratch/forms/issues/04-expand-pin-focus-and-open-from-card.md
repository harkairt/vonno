# 04: Expand, collapse, pin, focus, and open a form from its card

**What to build:** Panel items become collapsible. Clicking a header expands that item and collapses every unpinned other item, scrolls it into view and shows a short highlight ring. The pin button keeps an item expanded through focus changes. Expanding an item enables its instance query and shows a skeleton, an inline error with retry, or (for now) an empty loaded body region, with the closed-form notice for closed forms. Collapsing disables the query. When the panel opens with nothing expanded, the initial expansion rule applies (marker if open and listed, else newest open form, else nothing). Clicking a card in the thread opens the panel (sidebar on desktop, slideover on mobile) and focuses that form, including closed ones in read-only mode.

Delivers: store expansion/pin/focus actions (`focusForm`, `toggleExpanded`, `collapse`, `togglePinned`, `removeForm`, transient `lastFocusedId`), `useFormInstance` enabled only while expanded, `FormPanelItem` header button with `aria-expanded`/`aria-controls`, pin button as a DOM sibling (not nested), `UCollapsible` body controlled by the store, the page `openForm` handler, i18n `pin`, `unpin`, `expand`, `collapse`, `closedNotice`.

Read spec sections 9.2 (`useFormInstance`), 10, 11.3 (collapsed items fetch nothing), 13.6 to 13.12 in `.scratch/forms/spec.md`.

**Blocked by:** 03

**Status:** done-with-notes

**Test first (TDD):**
- Store: `focusForm` collapses unpinned only, `togglePinned` expands, unpin keeps expanded, manual collapse of a pinned item is allowed, `removeForm` clears the marker, `reset`.
- `useFormInstance`: disabled while collapsed, fetches on expand.
- `FormPanelItem`: `aria-expanded`, pin `aria-pressed`, closed item dimmed with no pin and no footer.
- `FormsPanel`: initial expansion rule for marker open, marker closed, no marker, no open forms; card-driven focus of a closed form.

**Acceptance criteria:**
- [x] The pin behaviour table in spec 13.12 holds.
- [x] Focus highlight respects `prefers-reduced-motion` and does not move keyboard focus.
- [x] Card click on desktop opens the sidebar and focuses the form after `nextTick`; on mobile it opens the slideover.
- [x] Invalidating a collapsed item's instance query triggers no fetch.
- [x] typecheck, lint, test:run pass; coverage thresholds not lowered.

## Comments

**2026-09-16 — done-with-notes** (branch `forms/04-expand-pin-focus`, commit `e70a1ba`)

What was built:

- `app/stores/forms.ts`: `focusForm`, `toggleExpanded`, `collapse`, `togglePinned`, `removeForm` per the spec 10 table, plus transient `lastFocusedId` and `lastFocusSeq`. `reset()` clears both.
- `app/composables/useFormQueries.ts`: `useFormInstance(sessionId, agentId, instanceId, enabled)` keyed by `formQueryKeys.instance`, enabled only when the list conditions hold and `enabled` is true, same throw/retry rules as the list query. Default `staleTime` (0), so an item re-expanded after an invalidation refetches; a collapsed item never fetches (test covers `invalidateQueries` while disabled).
- `app/components/forms/FormPanelItem.vue`: header `button` (`aria-expanded`, `aria-controls`, `title` = `chat.forms.expand`/`collapse`) with chevron rotating 90° via `transition-transform duration-200 ease-out`; pin `UButton` ghost square xs as a DOM sibling with `aria-pressed`/`aria-label`; closed items dim the header row (`opacity-60`) and hide the pin. Body is `UCollapsible :open` (store-controlled, `#content` slot only, default trigger slot unused). Body root has `id="form-panel-body-<instanceId>"` and `data-form-instance-id`; shows three `USkeleton` rows while pending, `UAlert` with `getUserFriendlyMessage` + `errors.tryAgain` retry on failure, and on success an empty region `data-testid="form-panel-body-loaded"` plus the muted `chat.forms.closedNotice` for closed forms. Focus: watches `lastFocusSeq`, `scrollIntoView({ block: 'nearest', behavior })` with `behavior` `'auto'` under `usePreferredReducedMotion() === 'reduce'` else `'smooth'`; ring `ring-2 ring-[hsl(var(--primary)/0.5)]` for 1500 ms, with `transition-shadow` omitted under reduced motion. Keyboard focus is never moved.
- `app/components/forms/FormsPanel.vue`: passes `agentId` to items; initial expansion rule runs once per mount (in `onMounted` for cached lists, or a `flush: 'post'` watch when the list arrives later) so the items are already mounted and can scroll/ring.
- `app/pages/chats/[sessionId].vue`: `handleOpenForm` wired to `ChatMessages @open-form` — `ensureSession`, mobile → slideover, desktop → close siblings + open forms sidebar, `await nextTick()`, `focusForm`.
- i18n `chat.forms.pin`, `unpin`, `expand`, `collapse`, `closedNotice` in `hu.json` and `en.json`.

Decisions / deviations:

- **`lastFocusSeq`** was added beside `lastFocusedId`: a plain string ref cannot re-trigger a watcher when the same form is focused twice (e.g. clicking the same card again). Items watch the sequence and compare the id.
- **`aria-controls` is bound only while expanded** because `UCollapsible` unmounts the body when closed (`unmountOnHide` default), so the referenced id would otherwise dangle.
- **Pin rule interpretation**: spec 10 says a manually collapsed pinned item "becomes expanded again on the next `togglePinned`", but the action table says `togglePinned` on a pinned item only unpins. The table was followed: unpin never changes `expandedIds`; a collapsed pinned item re-expands on `focusForm` of itself or on the next pin (unpin → pin). Store test covers this.
- Card click after the panel was empty: the initial expansion rule (post-mount) and the page `focusForm` (after `nextTick`) both run; the card's `focusForm` runs last, so the card's form ends up expanded and highlighted. The initially expanded open form collapses (unless pinned) as the spec table requires.
- Header button got `hover:bg-[hsl(var(--muted)/0.5)] transition-colors duration-150` (repo norm) for click affordance; not in the spec, purely visual.
- `removeForm` uses `Object.fromEntries(filter)` instead of `delete` (lint rule `no-dynamic-delete`).
- Existing `FormsPanel` test assertions were adjusted for the new DOM: `opacity-60` sits on the header row inside the item (not the item root), and after the list loads, an expanded item's own instance skeleton may legitimately be on screen.
- Ticket 05+ not touched: no JSON Forms, no drafts/autosave, no SignalR, no submit/discard footer buttons, no save-status header text.

Verification (worktree, filtered):

- `npm run typecheck`: 0 errors.
- `npm run lint`: 0 errors (1 pre-existing warning `sonarjs/no-collapsible-if` in `shouldRetryFormQuery`, untouched).
- `npm run test:run`: 163 files, 1883 tests — 1880 passed, 3 failed, all pre-existing and out of scope (2× `tests/unit/components/chat/ChatMessages.test.ts` options-copy, 1× `tests/unit/lib/validation/barRace.test.ts` oversize guard). `vitest.config.ts` untouched.
- New/extended tests: `tests/unit/app/stores/forms.test.ts` (12), `tests/unit/composables/useFormQueries.test.ts` (13), `tests/unit/components/forms/FormPanelItem.test.ts` (12, new), `tests/unit/components/forms/FormsPanel.test.ts` (12), `tests/unit/pages/chats/sessionId.test.ts` (+3 in "open a form from its card").

Notes for ticket 05 (JSON Forms renderer):

- Mount point: `FormPanelItem.vue`, the `<div v-else-if="instance" data-testid="form-panel-body-loaded">` inside the `UCollapsible` `#content` slot (currently holds only the closed notice). Place `FormRenderer` above the notice; the footer (13.10 buttons) goes below.
- Available in that scope: `instance` (`FormInstance` from `useFormInstance`: `schema`, `uischema`, `data`, `status`, `instanceId`, `formInstId`, `formId`), `isClosed` (`form.status !== 'Open'` — use for `readonly`), `props.sessionId`, `props.agentId`, `props.form` (`SessionFormSummary`), `formsStore`, `isExpanded`, `refetch`, `isFetching`.
- The body root already carries `data-form-instance-id` (needed for 13.9's `focusin`/`focusout` flush rule and field focus tracker in ticket 08).
- The instance query is disabled the moment `isExpanded` turns false; ticket 08 must flush the draft before that (watch `isExpanded` with `flush: 'sync'` or do it in the store's `collapse`).
- Test stubs: component tests stub `UCollapsible` as `<div><slot /><slot v-if="open" name="content" /></div>`; reuse it (see `tests/unit/components/forms/FormPanelItem.test.ts`). `Element.prototype.scrollIntoView` is stubbed per test there because happy-dom lacks it.

