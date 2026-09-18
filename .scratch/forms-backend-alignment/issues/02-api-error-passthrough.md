# 02: Surface the backend's `error.message` through the response normalizer

**Status:** ready-for-agent

**Scheduling:** not scheduled. Written up while the evidence was fresh. Pick it up when convenient.

## Why

`URLAPOK-FRONTEND.md` section 4 defines the response envelope: on failure `data` is empty and `error` is filled with `{ code, message, severity, needsModal }`. The doc then makes the `message` load-bearing — a request for a form that does not exist (deleted, wrong id, foreign session) arrives as **`400 VALIDATION_ERROR`, never `404`** — and states:

> „a státuszkód nem elég — a `message` tartalmára kell szűrnöd"
> *the status code isn't enough — you must filter on the content of the `message`*

We discard exactly that string. Two defects follow, with one root cause.

### Defect 1 — the user sees "Bad request" instead of the reason

`safePost` (`lib/api/services/safeRequest.ts:37-41`) reads only `response.data.data`. On a thrown 400 the axios body is `{ data: null, error: { code, message, … } }` — no top-level `message`, no `errors` key — so `normalizeResponseData` (`lib/errors/normalize.ts:169-190`) finds nothing it recognises and falls through to `handleStatusCode`, which produces `createApiError(400, 'Bad request')` (`lib/errors/normalize.ts:218-219`).

The backend's explanation is dropped on the floor. The toasts at `app/components/forms/FormPanelItem.vue:339` and `:369` therefore read "Bad request" where they should say why the save or submit failed.

This is **not forms-specific**: `safePost` and the normalizer are shared by every service in the app, so every 400 from this backend loses its message the same way. That breadth is why this is its own ticket rather than part of the forms work.

### Defect 2 — dead retry on a form that cannot come back

`shouldRetryFormQuery` (`app/composables/useFormQueries.ts:19-24`) suppresses retries for `UNAUTHORIZED` / `FORBIDDEN` / `NOT_FOUND`. But per the doc a deleted form is a `400 VALIDATION_ERROR` and never a 404, and the normalizer turns that 400 into neither of those codes. So a `GetFormInst` for a deleted form is attempted **three times** when it can never succeed.

Consequently the `NOT_FOUND` entry in that set, and the `ErrorCode.NOT_FOUND` fallback at `lib/api/services/FormService.ts:36`, are dead code under this backend contract.

Fix both together: the retry rule cannot be made correct while the error code and message are invisible to it.

## Scope and cautions

- The change is in `lib/errors/normalize.ts` and `lib/api/services/safeRequest.ts`. **Every service in the app** depends on them — treat the blast radius as the main risk and lean on the existing error tests.
- Preserve current behaviour for response shapes that already normalize correctly (top-level `message`, `errors`, plain status codes). This is an *added* branch for the `{ data, error }` envelope, not a replacement.
- `severity` and `needsModal` are named in the doc but **no semantics are given** — it never says what values `severity` takes or what a client should do with `needsModal`. Do not invent behaviour for them. Carrying `code` and `message` through is the whole job. `ApiErrorSchema` (`types/api/schemas.ts:98-110`) is a plain `z.object`, so both extra fields are silently stripped today, which is fine.
- Do not build UI for `ExecuteFormAction`. The doc stubs it and says „ne építs rá felületet" (*don't build UI on it*). We correctly have none.

## Suggested shape

1. Teach `normalizeResponseData` to recognise the `{ data: null, error: { code, message, … } }` envelope and produce an `AppError` carrying the backend's `code` and `message`.
2. Map the backend's `code` onto the `ErrorCode` enum where a sensible equivalent exists; keep the raw message as the user-facing text.
3. Rewrite `shouldRetryFormQuery` in terms of what the backend actually returns for a missing form, and delete the `NOT_FOUND` branch plus the `ErrorCode.NOT_FOUND` fallback at `FormService.ts:36` if they are then unreachable.

## Tests

- Normalizer unit tests for the `{ data, error }` envelope: the backend's `message` survives; `code` maps as intended; existing shapes are unaffected (regression-guard the current cases explicitly).
- `useFormQueries` retry test: a 400 for a deleted form is attempted **once**, not three times.
- A forms-level test that the toast on a failed save shows the backend's message rather than "Bad request".

## Acceptance criteria

- [ ] A backend `{ data: null, error: { code, message } }` 400 produces an `AppError` carrying that `message`.
- [ ] Existing normalizer behaviour for all other response shapes is unchanged, with tests proving it.
- [ ] `GetFormInst` for a deleted form is not retried.
- [ ] Any code left unreachable by the above (the `NOT_FOUND` retry branch, the `FormService.ts:36` fallback) is removed rather than left dangling.
- [ ] `npm run typecheck`, `npm run lint`, `npm run test:run` pass; coverage thresholds not lowered.

Known **pre-existing** failures on `develop`, not your responsibility: 2 in `tests/unit/components/chat/ChatMessages.test.ts`, 1 in `tests/unit/lib/validation/barRace.test.ts`.

## Verified as already correct — do not "fix"

From a full diff of `URLAPOK-FRONTEND.md` against the implementation:

- All four implemented endpoints, their paths, and the `agentId` + `sessionId` request base.
- The draft-save key is `lastEditedField` carrying a JSON Pointer — exactly the doc's name (`app/utils/formDraftSave.ts:58`). Sent on save, not on submit, as specified.
- Saves send the full `data` object rather than a patch; submit sends `status: 'Submitted'`; the client cannot send `status: 'Open'` (the type makes it unrepresentable).
- Status strings `Open` / `Submitted` / `Cancelled` match exactly. Discard is `DeleteFormInst`, which the doc calls „valódi törlés, nem státuszváltás" (*real deletion, not a status change*) — so `Cancelled` is read-only for us by design.
- `FormUpdated(sessionId, instanceId)` and `FormSelected(sessionId, instanceId | null)` match in name, arity and nullability; form events correctly do not invalidate the message thread.
- A dangling `selectedInstanceId` is tolerated without error, as the doc requires.
- The client timeout (300 s) is above the doc's 120 s floor.
