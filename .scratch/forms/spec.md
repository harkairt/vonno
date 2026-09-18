# Forms (JSON Forms) in the chat frontend

Status: draft, confirmed in grilling on 2026-09-15 and 2026-09-16
Scope: phase 1 (see section 21 for later phases)
Language: this document uses ASD-STE100 style. Sentences are short. Each sentence gives one fact or one instruction. "Must" marks a requirement. "Can" marks a permission.

---

## 1. Purpose

The agent can open a form in a conversation. The user fills the form in the chat frontend. The frontend saves the data to the backend. The agent reads the data. The user submits or discards the form.

This document tells the implementer what to build. It tells the tester what to check. It does not contain code.

## 2. Terms

Use these terms. Do not use synonyms.

| Term | Meaning |
|---|---|
| form | One form instance. The backend identifies it by `instanceId` (string). |
| form definition | The template of a form. The backend identifies it by `formId` (number or null). |
| ad hoc form | A form with `formId: null`. Its `formName` is also null. |
| status | One of `Open`, `Submitted`, `Cancelled`. |
| open form | A form with status `Open`. The user can edit it. |
| closed form | A form with status `Submitted` or `Cancelled`. Nobody can edit it. |
| forms list | The result of `GetSessionForms` for one session. |
| instance data | The result of `GetFormInst` for one form. It contains `schema`, `uischema`, `data`, `status`. |
| draft | The data the user edits in the browser. It can differ from the instance data on the server. |
| dirty | The draft differs from the last data that the frontend sent or received. |
| save | A `SaveFormInst` call without `status`. |
| submit | A `SaveFormInst` call with `status: "Submitted"`. |
| discard | A `DeleteFormInst` call. |
| flush | Save the draft now, without waiting for the debounce. |
| fence | A markdown code block with the language `form`. |
| card | The compact view of one form inside a message bubble. |
| panel | The area that shows all forms of the session. On desktop it is a right sidebar. On mobile it is a slideover. |
| item | One form inside the panel. It has a header and a body. |
| expanded item | An item whose body is visible. |
| collapsed item | An item whose body is hidden. |
| pinned item | An item that stays expanded when another item gets focus. |
| focus (a form) | Expand the item, collapse the other items that are not pinned, scroll the item into view, show a short highlight. |
| marker | A badge that shows the form the agent selected last. |
| field focus | The browser keyboard focus is inside a control of the form. |
| JSON Pointer | A path like `/company/taxId` (RFC 6901). |
| renderer | A Vue component that JSON Forms uses to draw one control or one layout. |
| custom renderer | A renderer that this project writes with Nuxt UI components. |
| vanilla renderer | A renderer from `@jsonforms/vue-vanilla`. |

## 3. Source of truth

Two documents describe the backend. They disagree in some points.

- `URLAPOK-FRONTEND.md` describes the deployed backend. It is the source of truth.
- `backend-proposal.hu (1).md` describes intent. Use it only to understand why.

Decisions where the documents disagree:

| Topic | Use |
|---|---|
| Endpoint paths | `/api/Form/*` |
| Selection event name | `FormSelected` |
| Error codes from the agent | HTTP 400 with `error.code = "VALIDATION_ERROR"`. Do not depend on the HTTP status to detect "form not found". |
| Envelope fields `needsModal`, `severity` | The frontend does not read them. The frontend envelope type does not have them. Do not add them. |
| Question timeout "600 s" | Does not exist in the frontend. The Axios client uses 300 s for all calls. 300 s is more than the required 120 s. Do not add a per-request timeout. |

## 4. Backend contract

All calls are `POST`. All calls need the `Authorization: Bearer <token>` header. The existing Axios interceptors add the header. All responses use the `ApiResponse<T>` envelope. Field names are camelCase.

Every request body contains `agentId` (number) and `sessionId` (string). Take `agentId` from the session object (`session.agentId`). This is the same value that the question-sending flow uses. Never send a URL.

### 4.1 `POST /api/Form/GetSessionForms`

Request: `{ agentId, sessionId }`

Response `data`:

```jsonc
{
  "forms": [
    { "instanceId": "3f2a…", "formId": 7, "formName": "Partner rögzítés", "status": "Open" }
  ],
  "selectedInstanceId": "3f2a…"
}
```

Rules:

- `formId` can be null. Then `formName` is also null.
- `status` is `"Open"`, `"Submitted"`, or `"Cancelled"`.
- `selectedInstanceId` can be null.
- `selectedInstanceId` can point to a form that is not in `forms`. Accept this. Do not show an error.
- The order of `forms` is the creation order. Keep this order in the UI.

### 4.2 `POST /api/Form/GetFormInst`

Request: `{ agentId, sessionId, instanceId }`

Response `data`:

```jsonc
{
  "instanceId": "3f2a…",
  "formInstId": 42,
  "formId": 7,
  "agentName": "…",
  "sessionId": "…",
  "schema": { },
  "uischema": { },
  "data": { },
  "status": "Open",
  "insertdate": "2026-09-15T10:12:03",
  "insertUser": "…",
  "modDate": null,
  "modUser": null
}
```

Rules:

- `uischema` can be null. Then JSON Forms generates a default layout.
- `data` can be null. Treat null as `{}`.
- `schema` and `uischema` are standard JSON Forms documents. Pass them to the library without change.
- The frontend does not use `formInstId`, `agentName`, `insertdate`, `insertUser`, `modDate`, `modUser`. Make these fields optional in the Zod schema.

### 4.3 `POST /api/Form/SaveFormInst`

Request:

| Field | Type | Required | Note |
|---|---|---|---|
| `agentId` | number | yes | |
| `sessionId` | string | yes | |
| `instanceId` | string | yes | |
| `data` | object | yes | The full data. Not a patch. `{}` is allowed. `null` is not allowed. |
| `status` | string | no | Omit for a save. `"Submitted"` for submit. `"Cancelled"` is allowed but the frontend does not use it. |
| `lastEditedField` | string | no | JSON Pointer of the last edited field. |

Response `data`: the full instance after the save. Same shape as `GetFormInst`.

Rules the server enforces:

- Writing to a closed form returns 400.
- `status: "Open"` from the client returns 400.
- The server takes the user from the token. Do not send the user.

### 4.4 `POST /api/Form/DeleteFormInst`

Request: `{ agentId, sessionId, instanceId }`

Response `data`: `{ "instanceId": "3f2a…", "deleted": true }`

Rules:

- This is a real deletion. It is not a status change.
- Only an open form can be deleted. A closed form returns 400.

### 4.5 `POST /api/Form/ExecuteFormAction`

Do not call this endpoint. Do not build UI for it. Do not add a service method for it. The backend returns 400 for every call today.

### 4.6 Errors

| Case | HTTP | `error.code` |
|---|---|---|
| Missing required field | 400 | `MISSING_FIELD` |
| Unknown `agentId` | 400 | `VALIDATION_ERROR` |
| The agent rejected the call: no such form, write to closed form, forbidden status | 400 | `VALIDATION_ERROR` |
| The agent is not reachable or failed | 500 | `SERVER_ERROR` |
| Missing or expired token | 401 | – |

