import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { delay } from 'msw'
import { server, http } from '@/tests/msw/server'
import { apiOk, apiError } from '@/tests/msw/http'
import { seedAuthStorage } from '@/tests/utils/authSeed'
import { createTestQueryClient } from '@/tests/utils/render'
import { trackPostCalls } from '@/tests/utils/requestCounter'
import { configureApiInterceptors } from '@/lib/api/interceptors/setup'
import {
  COMPUTED_COMPANY_NAME,
  FORM_FIXTURE_AGENT_ID,
  FORM_FIXTURE_SESSION_ID,
  OPEN_FORM_INSTANCE_ID,
  openFormInstance,
} from '@/tests/msw/handlers/form'
import { useAuthStore } from '~/stores/auth'
import { useFormsStore } from '~/stores/forms'
import { formQueryKeys } from '~/composables/useFormQueries'
import {
  applySavedInstance,
  flushSessionFormDrafts,
  saveFormDraft,
} from '~/composables/useFormDraftPersistence'
import type { FormInstance } from '@/types/api/schemas'

const SAVE_FORM_INST = '/api/Form/SaveFormInst'

const target = {
  sessionId: FORM_FIXTURE_SESSION_ID,
  agentId: FORM_FIXTURE_AGENT_ID,
  instanceId: OPEN_FORM_INSTANCE_ID,
}

function setup() {
  setActivePinia(createPinia())
  seedAuthStorage()
  configureApiInterceptors({ authStore: useAuthStore(), redirectToLogin: vi.fn() })
  const store = useFormsStore()
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(
    formQueryKeys.instance(target.sessionId, target.instanceId),
    openFormInstance,
  )
  store.createDraft(target.sessionId, target.instanceId, openFormInstance.data!)
  return { store, queryClient }
}

function captureSaves() {
  const bodies: Array<Record<string, unknown>> = []
  server.use(
    http.post(SAVE_FORM_INST, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      bodies.push(body)
      const data = body.data as Record<string, unknown>
      const company = (data.company ?? {}) as Record<string, unknown>
      return apiOk({
        ...openFormInstance,
        data: { ...data, company: { ...company, name: COMPUTED_COMPANY_NAME } },
      })
    }),
  )
  return bodies
}

let toastAdd: ReturnType<typeof vi.fn>

beforeEach(() => {
  toastAdd = vi.fn()
  vi.mocked(useToast).mockReturnValue({
    add: toastAdd,
    remove: vi.fn(),
    clear: vi.fn(),
  } as unknown as ReturnType<typeof useToast>)
})

