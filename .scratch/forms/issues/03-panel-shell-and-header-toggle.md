# 03: Forms panel shell, header toggle, sidebar and slideover

**What to build:** The session header gets a third toggle button (clipboard icon, badge with the open-form count, marker dot). On desktop it opens a forms sidebar that is mutually exclusive with the bookmark and file preview sidebars and shares their resize handle. On mobile it opens a full-screen slideover. Both wrap one shared `FormsPanel` that lists every form of the session in creation order as a static row (icon, name, status badge, marker dot), with loading (three skeletons), error (inline + retry) and empty states. The first successful list response initialises the marker. Items do not expand yet.

Delivers: `FormsPanel`, `FormsSidebar`, `FormsSlideover`, `FormPanelItem` header row (no chevron behaviour yet), page changes (`formsSidebarOpen`, `'forms'` in `activeSidebar`, toggle functions, Escape rule), header toggle with `data-testid="forms-sidebar-toggle"`, i18n keys `title`, `toggleSidebar`, `empty`, `count`.

Read spec sections 13.1 to 13.5 (rows only), 13.8 (items 2 to 5 of the header), 17 in `.scratch/forms/spec.md`. Follow `FocusedMessagesSidebar` for structure. Reuse the existing `usePanelResize` instance.

**Blocked by:** 02

**Status:** done-with-notes

**Test first (TDD):**
- Header toggle: badge count equals open forms, hidden at 0; marker dot when the marker points to a listed open form; desktop click opens the sidebar and closes the siblings; mobile click opens the slideover.
- `FormsPanel`: order matches list order, empty state, error state with retry, `initSelectedFromList` runs once.

