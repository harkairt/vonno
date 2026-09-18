import { describe, it, expect } from 'vitest'
import { server, http, HttpResponse } from '@/tests/msw/server'
import { apiOk, apiError } from '@/tests/msw/http'
import { formService } from '@/lib/api/services/FormService'
import {
  CANCELLED_FORM_INSTANCE_ID,
  COMPUTED_COMPANY_NAME,
  DELETED_FORM_INSTANCE_ID,
  FORM_FIXTURE_AGENT_ID,
  FORM_FIXTURE_SESSION_ID,
  OPEN_FORM_INSTANCE_ID,
  SUBMITTED_FORM_INSTANCE_ID,
  cancelledFormInstance,
  formInstancesById,
  openFormInstance,
  openFormSchema,
  openFormUiSchema,
  sessionFormSummaries,
  sessionFormsResponse,
  submittedFormInstance,
} from '@/tests/msw/handlers/form'
import { ErrorCode } from '@/types/enums'

const P = {
  list: '/api/Form/GetSessionForms',
  get: '/api/Form/GetFormInst',
  save: '/api/Form/SaveFormInst',
  del: '/api/Form/DeleteFormInst',
} as const

const sessionReq = { agentId: FORM_FIXTURE_AGENT_ID, sessionId: FORM_FIXTURE_SESSION_ID }
const openReq = { ...sessionReq, instanceId: OPEN_FORM_INSTANCE_ID }

function expectErrorCode(
  result: Awaited<ReturnType<typeof formService.getSessionForms>>,
  code: ErrorCode,
  statusCode?: number,
) {
  expect(result.isErr()).toBe(true)
  if (result.isErr()) {
    expect(result.error.code).toBe(code)
    if (statusCode !== undefined) expect(result.error.statusCode).toBe(statusCode)
  }
}

describe('FormService.getSessionForms', () => {
  it('returns the parsed forms list with the fixture summaries', async () => {
    let capturedBody: unknown
    server.use(
      http.post(P.list, async ({ request }) => {
        capturedBody = await request.json()
        return apiOk(sessionFormsResponse)
      }),
    )

    const result = await formService.getSessionForms(sessionReq)

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.forms).toEqual(sessionFormSummaries)
      expect(result.value.forms.map((f) => f.status)).toEqual(['Open', 'Submitted', 'Cancelled'])
      expect(result.value.selectedInstanceId).toBe(DELETED_FORM_INSTANCE_ID)
    }
    expect(capturedBody).toEqual(sessionReq)
  })

  it('is served by the default handler', async () => {
    const result = await formService.getSessionForms(sessionReq)

    expect(result.isOk()).toBe(true)
    if (result.isOk()) expect(result.value.forms).toHaveLength(3)
  })

  it('returns EMPTY_RESPONSE when data is null', async () => {
    server.use(http.post(P.list, () => apiOk(null)))

    expectErrorCode(await formService.getSessionForms(sessionReq), ErrorCode.EMPTY_RESPONSE)
  })

  it('returns VALIDATION_ERROR when the response shape is invalid', async () => {
    server.use(http.post(P.list, () => apiOk({ forms: 'nope' })))

    expectErrorCode(await formService.getSessionForms(sessionReq), ErrorCode.VALIDATION_ERROR)
  })

  it('maps a 400 VALIDATION_ERROR envelope to an AppError', async () => {
    server.use(http.post(P.list, () => apiError(400, 'VALIDATION_ERROR', 'Unknown agentId')))

    expectErrorCode(await formService.getSessionForms(sessionReq), ErrorCode.VALIDATION_ERROR, 400)
  })

  it('maps a 500 to SERVER_ERROR', async () => {
    server.use(http.post(P.list, () => apiError(500, 'SERVER_ERROR')))

    expectErrorCode(await formService.getSessionForms(sessionReq), ErrorCode.SERVER_ERROR, 500)
  })

  it('maps a network failure to NETWORK_ERROR', async () => {
    server.use(http.post(P.list, () => HttpResponse.error()))

    expectErrorCode(await formService.getSessionForms(sessionReq), ErrorCode.NETWORK_ERROR)
  })
})

describe('FormService.getFormInst', () => {
  it('returns the parsed open form instance', async () => {
    let capturedBody: unknown
    server.use(
      http.post(P.get, async ({ request }) => {
        capturedBody = await request.json()
        return apiOk(openFormInstance)
      }),
    )

    const result = await formService.getFormInst(openReq)

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.instanceId).toBe(OPEN_FORM_INSTANCE_ID)
      expect(result.value.status).toBe('Open')
      expect(result.value.schema).toEqual(openFormSchema)
      expect(result.value.uischema).toEqual(openFormUiSchema)
    }
    expect(capturedBody).toEqual(openReq)
  })

  it.each([
    [SUBMITTED_FORM_INSTANCE_ID, submittedFormInstance],
    [CANCELLED_FORM_INSTANCE_ID, cancelledFormInstance],
  ])('is served by the default handler for %s', async (instanceId, expected) => {
    const result = await formService.getFormInst({ ...sessionReq, instanceId })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.status).toBe(expected.status)
      expect(result.value.data).toEqual(expected.data)
      expect(formInstancesById[instanceId]).toBe(expected)
    }
  })

  it('returns NOT_FOUND when data is null', async () => {
    server.use(http.post(P.get, () => apiOk(null)))

    expectErrorCode(await formService.getFormInst(openReq), ErrorCode.NOT_FOUND)
  })

  it('maps the default 400 VALIDATION_ERROR for an unknown id to an AppError', async () => {
    const result = await formService.getFormInst({
      ...sessionReq,
      instanceId: DELETED_FORM_INSTANCE_ID,
    })

    expectErrorCode(result, ErrorCode.VALIDATION_ERROR, 400)
  })

  it('carries the backend message through a 400 envelope instead of a generic message', async () => {
    server.use(
      http.post(P.get, () => apiError(400, 'VALIDATION_ERROR', 'Form not found or not open')),
    )

    const result = await formService.getFormInst(openReq)

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.code).toBe(ErrorCode.VALIDATION_ERROR)
      expect(result.error.statusCode).toBe(400)
      expect(result.error.message).toBe('Form not found or not open')
    }
  })

  it('maps a 500 to SERVER_ERROR', async () => {
    server.use(http.post(P.get, () => apiError(500, 'SERVER_ERROR')))

    expectErrorCode(await formService.getFormInst(openReq), ErrorCode.SERVER_ERROR, 500)
  })

  it('maps a network failure to NETWORK_ERROR', async () => {
    server.use(http.post(P.get, () => HttpResponse.error()))

    expectErrorCode(await formService.getFormInst(openReq), ErrorCode.NETWORK_ERROR)
  })
})