describe('saveFormDraft', () => {
  it('does nothing when the draft is not dirty', async () => {
    const { store, queryClient } = setup()
    const counter = trackPostCalls(SAVE_FORM_INST, () => apiOk(openFormInstance))

    await expect(saveFormDraft(target, { store, queryClient })).resolves.toBe('idle')

    expect(counter.count).toBe(0)
    expect(store.getDraft(target.sessionId, target.instanceId)?.saveState.status).toBe('idle')
  })

  it('returns idle without a draft', async () => {
    const { store, queryClient } = setup()

    await expect(
      saveFormDraft({ ...target, instanceId: 'unknown' }, { store, queryClient }),
    ).resolves.toBe('idle')
  })

  it('sends the full data with lastEditedField, then updates baseline, cache and status', async () => {
    const { store, queryClient } = setup()
    const bodies = captureSaves()
    const edited = { ...openFormInstance.data, company: { taxId: 'new-tax-id' }, notes: 'hi' }
    store.updateDraftData(target.sessionId, target.instanceId, edited)
    store.setLastEditedPointer(target.sessionId, target.instanceId, '/notes')

    const promise = saveFormDraft(target, { store, queryClient })
    expect(store.getDraft(target.sessionId, target.instanceId)?.saveState.status).toBe('saving')

    await expect(promise).resolves.toBe('saved')

    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toEqual({
      agentId: FORM_FIXTURE_AGENT_ID,
      sessionId: FORM_FIXTURE_SESSION_ID,
      instanceId: OPEN_FORM_INSTANCE_ID,
      data: edited,
      lastEditedField: '/notes',
    })

    const serverData = { ...edited, company: { taxId: 'new-tax-id', name: COMPUTED_COMPANY_NAME } }
    const draft = store.getDraft(target.sessionId, target.instanceId)!
    expect(draft.saveState.status).toBe('saved')
    expect(draft.baseline).toEqual(serverData)
    expect(draft.data).toEqual(serverData)
    expect(draft.lastEditedPointer).toBeUndefined()
    expect(store.dirtyInstanceIds(target.sessionId)).toEqual([])

    const cached = queryClient.getQueryData<FormInstance>(
      formQueryKeys.instance(target.sessionId, target.instanceId),
    )
    expect(cached?.data).toEqual(serverData)
  })

  it('keeps the focused field from local when the response differs', async () => {
    const { store, queryClient } = setup()
    server.use(
      http.post(SAVE_FORM_INST, () =>
        apiOk({
          ...openFormInstance,
          data: { company: { taxId: 'server-normalised', name: COMPUTED_COMPANY_NAME } },
        }),
      ),
    )
    store.updateDraftData(target.sessionId, target.instanceId, { company: { taxId: 'typing' } })

    const status = await saveFormDraft(target, {
      store,
      queryClient,
      getFocusedPointer: () => '/company/taxId',
    })

    expect(status).toBe('saved')
    const draft = store.getDraft(target.sessionId, target.instanceId)!
    expect(draft.data).toEqual({ company: { taxId: 'typing', name: COMPUTED_COMPANY_NAME } })
    expect(draft.baseline).toEqual({
      company: { taxId: 'server-normalised', name: COMPUTED_COMPANY_NAME },
    })
    expect(store.dirtyInstanceIds(target.sessionId)).toEqual([target.instanceId])
  })

  it('coalesces saves requested while one is in flight into a single follow-up', async () => {
    const { store, queryClient } = setup()
    const bodies: Array<Record<string, unknown>> = []
    server.use(
      http.post(SAVE_FORM_INST, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        bodies.push(body)
        await delay(40)
        return apiOk({ ...openFormInstance, data: body.data })
      }),
    )

    store.updateDraftData(target.sessionId, target.instanceId, { notes: '1' })
    const first = saveFormDraft(target, { store, queryClient })
    await new Promise((r) => setTimeout(r, 5))

    store.updateDraftData(target.sessionId, target.instanceId, { notes: '12' })
    const second = saveFormDraft(target, { store, queryClient })
    store.updateDraftData(target.sessionId, target.instanceId, { notes: '123' })
    const third = saveFormDraft(target, { store, queryClient })

    expect(second).toBe(first)
    expect(third).toBe(first)
    await expect(first).resolves.toBe('saved')

    expect(bodies.map((b) => b.data)).toEqual([{ notes: '1' }, { notes: '123' }])
    expect(store.getDraft(target.sessionId, target.instanceId)?.baseline).toEqual({ notes: '123' })
    expect(store.dirtyInstanceIds(target.sessionId)).toEqual([])
  })

  it('runs a fresh save after the previous one settled', async () => {
    const { store, queryClient } = setup()
    const bodies = captureSaves()

    store.updateDraftData(target.sessionId, target.instanceId, { notes: 'a' })
    await saveFormDraft(target, { store, queryClient })
    store.updateDraftData(target.sessionId, target.instanceId, { notes: 'b' })
    await saveFormDraft(target, { store, queryClient })

    expect(bodies).toHaveLength(2)
  })

  it('sets the error status with the message, keeps the draft and never toasts', async () => {
    const { store, queryClient } = setup()
    server.use(http.post(SAVE_FORM_INST, () => apiError(500, 'SERVER_ERROR', 'agent down')))
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    store.updateDraftData(target.sessionId, target.instanceId, { notes: 'keep me' })

    await expect(saveFormDraft(target, { store, queryClient })).resolves.toBe('error')

    const draft = store.getDraft(target.sessionId, target.instanceId)!
    expect(draft.saveState.status).toBe('error')
    expect(draft.saveState.status === 'error' && draft.saveState.message).toEqual(
      expect.stringMatching(/\S/),
    )
    expect(draft.data).toEqual({ notes: 'keep me' })
    expect(store.dirtyInstanceIds(target.sessionId)).toEqual([target.instanceId])
    expect(invalidate).not.toHaveBeenCalled()
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('invalidates the list and the instance on a 400', async () => {
    const { store, queryClient } = setup()
    server.use(http.post(SAVE_FORM_INST, () => apiError(400, 'VALIDATION_ERROR', 'closed')))
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    store.updateDraftData(target.sessionId, target.instanceId, { notes: 'x' })

    await expect(saveFormDraft(target, { store, queryClient })).resolves.toBe('error')

    expect(invalidate).toHaveBeenCalledWith({ queryKey: formQueryKeys.list(target.sessionId) })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: formQueryKeys.instance(target.sessionId, target.instanceId),
    })
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it.each([404, 409])(
    'invalidates the list and the instance on a %d, same as a 400',
    async (status) => {
      const { store, queryClient } = setup()
      server.use(http.post(SAVE_FORM_INST, () => apiError(status, 'ERROR', 'gone')))
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
      store.updateDraftData(target.sessionId, target.instanceId, { notes: 'x' })

      await expect(saveFormDraft(target, { store, queryClient })).resolves.toBe('error')

      expect(invalidate).toHaveBeenCalledWith({ queryKey: formQueryKeys.list(target.sessionId) })
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: formQueryKeys.instance(target.sessionId, target.instanceId),
      })
      expect(toastAdd).not.toHaveBeenCalled()
    },
  )

  it('invalidates the list when the saved instance is no longer open', async () => {
    const { store, queryClient } = setup()
    server.use(http.post(SAVE_FORM_INST, () => apiOk({ ...openFormInstance, status: 'Submitted' })))
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    store.updateDraftData(target.sessionId, target.instanceId, { notes: 'x' })

    await saveFormDraft(target, { store, queryClient })

    expect(invalidate).toHaveBeenCalledWith({ queryKey: formQueryKeys.list(target.sessionId) })
  })

  it('drops the response when the form was removed while the save was in flight', async () => {
    const { store, queryClient } = setup()
    const instanceKey = formQueryKeys.instance(target.sessionId, target.instanceId)
    server.use(
      http.post(SAVE_FORM_INST, async () => {
        await delay(40)
        return apiOk(openFormInstance)
      }),
    )
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    store.updateDraftData(target.sessionId, target.instanceId, { notes: 'x' })

    const save = saveFormDraft(target, { store, queryClient })
    await new Promise((r) => setTimeout(r, 5))
    queryClient.removeQueries({ queryKey: instanceKey })
    store.removeForm(target.sessionId, target.instanceId)

    await expect(save).resolves.toBe('idle')
    expect(queryClient.getQueryData(instanceKey)).toBeUndefined()
    expect(store.getDraft(target.sessionId, target.instanceId)).toBeUndefined()
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('does not invalidate on a late 400 when the form was removed while in flight', async () => {
    const { store, queryClient } = setup()
    server.use(
      http.post(SAVE_FORM_INST, async () => {
        await delay(40)
        return apiError(400, 'VALIDATION_ERROR', 'deleted')
      }),
    )
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    store.updateDraftData(target.sessionId, target.instanceId, { notes: 'x' })

    const save = saveFormDraft(target, { store, queryClient })
    await new Promise((r) => setTimeout(r, 5))
    store.removeForm(target.sessionId, target.instanceId)

    await expect(save).resolves.toBe('idle')
    expect(invalidate).not.toHaveBeenCalled()
    expect(toastAdd).not.toHaveBeenCalled()
  })
})

describe('applySavedInstance', () => {
  it('writes the instance to the cache and invalidates the list only when it left Open', () => {
    const { queryClient } = setup()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    applySavedInstance(queryClient, target.sessionId, target.instanceId, openFormInstance)
    expect(
      queryClient.getQueryData(formQueryKeys.instance(target.sessionId, target.instanceId)),
    ).toBe(openFormInstance)
    expect(invalidate).not.toHaveBeenCalled()

    const submitted: FormInstance = { ...openFormInstance, status: 'Submitted' }
    applySavedInstance(queryClient, target.sessionId, target.instanceId, submitted)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: formQueryKeys.list(target.sessionId) })
  })
})