**Acceptance criteria:**
- [x] Toggle is visible on desktop and mobile once the session is loaded and is the only sidebar toggle on mobile. (page test: desktop and mobile cases)
- [x] Opening the forms sidebar closes bookmark and file preview sidebars, and vice versa. (page test: focus↔forms both directions, forms→files; the files→forms and auto-open paths follow the same code)
- [x] Panel lists forms in creation order with closed rows at `opacity-60`. (FormsPanel test)
- [x] Slideover has title, close button, 100 % width and height, `v-model:open` bound to the page. (title prop, `USlideover` default close button, `:ui="{ content: 'max-w-full' }"` on top of the theme's `w-full inset-y-0`; binding verified in the page test through a `USlideover` stub, not in a browser)
- [x] Both locales have the new keys.
- [x] typecheck, lint, test:run pass; coverage thresholds not lowered. (3 pre-existing failures, see comments)

## Comments

**2026-09-16 — implemented on `forms/03-panel-shell`, commit `ab74ae0`.**

Built:
- `app/components/forms/FormsPanel.vue` — list via `useSessionForms`; `isPending` → three `USkeleton` rows; `isError` → `UAlert color="error"` with a retry `UButton` (`errors.tryAgain`, `:loading="isFetching"`, calls `refetch()`); empty → icon + `chat.forms.empty`; otherwise one `FormPanelItem` per form in list order keyed by `instanceId`.
- `app/components/forms/FormPanelItem.vue` — static header row only: chevron (static), form icon, truncated name (`chat.forms.untitled` fallback), status badge, marker dot (`role="img"`, `chat.forms.agentSelected`) when marker → this open form. Closed rows get `opacity-60`. `data-testid="form-panel-item"`, `data-instance-id`.
- `app/components/forms/FormsSidebar.vue` — structure/classes of `FocusedMessagesSidebar`; header with close button, `chat.forms.title`, `chat.forms.count`; body scroll container with `FormsPanel`. Props `sessionId`, `agentId?`, `contentWidth`; emits `close`. `data-testid="forms-sidebar"`.
- `app/components/forms/FormsSlideover.vue` — `USlideover side="right"`, `:ui="{ content: 'max-w-full', body: 'p-0' }"`, title, default close button, `FormsPanel` in `#body`; `open` prop + `update:open` emit (works with `v-model:open`).
- `app/utils/formStatus.ts` — `FORM_STATUS_COLOR` / `FORM_STATUS_KEY` extracted from `FormCard.vue` (which now imports them) so the card and the panel item share one mapping.
- Page `app/pages/chats/[sessionId].vue` — `formsSidebarOpen`, `formsSlideoverOpen`, `activeSidebar` returns `'focus' | 'files' | 'forms' | null` (precedence focus, files, forms), `toggleFormsSidebar()`, `handleFormsToggle()` (mobile → slideover, desktop → sidebar), the two sibling toggles plus `toggleFocus` auto-open and `handlePreviewFile` also close the forms sidebar. `FormsSidebar` mounted when `activeSidebar === 'forms'` with `contentWidth = sidebarWidth - 4` from the existing `usePanelResize`; `FormsSlideover` mounted with `v-if="isMobile"`. Header toggle: `data-testid="forms-sidebar-toggle"`, visible whenever `session` is loaded (desktop and mobile), `i-heroicons-clipboard-document-list` / `-solid` when the sidebar or slideover is open, badge markup copied from the bookmark toggle (count of `Open` forms, hidden at 0), marker dot at the top-right of the icon in `--brand-soft`. The page mounts `useSessionForms(sessionId, () => session.value?.agentId)`.
- Escape: extended the existing `onKeyStroke('Escape')` handler. The forms sidebar closes unless the event target is inside a `[role="dialog"]` (an open modal traps focus) or is a field (`input, textarea, select, [contenteditable]`) inside the sidebar element.
- i18n `chat.forms.title`, `toggleSidebar`, `empty`, `count` in hu and en.
- Tests: `tests/unit/components/forms/FormsPanel.test.ts` (5 tests: order + dimming, skeletons, empty, error + retry, marker init once), `tests/unit/pages/chats/sessionId.test.ts` new describe (4 tests: badge + marker dot, hidden badge/dot, desktop exclusivity, mobile slideover).

Decisions / deviations:
- `initSelectedFromList` is not called again in `FormsPanel`: `useSessionForms` (ticket 01) already runs it on every data change and the store guards with `selectedInitialized`. The panel test verifies the behaviour (first response wins; a refetch with a different `selectedInstanceId` does not move the marker).
- Sidebar close icon is `i-heroicons-x-mark-20-solid` (same glyph as `FocusedMessagesSidebar`) rather than the spec's `i-heroicons-x-mark`, to keep the two sidebars visually identical.
- The marker dot on the toggle always sits beside the badge (top-right of the icon): a visible marker implies at least one open form, so the count badge is always present with it.
- The spec's "flush every dirty form when the slideover closes" (13.3) belongs to the ticket that introduces drafts; nothing to flush yet.
- Mobile page tests mock `~/composables/useNavigationVisibility` as a module (with a `vi.hoisted` switch) because the page imports it directly, so the global `useNavigationVisibility` mock from `tests/setup.ts` is bypassed there.
- `FormsPanel` error description uses `error.message` (guarded by `instanceof Error`; the query error type is not narrowed).

Verification (worktree):
- `npm run typecheck`: 0 errors.
- `npm run lint`: 0 errors; no warnings in touched files (pre-existing warnings elsewhere unchanged).
- `npm run test:run`: 162 files (160 passed, 2 failed), 1849 tests (1846 passed, 3 failed). The 3 failures are the known pre-existing ones: 2 in `tests/unit/components/chat/ChatMessages.test.ts` (options copy), 1 in `tests/unit/lib/validation/barRace.test.ts`.
- `vitest.config.ts` untouched.

Notes for ticket 04 (expand / pin / focus):
- `FormPanelItem` has no `agentId` prop yet (not needed by the static row); add it with `useFormInstance` and wrap the row: header `button` (`aria-expanded`, `aria-controls`) + pin `UButton` as siblings, `UCollapsible` body below. The chevron is `i-heroicons-chevron-right-20-solid`; rotate it with the motion recipe.
- Spec 13.5 item 5 (initial expansion rule on mount / when the panel becomes visible) is not implemented; `FormsPanel` currently only renders rows.
- `FormsPanel` root has `data-testid="forms-panel"`; `FormsSidebar` root `data-testid="forms-sidebar"`; the page holds `formsSidebarRef: Ref<ComponentPublicInstance | null>` for the Escape rule — the field check (`input, textarea, select, [contenteditable]`) is where JSON Forms widgets will be matched.
- Page `openForm` handler: `ChatMessages`/`MessageBubble` emit `openForm(instanceId)`; on desktop call `toggleFormsSidebar()` if closed (or set `formsSidebarOpen = true`), on mobile set `formsSlideoverOpen = true`, then the store expand/focus actions.
- `FORM_STATUS_COLOR` / `FORM_STATUS_KEY` live in `app/utils/formStatus.ts` for the footer/closed notice.
