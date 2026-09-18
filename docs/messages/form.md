# `form` Message Type — Form Instance Card

Message type: `form` (`AIAnswerType.Form`, 19)

A `form` message hands the user a form to fill in. Like a `file` message, its `messageText` is **not
markdown** — it is a JSON envelope. The message renders as an optional line of text plus one card.
The card is a handle: the form itself is filled in in the forms panel, never inside the bubble.

The envelope carries an `instanceId` and nothing else about the form. Name, status, JSON Schema, UI
Schema and data all come from `/api/Form/*` at render time.

---

## Top-Level Object

```jsonc
{
  "text": "Kérlek, töltsd ki a cégadatokat:",          // bubble text; may be empty
  "formName": "Partner rögzítés",                       // may be null (ad hoc form)
  "instanceId": "3f2a1c4e-5b60-4c31-9a77-1d2e3f4a5b6c"  // required
}
```

Parsed by `parseFormMessagePayload` (`types/api/schemas.ts`), which mirrors the `file` and `options`
parsers: it unwraps multi-encoded JSON (up to five times while the value is still a string),
validates with Zod, returns `null` on any failure, and never throws.

---

## Fields

| Field | Type | Required | Meaning |
|---|---|---|---|
| `text` | `string` | no, defaults to `''` | The bubble text, rendered as markdown. |
| `formName` | `string` \| `null` | no, defaults to `null` | Fallback name. `null` means an ad hoc form with no template. |
| `instanceId` | non-empty `string` | **yes** | The form instance id, as returned by `GetSessionForms`. |

### `text`

Rendered with `MarkdownContent`, exactly like the text part of a `file` message.

**An empty `text` renders no text node at all** — not an empty paragraph, not a blank line. The
message is then just the card. This is deliberate: the agent often has nothing to say beyond handing
over the form.

### `formName`

A **fallback only**. The session forms list is authoritative whenever it has an entry for the id, so
a form the user renamed never shows the stale name captured in an old message. `formName` is used
only in the missing and error card states, where there is no list entry to name the form.

### `instanceId`

The only required field. An envelope without a usable handle is worthless, so a missing, empty or
non-string `instanceId` makes the whole payload parse to `null`.

---

## Rendering

`FormMessage.vue` renders, in order:

1. `MarkdownContent` with `payload.text` — **only when `text` is non-empty**.
2. One `FormCard` for `payload.instanceId`, with `payload.formName` as its `fallbackName`.

There is exactly **one** card per message: the envelope carries exactly one `instanceId`.

### Unparseable envelopes

A payload that does not parse renders the **raw `messageText`** through `MarkdownContent`, and no
card.

This is on purpose. A `form` message always arrives whole — there is no streaming — so an
unparseable envelope is a genuine defect, not a transient state. Rendering it visibly makes the
defect obvious instead of silently swallowing the message.

---

## Arrival Paths

A `form` message reaches the client in the same shape by two routes:

| Route | Path |
|---|---|
| Answer to a question | the `AIAnswer` in the `POST /api/AIWebAPI/question/text` response |
| Server push | SignalR `ReceiveMessage(sessionId, agentId)` invalidates the session query; the message arrives in the `GetSessionById` refetch |

`ReceiveMessage` carries no message body, so both routes end in the same parsed
`AISessionMessageDTO`. Neither route delivers a `form` message in fragments.

---

## Why the Content Is Not in the Message

The message is permanent; the form is not. The form's data, status and even its name change while
the conversation stays as it was. Embedding any of it in `messageText` would produce a bubble that
disagrees with the form the moment the user types into it.

Therefore:

- The frontend **never** caches form content from a message.
- Reopening an old conversation resolves every card against `GetSessionForms` — that call is the
  only source of a form's current name and status. A message from last month shows today's state.
- A form deleted since the message was sent resolves to the deleted state, named by the envelope's
  `formName` when it has one.

---

## Card States

`FormCard` (`app/components/chat/FormCard.vue`) resolves the id against the session form list
(`GetSessionForms`). It never fetches the instance itself.

| State | Condition | Rendering |
|---|---|---|
| Loading | the list query is pending, or `agentId` is not known yet | skeleton, `max-w-[320px]` |
| Found | the id is in the (possibly cached) list | clipboard icon, name (or the untitled fallback), status badge, `Open` affordance |
| Marked | found **and** `status === 'Open'` **and** the id is the agent marker | a small dot next to the name, labelled with `chat.forms.agentSelected` |
| Stale | found, but the most recent list refetch failed | same as Found, plus a muted `chat.forms.staleHint` line; the card stays interactive |
| Deleted | the list resolved but does not contain the id | faint italic line — `chat.forms.deletedNamed` with `formName`, else `chat.forms.deleted` |
| Unavailable | the list has never loaded successfully, and the query failed | faint italic line — `chat.forms.unavailableNamed` with `formName`, else `chat.forms.unavailable` |

