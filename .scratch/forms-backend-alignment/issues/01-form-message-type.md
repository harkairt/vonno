# 01: `form` as a first-class message type

**Status:** done (Phase 1 only; Phase 2 still gated)

## Why

The forms feature (previously `.scratch/forms/`, issues 01–13, all landed on `develop`) ingests forms from the thread by parsing a ```` ```form ```` **fence** out of markdown in `messageText`. That was built against `URLAPOK-FRONTEND.md` (2026-09-15), whose section 2 says „az üzenetek fence-ei csak fogantyúkat hordoznak" (*the fences in messages carry only handles*).

On 2026-09-16 the backend team issued `FORM-UZENETTIPUS-FRONTEND.md`, which describes a different carrier: `form` is its own `messageType`, and `messageText` is a **JSON envelope**, exactly like `file`:

```json
{
  "text": "Kérlek, töltsd ki a cégadatokat:",
  "formName": "Partner rögzítés",
  "instanceId": "3f2a1c4e-5b60-4c31-9a77-1d2e3f4a5b6c"
}
```

| Field | Type | Meaning |
|---|---|---|
| `text` | string, may be empty | the bubble text. **Empty ⇒ render no text at all, only the form.** |
| `formName` | string **or `null`** | `null` = an ad hoc form with no template, i.e. untitled |
| `instanceId` | string | the handle; the content is fetched separately via `GetFormInst` |

**Consequence today:** a real `form` message from this backend renders as a blob of raw JSON. `MessageBubble.vue` has no `Form` branch, so it falls through to the text branch, finds no fence, and hands `messageText` straight to `MarkdownContent`.

The form content is deliberately **not** in the message and must never be cached from it — the message is permanent, the form changes. Everything below the message (`GetFormInst`, `GetSessionForms`, `FormUpdated`, `FormSelected`, the panel, renderers, drafts, submit/discard, locked `Submitted`/`Cancelled`) already matches both backend docs and **must not be touched**.

## Decisions already taken — do not relitigate

1. **No streaming.** Confirmed by the user: `form` messages always arrive whole, via either the `AIAnswer` response or a SignalR `ReceiveMessage` push, in identical shape. So an unparseable envelope is a genuine defect, not a transient state, and must render **visibly** (raw `messageText`) rather than render nothing.
2. **One `instanceId` per message.** The envelope carries exactly one. `FormCardRow.vue` exists only to render N cards from N fence ids and has no remaining source of a second element.
3. **The fence path is NOT deleted in this ticket.** See Phase 2 below. Phase 1 leaves `app/utils/formFence.ts` and its behaviour untouched and working.
4. **The session-forms list stays authoritative** for a form that exists. The envelope's `formName` is a *fallback* only. A renamed form must not show a stale name from an old message.

## Phase 1 — the envelope path

### 1. Payload schema and parser

`types/api/schemas.ts`, next to `FileMessagePayloadSchema` (line ~241) and the two existing parsers (line ~247 and ~265):

```ts
export const FormMessagePayloadSchema = z.object({
  text: z.string().default(''),
  formName: z.string().nullable().default(null),
  instanceId: z.string().min(1),
})
export type FormMessagePayload = z.infer<typeof FormMessagePayloadSchema>

