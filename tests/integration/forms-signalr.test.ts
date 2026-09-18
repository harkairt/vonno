import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, nextTick, ref, type Component } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { screen, waitFor } from '@testing-library/vue'
import { VueQueryPlugin, type QueryClient } from '@tanstack/vue-query'
import { createPinia, setActivePinia } from 'pinia'
import { server, http } from '@/tests/msw/server'
import { apiOk } from '@/tests/msw/http'
import { installFakeSignalR } from '@/tests/utils/fakeSignalR'
import { seedAuthStorage } from '@/tests/utils/authSeed'
import { trackPostCalls } from '@/tests/utils/requestCounter'
import { createTestQueryClient, renderWithProviders } from '@/tests/utils/render'
import { configureApiInterceptors } from '@/lib/api/interceptors/setup'
import {
  FORM_FIXTURE_AGENT_ID,
  FORM_FIXTURE_SESSION_ID,
  OPEN_FORM_INSTANCE_ID,
  openFormInstance,
  sessionFormSummaries,
} from '@/tests/msw/handlers/form'
import { useAuthStore } from '@/app/stores/auth'
import { useChatStore } from '@/app/stores/chat'
import { useFormsStore } from '@/app/stores/forms'
import { useSignalR } from '@/app/composables/useSignalR'
import { useSessionForms, formQueryKeys } from '@/app/composables/useFormQueries'
import { useFormDraft } from '@/app/composables/useFormDraft'
import signalrInitPlugin from '@/app/plugins/signalr-init.client'
import FormsPanel from '~/components/forms/FormsPanel.vue'
import type { SessionFormsResponse, SessionFormSummary } from '@/types/api/schemas'
import type { JsonFormsChangeEvent } from '@jsonforms/vue'

const GET_SESSION_FORMS = '/api/Form/GetSessionForms'
const GET_FORM_INST = '/api/Form/GetFormInst'
const SESSION = FORM_FIXTURE_SESSION_ID
const NEW_FORM: SessionFormSummary = {
  instanceId: 'form-inst-new',
  formId: 9,
  formName: 'Új űrlap',
  status: 'Open',
}
const baseData = openFormInstance.data as Record<string, unknown>

