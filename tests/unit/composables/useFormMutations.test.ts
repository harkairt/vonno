import { describe, it, expect, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import { createPinia, setActivePinia } from 'pinia'
import { server, http } from '@/tests/msw/server'
import { apiOk, apiError } from '@/tests/msw/http'
import { seedAuthStorage } from '@/tests/utils/authSeed'
import { configureApiInterceptors } from '@/lib/api/interceptors/setup'
import { useAuthStore } from '~/stores/auth'
import {
  FORM_FIXTURE_AGENT_ID,
  FORM_FIXTURE_SESSION_ID,
  OPEN_FORM_INSTANCE_ID,
  openFormInstance,
} from '@/tests/msw/handlers/form'
import { formQueryKeys } from '~/composables/useFormQueries'
import { useSaveFormInst, useDeleteFormInst } from '~/composables/useFormMutations'
import { useFormsStore } from '~/stores/forms'
import { AppError } from '@/lib/errors/types'
import type { FormInstance } from '@/types/api/schemas'

const SAVE_FORM_INST = '/api/Form/SaveFormInst'
const DELETE_FORM_INST = '/api/Form/DeleteFormInst'

function mountMutation<T>(setup: () => T): { result: T; queryClient: QueryClient } {
  const pinia = createPinia()
  setActivePinia(pinia)
  seedAuthStorage()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
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
  return { result, queryClient }
}

const request = {
  agentId: FORM_FIXTURE_AGENT_ID,
  sessionId: FORM_FIXTURE_SESSION_ID,
  instanceId: OPEN_FORM_INSTANCE_ID,
  data: { notes: 'hello' },
}

describe('useSaveFormInst', () => {
  it('writes the returned instance into the cache and leaves the list alone while open', async () => {
    const { result: mutation, queryClient } = mountMutation(() => useSaveFormInst())
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    const saved = await mutation.mutateAsync(request)

    expect(saved.data).toMatchObject({ notes: 'hello' })
    expect(
      queryClient.getQueryData<FormInstance>(
        formQueryKeys.instance(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID),
      ),
    ).toEqual(saved)
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('invalidates the list when the status leaves Open', async () => {
    const { result: mutation, queryClient } = mountMutation(() => useSaveFormInst())
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    await mutation.mutateAsync({ ...request, status: 'Submitted' })

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: formQueryKeys.list(FORM_FIXTURE_SESSION_ID),
    })
  })

  it('throws the AppError of a failed save', async () => {
    server.use(http.post(SAVE_FORM_INST, () => apiError(400, 'VALIDATION_ERROR', 'closed')))
    const { result: mutation, queryClient } = mountMutation(() => useSaveFormInst())

    await expect(mutation.mutateAsync(request)).rejects.toBeInstanceOf(AppError)
    expect(
      queryClient.getQueryData(
        formQueryKeys.instance(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID),
      ),
    ).toBeUndefined()
  })

  it('uses the real endpoint response shape', async () => {
    server.use(http.post(SAVE_FORM_INST, () => apiOk({ ...openFormInstance, data: null })))
    const { result: mutation } = mountMutation(() => useSaveFormInst())

    const saved = await mutation.mutateAsync(request)
    expect(saved.data).toBeNull()
  })
})

describe('useDeleteFormInst', () => {
  const deleteRequest = {
    agentId: FORM_FIXTURE_AGENT_ID,
    sessionId: FORM_FIXTURE_SESSION_ID,
    instanceId: OPEN_FORM_INSTANCE_ID,
  }
  const instanceKey = formQueryKeys.instance(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID)

  it('removes the instance query, invalidates the list and drops the form from the store', async () => {
    const { result: mutation, queryClient } = mountMutation(() => useDeleteFormInst())
    const store = useFormsStore()
    store.toggleExpanded(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID)
    store.createDraft(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID, { notes: 'x' })
    queryClient.setQueryData(instanceKey, openFormInstance)
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    const response = await mutation.mutateAsync(deleteRequest)

    expect(response.deleted).toBe(true)
    expect(queryClient.getQueryData(instanceKey)).toBeUndefined()
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: formQueryKeys.list(FORM_FIXTURE_SESSION_ID),
    })
    expect(store.sessions[FORM_FIXTURE_SESSION_ID]?.expandedIds).toEqual([])
    expect(store.getDraft(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID)).toBeUndefined()
  })

  it('throws the AppError of a failed delete and keeps the cache and store intact', async () => {
    server.use(http.post(DELETE_FORM_INST, () => apiError(500, 'SERVER_ERROR', 'down')))
    const { result: mutation, queryClient } = mountMutation(() => useDeleteFormInst())
    const store = useFormsStore()
    store.createDraft(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID, { notes: 'x' })
    queryClient.setQueryData(instanceKey, openFormInstance)

    await expect(mutation.mutateAsync(deleteRequest)).rejects.toBeInstanceOf(AppError)

    expect(queryClient.getQueryData(instanceKey)).toEqual(openFormInstance)
    expect(store.getDraft(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID)).toBeTruthy()
  })
})
