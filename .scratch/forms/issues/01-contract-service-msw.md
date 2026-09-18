# 01: Form contract, service layer, and MSW fixtures

**What to build:** A session that contains a message of the new `form` type loads without error, and the four form endpoints are callable from the service layer with validated, typed results. This is the foundation every later slice builds on: Zod schemas, request DTOs, the `Form = 19` message type, `FormService` (`getSessionForms`, `getFormInst`, `saveFormInst`, `deleteFormInst`), and MSW handlers with the shared fixture set (three forms: `Open` with a schema that uses every custom control plus one array, `Submitted`, `Cancelled`; `selectedInstanceId` pointing to a deleted id; `SaveFormInst` echoing the sent data plus a computed `company.name`; 400 `VALIDATION_ERROR` for writes to closed forms and unknown ids).

Read spec sections 3, 4, 7, 8, 18 (MSW part), 19.2 in `.scratch/forms/spec.md`. Follow the `ChatService` / `safePost` pattern. Do not add a service method for `ExecuteFormAction`. Do not add a timeout.

**Blocked by:** None (can start immediately)

**Status:** done-with-notes

**Test first (TDD):**
- Schema test: a session payload containing a `form`-type message parses; `FormInstanceSchema` accepts null `uischema`, null `data`, and unknown extra fields.
- Service tests per method via MSW: success parse, `data: null` yields the specified error code (`EMPTY_RESPONSE` / `NOT_FOUND`), 400 `VALIDATION_ERROR` maps to `AppError`, 500, network error.

**Acceptance criteria:**
- [x] `AIAnswerType.Form = 19` exists; `'form'` is in the answer type values and map; a thread with a `form` message parses.
- [x] `FormStatus`, `SessionFormSummary`, `SessionFormsResponse`, `FormInstance`, `DeleteFormResponse` schemas and types exported; request DTOs exported as plain types.
- [x] `formService` singleton with the four methods returns `Result<T, AppError>` and never throws.
- [x] MSW handlers for the four endpoints registered in the handler index with the fixture set described above.
- [ ] `npm run typecheck`, `npm run lint`, `npm run test:run` pass; coverage thresholds not lowered.
  Typecheck and lint pass and thresholds are untouched. `test:run` reports 3 failing tests in `tests/unit/components/chat/ChatMessages.test.ts` (2) and `tests/unit/lib/validation/barRace.test.ts` (1). The same 3 tests fail identically on `develop` (verified in the main checkout: 3 failed / 1742 passed there vs 3 failed / 1789 passed on the branch). They are unrelated to forms and out of scope for this ticket; no new failures were introduced.

## Comments

**2026-09-16 — implemented on branch `forms/01-contract-service-msw`**

Built:
- `types/enums/index.ts`: `AIAnswerType.Form = 19`.
- `types/api/schemas.ts`: `'form'` in `AI_ANSWER_TYPE_VALUES` and `aiAnswerTypeMap`; `FormStatusSchema`, `SessionFormSummarySchema`, `SessionFormsResponseSchema`, `FormInstanceSchema` (`.loose()`, nullable/optional `uischema` and `data`, optional `formId`/`sessionId`), `DeleteFormResponseSchema`; inferred types `FormStatus`, `SessionFormSummary`, `SessionFormsResponse`, `FormInstance`, `DeleteFormResponse`; plain request types `FormSessionRequestDTO`, `FormInstanceRequestDTO`, `SaveFormRequestDTO`.
- `lib/api/services/FormService.ts`: `formService` singleton with `getSessionForms` (`EMPTY_RESPONSE`), `getFormInst` (`NOT_FOUND`), `saveFormInst` (`EMPTY_RESPONSE`), `deleteFormInst` (`EMPTY_RESPONSE`), all via `safePost`. No `ExecuteFormAction`, no timeout.
- `tests/msw/handlers/form.ts` registered in `tests/msw/handlers/index.ts`. Exports for later tickets: `FORM_FIXTURE_AGENT_ID` (1), `FORM_FIXTURE_SESSION_ID` (`'session-1'`), `OPEN_FORM_INSTANCE_ID`, `SUBMITTED_FORM_INSTANCE_ID`, `CANCELLED_FORM_INSTANCE_ID`, `DELETED_FORM_INSTANCE_ID`, `COMPUTED_COMPANY_NAME`, `openFormSchema`, `openFormUiSchema`, `openFormInstance`, `submittedFormInstance`, `cancelledFormInstance`, `formInstancesById`, `sessionFormSummaries`, `sessionFormsResponse`, `formHandlers`. The open form's schema/uischema exercise every custom renderer from spec 14.2 (string incl. email/uri, multiline, integer and number, checkbox and toggle, enum select and oneOf radio, date, time, date-time, VerticalLayout, HorizontalLayout, Group, Categorization) plus one array (`contacts`). `selectedInstanceId` is `DELETED_FORM_INSTANCE_ID`, which is not in `forms` and not in `formInstancesById`.
- Tests: `tests/unit/types/api/schemas.test.ts` (16) and `tests/unit/lib/api/services/FormService.test.ts` (31).

Decisions and deviations:
- Zod is v4, so `FormInstanceSchema` uses `.loose()` instead of the deprecated `.passthrough()` (the `no-deprecated` lint rule is an error). Same effect: unknown fields pass and are kept.
- The handlers are stateless: `SaveFormInst` returns the echoed data plus `company.name` but does not mutate the fixture, so a later `GetFormInst` still returns the original fixture. Per-test `server.use` overrides cover stateful scenarios.
- A 400 envelope with no top-level `message` is normalized by `lib/errors/normalize.ts` to an `ApiError` with `code = VALIDATION_ERROR`, `statusCode = 400`; the tests assert that. The envelope's `error.code` is not read by the service (no code path in the project does).
- Both unknown ids and closed forms answer 400 `VALIDATION_ERROR`; only the message differs (`Form not found` vs `Form not found or not open`).
- `openFormSchema` and `openFormUiSchema` are exported separately (referenced by the service test so knip stays clean) for renderer tickets that need a schema exercising every control.
- `.nuxt/` had to be generated in the worktree (`npx nuxi prepare`) before Vitest could run; it is gitignored.

Results:
- `npm run typecheck`: pass (exit 0).
- `npm run lint`: pass, 0 errors, 58 pre-existing warnings (none in the files of this ticket).
- `npm run test:run`: 157 files, 1792 tests: 1789 passed, 3 failed. The 3 failures are pre-existing on `develop` (see criterion 5 above).
- `npx knip`: no new findings (the 5 reported also appear on `develop`).

Commits:
- `32eda9a` feat(forms): add form contract, FormService and MSW fixtures
- `0055cc6` test(forms): assert open form fixture against exported schema and uischema