In the found state the name comes from the list (`form.formName ?? chat.forms.untitled`), never from
the envelope. The loading state is a bare skeleton, with no text to name.

A refetch (SignalR invalidation, a mutation, or a background revalidation) can fail while a
previously loaded list is still cached. TanStack Query keeps the last successful response in that
case, so the card stays in the Found/Marked state and remains interactive — it only adds the Stale
hint. The Unavailable state is reserved for the id never having resolved against a list at all: no
prior fetch ever succeeded.

Status badge colours come from `FORM_STATUS_COLOR`:

| Status | Badge colour |
|---|---|
| `Open` | `primary` |
| `Submitted` | `success` |
| `Cancelled` | `neutral` |

The found card is a single `role="button"` with `tabindex="0"`. Click, `Enter`, and `Space` all
emit `openForm` with the instance id. The trailing `Open` element is decorative (`aria-hidden`), so
assistive technology announces one control, not two. The marker dot only ever shows on an **open**
form — a marker pointing at a submitted or cancelled form shows no dot.

---

## Copying a Form Message

The message action bar copies `payload.text` alone. The clipboard never receives the JSON envelope,
and no summary of the form's content is synthesised — the message does not hold that content. An
unparseable envelope falls back to the raw `messageText`, matching what the bubble shows.

---

## Panel Behaviour

Opening a card focuses the form in the forms panel — a sidebar on desktop, a slideover on mobile.
On desktop the forms sidebar also closes its sibling sidebars (focus, files).

- **Order.** The panel lists the session forms in creation order, exactly as the list endpoint
  returns them. New forms arriving over SignalR append at the end, collapsed — unless it is the
  first form the list has ever had, in which case initial expansion (below) opens it.
- **Initial expansion.** Applied once per session, the first time the form list is non-empty —
  whether that is at mount or a later SignalR arrival for a session that mounted empty — and only
  when nothing is expanded yet: the marked form if it is open and listed, otherwise the newest open
  form, otherwise nothing. The panel never opens by itself.
- **Focus.** Focusing a form expands it and collapses every other **unpinned** form. Pinned forms
  stay expanded. Focusing scrolls the item into view and rings it briefly; it never steals keyboard
  focus. Under reduced motion the scroll is instant and the ring does not transition.
- **Pinning.** Pinning expands the form if it was collapsed. Unpinning leaves it expanded.
- **Closed forms.** `Submitted` and `Cancelled` forms are dimmed and collapsed. Expanding one
  renders it read-only: every control is disabled, the pin is hidden, and the footer with
  Discard/Submit is replaced by a read-only notice. A card click on a closed form still expands it
  read-only and collapses the open one.
- **Lazy instance fetch.** The full instance (`GetFormInst`) is fetched only while the item is
  expanded. A `FormUpdated` for a collapsed item fetches no instance until it expands.
- **Autosave.** Edits are debounced by **1500 ms** and saved with `SaveFormInst`, carrying
  `lastEditedField` as a JSON Pointer. Leaving the form body, collapsing the item, closing the
  slideover, sending a chat message, unmounting the item, or navigating to another session flushes
  the pending save immediately. There is no `beforeunload` hook — closing the tab mid-debounce
  loses the edit. A chat send waits for the flush to resolve before issuing the send request. The
  status line shows `Saving…`, then `Saved` for 2 s. A failed save shows an inline `Not saved` with
  a retry button and never raises a toast — except a flush triggered by a send, which toasts once
  and still sends.
- **Submit.** Submitting flushes the pending autosave first. If that flush fails and the draft is
  still dirty, the submit stops there — no validation reveal, no confirmation modal — and the only
  sign is the inline `Not saved` status and retry button already showing from the failed autosave.
  Once the flush succeeds, the first submit attempt reveals validation errors and focuses the first
  erroring control. With no errors it opens a confirmation modal; confirming saves with
  `status: 'Submitted'` and locks the form. `lastEditedField` is **not** sent on submit.
- **Discard.** Asks for confirmation, cancels the pending autosave, then calls `DeleteFormInst`. The
  item leaves the panel and its card falls to the deleted state after the list refetch.

Expanded state, pinned state, and the marker live in memory per session. They do not survive a
reload.

---

## SignalR Events