"No such form" arrives as 400, not 404. The frontend must not try to detect "deleted" from the status code. The frontend uses the forms list instead: a form that is not in the list is deleted.

### 4.7 SignalR

Hub: the existing `/chatHub`. Use the existing `SignalRService` singleton.

| Event | Parameters | Meaning |
|---|---|---|
| `FormUpdated` | `(sessionId: string, instanceId: string)` | The content of this form changed on the server. |
| `FormSelected` | `(sessionId: string, instanceId: string \| null)` | The agent selected this form. `null` means no selection. |

Rules:

- The events carry no data. Fetch the data with `GetFormInst`.
- When the agent opens a new form, it sends `FormUpdated` first and `FormSelected` second.
- The existing `ReceiveMessage` event is unchanged.

## 5. Decisions from the grilling

This section lists the decisions. The later sections give the details.

| # | Decision |
|---|---|
| 1 | `URLAPOK-FRONTEND.md` is the source of truth. |
| 2 | Build fence detection now. The backend will probably add a `form` message type later. Add the enum value now so the frontend does not break when the backend ships it. |
| 3 | The card renders below the markdown text, like file messages. Not beside it. Not in place of the fence. |
| 4 | The card shows metadata only: icon, name, status, call to action. No field preview. |
| 5 | Do not hide messages that contain only a fence. |
| 6 | The panel is a third right sidebar on desktop. It is mutually exclusive with the bookmark sidebar and the file preview sidebar. |
| 7 | The panel is a full-screen slideover on mobile. Desktop and mobile share one panel component. |
| 8 | The panel shows all forms in creation order. Closed forms are collapsed, dimmed, and read-only. |
| 9 | Expanded state, pinned state, and marker live in memory, per session. They do not survive a reload. |
| 10 | An event about a form the user does not look at only updates data. Nothing moves on screen. |
| 11 | Renderers: custom Nuxt UI renderers for common controls. Vanilla renderers for the rest. Phase 1 ships the custom set. |
| 12 | Validation errors are hidden until the first submit attempt. Saves happen regardless of validity. Submit is blocked while errors exist. |
| 13 | Autosave: 1500 ms after the last change, plus flush on defined triggers. |
| 14 | Merge rule: server data wins for every field except the field that has field focus. No "updated field" highlight in phase 1. |
| 15 | Form queries have their own key root. `ReceiveMessage` refetches the forms list. A successful send refetches the list and all mounted instances. |
| 16 | Submit and discard both show a confirmation modal. Autosave errors are inline only. Submit and discard errors show a toast and the inline status. |
| 17 | Public mode is out of scope. |
| 18 | The bookmark sidebar collapse fix is a separate ticket. |
| 19 | Add `form` to the message type enum now. |
| 20 | `FormSelected` sets a marker only. It does not expand, collapse, or scroll. |
| 21 | On panel open from the header button: expand the selected form if it is open and listed, else the newest open form, else nothing. |
| 22 | The panel never opens automatically. |
| 23 | Flush before send waits for the save. On failure, send anyway, show one toast, keep the inline status. |
| 24 | Phase 1 ships the custom Nuxt UI renderer set. |
| 25 | No Playwright e2e in phase 1. |
| 26 | Dates use native input types through `UInput`. No Nuxt UI upgrade. |
| 27 | Spec only. Issues later. |

## 6. Files

### 6.1 New files

| Path | Content |
|---|---|
| `lib/api/services/FormService.ts` | `getSessionForms`, `getFormInst`, `saveFormInst`, `deleteFormInst`. |
| `app/composables/useFormQueries.ts` | `formQueryKeys`, `useSessionForms`, `useFormInstance`. |
| `app/composables/useFormMutations.ts` | `useSaveFormInst`, `useDeleteFormInst`. |
| `app/composables/useFormDraft.ts` | Draft, autosave, flush, merge for one form. |
| `app/composables/useJsonForms.ts` | Lazy loader for the JSON Forms libraries and the renderer set. |
| `app/stores/forms.ts` | `useFormsStore`. Panel state per session. |
| `app/utils/formFence.ts` | `splitFormFences`. |
| `app/utils/jsonPointer.ts` | `toJsonPointer`, `diffToJsonPointer`. |
| `app/utils/formMerge.ts` | `mergeServerData`. |
| `app/components/chat/FormCard.vue` | One card in a message bubble. |
| `app/components/chat/FormCardRow.vue` | The row of cards below the markdown. |
| `app/components/forms/FormsPanel.vue` | The list of items. Shared by sidebar and slideover. |
| `app/components/forms/FormsSidebar.vue` | Desktop wrapper. Header, close button, `FormsPanel`. |
| `app/components/forms/FormsSlideover.vue` | Mobile wrapper. `USlideover` around `FormsPanel`. |
| `app/components/forms/FormPanelItem.vue` | One item. Header, body, footer. |
| `app/components/forms/FormRenderer.vue` | Wraps the `JsonForms` component. |
| `app/components/forms/FormSubmitModal.vue` | Submit confirmation. |
| `app/components/forms/FormDiscardModal.vue` | Discard confirmation. |
| `app/components/forms/renderers/*.vue` | Custom renderers. See section 13. |
| `app/components/forms/renderers/index.ts` | The renderer set. |
| `tests/msw/handlers/form.ts` | MSW handlers for the four endpoints. |
| `docs/messages/form.md` | Fence documentation. |

### 6.2 Modified files

| Path | Change |
|---|---|
| `types/enums/index.ts` | Add `Form = 19` to `AIAnswerType`. |
| `types/api/schemas.ts` | Add `'form'` to `AI_ANSWER_TYPE_VALUES` and to `aiAnswerTypeMap`. Add the form schemas. |
| `lib/signalr/types.ts` | Add `FormUpdated` and `FormSelected` to `SignalREventRegistry`. |
| `app/plugins/signalr-init.client.ts` | Register the two handlers. Add the forms list invalidation to the `ReceiveMessage` handler. |
| `app/composables/useChatMutations.ts` | In `useSendMessage`: flush dirty forms before the request. Invalidate form queries after success. |
| `app/components/chat/MessageBubble.vue` | Route `Form` type to the text branch. Split fences. Render `FormCardRow`. Emit `openForm`. |
| `app/components/chat/ChatMessages.vue` | Forward `openForm`. |
| `app/pages/chats/[sessionId].vue` | Add `formsSidebarOpen`. Add `'forms'` to `activeSidebar`. Add the header toggle. Mount `FormsSidebar` and `FormsSlideover`. Handle `openForm`. |
| `tests/msw/handlers/index.ts` | Register the form handlers. |
| `i18n/locales/hu.json`, `i18n/locales/en.json` | Add `chat.forms.*` keys. |
| `app/dev/fixtures/markdown.ts`, `app/dev/fixtures/thread.ts` | Add form fixtures. |
| `package.json` | Add `@jsonforms/core`, `@jsonforms/vue`, `@jsonforms/vue-vanilla`. |

## 7. Types and Zod schemas

Add to `types/api/schemas.ts`. Export the inferred types.