beforeEach(() => {
  vi.stubGlobal('useAuthStore', useAuthStore)
  vi.stubGlobal('useSignalR', useSignalR)
  vi.stubGlobal('useChatStore', useChatStore)
  vi.stubGlobal('useFormsStore', useFormsStore)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function connectHub(queryClient: QueryClient) {
  const fake = installFakeSignalR()
  await signalrInitPlugin({ $queryClient: queryClient } as unknown as Parameters<
    typeof signalrInitPlugin
  >[0])
  fake.setState('connected')
  await nextTick()
  return fake
}

function serveGrowingList() {
  let calls = 0
  server.use(
    http.post(GET_SESSION_FORMS, () => {
      calls++
      const forms = calls === 1 ? sessionFormSummaries : [...sessionFormSummaries, NEW_FORM]
      return apiOk({ forms, selectedInstanceId: null } satisfies SessionFormsResponse)
    }),
  )
}

async function mountForms(options: { expanded?: boolean } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  seedAuthStorage()
  const queryClient = createTestQueryClient()
  const expanded = ref(options.expanded ?? true)
  let list!: ReturnType<typeof useSessionForms>
  let draft!: ReturnType<typeof useFormDraft>
  const Harness = defineComponent({
    setup() {
      list = useSessionForms(SESSION, () => FORM_FIXTURE_AGENT_ID)
      draft = useFormDraft({
        sessionId: SESSION,
        agentId: () => FORM_FIXTURE_AGENT_ID,
        instanceId: OPEN_FORM_INSTANCE_ID,
        expanded,
        readonly: false,
      })
      return () => null
    },
  })
  const wrapper: VueWrapper = mount(Harness, {
    global: { plugins: [[VueQueryPlugin, { queryClient }], pinia] },
  })
  configureApiInterceptors({ authStore: useAuthStore(), redirectToLogin: vi.fn() })
  const fake = await connectHub(queryClient)
  await waitFor(() => expect(list.data.value).toBeTruthy())
  return { wrapper, queryClient, expanded, list, draft, fake, store: useFormsStore() }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30))

describe('forms panel <- hub events', () => {
  it('FormUpdated for an expanded form refetches the instance', async () => {
    const instCalls = trackPostCalls(GET_FORM_INST, () => apiOk(openFormInstance))
    const { fake, draft } = await mountForms({ expanded: true })
    await waitFor(() => expect(draft.draft.value).toBeTruthy())
    expect(instCalls.count).toBe(1)

    fake.emitFromServer('FormUpdated', SESSION, OPEN_FORM_INSTANCE_ID)

    await waitFor(() => expect(instCalls.count).toBe(2))
  })

  it('FormUpdated for a collapsed form fetches nothing until expand', async () => {
    const instCalls = trackPostCalls(GET_FORM_INST, () => apiOk(openFormInstance))
    const { fake, expanded, draft } = await mountForms({ expanded: false })

    fake.emitFromServer('FormUpdated', SESSION, OPEN_FORM_INSTANCE_ID)
    await settle()
    expect(instCalls.count).toBe(0)

    expanded.value = true
    await waitFor(() => expect(draft.draft.value).toBeTruthy())
    expect(instCalls.count).toBe(1)
  })

  it('FormUpdated for an unknown id refetches the list and the new form is appended', async () => {
    serveGrowingList()
    const { fake, list } = await mountForms()
    expect(list.data.value?.forms).toHaveLength(sessionFormSummaries.length)

    fake.emitFromServer('FormUpdated', SESSION, NEW_FORM.instanceId)

    await waitFor(() =>
      expect(list.data.value?.forms.map((form) => form.instanceId)).toEqual([
        ...sessionFormSummaries.map((form) => form.instanceId),
        NEW_FORM.instanceId,
      ]),
    )
  })

  it('FormUpdated for an unknown id renders the new row last and collapsed in the panel', async () => {
    serveGrowingList()
    seedAuthStorage()
    const { queryClient } = renderWithProviders(FormsPanel as Component, {
      props: { sessionId: SESSION, agentId: FORM_FIXTURE_AGENT_ID },
      global: {
        stubs: {
          UIcon: { template: '<i />' },
          USkeleton: { template: '<div />' },
          UBadge: { props: ['label'], template: '<span>{{ label }}</span>' },
          UAlert: { template: '<div role="alert" />' },
          UButton: { inheritAttrs: false, template: '<button v-bind="$attrs"><slot /></button>' },
          UCollapsible: { props: ['open'], template: '<div><slot /></div>' },
        },
      },
    })
    const fake = await connectHub(queryClient)
    await screen.findAllByTestId('form-panel-item')

    fake.emitFromServer('FormUpdated', SESSION, NEW_FORM.instanceId)

    await waitFor(() =>
      expect(screen.getAllByTestId('form-panel-item')).toHaveLength(
        sessionFormSummaries.length + 1,
      ),
    )
    const rows = screen.getAllByTestId('form-panel-item')
    const last = rows[rows.length - 1]!
    expect(last.getAttribute('data-instance-id')).toBe(NEW_FORM.instanceId)
    expect(last.querySelector('[aria-expanded]')?.getAttribute('aria-expanded')).toBe('false')
    expect(
      queryClient.getQueryData<SessionFormsResponse>(formQueryKeys.list(SESSION))?.forms,
    ).toHaveLength(sessionFormSummaries.length + 1)
  })

  it('FormUpdated refetch keeps the focused field via the merge rule', async () => {
    const { fake, draft } = await mountForms({ expanded: true })
    await waitFor(() => expect(draft.draft.value).toBeTruthy())

    const field = document.createElement('input')
    const wrapperEl = document.createElement('div')
    wrapperEl.setAttribute('data-form-path', '/company/taxId')
    wrapperEl.appendChild(field)
    document.body.appendChild(wrapperEl)
    draft.onFocusIn({ target: field } as unknown as FocusEvent)
    draft.onChange({
      data: { ...baseData, company: { taxId: 'typing' } },
      errors: [],
    } as JsonFormsChangeEvent)

    const serverData = {
      ...baseData,
      company: { taxId: 'agent', name: 'Agent Kft.' },
      notes: 'agent',
    }
    server.use(http.post(GET_FORM_INST, () => apiOk({ ...openFormInstance, data: serverData })))

    fake.emitFromServer('FormUpdated', SESSION, OPEN_FORM_INSTANCE_ID)

    await waitFor(() => expect(draft.draft.value?.baseline).toEqual(serverData))
    expect(draft.draft.value?.data).toEqual({
      ...serverData,
      company: { taxId: 'typing', name: 'Agent Kft.' },
    })
    wrapperEl.remove()
  })

  it('FormSelected moves the marker only and does not refetch a known id', async () => {
    const listCalls = trackPostCalls(GET_SESSION_FORMS, () =>
      apiOk({ forms: sessionFormSummaries, selectedInstanceId: null }),
    )
    const { fake, store } = await mountForms({ expanded: true })
    const expandedBefore = [...(store.sessions[SESSION]?.expandedIds ?? [])]
    const focusSeqBefore = store.lastFocusSeq

    fake.emitFromServer('FormSelected', SESSION, OPEN_FORM_INSTANCE_ID)
    await settle()

    expect(store.sessions[SESSION]?.selectedInstanceId).toBe(OPEN_FORM_INSTANCE_ID)
    expect(store.sessions[SESSION]?.expandedIds).toEqual(expandedBefore)
    expect(store.lastFocusSeq).toBe(focusSeqBefore)
    expect(listCalls.count).toBe(1)

    fake.emitFromServer('FormSelected', SESSION, null)
    await nextTick()
    expect(store.sessions[SESSION]?.selectedInstanceId).toBeNull()
    expect(listCalls.count).toBe(1)
  })

  it('FormSelected for an unknown id refetches the list once', async () => {
    const listCalls = trackPostCalls(GET_SESSION_FORMS, () =>
      apiOk({ forms: sessionFormSummaries, selectedInstanceId: null }),
    )
    const { fake, store } = await mountForms()

    fake.emitFromServer('FormSelected', SESSION, NEW_FORM.instanceId)

    await waitFor(() => expect(listCalls.count).toBe(2))
    await settle()
    expect(listCalls.count).toBe(2)
    expect(store.sessions[SESSION]?.selectedInstanceId).toBe(NEW_FORM.instanceId)
  })

  it('ReceiveMessage refetches the forms list', async () => {
    const listCalls = trackPostCalls(GET_SESSION_FORMS, () =>
      apiOk({ forms: sessionFormSummaries, selectedInstanceId: null }),
    )
    const { fake } = await mountForms()
    expect(listCalls.count).toBe(1)

    fake.emitFromServer('ReceiveMessage', SESSION, FORM_FIXTURE_AGENT_ID)

    await waitFor(() => expect(listCalls.count).toBe(2))
  })
})