| Event | Effect |
|---|---|
| `FormUpdated(sessionId, instanceId)` | always invalidates the session forms list |
| `FormUpdated` for an expanded form | in addition, refetches that instance and merges the result |
| `FormUpdated` for a collapsed form | no instance fetch — that query stays disabled until it expands |
| `FormUpdated` for an unknown id | the list refetch brings it in; the new form appears last, collapsed |
| `FormSelected(sessionId, instanceId)` | moves the marker only — no expansion, no collapse, no scroll |
| `FormSelected(sessionId, null)` | clears the marker |
| `FormSelected` for an unknown id | refetches the list once |
| `ReceiveMessage(sessionId, agentId)` | refetches the session **and** the forms list |

The events carry no form data. When the agent opens a new form it sends `FormUpdated` first and
`FormSelected` second.

---

## The Merge Rule

When server data arrives for a form the user is editing — from a `FormUpdated` refetch — the local
draft is **replaced** by the server data, except for every field the user has changed since the last
save (the dirty set) plus the field that currently has keyboard focus. Everything else — every field
the user never touched — takes the server value. This is what lets the backend add computed fields —
for example a `company.name` filled in from a tax number — without wiping a field the user is
editing or has already edited elsewhere in the form.

`mergeServerData(local, server, preservedPointers)` (`app/utils/formMerge.ts`):

1. Deep-clone the server data. Mutating the result never touches either input.
2. For each pointer in `preservedPointers` (`undefined` and empty pointers are skipped), read that
   JSON Pointer out of the local draft. If the path exists locally, write that value (deep-cloned)
   into the clone at the same pointer, creating intermediate objects as needed. If the path does not
   exist locally, the server value stands.

`useFormDraft` (`app/composables/useFormDraft.ts`) calls it on a `FormUpdated` refetch with
`[...diffToJsonPointers(baseline, draft), focusedPointer]` — the full dirty set (every pointer that
differs between the last-known-saved baseline and the current draft), plus whatever field currently
has focus. If the merge still differs from the server data it just adopted as the new baseline, the
draft stays dirty and a save is scheduled, exactly as if the user had just typed it.

Edits typed while a save request is in flight are handled differently, in the save-response path
(`app/utils/formDraftSave.ts`): the baseline moves to the server data, and if the draft changed while
the request was in flight, it is left alone (dirty, so a follow-up save sends it) rather than merged.
Only when nothing changed during the flight does the response get merged, and there only the
**focused** pointer is preserved — the dirty set is not, because the request that just completed is
exactly what emptied it.

### Remaining gap

`focusedPointer` is resolved from the DOM: `onFocusIn` walks up to the nearest ancestor carrying a
`data-form-path` attribute. Only the app's own control renderers (`StringControl.vue`,
`NumberControl.vue`, and the rest under `renderers/`) render that attribute. A field that falls
through to a JSON Forms vanilla renderer — arrays, chiefly — has no `data-form-path`, so focusing it
never sets `focusedPointer`. Such a field is protected only once it has an actual edit in the dirty
set; the moment between focusing it and its first keystroke is unprotected, so a `FormUpdated` merge
landing in exactly that moment can replace it with the server's value before the user has typed
anything to lose.

---

## Backend Contract

All calls are `POST` under `/api/Form/*`, authenticated with the usual bearer token, wrapped in the
standard `ApiResponse<T>` envelope. Every request body carries `agentId` and `sessionId`.

`agentId` is the agent the session is talking to: `resolveSessionAgentId` (`app/utils/sessionAgents.ts`)
takes the virtual members of the session (`session.members` ∩ the selectable users, `isVirtual`) and
returns the lowest id. Not `session.agentId` — `GetSessionById` is called with a hardcoded `agentId: 1`
and echoes it back, so that field is always `1`. A session with no virtual member resolves to
`undefined`, which leaves every form query disabled and every draft save skipped.

| Endpoint | Request | Response `data` |
|---|---|---|
| `GetSessionForms` | `{ agentId, sessionId }` | `{ forms: [{ instanceId, formId, formName, status }], selectedInstanceId }` |
| `GetFormInst` | `{ agentId, sessionId, instanceId }` | the full instance: `schema`, `uischema`, `data`, `status`, plus metadata the frontend ignores |
| `SaveFormInst` | `{ agentId, sessionId, instanceId, data, status?, lastEditedField? }` | the full instance after the save |
| `DeleteFormInst` | `{ agentId, sessionId, instanceId }` | `{ instanceId, deleted: true }` |

Rules that shape the UI:

- `formId` may be null; then `formName` is null too (an ad hoc form).
- `selectedInstanceId` may be null, and may point to a form that is not in `forms`. Accept it
  silently — no marker, no error.
- `forms` is in creation order. Keep that order.
- `uischema` may be null (JSON Forms generates a layout); `data` may be null (treat it as `{}`).
- `data` on save is the **full** data, never a patch. `status: 'Open'` from the client is rejected.
- Writing to or deleting a closed form returns 400.
- `ExecuteFormAction` exists but is never called — the backend returns 400 for every call.