```
FormStatusSchema          = z.enum(['Open', 'Submitted', 'Cancelled'])
SessionFormSummarySchema  = { instanceId: string, formId: number | null, formName: string | null, status: FormStatus }
SessionFormsResponseSchema= { forms: SessionFormSummary[], selectedInstanceId: string | null }
FormInstanceSchema        = { instanceId: string, formId: number | null (optional), sessionId: string (optional),
                              schema: Record<string, unknown>, uischema: Record<string, unknown> | null (optional),
                              data: Record<string, unknown> | null (optional), status: FormStatus,
                              all other fields: optional, unknown }
DeleteFormResponseSchema  = { instanceId: string, deleted: boolean }
```

Request types (plain TypeScript, no Zod):

```
FormSessionRequestDTO  = { agentId: number, sessionId: string }
FormInstanceRequestDTO = FormSessionRequestDTO & { instanceId: string }
SaveFormRequestDTO     = FormInstanceRequestDTO & { data: Record<string, unknown>, status?: 'Submitted' | 'Cancelled', lastEditedField?: string }
```

Rules:

- `schema` must be a plain object. Use `z.record(z.string(), z.unknown())`. Do not validate the JSON Schema itself. The library validates it.
- Use `.passthrough()` or explicit optional fields so that unknown fields from the backend do not fail the parse.
- Message type: add `'form'` to `AI_ANSWER_TYPE_VALUES` and `form: AIAnswerType.Form` to `aiAnswerTypeMap`. Without this, one `form` message fails the parse of the whole session at `types/api/schemas.ts` line 341, and the thread does not load.

## 8. Service layer

`lib/api/services/FormService.ts`. Follow the `ChatService` pattern. Use `safePost` with a `schema`. Return `Result<T, AppError>`. Never throw.

| Method | URL | Schema | Error code when `data` is null |
|---|---|---|---|
| `getSessionForms(req)` | `/api/Form/GetSessionForms` | `SessionFormsResponseSchema` | `EMPTY_RESPONSE` |
| `getFormInst(req)` | `/api/Form/GetFormInst` | `FormInstanceSchema` | `NOT_FOUND` |
| `saveFormInst(req)` | `/api/Form/SaveFormInst` | `FormInstanceSchema` | `EMPTY_RESPONSE` |
| `deleteFormInst(req)` | `/api/Form/DeleteFormInst` | `DeleteFormResponseSchema` | `EMPTY_RESPONSE` |

Export a singleton `formService` like `chatService`.

Do not add a timeout. The global 300 s applies.

## 9. Query layer

### 9.1 Keys

`app/composables/useFormQueries.ts`:

```
formQueryKeys.all(sessionId)                 = ['forms', sessionId]
formQueryKeys.list(sessionId)                = ['forms', sessionId, 'list']
formQueryKeys.instance(sessionId, instanceId)= ['forms', sessionId, 'instance', instanceId]
```

Do not nest these keys under `chatQueryKeys.session(sessionId)`. That key is invalidated on every `ReceiveMessage`. It would refetch every mounted form on every message.

### 9.2 Queries

`useSessionForms(sessionId: Ref<string>, agentId: Ref<number | undefined>)`:

- Key: `formQueryKeys.list(sessionId)`.
- Enabled when: `authStore.isAuthenticated` and `sessionId` is not empty and `agentId` is a number.
- On `isErr()`: throw `result.error`. Same as the chat queries.
- Retry: same rule as the chat queries. Do not retry `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`.

`useFormInstance(sessionId, agentId, instanceId, enabled)`:

- Key: `formQueryKeys.instance(sessionId, instanceId)`.
- Enabled when: the list query conditions are true, and `instanceId` is not empty, and `enabled` is true. `enabled` is true only while the item is expanded.
- Same error and retry rules.

Because an instance query is enabled only while its item is expanded, an invalidation of a collapsed item fetches nothing. The query becomes stale. It fetches when the user expands the item. This is how decision 10 is implemented.

### 9.3 Mutations

`app/composables/useFormMutations.ts`:

`useSaveFormInst()`:

- `mutationFn`: `formService.saveFormInst(req)`. On `isErr()`: throw.
- `onSuccess(instance)`: `setQueryData(formQueryKeys.instance(sessionId, instanceId), instance)`. If `instance.status` is not `Open`: invalidate `formQueryKeys.list(sessionId)`.
- No optimistic update. The draft is the optimistic state (section 14).

`useDeleteFormInst()`:

- `mutationFn`: `formService.deleteFormInst(req)`. On `isErr()`: throw.
- `onSuccess`: `removeQueries(formQueryKeys.instance(sessionId, instanceId))`. Invalidate `formQueryKeys.list(sessionId)`. Call `formsStore.removeForm(sessionId, instanceId)`.

### 9.4 Invalidation map

| Trigger | Action |
|---|---|
| `ReceiveMessage(sessionId)` | Invalidate `formQueryKeys.list(sessionId)`. Keep the existing invalidations. |
| `FormUpdated(sessionId, instanceId)` | Invalidate `formQueryKeys.instance(sessionId, instanceId)`. Invalidate `formQueryKeys.list(sessionId)`. |
| `FormSelected(sessionId, instanceId)` | `formsStore.setSelected(sessionId, instanceId)`. If `instanceId` is not null and not in the cached list: invalidate `formQueryKeys.list(sessionId)` once. |
| `useSendMessage` success | Invalidate `formQueryKeys.all(sessionId)`. |
| Save success | `setQueryData` for the instance. |
| Submit success | `setQueryData` for the instance. Invalidate the list. Invalidate `chatQueryKeys.session(sessionId)`. |
| Delete success | Remove the instance query. Invalidate the list. |
| Panel open from header button | Nothing extra. The list query is already mounted by the header badge. |

## 10. Store

`app/stores/forms.ts`. Pinia. Not persisted. Do not add it to `persistedstate`.

State, keyed by `sessionId`:

```
sessions: Record<sessionId, {
  expandedIds: string[]
  pinnedIds: string[]
  selectedInstanceId: string | null       // the marker
  selectedInitialized: boolean            // true after the first list response set the marker
  drafts: Record<instanceId, {
    data: Record<string, unknown>
    baseline: Record<string, unknown>     // last data sent to or received from the server
    lastEditedPointer: string | undefined
    saveStatus: 'idle' | 'saving' | 'saved' | 'error'
    errorMessage: string | undefined
    showErrors: boolean                   // true after the first submit attempt
  }>
}>
```

Actions:

| Action | Behaviour |
|---|---|
| `ensureSession(sessionId)` | Create the entry if it does not exist. |
| `focusForm(sessionId, instanceId)` | Add `instanceId` to `expandedIds`. Remove every other id that is not in `pinnedIds`. Set `lastFocusedId` (transient, for scroll and highlight). |
| `toggleExpanded(sessionId, instanceId)` | If expanded: remove from `expandedIds`. If collapsed: call `focusForm`. |
| `collapse(sessionId, instanceId)` | Remove from `expandedIds`. |
| `togglePinned(sessionId, instanceId)` | If pinned: remove from `pinnedIds`. If not pinned: add to `pinnedIds` and add to `expandedIds`. |
| `setSelected(sessionId, instanceId)` | Set `selectedInstanceId`. |
| `initSelectedFromList(sessionId, selectedInstanceId)` | If `selectedInitialized` is false: set the marker and set `selectedInitialized` true. |
| `removeForm(sessionId, instanceId)` | Remove the id from `expandedIds`, `pinnedIds`, `drafts`. If it is the marker: set the marker to null. |
| `setDraft`, `setBaseline`, `setSaveStatus`, `setShowErrors` | Draft field setters. |
| `dirtyInstanceIds(sessionId)` | Return the ids whose draft `data` differs from `baseline` by deep equality. |
| `reset()` | Clear all. Called by `tests/utils/resetAllState.ts`. |

Rules:

- A pinned item is always expanded. `togglePinned` enforces this.
- Unpinning does not collapse.
- Manually collapsing a pinned item is allowed. It stays pinned. It becomes expanded again on the next `togglePinned` or `focusForm` of itself. The pin only protects against automatic collapse by `focusForm` of another item.
- The store does not hold the server data. The Vue Query cache holds it.

Add `useFormsStore().reset()` to `tests/utils/resetAllState.ts`.

## 11. SignalR

### 11.1 Registry

`lib/signalr/types.ts`, in `SignalREventRegistry`:

```
FormUpdated:  [sessionId: string, instanceId: string]
FormSelected: [sessionId: string, instanceId: string | null]
```

### 11.2 Handlers

`app/plugins/signalr-init.client.ts`. Register next to the `ReceiveMessage` handler. Respect the existing `listenersRegistered` flag.

`FormUpdated(sessionId, instanceId)`:

1. If `sessionId` is not a non-empty string: log a warning and return.
2. If `instanceId` is not a non-empty string: log a warning and return.
3. Invalidate `formQueryKeys.instance(sessionId, instanceId)`.
4. Invalidate `formQueryKeys.list(sessionId)`.

`FormSelected(sessionId, instanceId)`:

1. If `sessionId` is not a non-empty string: log a warning and return.
2. If `instanceId` is not null and not a string: log a warning and return.
3. `formsStore.setSelected(sessionId, instanceId)`.
4. If `instanceId` is not null: read the cached list. If the id is not in the list: invalidate `formQueryKeys.list(sessionId)`.

`ReceiveMessage`: add step "invalidate `formQueryKeys.list(sessionId)`" after the existing invalidations.

### 11.3 Effects on screen

- `FormUpdated` for an expanded item: the instance refetches. The merge rule applies (section 14.5).
- `FormUpdated` for a collapsed item: nothing fetches. The query is stale. It fetches on expand.
- `FormUpdated` for an unknown id: the list refetches. The new form appears at the end of the panel, collapsed. The header badge count updates.
- `FormSelected`: the marker moves. Nothing expands, collapses, or scrolls.
- `FormSelected(null)`: the marker disappears.

## 12. Thread

### 12.1 Fence format

```
```form
{ "instanceId": "3f2a…" }
```
```

Rules for `splitFormFences(text: string | null | undefined): { markdown: string, instanceIds: string[] }` in `app/utils/formFence.ts`:

1. If `text` is null, undefined, or empty: return `{ markdown: '', instanceIds: [] }`.
2. Find every fenced block that starts with a line ```` ```form ```` (three backticks, `form`, optional trailing spaces) and ends with a line ```` ``` ````. Match at line starts. Match non-greedy.
3. For each block: `JSON.parse` the body. Accept only a plain object with a non-empty string `instanceId`. Add it to `instanceIds`. Ignore duplicates. Ignore blocks that fail this check. Do not throw.
4. Remove every matched block from the text. Remove an unclosed ```` ```form ```` block at the end of the text as well. This covers streaming, where the closing fence arrives later.
5. Collapse three or more consecutive line breaks that the removal created into two.
6. Trim the result. Return it as `markdown`.

The utility is pure. It has no Vue imports. The fence does not go through the Teleport pipeline in `MarkdownContent.vue`. No `data-*` attribute is added to `sanitize.ts`.

### 12.2 Message routing

`app/components/chat/MessageBubble.vue`:

1. Keep the `Options` branch and the `File` branch unchanged.
2. In the fallback branch (Text, Form, and every other type): compute `split = splitFormFences(message.messageText)`.
3. If `split.instanceIds` is empty: render `MarkdownContent` with the original `messageText`. Nothing changes for existing messages.
4. If `split.instanceIds` is not empty: render `MarkdownContent` with `split.markdown` only when `split.markdown` is not empty. Then render `FormCardRow` with `split.instanceIds`. Use the same vertical spacing as `FileMessage.vue` (`space-y-2`).
5. A message with only a fence renders a bubble with only the card row.
6. Emit `openForm(instanceId)` when a card asks for it. `ChatMessages.vue` forwards the event to the page.

Keep the `MarkdownContent` instance stable while a message streams. The component key must not depend on the fence content.

### 12.3 Card

`FormCard.vue`. Props: `instanceId`, `sessionId`. It reads the list query with `useSessionForms`. It does not call `GetFormInst`.

States:

| State | Condition | Render |
|---|---|---|
| loading | list query is pending and has no data | Skeleton of the card size. |
| found | the id is in the list | Icon, name, status badge, call to action. |
| missing | the list has data and the id is not in it | Faint text "This form was deleted." No icon. Not clickable. |
| error | list query failed | Same as missing, but with the text "Form not available." |

Content in the found state:

- Icon: `i-heroicons-clipboard-document-list`. Size 5.
- Name: `formName`. If null: the translated text `chat.forms.untitled`.
- Status badge: `UBadge`, size `sm`. `Open` → color `primary`, label `chat.forms.status.open`. `Submitted` → color `success`, label `chat.forms.status.submitted`. `Cancelled` → color `neutral`, label `chat.forms.status.cancelled`.
- Marker: if `formsStore.selectedInstanceId === instanceId` and the status is `Open`: show a small dot in `--brand-soft` next to the name, with `aria-label` `chat.forms.agentSelected`.
- Call to action: an `UButton`, variant `ghost`, size `xs`. Label `chat.forms.open` ("Megnyitás" / "Open"). Trailing icon `i-heroicons-arrow-right` on desktop, `i-heroicons-arrow-up-right` on mobile.
- The whole card is one button. It has `role="button"`, `tabindex="0"`, and it reacts to Enter and Space. `aria-label`: "{name}, {status}, open form".
- Style: `--card` background, `--border` border, rounded like `FileEntry` card mode, minimum height 56 px, hover state per the Elemtár motion recipe.

Click on a found card, any status:

1. Emit `openForm(instanceId)`.

The page handles the event (section 13.7).

### 12.4 Card row

`FormCardRow.vue`. Props: `instanceIds`, `sessionId`. Renders one `FormCard` per id in a `flex flex-wrap gap-2` row. Forwards `openForm`.

## 13. Panel

### 13.1 Placement on desktop

`app/pages/chats/[sessionId].vue`:

1. Add `const formsSidebarOpen = ref(false)`.
2. Change `activeSidebar` to return `'focus' | 'files' | 'forms' | null`. Order of precedence: `focus`, `files`, `forms`.
3. Add `toggleFormsSidebar()`. When opening: set `focusSidebarOpen` and `filePreviewOpen` to false. When closing: set `formsSidebarOpen` to false.
4. In `toggleFocusSidebar()` and `toggleFilePreviewSidebar()`: also set `formsSidebarOpen` to false when opening.
5. In the sidebar slot: mount `FormsSidebar` when `activeSidebar === 'forms'`. Pass `sessionId`, `agentId`, `contentWidth = sidebarWidth - 4`. Handle `close` by setting `formsSidebarOpen` to false.
6. Reuse the existing `usePanelResize` instance. Do not create a second one. The default width, minimum width, and 50 % maximum are shared with the sibling sidebars.
7. Escape closes the forms sidebar only when no modal is open and no field has focus inside the panel.

The open state is page-local, like the sibling sidebars. It follows the same lifetime when the user switches sessions.

### 13.2 Header toggle

Add a third `UButton` next to the file preview toggle and the bookmark toggle. Same `variant`, `color`, `size`, `square`.

- Shown when `session` is loaded. Shown on desktop and on mobile. It is the only sidebar toggle shown on mobile.
- Icon: `i-heroicons-clipboard-document-list`, solid variant when the panel is open.
- Badge: the count of forms with status `Open`. Same badge style and position as the bookmark toggle badge. Hidden when the count is 0.
- Marker dot: when the marker points to an open form in the list, show a small dot in `--brand-soft` at the badge position (or beside the badge when both exist).
- `aria-label`: `chat.forms.toggleSidebar`.
- `data-testid`: `forms-sidebar-toggle`.
- On desktop: click calls `toggleFormsSidebar()`. On mobile: click sets `formsSlideoverOpen` to true.

The button mounts `useSessionForms`. This keeps the list query active while the session page is open.

### 13.3 Placement on mobile

`FormsSlideover.vue`:

- `USlideover`, `side="right"`. Content width 100 %. Height 100 %.
- Title: `chat.forms.title`. Close button in the header.
- Body: `FormsPanel`.
- `v-model:open` bound to `formsSlideoverOpen` on the page.
- Opened by: the header toggle, a card click.
- Closed by: the close button, the overlay, the browser back gesture as provided by the component.
- When the slideover closes: flush every dirty form of the session.

### 13.4 Sidebar wrapper

`FormsSidebar.vue`:

- Header row: title `chat.forms.title`, count text "{open} open / {total}", close button (`i-heroicons-x-mark`).
- Body: `FormsPanel` in a scroll container.
- Follow the structure and classes of `FocusedMessagesSidebar.vue`.

### 13.5 Panel body

`FormsPanel.vue`. Props: `sessionId`, `agentId`.

1. Read the list with `useSessionForms`.
2. On the first successful list response: `formsStore.initSelectedFromList(sessionId, selectedInstanceId)`.
3. Render one `FormPanelItem` per form, in list order. Key by `instanceId`.
4. States: loading → three skeleton rows. Error → an inline error with a retry button. Empty → `chat.forms.empty` ("Ebben a beszélgetésben nincs űrlap." / "This conversation has no forms.").
5. `onMounted` and when the panel becomes visible: apply the initial expansion rule (section 13.6) if `expandedIds` is empty for the session.

### 13.6 Initial expansion rule

When the panel opens and no item is expanded:

1. If the marker points to a listed form with status `Open`: `focusForm(marker)`.
2. Else if the list has open forms: `focusForm(the last open form in list order)`.
3. Else: nothing.

When the panel opens because of a card click: `focusForm(cardInstanceId)`. This applies to closed forms too. The closed form expands in read-only mode.

### 13.7 `openForm` handler on the page

1. `formsStore.ensureSession(sessionId)`.
2. If mobile: set `formsSlideoverOpen` to true. Else: set `focusSidebarOpen` and `filePreviewOpen` to false, set `formsSidebarOpen` to true.
3. After `nextTick`: `formsStore.focusForm(sessionId, instanceId)`.

### 13.8 Item header

`FormPanelItem.vue`. Props: `form: SessionFormSummary`, `sessionId`, `agentId`.

Header, left to right:

1. Chevron icon. Rotated 90° when expanded. Follows the motion recipe.
2. Form icon.
3. Name. `formName` or `chat.forms.untitled`. One line, truncated.
4. Status badge. Same mapping as the card.
5. Marker dot when this form is the marker and it is open.
6. Save status text, small, muted: `chat.forms.saving` ("Mentés…"), `chat.forms.saved` ("Mentve"), `chat.forms.saveFailed` ("Nincs mentve") with a retry `UButton` (`chat.forms.retry`). Nothing when idle. `saved` disappears after 2 s.
7. Pin button on the right edge. `UButton` ghost, square, `xs`. Icon `i-ph-push-pin` for unpinned, `i-ph-push-pin-fill` for pinned. `aria-pressed` = pinned. `aria-label` = `chat.forms.pin` / `chat.forms.unpin`. A click does not toggle the item.

The header is a `button` with `aria-expanded` and `aria-controls` of the body. A click calls `formsStore.toggleExpanded`. The pin button is outside the header button in the DOM so that nested interactive elements do not occur. Use a wrapper row with the header button and the pin button as siblings.

Closed items: the whole header has `opacity-60`. The pin button is hidden. The save status is hidden.

### 13.9 Item body

Use `UCollapsible` with `:open` controlled by the store. Do not use `UAccordion`. The pin rule needs per-item control.

Body content when expanded:

1. If the instance query is pending: a skeleton of three rows.
2. If the instance query failed: an inline error with the message from `getUserFriendlyMessage` and a retry button.
3. If loaded: `FormRenderer` with the draft, plus the footer.

The body root has `data-form-instance-id`. It listens to `focusin` and `focusout` for the flush rule and the field focus tracker.

The instance query is enabled only while the item is expanded. When the item collapses: flush the draft first (section 14.3), then disable the query.

### 13.10 Footer

Only for open forms:

- Left: `UButton` variant `ghost`, color `error`, label `chat.forms.discard` ("Elvetés" / "Discard"). Opens `FormDiscardModal`.
- Right: `UButton` color `primary`, label `chat.forms.submit` ("Beküldés" / "Submit"). Runs the submit flow (section 15.1).

For closed forms: a muted one-line notice `chat.forms.closedNotice` ("Ez az űrlap lezárult, nem szerkeszthető." / "This form is closed. You cannot edit it.").

### 13.11 Focus behaviour

`focusForm` in the store sets a transient `lastFocusedId`. `FormPanelItem` watches it:

1. If it equals its own id: `scrollIntoView({ block: 'nearest' })` with `behavior: 'smooth'` unless `prefers-reduced-motion` is set. Then `behavior: 'auto'`.
2. Add a ring class (`ring-2 ring-[hsl(var(--primary)/0.5)]`) for 1500 ms. Skip the animation when reduced motion is set. Show the ring without transition instead.
3. Do not move keyboard focus into a control. Leave the keyboard focus where it is.

### 13.12 Pin behaviour, summarised

| User action | Effect |
|---|---|
| Click header of collapsed item A | A expands. Every unpinned other item collapses. Highlight A. |
| Click header of expanded item A | A collapses. Nothing else changes. |
| Click pin on unpinned A | A becomes pinned and expanded. Nothing else changes. |
| Click pin on pinned A | A becomes unpinned. A stays expanded. |
| Card click for B | B expands (via `focusForm`). Unpinned others collapse. Pinned stay. |
| `FormSelected(B)` | Marker moves to B. Nothing expands or collapses. |
| Panel opens, nothing expanded | Initial expansion rule. |

## 14. Rendering and editing

### 14.1 Libraries

Add dependencies: `@jsonforms/core`, `@jsonforms/vue`, `@jsonforms/vue-vanilla`. Use the same major version for all three (3.x). Use `createAjv` from `@jsonforms/core` for the validator. Do not add `ajv` directly.

`app/composables/useJsonForms.ts`:

- Loads the three packages with dynamic `import()` on the first call. Returns a promise of `{ JsonForms, renderers, ajv }`.
- Caches the promise in a module-level variable. Same pattern as the other fence libraries.
- `renderers` = the custom set followed by the vanilla set (section 14.2).
- `ajv` = one `createAjv({ useDefaults: true })` instance, shared.

`FormRenderer.vue` shows a skeleton until the loader resolves.

### 14.2 Renderer set

Each custom renderer is a Vue SFC in `app/components/forms/renderers/`. Each uses `useJsonFormsControl` from `@jsonforms/vue`. Each is exported as `{ tester, renderer }`. The tester uses `rankWith(n, …)` from `@jsonforms/core`. Rank 10 for controls, rank 5 for layouts. The vanilla renderers rank lower and stay as fallback.

Every control renderer wraps its input in `UFormField`:

- `label` = the control label from JSON Forms.
- `description` = `schema.description`, when present.
- `error` = the first error message for the control, only when `showErrors` is true (section 14.6).
- `required` = from JSON Forms `required`.
- The `UFormField` root has `data-form-path="<JSON Pointer>"`. The field focus tracker reads it.

| File | Tester (in order of checks) | Component |
|---|---|---|
| `StringControl.vue` | `isStringControl` and not multiline and no enum | `UInput` type `text`. `type="email"` when `format: email`, `type="url"` when `format: uri`. |
| `MultilineControl.vue` | `isMultiLineControl` | `UTextarea`, `autoresize`, rows 3. |
| `NumberControl.vue` | `isNumberControl` or `isIntegerControl` | `UInputNumber`. `step` 1 for integers. `min`, `max` from the schema. Empty input sets `undefined`. |
| `BooleanControl.vue` | `isBooleanControl` | `UCheckbox`. `USwitch` when `uischema.options.toggle === true`. Label inside the control, not in `UFormField` label. |
| `EnumControl.vue` | `isEnumControl` or `isOneOfEnumControl` | `USelect`. `URadioGroup` when `uischema.options.format === 'radio'`. Items from `enum` or from `oneOf[].const` with `oneOf[].title` as label. Include an empty item when the control is not required. |
| `DateControl.vue` | `isDateControl` | `UInput type="date"`. Value is an ISO date string `YYYY-MM-DD`. |
| `TimeControl.vue` | `isTimeControl` | `UInput type="time"`. Value `HH:mm`. |
| `DateTimeControl.vue` | `isDateTimeControl` | `UInput type="datetime-local"`. Convert to and from ISO 8601 without offset. |
| `VerticalLayout.vue` | `uiTypeIs('VerticalLayout')` | `div` with `flex flex-col gap-4`. Renders `DispatchRenderer` for each element. |
| `HorizontalLayout.vue` | `uiTypeIs('HorizontalLayout')` | `div` with `grid gap-4`, columns = number of elements on width ≥ 480 px, one column below. |
| `GroupLayout.vue` | `uiTypeIs('Group')` | `div` with `--card` background, border, padding, a heading with `uischema.label`, then a vertical layout. |
| `CategorizationLayout.vue` | `uiTypeIs('Categorization')` | `UTabs`. One tab per category. Each tab body is a vertical layout. |

Not in the custom set. The vanilla renderers handle them: arrays, nested object controls, non-enum `oneOf` and `anyOf`, `const`, labels (`Label` element). Style the vanilla output with a scoped stylesheet in `FormRenderer.vue` that targets the vanilla class names (`vertical-layout`, `control`, `input`, `array-list`, …) and applies the design tokens: `--card`, `--border`, `--muted-foreground`, the input radius and height of `UInput`. The vanilla controls do not report field focus (section 14.5).

Unknown element: a lowest-rank fallback renderer `UnsupportedElement.vue` with `rankWith(1, () => true)`. It renders a muted line `chat.forms.unsupportedElement` ("Ez az elem nem jeleníthető meg." / "This element cannot be displayed."). The rest of the form stays usable.

Every renderer must:

- Honour `readonly` from JSON Forms. Closed forms pass `readonly: true` to `JsonForms`. Inputs become disabled. The footer disappears.
- Work with touch. Minimum tap target 44 px.
- Have a label bound to the input (`UFormField` does this).
- Use both locales for any text it adds itself.

### 14.3 Draft and autosave

`useFormDraft(sessionId, agentId, instanceId)` in `app/composables/useFormDraft.ts`. One instance per expanded item.

Setup:

1. Read the instance query.
2. When instance data arrives and no draft exists: set `draft.data = instance.data ?? {}` and `draft.baseline = draft.data`.
3. When instance data arrives and a draft exists: apply the merge rule (section 14.5).

On JSON Forms `change` event `{ data, errors }`:

1. Ignore the event while `readonly` is true.
2. Compute `pointer = diffToJsonPointer(draft.data, data)`. If a pointer exists: set `draft.lastEditedPointer = pointer`.
3. Set `draft.data = data`.
4. Store `errors` in a local ref for section 14.6.
5. If `data` differs from `baseline` by deep equality: schedule a save 1500 ms after this event. Reset the timer on every event. Use `useDebounceFn` from `@vueuse/core` or the same `watchDebounced` pattern as `MessageInput.vue`.

`save()`:

1. If not dirty: return.
2. If a save is in flight: set `pendingSave = true` and return. When the in-flight save finishes, run `save()` once more if `pendingSave` is true.
3. Set `saveStatus = 'saving'`.
4. Call `useSaveFormInst().mutateAsync({ agentId, sessionId, instanceId, data: draft.data, lastEditedField: draft.lastEditedPointer })`.
5. On success: set `baseline = response.data ?? {}`. Apply the merge rule with the response. Set `saveStatus = 'saved'`. Clear `lastEditedPointer`.
6. On error: set `saveStatus = 'error'`, `errorMessage = getUserFriendlyMessage(error)`. Do not show a toast. Keep the draft. If the error is HTTP 400: invalidate the list and the instance, because the form is probably closed or deleted now.

`flush()`:

1. Cancel the pending debounce timer.
2. Await `save()`. If a save is in flight, await it and the follow-up save.
3. Return the final `saveStatus`.

### 14.4 Flush triggers

| Trigger | Where |
|---|---|
| Keyboard focus leaves the item body (`focusout` and the new target is outside the body root) | `FormPanelItem` |
| The item collapses | `FormPanelItem`, before the query is disabled |
| The item unmounts | `useFormDraft` `onBeforeUnmount` |
| The slideover closes | `FormsSlideover` |
| The session changes or the page unmounts | page watcher: flush every dirty form of the old session |
| Before a chat message is sent | `useSendMessage` `mutationFn`, before the request |
| Before submit | submit flow |

The "before send" flush:

1. In `useSendMessage`, before the network call: `const ids = formsStore.dirtyInstanceIds(sessionId)`.
2. Await the flush of every dirty form. The flushes run in parallel.
3. If at least one flush ends with `saveStatus = 'error'`: show one toast `chat.forms.flushFailed` ("Az űrlap módosításait nem sikerült menteni." / "Form changes could not be saved."). Continue with the send.
4. The optimistic message bubble is already visible. The wait is not visible to the user.

A draft for a collapsed item is not dirty. Collapsing flushes. If that flush failed, the draft stays dirty and stays in the store. The before-send flush retries it. To make this possible, the flush logic must work without a mounted `useFormDraft`. Put the save logic in a plain function that takes the store and the query client. `useFormDraft` calls it.

### 14.5 Merge rule

`mergeServerData(local, server, focusedPointer)` in `app/utils/formMerge.ts`:

1. Start with a deep clone of `server`.
2. If `focusedPointer` is defined and the value at `focusedPointer` exists in `local`: set that value in the clone.
3. Return the clone.

Apply it whenever instance data arrives while a draft exists: after a save response, after a `FormUpdated` refetch, after a send-triggered refetch.

After the merge: set `draft.data` = merged result. Set `baseline` = server data. If the merged result differs from the server data (the focused field kept a local value), the draft is dirty. The normal debounce saves it.

Field focus tracker:

- The item body listens to `focusin`. It reads the closest `[data-form-path]` ancestor of `event.target`. It stores the pointer as `focusedPointer`.
- On `focusout` with a target outside the body: `focusedPointer = undefined`.
- Vanilla renderers have no `data-form-path`. Their fields are never "focused" for the merge rule. A server update replaces their value. This is an accepted limitation of phase 1.

Known limitation: an edit made in field A, followed by a `FormUpdated` refetch before the 1500 ms save, is lost when A no longer has field focus. Blur flushes the save, so the window is at most the debounce delay while the field keeps focus, which is protected. Document this in `docs/messages/form.md`.

### 14.6 Validation

- `JsonForms` prop `validationMode`: `'ValidateAndHide'` until the first submit attempt. `'ValidateAndShow'` after the first submit attempt. `draft.showErrors` holds this.
- Saves happen regardless of validity.
- The custom renderers show `error` in `UFormField` only when `showErrors` is true. JSON Forms passes errors to the control; the renderer checks `showErrors` via `inject`.
- Error message translation: pass `i18n: { locale, translate }` to `JsonForms`. `translate(key, defaultMessage, context)` maps the ajv keyword to `chat.forms.validation.<keyword>` for `required`, `minLength`, `maxLength`, `minimum`, `maximum`, `pattern`, `format`, `enum`, `type`, `const`, `minItems`, `maxItems`. Use `context` for the limit values. When the key is not mapped: return `defaultMessage`.

### 14.7 `diffToJsonPointer`

`app/utils/jsonPointer.ts`:

- `toJsonPointer(path: string)`: converts a JSON Forms dotted path (`company.taxId`, `items.0.name`) to `/company/taxId`, `/items/0/name`. Escapes `~` as `~0` and `/` as `~1`.
- `diffToJsonPointer(prev, next)`: walks both objects. Returns the pointer of the first leaf that differs. Returns `undefined` when nothing differs. A leaf is a primitive, null, or an array whose length changed. When an array element changes, return the pointer of the element leaf.

## 15. Submit and discard

### 15.1 Submit flow

1. The user clicks Submit.
2. `await flush()`. If it fails: show the inline error and stop.
3. Set `draft.showErrors = true`.
4. If the local `errors` list is not empty: scroll to the first control with an error. Move keyboard focus to it. Stop. No modal.
5. Open `FormSubmitModal`.
6. Modal: title `chat.forms.submitConfirmTitle` ("Űrlap beküldése" / "Submit form"), body `chat.forms.submitConfirmBody` ("Beküldés után az űrlap nem szerkeszthető." / "After submitting, you cannot edit the form."), buttons Cancel and `chat.forms.submitConfirm` ("Beküldés" / "Submit"). Follow the delete-confirm modal in `SessionItemMenu.vue`.
7. On confirm: `useSaveFormInst().mutateAsync({ …, data: draft.data, status: 'Submitted' })`. Omit `lastEditedField`.
8. Disable both modal buttons while the request runs. Show a spinner on the confirm button.
9. On success: `setQueryData` for the instance. Invalidate the list. Invalidate `chatQueryKeys.session(sessionId)`. Close the modal. The item stays expanded and becomes read-only. Show a toast `chat.forms.submitted` ("Űrlap beküldve." / "Form submitted."), color `success`.
10. On error: close the modal. Show a toast with `getUserFriendlyMessage(error)`, color `error`. Set the inline `saveStatus = 'error'`. If HTTP 400: invalidate the list and the instance.

### 15.2 Discard flow

1. The user clicks Discard.
2. Open `FormDiscardModal`. Title `chat.forms.discardConfirmTitle` ("Űrlap elvetése" / "Discard form"), body `chat.forms.discardConfirmBody` ("Az űrlap és a kitöltött adatok véglegesen törlődnek." / "The form and its data are deleted permanently."), buttons Cancel and `chat.forms.discardConfirm` ("Elvetés" / "Discard"), color `error`.
3. On confirm: cancel the pending debounce timer. Do not flush. Call `useDeleteFormInst().mutateAsync`.
4. Disable the buttons while the request runs.
5. On success: the mutation removes the instance query, invalidates the list, and calls `removeForm`. Close the modal. The item disappears from the panel. The card in the thread shows the missing state after the list refetch.
6. On error: close the modal. Toast with `getUserFriendlyMessage(error)`, color `error`. If HTTP 400: invalidate the list and the instance.

## 16. Error display, summarised

| Situation | Display |
|---|---|
| List query fails | Inline error in the panel with retry. Header badge hidden. Cards show "Form not available." |
| Instance query fails | Inline error in the item body with retry. |
| Autosave fails | Inline "Nincs mentve" with retry in the item header. No toast. |
| Flush before send fails | One toast. Inline status stays. The message is sent. |
| Submit fails | Toast plus inline status. |
| Discard fails | Toast. |
| Save returns 400 | As above, plus refetch list and instance. The form is probably closed or deleted. |
| `selectedInstanceId` not in list | Ignore. No marker. No error. |
| Unknown `instanceId` in a fence | Card in missing state. No error. |
| Invalid fence body | No card. No error. The fence text is removed from the markdown. |
| Unknown UI schema element | Muted "cannot be displayed" line. Rest of the form works. |

## 17. i18n keys

Add every key to `i18n/locales/hu.json` and `i18n/locales/en.json`. Namespace `chat.forms`.

```
title, toggleSidebar, empty, untitled, open, deleted, unavailable, agentSelected,
pin, unpin, expand, collapse,
saving, saved, saveFailed, retry,
submit, discard, submitConfirmTitle, submitConfirmBody, submitConfirm,
discardConfirmTitle, discardConfirmBody, discardConfirm, cancel,
submitted, flushFailed, closedNotice, unsupportedElement,
count ("{open} nyitott / {total}" / "{open} open / {total}"),
status.open, status.submitted, status.cancelled,
validation.required, validation.minLength, validation.maxLength, validation.minimum,
validation.maximum, validation.pattern, validation.format, validation.enum,
validation.type, validation.const, validation.minItems, validation.maxItems, validation.default
```

Hungarian term for form: "Űrlap". English: "Form".

## 18. Dev gallery and docs

- `app/dev/fixtures/markdown.ts`: add a message with text and one fence, a message with only a fence, a message with two fences, a message with a fence for an unknown id, a message with an invalid fence body.
- `app/dev/fixtures/thread.ts`: add a thread that contains the messages above.
- `tests/msw/handlers/form.ts`: handlers for the four endpoints. Fixtures: three forms (`Open` with a schema that uses every custom control and one array; `Submitted`; `Cancelled`), plus a `selectedInstanceId` that points to a deleted id. `SaveFormInst` returns the sent data with a computed field `company.name` added, so the merge rule can be tested. Return 400 `VALIDATION_ERROR` for a write to a closed form and for an unknown id. Register in `tests/msw/handlers/index.ts`.
- `docs/messages/form.md`: the fence format, the card states, the panel behaviour, the merge rule and its known limitation, the phase plan.

## 19. Tests

Vitest with Testing Library and MSW. Follow `innochat-testing`. No Playwright in phase 1.

### 19.1 Unit

- `splitFormFences`: empty input, no fence, one fence, two fences, duplicate ids, invalid JSON, non-object JSON, missing `instanceId`, unclosed fence at the end, fence in the middle of text, whitespace collapse, other fence types untouched.
- `toJsonPointer`: dotted path, array index, escaping.
- `diffToJsonPointer`: no change, primitive change, nested change, array length change, array element change, new key, removed key.
- `mergeServerData`: no focus, focus on a changed field, focus on a field missing in local, deep clone (mutating the result does not change the input).
- Store: `focusForm` collapses unpinned only, `togglePinned` expands, unpin keeps expanded, `removeForm` clears the marker, `dirtyInstanceIds`, `initSelectedFromList` runs once, `reset`.

### 19.2 Service

- Each method: success parse, `data: null` error code, 400 `VALIDATION_ERROR` mapped to `AppError`, 500, network error. Use MSW.

### 19.3 Composables

- `useSessionForms`: disabled without `agentId`, fetches with both, throws on error.
- `useFormInstance`: disabled while collapsed, fetches on expand.
- `useFormDraft`: debounce 1500 ms, no save when not dirty, coalescing of an in-flight save, `lastEditedField` sent, `flush` cancels the timer, save error sets status without toast, 400 invalidates.

### 19.4 Components

- `FormCard`: loading, found (name, badge per status, marker dot), missing, error, click emits `openForm`, keyboard Enter and Space.
- `MessageBubble`: text plus fence renders markdown and a card, fence-only renders only a card, `Form` type falls to the text branch, existing messages unchanged.
- `FormPanelItem`: header content, `aria-expanded`, pin `aria-pressed`, closed item dimmed and read-only with no footer, save status texts, retry button.
- `FormsPanel`: order, empty state, error state, initial expansion rule (marker open, marker closed, no marker, no open forms), card-driven focus of a closed form.
- `FormRenderer`: each custom renderer renders the right Nuxt UI component, `readonly` disables, errors hidden before the first submit and shown after, translation of `required`.
- Modals: submit confirm success and failure, discard confirm success and failure, buttons disabled while pending.
- Header toggle: badge count, marker dot, mobile opens the slideover, desktop opens the sidebar and closes the siblings.

### 19.5 Integration with the fake hub

Use `tests/utils/fakeSignalR.ts`.

- `FormUpdated` for an expanded item refetches the instance.
- `FormUpdated` for a collapsed item fetches nothing until expand.
- `FormUpdated` for an unknown id refetches the list and the item appears.
- `FormSelected` sets the marker, does not change `expandedIds`.
- `FormSelected(null)` clears the marker.
- `FormSelected` for an unknown id refetches the list once.
- `ReceiveMessage` refetches the forms list.
- A send flushes a dirty form first; the send request is issued after the save response.
- A flush failure shows one toast and the send still happens.
- The merge rule keeps the focused field on a `FormUpdated` refetch.

## 20. Acceptance criteria

Phase 1 is done when every statement is true.

1. A session with a `form` message type loads without error.
2. A message with a fence shows the markdown and a card below it. The card shows name, status, and Open.
3. A click on the card opens the panel and focuses the form. On mobile it opens the slideover.
4. The panel lists all forms in creation order. Closed forms are dimmed, collapsed, and read-only when expanded.
5. Focusing one form collapses every unpinned other form. Pinned forms stay expanded.
6. `FormSelected` moves the marker only.
7. Typing pauses of 1.5 s save the draft with `lastEditedField`. Leaving the form saves at once.
8. Sending a chat message waits for the pending save.
9. A `FormUpdated` for an expanded form refreshes its data. The focused field keeps the user's text.
10. Submit shows errors on the first attempt if any exist. Otherwise it asks for confirmation, then locks the form.
11. Discard asks for confirmation, then removes the form. The card shows the deleted state.
12. Every custom control renders with Nuxt UI. Arrays render with the vanilla renderer in the design tokens.
13. All texts exist in Hungarian and English.
14. `npm run typecheck`, `npm run lint`, and `npm run test:run` pass. Coverage thresholds in `vitest.config.ts` are not lowered.

## 21. Out of scope, later phases

Phase 2:

- "Updated field" highlight after a server merge.
- Agent-steered focusing on `FormSelected` for an existing form, if the backend team confirms agents will re-select.
- Field preview inside the card.
- A dedicated payload parser when the backend defines the `form` message type payload. Today the frontend treats it as markdown with an optional fence.

Later:

- Public mode.
- `ExecuteFormAction`.
- Nuxt UI upgrade for `UInputDate` and `UInputTime`.
- The bookmark sidebar collapse fix. Separate ticket.

## 22. Messages for the backend team

1. The frontend will treat a future `form` message type as markdown plus an optional fence. Keep the fence in the text.
2. The frontend uses `FormSelected` as the event name and `/api/Form/*` as paths, as in `URLAPOK-FRONTEND.md`.
3. The frontend never reads `needsModal` or `severity`.
4. The frontend sends `lastEditedField` on every draft save. It does not send it on submit.
5. The frontend does not call `ExecuteFormAction`.