describe('flushSessionFormDrafts', () => {
  it('saves every dirty draft of the session and reports a rejected save as error', async () => {
    const { store, queryClient } = setup()
    store.updateDraftData(target.sessionId, target.instanceId, { company: { name: 'edited' } })
    store.createDraft(target.sessionId, 'form-inst-second', openFormInstance.data!)
    store.updateDraftData(target.sessionId, 'form-inst-second', { company: { name: 'edited too' } })
    const saves = trackPostCalls(SAVE_FORM_INST, () => apiOk(openFormInstance))
    const getFocusedPointer = vi
      .fn<() => string | undefined>()
      .mockImplementationOnce(() => {
        throw new Error('boom')
      })
      .mockReturnValue(undefined)

    const statuses = await flushSessionFormDrafts(target.sessionId, target.agentId, {
      store,
      queryClient,
      getFocusedPointer,
    })

    expect(saves.count).toBe(2)
    expect(statuses.sort()).toEqual(['error', 'saved'])
  })

  it('flushes nothing without an agent id', async () => {
    const { store, queryClient } = setup()
    store.updateDraftData(target.sessionId, target.instanceId, { company: { name: 'edited' } })
    const saves = trackPostCalls(SAVE_FORM_INST, () => apiOk(openFormInstance))

    await expect(
      flushSessionFormDrafts(target.sessionId, undefined, { store, queryClient }),
    ).resolves.toEqual([])
    expect(saves.count).toBe(0)
  })
})

