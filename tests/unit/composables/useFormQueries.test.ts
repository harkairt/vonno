import { describe, it, expect, vi } from 'vitest'
import { defineComponent, ref, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { VueQueryPlugin, QueryClient, useQueryClient } from '@tanstack/vue-query'
import { createPinia, setActivePinia } from 'pinia'
import { server, http } from '@/tests/msw/server'
import { apiOk, apiError } from '@/tests/msw/http'
import { seedAuthStorage } from '@/tests/utils/authSeed'
import { configureApiInterceptors } from '@/lib/api/interceptors/setup'
import { useAuthStore } from '@/app/stores/auth'
import { useFormsStore } from '@/app/stores/forms'
import {
  FORM_FIXTURE_AGENT_ID,
  FORM_FIXTURE_SESSION_ID,
  DELETED_FORM_INSTANCE_ID,
  OPEN_FORM_INSTANCE_ID,
  openFormInstance,
  sessionFormSummaries,
} from '@/tests/msw/handlers/form'
import {
  assertAgentId,
  formQueryKeys,
  shouldRetryFormQuery,
  useFormInstance,
  useSessionForms,
} from '~/composables/useFormQueries'
import { AppError } from '@/lib/errors/types'

const GET_SESSION_FORMS = '/api/Form/GetSessionForms'
const GET_FORM_INST = '/api/Form/GetFormInst'

function mountQuery<T>(setup: () => T): T {
  const pinia = createPinia()
  setActivePinia(pinia)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  let result!: T
  const Comp = defineComponent({
    setup() {
      result = setup()
      return () => null
    },
  })
  mount(Comp, { global: { plugins: [[VueQueryPlugin, { queryClient }], pinia] } })
  configureApiInterceptors({ authStore: useAuthStore(), redirectToLogin: vi.fn() })
  return result
}

async function flush(ms = 50) {
  await new Promise((r) => setTimeout(r, ms))
  await nextTick()
}

describe('formQueryKeys', () => {
  it('lives under its own forms root, not under the chat session key', () => {
    expect(formQueryKeys.all('s1')).toEqual(['forms', 's1'])
    expect(formQueryKeys.list('s1')).toEqual(['forms', 's1', 'list'])
    expect(formQueryKeys.instance('s1', 'i1')).toEqual(['forms', 's1', 'instance', 'i1'])
  })
})

describe('useSessionForms', () => {
  it('is disabled without an agentId', async () => {
    seedAuthStorage()
    const spy = vi.fn()
    server.use(
      http.post(GET_SESSION_FORMS, () => {
        spy()
        return apiError(500)
      }),
    )

    const query = mountQuery(() =>
      useSessionForms(ref(FORM_FIXTURE_SESSION_ID), ref<number | undefined>(undefined)),
    )
    await flush()

    expect(spy).not.toHaveBeenCalled()
    expect(query.isPending.value).toBe(true)
    expect(query.data.value).toBeUndefined()
  })

  it('is disabled when not authenticated', async () => {
    const spy = vi.fn()
    server.use(
      http.post(GET_SESSION_FORMS, () => {
        spy()
        return apiError(500)
      }),
    )

    mountQuery(() => useSessionForms(ref(FORM_FIXTURE_SESSION_ID), ref(FORM_FIXTURE_AGENT_ID)))
    await flush()

    expect(spy).not.toHaveBeenCalled()
  })

  it('fetches the session forms when authenticated with both ids', async () => {
    seedAuthStorage()

    const query = mountQuery(() =>
      useSessionForms(ref(FORM_FIXTURE_SESSION_ID), ref(FORM_FIXTURE_AGENT_ID)),
    )
    await vi.waitFor(() => expect(query.isSuccess.value).toBe(true))

    expect(query.data.value?.forms).toEqual(sessionFormSummaries)
    expect(query.data.value?.selectedInstanceId).toBe(DELETED_FORM_INSTANCE_ID)
  })

  it('sends agentId and sessionId in the request body', async () => {
    seedAuthStorage()
    let captured: unknown
    server.use(
      http.post(GET_SESSION_FORMS, async ({ request }) => {
        captured = await request.json()
        return apiError(500)
      }),
    )

    mountQuery(() => useSessionForms(ref('other-session'), ref(42)))
    await vi.waitFor(() => expect(captured).toBeDefined())

    expect(captured).toEqual({ agentId: 42, sessionId: 'other-session' })
  })

  it('initialises the store marker from the first list response', async () => {
    seedAuthStorage()

    const query = mountQuery(() =>
      useSessionForms(ref(FORM_FIXTURE_SESSION_ID), ref(FORM_FIXTURE_AGENT_ID)),
    )
    await vi.waitFor(() => expect(query.isSuccess.value).toBe(true))

    const store = useFormsStore()
    expect(store.sessions[FORM_FIXTURE_SESSION_ID]?.selectedInstanceId).toBe(
      DELETED_FORM_INSTANCE_ID,
    )
    expect(store.sessions[FORM_FIXTURE_SESSION_ID]?.selectedInitialized).toBe(true)
  })

  it('throws the AppError so the query enters the error state', async () => {
    seedAuthStorage()
    server.use(http.post(GET_SESSION_FORMS, () => apiError(404, 'NOT_FOUND', 'gone')))

    const query = mountQuery(() =>
      useSessionForms(ref(FORM_FIXTURE_SESSION_ID), ref(FORM_FIXTURE_AGENT_ID)),
    )
    await vi.waitFor(() => expect(query.isError.value).toBe(true))

    expect(query.error.value).toMatchObject({ code: 'NOT_FOUND' })
    expect(query.data.value).toBeUndefined()
  })

  it('prunes a draft whose instance id is absent from the refreshed non-empty list', async () => {
    seedAuthStorage()

    const query = mountQuery(() =>
      useSessionForms(ref(FORM_FIXTURE_SESSION_ID), ref(FORM_FIXTURE_AGENT_ID)),
    )
    await vi.waitFor(() => expect(query.isSuccess.value).toBe(true))

    const store = useFormsStore()
    store.createDraft(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID, { notes: 'a' })
    store.createDraft(FORM_FIXTURE_SESSION_ID, 'gone-form', { notes: 'original' })
    store.updateDraftData(FORM_FIXTURE_SESSION_ID, 'gone-form', { notes: 'edited' })

    server.use(
      http.post(GET_SESSION_FORMS, () =>
        apiOk({
          forms: [
            { instanceId: OPEN_FORM_INSTANCE_ID, formId: 7, formName: 'Kept', status: 'Open' },
          ],
          selectedInstanceId: null,
        }),
      ),
    )
    await query.refetch()
    await vi.waitFor(() => expect(query.dataUpdatedAt.value).toBeGreaterThan(0))
    await nextTick()

    expect(store.getDraft(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID)).toBeDefined()
    expect(store.getDraft(FORM_FIXTURE_SESSION_ID, 'gone-form')).toBeUndefined()
  })

  it('shows a toast when pruning a dirty draft', async () => {
    seedAuthStorage()
    const toastAdd = vi.fn()
    vi.mocked(useToast).mockReturnValue({
      add: toastAdd,
      remove: vi.fn(),
      clear: vi.fn(),
    } as unknown as ReturnType<typeof useToast>)

    const query = mountQuery(() =>
      useSessionForms(ref(FORM_FIXTURE_SESSION_ID), ref(FORM_FIXTURE_AGENT_ID)),
    )
    await vi.waitFor(() => expect(query.isSuccess.value).toBe(true))

    const store = useFormsStore()
    store.createDraft(FORM_FIXTURE_SESSION_ID, 'gone-dirty', { notes: 'original' })
    store.updateDraftData(FORM_FIXTURE_SESSION_ID, 'gone-dirty', { notes: 'edited' })

    server.use(
      http.post(GET_SESSION_FORMS, () =>
        apiOk({
          forms: [
            { instanceId: OPEN_FORM_INSTANCE_ID, formId: 7, formName: 'Kept', status: 'Open' },
          ],
          selectedInstanceId: null,
        }),
      ),
    )
    await query.refetch()
    await vi.waitFor(() =>
      expect(store.getDraft(FORM_FIXTURE_SESSION_ID, 'gone-dirty')).toBeUndefined(),
    )

    expect(toastAdd).toHaveBeenCalledTimes(1)
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'chat.forms.draftPruned', color: 'warning' }),
    )
  })
})