### Errors

| Case | HTTP | `error.code` |
|---|---|---|
| Missing required field | 400 | `MISSING_FIELD` |
| Unknown `agentId` | 400 | `VALIDATION_ERROR` |
| Agent rejected the call: no such form, write to a closed form, forbidden status | 400 | `VALIDATION_ERROR` |
| Agent unreachable or failed | 500 | `SERVER_ERROR` |
| Missing or expired token | 401 | – |

"No such form" arrives as **400, not 404**. The frontend never infers "deleted" from a status code:
a form that is not in `GetSessionForms` is deleted, full stop.

The frontend never reads `needsModal` or `severity` from any form payload.

---

## Complete Examples

### 1. Text and a card

```json
{
  "text": "Please fill in the partner details below.",
  "formName": "Partner rögzítés",
  "instanceId": "form-inst-open"
}
```

Renders the paragraph, then one card underneath it.

### 2. Card only — empty text

```json
{ "text": "", "formName": "Ajánlatkérés", "instanceId": "form-inst-submitted" }
```

Renders **only** the card. No text node, no empty paragraph.

### 3. Ad hoc form — no template

```json
{ "text": "An ad hoc form.", "formName": null, "instanceId": "form-inst-cancelled" }
```

Renders the paragraph and the card. The list names the card; if the id is missing from the list, the
unnamed `chat.forms.deleted` line shows, because there is no name to fall back to.

### 4. Deleted form — the envelope names it

```json
{
  "text": "This one no longer exists.",
  "formName": "Partner rögzítés",
  "instanceId": "form-inst-deleted"
}
```

Renders the paragraph and a faint „A(z) „Partner rögzítés” űrlapot törölték." line where the card
would be.

### 5. Broken envelope — a visible defect

```
{ not json
```

Renders the raw text, exactly as it arrived, and no card.

---

## Renderer Details

| Concern | File |
|---|---|
| Payload parser | `types/api/schemas.ts` (`FormMessagePayloadSchema`, `parseFormMessagePayload`) |
| Message | `app/components/chat/FormMessage.vue` |
| Message routing | `app/components/chat/MessageBubble.vue` |
| Card | `app/components/chat/FormCard.vue` |
| Clipboard | `app/composables/useMessagePresentation.ts` |
| Panel and item | `app/components/forms/FormsPanel.vue`, `FormPanelItem.vue` |
| Sidebar / slideover | `app/components/forms/FormsSidebar.vue`, `FormsSlideover.vue` |
| Form body | `app/components/forms/FormRenderer.vue` + `renderers/` |
| Draft autosave | `app/composables/useFormDraft.ts`, `app/utils/formDraftSave.ts` |
| Merge rule | `app/utils/formMerge.ts` |
| Session state | `app/stores/forms.ts` |
| Service | `lib/api/services/FormService.ts` |

The form body is rendered with JSON Forms. Every control listed below has a custom renderer built on
Nuxt UI, so forms inherit the app's design tokens:

`string`, multiline `string`, `number`/`integer`, `boolean`, `enum`, `date`, `time`, `date-time`,
plus the `VerticalLayout`, `HorizontalLayout`, `Group`, and `Categorization` layouts.

Anything without a custom renderer — arrays in particular — falls through to the JSON Forms vanilla
renderers, which are styled with the same design tokens. An element JSON Forms cannot render at all
becomes a muted one-line placeholder and leaves the rest of the form usable.

Validation errors stay hidden until the first submit attempt; saves happen regardless of validity.
All texts live under `chat.forms.*` in both `en.json` and `hu.json`.

---

## The Legacy Fence Path

Before this message type existed, forms were referenced by a ```` ```form ```` fence inside an
ordinary text message. That path is **still live**: `app/utils/formFence.ts` and
`FormCardRow.vue` still split fences out of non-`form` messages and render a row of cards.

It is scheduled for deletion, gated on confirmation that the backend no longer emits fences. No
stored message is known to contain one. Until then both paths work, and a `form`-typed message never
goes through the fence path.

---

## Unsupported Features

- Inline form rendering. The message only ever produces a card; the form is filled in in the panel.
- More than one form per message. The envelope carries exactly one `instanceId`.
- Any form content in the message — name, status, schema and data all come from the API.
- Creating a form from a message. The instance must already exist server-side.
- Presentation options — size, colour, placement, or a custom label on the card.
- Field preview inside the card.
- An "updated field" highlight after a server merge.
- Agent-steered expansion: `FormSelected` moves the marker only.
- Array-specific controls: add/remove/reorder use the vanilla JSON Forms affordances.
- File upload controls.
- Cross-field validation beyond what the instance's JSON Schema expresses.
- Public/iframe mode. Form messages are an authenticated-mode feature.
