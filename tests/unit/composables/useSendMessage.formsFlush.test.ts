import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { VueQueryPlugin, type QueryClient } from '@tanstack/vue-query'
import { createPinia, setActivePinia } from 'pinia'
import { delay } from 'msw'
import { server, http } from '@/tests/msw/server'
import { apiOk, apiError } from '@/tests/msw/http'
import { seedAuthStorage } from '@/tests/utils/authSeed'
import { createTestQueryClient } from '@/tests/utils/render'
import { trackPostCalls } from '@/tests/utils/requestCounter'
import { makeRawMessage, makeUser } from '@/tests/utils/factories'
import { configureApiInterceptors } from '@/lib/api/interceptors/setup'
import { OPEN_FORM_INSTANCE_ID, openFormInstance } from '@/tests/msw/handlers/form'
import { useSendMessage } from '~/composables/useChatMutations'
import { formQueryKeys } from '~/composables/useFormQueries'
import { userQueryKeys } from '~/composables/useUsers'
import { useAuthStore } from '~/stores/auth'
import { useFormsStore } from '~/stores/forms'
import type { AiQuestionRequestDTO } from '@/types/api/schemas'

const SESSION_ID = 'session-1'
const SAVE_FORM_INST = '/api/Form/SaveFormInst'
const SEND_TEXT = '/api/AIWebAPI/question/text'
const ME = 'me@example.com'

const SESSION_AGENT_ID = 11
const MESSAGE_TARGET_AGENT_ID = 22
const AGENT_A_EMAIL = 'agentA@example.com'
const AGENT_B_EMAIL = 'agentB@example.com'

function sendRequest(overrides: Partial<AiQuestionRequestDTO> = {}): AiQuestionRequestDTO {
  return {
    sessionId: SESSION_ID,
    agentId: MESSAGE_TARGET_AGENT_ID,
    userCode: ME,
    members: [ME, AGENT_A_EMAIL, AGENT_B_EMAIL],
    question: 'hello there',
    group: 'default',
    pquestionType: 0,
    options: [],
    ...overrides,
  } as unknown as AiQuestionRequestDTO
}

function seedSelectableUsers(queryClient: QueryClient) {
  queryClient.setQueryData(userQueryKeys.selectable(), [
    makeUser({ id: SESSION_AGENT_ID, email: AGENT_A_EMAIL, isVirtual: true }),
    makeUser({ id: MESSAGE_TARGET_AGENT_ID, email: AGENT_B_EMAIL, isVirtual: true }),
  ])
}

function mountSend(queryClient: QueryClient) {
  const pinia = createPinia()
  setActivePinia(pinia)
  seedAuthStorage({ user: makeUser({ email: ME }) })
  configureApiInterceptors({ authStore: useAuthStore(), redirectToLogin: vi.fn() })

  let mutation!: ReturnType<typeof useSendMessage>
  const Comp = defineComponent({
    setup() {
      mutation = useSendMessage()
      return () => null
    },
  })
  mount(Comp, { global: { plugins: [[VueQueryPlugin, { queryClient }], pinia] } })
  return mutation
}

function seedDirtyDraft(instanceId: string) {
  const store = useFormsStore()
  store.createDraft(SESSION_ID, instanceId, openFormInstance.data!)
  store.updateDraftData(SESSION_ID, instanceId, { company: { name: `edited ${instanceId}` } })
  return store
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

describe('useSendMessage — flush dirty forms before send', () => {
  it('completes the draft save before issuing the send request, addressed to the session agent', async () => {
    const order: string[] = []
    const saveBodies: { agentId: number }[] = []
    server.use(
      http.post(SAVE_FORM_INST, async ({ request }) => {
        const body = (await request.json()) as { data: Record<string, unknown>; agentId: number }
        saveBodies.push({ agentId: body.agentId })
        await delay(20)
        order.push('save')
        return apiOk({ ...openFormInstance, data: body.data })
      }),
      http.post(SEND_TEXT, () => {
        order.push('send')
        return apiOk(makeRawMessage())
      }),
    )
    const queryClient = createTestQueryClient()
    seedSelectableUsers(queryClient)
    const mutation = mountSend(queryClient)
    const store = seedDirtyDraft(OPEN_FORM_INSTANCE_ID)

    await mutation.mutateAsync({ request: sendRequest() })

    expect(order).toEqual(['save', 'send'])
    expect(saveBodies).toEqual([{ agentId: SESSION_AGENT_ID }])
    expect(store.dirtyInstanceIds(SESSION_ID)).toEqual([])
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('saves with the session agent even when the request carries no selected target (the human user id)', async () => {
    const HUMAN_USER_ID = 999
    const saveBodies: { agentId: number }[] = []
    server.use(
      http.post(SAVE_FORM_INST, async ({ request }) => {
        const body = (await request.json()) as { agentId: number }
        saveBodies.push({ agentId: body.agentId })
        return apiOk(openFormInstance)
      }),
      http.post(SEND_TEXT, () => apiOk(makeRawMessage())),
    )
    const queryClient = createTestQueryClient()
    seedSelectableUsers(queryClient)
    const mutation = mountSend(queryClient)
    seedDirtyDraft(OPEN_FORM_INSTANCE_ID)

    await mutation.mutateAsync({ request: sendRequest({ agentId: HUMAN_USER_ID }) })

    expect(saveBodies).toEqual([{ agentId: SESSION_AGENT_ID }])
  })

  it('sends no save request when no draft is dirty', async () => {
    const saves = trackPostCalls(SAVE_FORM_INST, () => apiOk(openFormInstance))
    const sends = trackPostCalls(SEND_TEXT, () => apiOk(makeRawMessage()))
    const mutation = mountSend(createTestQueryClient())

    await mutation.mutateAsync({ request: sendRequest() })

    expect(saves.count).toBe(0)
    expect(sends.count).toBe(1)
  })

  it('shows exactly one toast when flushes fail and still sends the message', async () => {
    const saves = trackPostCalls(SAVE_FORM_INST, () => apiError(500, 'SERVER_ERROR', 'boom'))
    const sends = trackPostCalls(SEND_TEXT, () => apiOk(makeRawMessage()))
    const queryClient = createTestQueryClient()
    seedSelectableUsers(queryClient)
    const mutation = mountSend(queryClient)
    const store = seedDirtyDraft(OPEN_FORM_INSTANCE_ID)
    seedDirtyDraft('form-inst-second')

    await mutation.mutateAsync({ request: sendRequest() })

    expect(saves.count).toBe(2)
    expect(sends.count).toBe(1)
    expect(toastAdd).toHaveBeenCalledTimes(1)
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'chat.forms.flushFailed', color: 'error' }),
    )
    expect(store.getDraft(SESSION_ID, OPEN_FORM_INSTANCE_ID)?.saveState.status).toBe('error')
    expect(store.dirtyInstanceIds(SESSION_ID)).toHaveLength(2)
  })

  it('invalidates the forms of the session after a successful send', async () => {
    const queryClient = createTestQueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const mutation = mountSend(queryClient)

    await mutation.mutateAsync({ request: sendRequest() })

    expect(invalidate).toHaveBeenCalledWith({ queryKey: formQueryKeys.all(SESSION_ID) })
  })
})