describe('useFormInstance', () => {
  function spyInstanceEndpoint() {
    const spy = vi.fn()
    server.use(
      http.post(GET_FORM_INST, async ({ request }) => {
        spy(await request.json())
        return apiOk(openFormInstance)
      }),
    )
    return spy
  }

  it('is disabled while the item is collapsed and fetches once expanded', async () => {
    seedAuthStorage()
    const spy = spyInstanceEndpoint()
    const enabled = ref(false)

    const query = mountQuery(() =>
      useFormInstance(
        ref(FORM_FIXTURE_SESSION_ID),
        ref(FORM_FIXTURE_AGENT_ID),
        ref(OPEN_FORM_INSTANCE_ID),
        enabled,
      ),
    )
    await flush()

    expect(spy).not.toHaveBeenCalled()
    expect(query.isPending.value).toBe(true)

    enabled.value = true
    await vi.waitFor(() => expect(query.isSuccess.value).toBe(true))

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith({
      agentId: FORM_FIXTURE_AGENT_ID,
      sessionId: FORM_FIXTURE_SESSION_ID,
      instanceId: OPEN_FORM_INSTANCE_ID,
    })
    expect(query.data.value).toEqual(openFormInstance)
  })

  it('does not fetch when a collapsed item is invalidated, then fetches on expand', async () => {
    seedAuthStorage()
    const spy = spyInstanceEndpoint()
    const enabled = ref(true)

    const { query, queryClient } = mountQuery(() => ({
      query: useFormInstance(
        ref(FORM_FIXTURE_SESSION_ID),
        ref(FORM_FIXTURE_AGENT_ID),
        ref(OPEN_FORM_INSTANCE_ID),
        enabled,
      ),
      queryClient: useQueryClient(),
    }))
    await vi.waitFor(() => expect(query.isSuccess.value).toBe(true))
    expect(spy).toHaveBeenCalledTimes(1)

    enabled.value = false
    await nextTick()
    await queryClient.invalidateQueries({
      queryKey: formQueryKeys.instance(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID),
    })
    await flush()
    expect(spy).toHaveBeenCalledTimes(1)

    enabled.value = true
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2))
  })

  it('is disabled without an agentId even when expanded', async () => {
    seedAuthStorage()
    const spy = spyInstanceEndpoint()

    mountQuery(() =>
      useFormInstance(
        ref(FORM_FIXTURE_SESSION_ID),
        ref<number | undefined>(undefined),
        ref(OPEN_FORM_INSTANCE_ID),
        ref(true),
      ),
    )
    await flush()

    expect(spy).not.toHaveBeenCalled()
  })

  it('throws the AppError so the query enters the error state', async () => {
    seedAuthStorage()
    server.use(http.post(GET_FORM_INST, () => apiError(404, 'NOT_FOUND', 'gone')))

    const query = mountQuery(() =>
      useFormInstance(
        ref(FORM_FIXTURE_SESSION_ID),
        ref(FORM_FIXTURE_AGENT_ID),
        ref(OPEN_FORM_INSTANCE_ID),
        ref(true),
      ),
    )
    await vi.waitFor(() => expect(query.isError.value).toBe(true))

    expect(query.error.value).toMatchObject({ code: 'NOT_FOUND' })
    expect(query.data.value).toBeUndefined()
  })

  it('makes exactly one request when the backend reports the form gone via a 400 envelope', async () => {
    seedAuthStorage()
    const spy = vi.fn()
    server.use(
      http.post(GET_FORM_INST, () => {
        spy()
        return apiError(400, 'VALIDATION_ERROR', 'Form not found')
      }),
    )

    const query = mountQuery(() =>
      useFormInstance(
        ref(FORM_FIXTURE_SESSION_ID),
        ref(FORM_FIXTURE_AGENT_ID),
        ref(OPEN_FORM_INSTANCE_ID),
        ref(true),
      ),
    )
    await vi.waitFor(() => expect(query.isError.value).toBe(true))

    expect(spy).toHaveBeenCalledTimes(1)
    expect(query.error.value).toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Form not found',
    })
  })
})

