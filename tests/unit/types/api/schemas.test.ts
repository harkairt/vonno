import { describe, it, expect } from 'vitest'
import {
  AISessionDTOSchema,
  AISessionMessageDTOSchema,
  DeleteFormResponseSchema,
  FormInstanceIdSchema,
  FormInstanceSchema,
  FormMessagePayloadSchema,
  FormStatusSchema,
  SaveFormStatusSchema,
  SessionFormSummarySchema,
  SessionFormsResponseSchema,
  FormSessionRequestDTOSchema,
  FormInstanceRequestDTOSchema,
  SaveFormRequestDTOSchema,
} from '@/types/api/schemas'
import { AIAnswerType } from '@/types/enums'
import { makeRawMessage, makeSession } from '@/tests/utils/factories'

describe('AIAnswerType form message', () => {
  it('parses a form-type message to AIAnswerType.Form', () => {
    const result = AISessionMessageDTOSchema.safeParse(makeRawMessage({ messageType: 'form' }))

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.messageType).toBe(AIAnswerType.Form)
  })

  it('parses a whole session that contains a form message', () => {
    const result = AISessionDTOSchema.safeParse({
      ...makeSession(),
      messages: [makeRawMessage({ messageType: 'text' }), makeRawMessage({ messageType: 'form' })],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.messages?.map((m) => m.messageType)).toEqual([
        AIAnswerType.Text,
        AIAnswerType.Form,
      ])
    }
  })
})

describe('FormInstanceIdSchema', () => {
  it('accepts a non-empty string', () => {
    expect(FormInstanceIdSchema.safeParse('abc-123').success).toBe(true)
  })

  it.each([
    ['empty string', ''],
    ['number', 42],
    ['null', null],
  ])('rejects %s', (_label, value) => {
    expect(FormInstanceIdSchema.safeParse(value).success).toBe(false)
  })
})

describe('FormStatusSchema', () => {
  it.each(['Open', 'Submitted', 'Cancelled'])('accepts %s', (status) => {
    expect(FormStatusSchema.safeParse(status).success).toBe(true)
  })

  it('rejects unknown and lowercase statuses', () => {
    expect(FormStatusSchema.safeParse('open').success).toBe(false)
    expect(FormStatusSchema.safeParse('Deleted').success).toBe(false)
  })
})

describe('SaveFormStatusSchema', () => {
  it.each(['Submitted', 'Cancelled'])('accepts %s', (status) => {
    expect(SaveFormStatusSchema.safeParse(status).success).toBe(true)
  })

  it('rejects Open', () => {
    expect(SaveFormStatusSchema.safeParse('Open').success).toBe(false)
  })
})

describe('SessionFormSummarySchema', () => {
  const validSummary = { instanceId: 'a', formId: 7, formName: 'Partner', status: 'Open' }

  it('accepts a summary with formId and formName', () => {
    expect(SessionFormSummarySchema.safeParse(validSummary).success).toBe(true)
  })

  it('accepts null formId with null formName', () => {
    expect(
      SessionFormSummarySchema.safeParse({ ...validSummary, formId: null, formName: null }).success,
    ).toBe(true)
  })

  it('rejects null formId with a non-null formName', () => {
    expect(
      SessionFormSummarySchema.safeParse({ ...validSummary, formId: null, formName: 'Oops' })
        .success,
    ).toBe(false)
  })

  it('rejects an empty instanceId', () => {
    expect(SessionFormSummarySchema.safeParse({ ...validSummary, instanceId: '' }).success).toBe(
      false,
    )
  })

  it('rejects a missing status', () => {
    const { status: _, ...noStatus } = validSummary
    expect(SessionFormSummarySchema.safeParse(noStatus).success).toBe(false)
  })
})

describe('SessionFormsResponseSchema', () => {
  it('accepts ad hoc forms and a null selection', () => {
    const result = SessionFormsResponseSchema.safeParse({
      forms: [
        { instanceId: 'a', formId: 7, formName: 'Partner', status: 'Open' },
        { instanceId: 'b', formId: null, formName: null, status: 'Cancelled' },
      ],
      selectedInstanceId: null,
    })

    expect(result.success).toBe(true)
  })

  it('accepts a selectedInstanceId that is not in forms', () => {
    const result = SessionFormsResponseSchema.safeParse({
      forms: [],
      selectedInstanceId: 'deleted-id',
    })

    expect(result.success).toBe(true)
  })

  it('rejects a summary with an invalid status', () => {
    const result = SessionFormsResponseSchema.safeParse({
      forms: [{ instanceId: 'a', formId: 7, formName: 'Partner', status: 'open' }],
      selectedInstanceId: null,
    })

    expect(result.success).toBe(false)
  })
})