describe('saveFormDraft — closed forms', () => {
  const dirty = { ...openFormInstance.data, notes: 'typed just before it closed' }

  const seedList = (queryClient: ReturnType<typeof createTestQueryClient>, status: string) =>
    queryClient.setQueryData(formQueryKeys.list(target.sessionId), {
      forms: [{ instanceId: target.instanceId, formId: 7, formName: 'x', status }],
      selectedInstanceId: null,
    })

  it.each(['Submitted', 'Cancelled'])(
    'issues no request when the cached instance is %s',
    async (status) => {
      const { store, queryClient } = setup()
      const counter = trackPostCalls(SAVE_FORM_INST, () => apiOk(openFormInstance))
      store.updateDraftData(target.sessionId, target.instanceId, dirty)
      queryClient.setQueryData(formQueryKeys.instance(target.sessionId, target.instanceId), {
        ...openFormInstance,
        status,
      })

      await expect(saveFormDraft(target, { store, queryClient })).resolves.toBe('idle')

      expect(counter.count).toBe(0)
      expect(toastAdd).not.toHaveBeenCalled()
      expect(store.getDraft(target.sessionId, target.instanceId)?.saveState.status).toBe('idle')
    },
  )

  it('issues no request when only the list summary has closed the form', async () => {
    const { store, queryClient } = setup()
    const counter = trackPostCalls(SAVE_FORM_INST, () => apiOk(openFormInstance))
    store.updateDraftData(target.sessionId, target.instanceId, dirty)
    seedList(queryClient, 'Submitted')

    await expect(
      flushSessionFormDrafts(target.sessionId, target.agentId, { store, queryClient }),
    ).resolves.toEqual(['idle'])

    expect(counter.count).toBe(0)
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('still saves while both sources report the form open', async () => {
    const { store, queryClient } = setup()
    const bodies = captureSaves()
    store.updateDraftData(target.sessionId, target.instanceId, dirty)
    seedList(queryClient, 'Open')

    await expect(saveFormDraft(target, { store, queryClient })).resolves.toBe('saved')

    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toMatchObject({ data: dirty })
  })
})