describe('agentId guard', () => {
  it('throws an AppError when the agentId is unexpectedly undefined', () => {
    expect(() => assertAgentId(undefined)).toThrow(AppError)
    expect(() => assertAgentId(undefined)).toThrow('Agent ID is required')
  })

  it('does not throw for a valid numeric agentId', () => {
    expect(() => assertAgentId(42)).not.toThrow()
  })
})

describe('shouldRetryFormQuery', () => {
  it('does not retry auth or not-found errors', () => {
    expect(shouldRetryFormQuery(0, { code: 'UNAUTHORIZED' })).toBe(false)
    expect(shouldRetryFormQuery(0, { code: 'FORBIDDEN' })).toBe(false)
    expect(shouldRetryFormQuery(0, { code: 'NOT_FOUND' })).toBe(false)
  })

  it('does not retry a validation error with status 400', () => {
    expect(shouldRetryFormQuery(0, { code: 'VALIDATION_ERROR', statusCode: 400 })).toBe(false)
  })

  it('retries other errors once', () => {
    expect(shouldRetryFormQuery(0, { code: 'SERVER_ERROR' })).toBe(true)
    expect(shouldRetryFormQuery(1, { code: 'SERVER_ERROR' })).toBe(true)
    expect(shouldRetryFormQuery(2, { code: 'SERVER_ERROR' })).toBe(false)
    expect(shouldRetryFormQuery(0, new Error('network'))).toBe(true)
    expect(shouldRetryFormQuery(0, { code: 'SERVER_ERROR', statusCode: 500 })).toBe(true)
  })
})