describe('FormInstanceSchema', () => {
  const minimal = {
    instanceId: 'inst-1',
    formId: null,
    sessionId: 'session-1',
    schema: { type: 'object', properties: { name: { type: 'string' } } },
    status: 'Open',
  }

  it('parses the full backend payload', () => {
    const result = FormInstanceSchema.safeParse({
      ...minimal,
      formInstId: 42,
      formId: 7,
      agentName: 'Agent',
      uischema: { type: 'VerticalLayout', elements: [] },
      data: { name: 'Acme' },
      insertdate: '2026-09-15T10:12:03',
      insertUser: 'user',
      modDate: null,
      modUser: null,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.formId).toBe(7)
      expect(result.data.data).toEqual({ name: 'Acme' })
    }
  })

  it('preserves null data and transforms null uischema to undefined', () => {
    const result = FormInstanceSchema.safeParse({ ...minimal, uischema: null, data: null })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.data).toBeNull()
      expect(result.data.uischema).toBeUndefined()
    }
  })

  it('keeps missing data and uischema undefined', () => {
    const result = FormInstanceSchema.safeParse(minimal)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.data).toBeUndefined()
      expect(result.data.uischema).toBeUndefined()
    }
  })

  it('rejects a payload missing sessionId', () => {
    const { sessionId: _, ...noSession } = minimal
    expect(FormInstanceSchema.safeParse(noSession).success).toBe(false)
  })

  it('rejects a payload missing formId', () => {
    const { formId: _, ...noFormId } = minimal
    expect(FormInstanceSchema.safeParse(noFormId).success).toBe(false)
  })

  it('accepts formId: null', () => {
    const result = FormInstanceSchema.safeParse({ ...minimal, formId: null })

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.formId).toBeNull()
  })

  it('preserves unknown backend fields for forward compatibility', () => {
    const result = FormInstanceSchema.safeParse({ ...minimal, futureField: { nested: true } })

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.futureField).toEqual({ nested: true })
  })

  it('rejects a payload without schema or with a non-object schema', () => {
    expect(
      FormInstanceSchema.safeParse({
        instanceId: 'x',
        formId: null,
        sessionId: 's',
        status: 'Open',
      }).success,
    ).toBe(false)
    expect(FormInstanceSchema.safeParse({ ...minimal, schema: 'not-an-object' }).success).toBe(
      false,
    )
  })
})

describe('DeleteFormResponseSchema', () => {
  it('parses the delete confirmation', () => {
    const result = DeleteFormResponseSchema.safeParse({ instanceId: 'inst-1', deleted: true })

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.deleted).toBe(true)
  })

  it('rejects a missing deleted flag', () => {
    expect(DeleteFormResponseSchema.safeParse({ instanceId: 'inst-1' }).success).toBe(false)
  })

  it('rejects deleted: false', () => {
    expect(
      DeleteFormResponseSchema.safeParse({ instanceId: 'inst-1', deleted: false }).success,
    ).toBe(false)
  })

  it('rejects an empty instanceId', () => {
    expect(DeleteFormResponseSchema.safeParse({ instanceId: '', deleted: true }).success).toBe(
      false,
    )
  })
})

describe('FormInstanceIdSchema is shared across schemas', () => {
  it.each([
    ['FormMessagePayloadSchema', () => FormMessagePayloadSchema.safeParse({ instanceId: '' })],
    [
      'SessionFormSummarySchema',
      () =>
        SessionFormSummarySchema.safeParse({
          instanceId: '',
          formId: null,
          formName: null,
          status: 'Open',
        }),
    ],
    [
      'FormInstanceSchema',
      () =>
        FormInstanceSchema.safeParse({
          instanceId: '',
          formId: null,
          sessionId: 's',
          schema: { type: 'object' },
          status: 'Open',
        }),
    ],
    [
      'DeleteFormResponseSchema',
      () => DeleteFormResponseSchema.safeParse({ instanceId: '', deleted: true }),
    ],
  ])('empty instanceId is rejected by %s', (_name, parse) => {
    expect(parse().success).toBe(false)
  })
})

describe('Request DTOs derive from Zod schemas', () => {
  it('FormSessionRequestDTOSchema requires agentId and sessionId', () => {
    expect(FormSessionRequestDTOSchema.safeParse({ agentId: 1, sessionId: 's-1' }).success).toBe(
      true,
    )
    expect(FormSessionRequestDTOSchema.safeParse({ agentId: 1 }).success).toBe(false)
    expect(FormSessionRequestDTOSchema.safeParse({ sessionId: 's-1' }).success).toBe(false)
  })

  it('FormInstanceRequestDTOSchema extends FormSessionRequestDTOSchema with instanceId', () => {
    expect(
      FormInstanceRequestDTOSchema.safeParse({ agentId: 1, sessionId: 's', instanceId: 'i-1' })
        .success,
    ).toBe(true)
    expect(FormInstanceRequestDTOSchema.safeParse({ agentId: 1, sessionId: 's' }).success).toBe(
      false,
    )
  })

  it('SaveFormRequestDTOSchema extends FormInstanceRequestDTOSchema with data and optional status', () => {
    const base = { agentId: 1, sessionId: 's', instanceId: 'i-1', data: { x: 1 } }

    expect(SaveFormRequestDTOSchema.safeParse(base).success).toBe(true)
    expect(SaveFormRequestDTOSchema.safeParse({ ...base, status: 'Submitted' }).success).toBe(true)
    expect(SaveFormRequestDTOSchema.safeParse({ ...base, status: 'Open' }).success).toBe(false)
  })
})