export function parseFormMessagePayload(
  messageText: string | null | undefined,
): FormMessagePayload | null
```

Model the parser **exactly** on `parseFileMessagePayload` / `parseOptionsPayload`: iterative unwrap of multi-encoded JSON (up to 5 times while the value is still a string), `safeParse`, `null` on any failure, never throws. The backend double-encodes elsewhere; assume it may here.

`instanceId` is the only required field — an envelope without a usable handle is worthless and must parse to `null`.

### 2. `FormMessage.vue`

New: `app/components/chat/FormMessage.vue`. Mirror `app/components/chat/FileMessage.vue` in shape, props and fallback behaviour.

- Props: `messageText: string | null`, `sessionId: string`, `agentId?: number`.
- Emits: `openForm: [instanceId: string]`.
- `const payload = computed(() => parseFormMessagePayload(props.messageText))`
- Root `<div class="space-y-2">`, matching `FileMessage.vue`.
- `<MarkdownContent v-if="payload?.text" :content="payload.text" />` — note `v-if` on the text itself, so an empty `text` renders nothing (the doc requires this explicitly).
- One `<FormCard v-if="payload" ... />` with `:instance-id="payload.instanceId"`, `:fallback-name="payload.formName"`, `:session-id`, `:agent-id`, forwarding `openForm`.
- `<MarkdownContent v-if="!payload" :content="messageText ?? ''" />` — the visible-defect fallback, same as `FileMessage.vue`'s last block.

### 3. `MessageBubble.vue`

- Add `<FormMessage v-else-if="message.messageType === AIAnswerType.Form" ... />` immediately after the `File` branch (currently line ~29), passing `:session-id="message.sessionId"`, `:agent-id="agentId"` and forwarding `@open-form`.
- **Leave the fallback branch's fence logic exactly as it is** (`hasFence`, `formSplit`, `FormCardRow`). It is removed in Phase 2, not here.
- Keep the `Options` and `File` branches unchanged.

### 4. `FormCard.vue` — `fallbackName`

Add an optional prop `fallbackName?: string | null`. Used **only when the list has no entry for the id**:

- The `found` state keeps `form.formName ?? t('chat.forms.untitled')` — unchanged, the list is authoritative.
- The `missing` / `error` state (the `<p>` at the end of the template) currently reads `chat.forms.deleted` / `chat.forms.unavailable` and names no form. When `fallbackName` is a non-empty string, use named variants instead.
- The loading state stays a bare skeleton — no text to name.

Two new i18n keys, in **both** `i18n/locales/en.json` and `i18n/locales/hu.json` under `chat.forms`: `deletedNamed` and `unavailableNamed`, each interpolating `{name}`. Hungarian needs real interpolation rather than concatenation for word order — e.g. „A(z) {name} űrlapot törölték."

### 5. Clipboard

`app/composables/useMessagePresentation.ts`, `copySource` (line ~64). It branches on `Options` and `File`; `Form` falls through to `message.messageText ?? ''`, which would put the raw JSON envelope on the clipboard. Add a `Form` branch returning `{ text: payload.text, hasImages: false }`, matching the `File` precedent. Copy `text` alone — do not synthesise a summary of form content we do not have.

### 6. Fixtures and MSW

- `app/dev/fixtures/thread.ts` (form fixture around line 363) and `app/dev/fixtures/markdown.ts`: add a `form`-typed message carrying the new envelope. Keep any existing fence fixture in place until Phase 2 so the gallery covers both paths.
- `tests/msw/handlers/form.ts` already serves the form endpoints and needs no change; verify the fixture's `instanceId` resolves against it.

### 7. Documentation

Move `docs/fence/form.md` → `docs/messages/form.md` (`git mv`, new directory) and rewrite it for the message type. `form` is **not** a markdown fence, and `docs/fence/` is specifically the directory of fence renderers with a matching `add-fence-type` skill — leaving it there misleads. This is the first doc of its kind and sets the convention; `file` has no doc to copy from, so mirror the *structure* of the fence docs (intro, payload table, behaviour, states, examples) without pretending it is a fence.

The doc must cover: the envelope and its three fields, the empty-`text` rule, the two arrival paths, why the content is not embedded, card states, panel behaviour, the merge rule **with its known limitation** (an edit is lost if the field has lost focus and a `FormUpdated` lands inside the remaining ≤1500 ms debounce window), `FormUpdated` / `FormSelected`, and that `GetSessionForms` is the only source when reopening an old conversation.

**Before you finish, check `.scratch/forms/spec.md` for anything worth rescuing into this doc** — the user is deleting that spec separately, and whatever is not in `docs/messages/form.md` is lost with it. Do not edit the spec; it is being retired, not maintained. List in your Comments anything you judged not worth keeping.

## Phase 2 — remove the fence path (DO NOT DO THIS YET)

Gated. Do not execute without an explicit go-ahead in the ticket or from the user.

**Why it is gated:** the backend's own `URLAPOK-FRONTEND.md` says "fence", and the copy we hold is an **excerpt** — it contains only sections 2, 3 and 4 while cross-referencing a section 1 and a section 6 we have never seen. Section 1 is the likely home of the message-plumbing description. The user judges the fence most probably dead but wants certainty before an irreversible deletion. Confirmed separately: **no stored message anywhere contains a form fence**, so there is no migration concern — only the risk that the backend still emits one.

When released, delete:

- `app/utils/formFence.ts` and `tests/unit/utils/formFence.test.ts`
- `app/components/chat/FormCardRow.vue`
- the `hasFence` / `formSplit` computeds and the `FormCardRow` usage in `MessageBubble.vue`, returning its fallback branch to a plain `MarkdownContent`
- fence fixtures in `app/dev/fixtures/thread.ts` and `markdown.ts`
- fence-specific cases in `tests/unit/components/chat/MessageBubble.test.ts`

## Tests

TDD where it fits: parser tests before the parser, component tests before `FormMessage.vue`.

- **New** `tests/unit/types/formMessagePayload.test.ts` (or alongside the existing payload-parser tests if there is a home for them): valid envelope; `formName: null`; empty `text`; missing/empty/non-string `instanceId` → `null`; double-encoded JSON; malformed JSON → `null`; `null`/`undefined`/`''` input → `null`.
- **New** `tests/unit/components/chat/FormMessage.test.ts`: renders text + one card; empty `text` renders **no** `MarkdownContent`; unparseable payload renders the raw text and no card; `openForm` propagates.
- **Update** `tests/unit/components/chat/MessageBubble.test.ts`: a `form`-typed message routes to the new branch. Keep the existing fence cases passing.
- **Update** `tests/unit/components/chat/FormCard.test.ts`: `fallbackName` names the missing and error states; the found state still prefers the list's `formName`.
- Check `tests/unit/components/forms/FormsPanel.test.ts` and `tests/unit/pages/chats/sessionId.test.ts` — both reference form cards; update only if the new branch changes their behaviour.

## Acceptance criteria

- [x] `parseFormMessagePayload` exists, mirrors the File/Options parsers, and never throws.
- [x] A `form`-typed message renders `text` (when non-empty) plus exactly one `FormCard`; an empty `text` renders no text node.
- [x] An unparseable envelope renders the raw `messageText` and no card.
- [x] `formName` from the envelope names the missing and error card states; the list still wins whenever it has an entry.
- [x] Copying a form message puts `payload.text` on the clipboard, not JSON.
- [x] The fence path still works and its tests still pass (Phase 2 not executed).
      One fence case was replaced, not kept: `MessageBubble.test.ts` asserted „routes the Form
      message type to the text branch", which is exactly the behaviour this ticket changes. It is
      replaced by the new-branch cases. Every other fence case, and all of
      `tests/unit/utils/formFence.test.ts`, is untouched and green.
- [x] `docs/messages/form.md` exists, describes the message type, and `docs/fence/form.md` is gone.
- [x] New i18n keys exist in **both** locale files; no key drift in either direction.
      Verified by diffing the flattened key sets of `en.json` and `hu.json`: empty in both directions.
- [x] `npm run typecheck`, `npm run lint`, `npm run test:run` pass; coverage thresholds in `vitest.config.ts` not lowered.
      typecheck clean; lint 0 errors / 91 pre-existing warnings; `test:run` 2099 passed with only the
      three known pre-existing failures. `vitest.config.ts` is untouched and `npm run test:coverage`
      reports no threshold violation.

Fixtures — partial, deliberately:

- `app/dev/fixtures/thread.ts` gained a `formMessages` block (text + card, empty text, ad hoc
  `formName: null`, deleted id, unparseable envelope), modelled on `fileMessages`. The ids resolve
  against `tests/msw/handlers/form.ts`.
- `app/dev/fixtures/markdown.ts` was **not** touched. Its scenarios are `MarkdownContent` props —
  a `content` string only, with no message type — so a form envelope placed there would render as a
  `text` message showing raw JSON. Envelope-carrying messages belong where `file` messages already
  live, in `thread.ts`. The fence scenarios in `markdown.ts` stay for Phase 2 to remove.

Known **pre-existing** failures on `develop`, not your responsibility: 2 in `tests/unit/components/chat/ChatMessages.test.ts`, 1 in `tests/unit/lib/validation/barRace.test.ts`. Everything else must pass.

## Comments

`.scratch/forms/spec.md` was read through before the doc was written. Rescued into
`docs/messages/form.md`: the backend contract and its error table (§4), the file map (§6, as the
renderer table), SignalR semantics (§11), card states (§12), the whole panel behaviour including
submit and discard (§13, §15), the renderer inventory and the hidden-until-submit validation rule
(§14), the error-display rules (§16), and the out-of-scope list (§21, as Unsupported Features).

Judged not worth keeping:

- §1–§3, §18, §19, §20 — spec scaffolding: purpose, terms, source-of-truth pointers, the build
  instruction for the gallery, the test plan and the spec's own acceptance criteria. The tests and
  the fixtures are their own record.
- §5 — the decisions taken during the grilling. Their *outcomes* are in the doc; the deliberation
  is history.
- §7–§10 — the Zod schemas, service signatures, query keys and store shape, line by line. These go
  stale the moment the code moves; the doc names the files instead.
- §17 — the flat list of `chat.forms.*` i18n keys. The locale files are the list.
- §22 — the messages for the backend team. Item 1 ("keep the fence in the text") is now contradicted
  by `FORM-UZENETTIPUS-FRONTEND.md`, which is exactly what this ticket implements. Items 2–5 are
  behaviour the doc already states in its own voice (the `FormSelected` name and `/api/Form/*`
  paths, `needsModal`/`severity` never read, `lastEditedField` sent on save but not on submit, and
  `ExecuteFormAction` never called).

Still pointing at the old path, deliberately left: `.scratch/forms/spec.md` (being retired by the
user) and `.scratch/forms/issues/13-docs-and-acceptance-sweep.md` (a closed issue's record of what
was true when it was closed). Nothing under `docs/`, `app/`, `lib/`, `tests/` or `.claude/` links to
`docs/fence/form.md`.

## Out of scope

The backend's `error.message` being discarded by the response normalizer, and the dead 400-retry on deleted forms — see `02-api-error-passthrough.md`.