describe('FormService.saveFormInst', () => {
  const saveReq = {
    ...openReq,
    data: { company: { taxId: '12345678-2-42' }, headcount: 12 },
    lastEditedField: '/headcount',
  }

  it('echoes the sent data with the computed company.name added', async () => {
    let capturedBody: unknown
    server.use(
      http.post(P.save, async ({ request }) => {
        capturedBody = await request.json()
        return apiOk({
          ...openFormInstance,
          data: {
            ...saveReq.data,
            company: { ...saveReq.data.company, name: COMPUTED_COMPANY_NAME },
          },
        })
      }),
    )

    const result = await formService.saveFormInst(saveReq)

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.data).toEqual({
        company: { taxId: '12345678-2-42', name: COMPUTED_COMPANY_NAME },
        headcount: 12,
      })
    }
    expect(capturedBody).toEqual(saveReq)
  })

  it('is served by the default handler and merges the computed field', async () => {
    const result = await formService.saveFormInst(saveReq)

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.status).toBe('Open')
      expect(result.value.data).toMatchObject({
        headcount: 12,
        company: { taxId: '12345678-2-42', name: COMPUTED_COMPANY_NAME },
      })
    }
  })

  it('submits through the default handler and returns the Submitted status', async () => {
    const result = await formService.saveFormInst({ ...saveReq, status: 'Submitted' })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) expect(result.value.status).toBe('Submitted')
  })

  it('returns EMPTY_RESPONSE when data is null', async () => {
    server.use(http.post(P.save, () => apiOk(null)))

    expectErrorCode(await formService.saveFormInst(saveReq), ErrorCode.EMPTY_RESPONSE)
  })

  it.each([SUBMITTED_FORM_INSTANCE_ID, CANCELLED_FORM_INSTANCE_ID, DELETED_FORM_INSTANCE_ID])(
    'maps the default 400 VALIDATION_ERROR for %s to an AppError',
    async (instanceId) => {
      const result = await formService.saveFormInst({ ...saveReq, instanceId })

      expectErrorCode(result, ErrorCode.VALIDATION_ERROR, 400)
    },
  )

  it('maps a 500 to SERVER_ERROR', async () => {
    server.use(http.post(P.save, () => apiError(500, 'SERVER_ERROR')))

    expectErrorCode(await formService.saveFormInst(saveReq), ErrorCode.SERVER_ERROR, 500)
  })

  it('maps a network failure to NETWORK_ERROR', async () => {
    server.use(http.post(P.save, () => HttpResponse.error()))

    expectErrorCode(await formService.saveFormInst(saveReq), ErrorCode.NETWORK_ERROR)
  })
})

describe('FormService.deleteFormInst', () => {
  it('returns the parsed delete confirmation', async () => {
    let capturedBody: unknown
    server.use(
      http.post(P.del, async ({ request }) => {
        capturedBody = await request.json()
        return apiOk({ instanceId: OPEN_FORM_INSTANCE_ID, deleted: true })
      }),
    )

    const result = await formService.deleteFormInst(openReq)

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toEqual({ instanceId: OPEN_FORM_INSTANCE_ID, deleted: true })
    }
    expect(capturedBody).toEqual(openReq)
  })

  it('is served by the default handler for the open form', async () => {
    const result = await formService.deleteFormInst(openReq)

    expect(result.isOk()).toBe(true)
    if (result.isOk()) expect(result.value.deleted).toBe(true)
  })

  it('returns EMPTY_RESPONSE when data is null', async () => {
    server.use(http.post(P.del, () => apiOk(null)))

    expectErrorCode(await formService.deleteFormInst(openReq), ErrorCode.EMPTY_RESPONSE)
  })

  it.each([SUBMITTED_FORM_INSTANCE_ID, CANCELLED_FORM_INSTANCE_ID, DELETED_FORM_INSTANCE_ID])(
    'maps the default 400 VALIDATION_ERROR for %s to an AppError',
    async (instanceId) => {
      const result = await formService.deleteFormInst({ ...sessionReq, instanceId })

      expectErrorCode(result, ErrorCode.VALIDATION_ERROR, 400)
    },
  )

  it('maps a 500 to SERVER_ERROR', async () => {
    server.use(http.post(P.del, () => apiError(500, 'SERVER_ERROR')))

    expectErrorCode(await formService.deleteFormInst(openReq), ErrorCode.SERVER_ERROR, 500)
  })

  it('maps a network failure to NETWORK_ERROR', async () => {
    server.use(http.post(P.del, () => HttpResponse.error()))

    expectErrorCode(await formService.deleteFormInst(openReq), ErrorCode.NETWORK_ERROR)
  })
})
