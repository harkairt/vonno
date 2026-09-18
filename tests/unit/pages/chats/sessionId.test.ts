/**
 * chats/[sessionId].vue page tests.
 *
 * Drives the REAL chat page: useChatSession → chatService.getSessionById → MSW;
 * MessageInput → useSendMessage → chatService.sendQuestion → MSW; the fake
 * SignalR singleton for ReceiveMessage; real Pinia stores throughout. No
 * store/service/apiClient mocking.
 *
 * useChatAutoScroll is mocked to no-ops: it drives happy-dom-hostile scroll APIs
 * and is irrelevant to the flows under test (a browser-API leaf per the mocking
 * ladder).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { delay } from 'msw'
import { screen, fireEvent, waitFor, within } from '@testing-library/vue'
import { defineComponent, h, reactive, type Component } from 'vue'
import { renderWithProviders } from '@/tests/utils/render'
import { server, http } from '@/tests/msw/server'
import { apiOk, apiError } from '@/tests/msw/http'
import { makeSession, makeRawMessage, makeUser } from '@/tests/utils/factories'
import { seedAuthStorage } from '@/tests/utils/authSeed'
import { trackPostCalls } from '@/tests/utils/requestCounter'
import { installFakeSignalR } from '@/tests/utils/fakeSignalR'
import { chatQueryKeys } from '@/app/composables/useChatQueries'
import { useChatStore } from '@/app/stores/chat'
import { useAuthStore } from '@/app/stores/auth'
import { useSignalR } from '@/app/composables/useSignalR'
import { useFormsStore } from '@/app/stores/forms'
import {
  OPEN_FORM_INSTANCE_ID,
  SUBMITTED_FORM_INSTANCE_ID,
  openFormInstance,
  sessionFormSummaries,
} from '@/tests/msw/handlers/form'
import type { AISessionDTO, SessionFormSummary } from '@/types/api/schemas'
import ChatSessionPage from '@/app/pages/chats/[sessionId].vue'
import ChatMessages from '@/app/components/chat/ChatMessages.vue'
import signalrInitPlugin from '@/app/plugins/signalr-init.client'

vi.mock('@/app/composables/useChatAutoScroll', () => ({
  useChatAutoScroll: () => ({
    isAtBottom: { value: true },
    scrollToBottom: () => {},
    scrollToElement: () => {},
  }),
}))

// The page imports this module directly (not the global from tests/setup.ts),
// so viewport mode is driven through a module mock with a hoisted switch.
const viewport = vi.hoisted(() => ({ mobile: false }))
vi.mock('~/composables/useNavigationVisibility', async () => {
  const { computed } = await import('vue')
  return {
    useNavigationVisibility: () => ({
      isMobile: computed(() => viewport.mobile),
      isActiveChat: computed(() => true),
      showBottomTabBar: computed(() => false),
      showRail: computed(() => !viewport.mobile),
    }),
  }
})

const ME = 'me@example.com'
const OTHER = 'other@example.com'
const SESSION_ID = 'session-1'
// Deliberately not makeSession's agentId (1), which GetSessionById echoes back.
const AGENT_ID = 77

const GET_SESSION_BY_ID = '/api/AIWebAPI/GetSessionById'
const SEND_TEXT = '/api/AIWebAPI/question/text'
const WELCOME_TEXT = '/api/AIWebAPI/welcomeText'
const GREETING = 'Greetings from the agent'

beforeEach(() => {
  vi.stubGlobal('useSeoMeta', vi.fn())
  vi.mocked(useRoute).mockReturnValue({
    params: { sessionId: SESSION_ID },
    query: {},
    path: `/chats/${SESSION_ID}`,
    fullPath: `/chats/${SESSION_ID}`,
    name: 'chats-sessionId',
  } as never)
})

afterEach(() => {
  vi.unstubAllGlobals()
  viewport.mobile = false
})

// Keep ChatMessages / TypingIndicator / MessageInput real; stub the markdown/
// avatar/modal leaves + Nuxt UI + Nuxt built-ins to plain DOM.
const stubs = {
  // Synchronous transition stub — the shimmer→messages <Transition mode="out-in">
  // otherwise wedges in happy-dom (no transitionend).
  transition: true,
  NuxtErrorBoundary: { template: '<div><slot /></div>' },
  MarkdownContent: { props: ['content'], template: '<div class="markdown">{{ content }}</div>' },
  SessionMembers: { template: '<div />' },
  ManageSessionUsers: { template: '<div />' },
  MessageRating: { template: '<div />' },
  OptionsMessage: { template: '<div />' },
  UButton: { template: '<button v-bind="$attrs"><slot /></button>' },
  UTextarea: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<textarea v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  UAlert: {
    props: ['title', 'description'],
    template: '<div role="alert">{{ title }}{{ description }}<slot name="actions" /></div>',
  },
  UIcon: { template: '<i />' },
  USkeleton: { template: '<div />' },
  UBadge: { props: ['label'], template: '<span>{{ label }}</span>' },
  USlideover: {
    props: ['open', 'title'],
    template:
      '<div v-if="open" data-testid="forms-slideover">{{ title }}<slot name="body" /></div>',
  },
  UCollapsible: {
    props: ['open'],
    template: '<div><slot /><slot v-if="open" name="content" /></div>',
  },
  UserAvatar: { template: '<div />' },
}

function renderPage() {
  // ChatMessages is a Nuxt auto-import (not imported by the page), so register it
  // for the test renderer; otherwise it resolves to an inert <chatmessages> stub.
  return renderWithProviders(ChatSessionPage as Component, {
    global: { stubs, components: { ChatMessages: ChatMessages as Component } },
  })
}

/**
 * Render the page as a child so a parent setup can seed store state first.
 * renderWithProviders creates and activates its own Pinia inside the call, so
 * there is no window to set store state before the page's own setup runs.
 */
function renderFreshlyCreatedPage() {
  const Wrapper = defineComponent({
    setup() {
      // What /chats/new/[userId] does immediately before navigating here.
      useChatStore().nextSessionIsFreshlyCreated = true
      return () => h(ChatSessionPage as Component)
    },
  })
  return renderWithProviders(Wrapper, {
    global: { stubs, components: { ChatMessages: ChatMessages as Component } },
  })
}

/**
 * A 1:1 session whose OTHER member is a virtual agent — the shape that arms the
 * welcome path. The default get-selectable-users returns non-virtual users, so
 * this override is what makes `resolveWelcomeAgent` return non-null.
 */
function serveVirtualAgentSession(messageText: string) {
  server.use(
    http.get('/api/user/get-selectable-users', () =>
      apiOk([makeUser({ email: OTHER, isVirtual: true }), makeUser({ email: ME })]),
    ),
    http.post(GET_SESSION_BY_ID, () =>
      apiOk({
        ...makeSession({ sessionId: SESSION_ID, members: [ME, OTHER] }),
        messages: [makeRawMessage({ messageID: 'm1', messageText, senderUserCode: OTHER })],
      }),
    ),
  )
}

/**
 * The OTHER member as a virtual agent: what makes the form calls address a real
 * agent instead of staying disabled.
 */
function serveAgentMember() {
  server.use(
    http.get('/api/user/get-selectable-users', () =>
      apiOk([makeUser({ id: AGENT_ID, email: OTHER, isVirtual: true }), makeUser({ email: ME })]),
    ),
  )
}

/** Session-by-id handler returning the supplied (mutable) message list. */
function serveSession(messages: () => Record<string, unknown>[]) {
  server.use(
    http.post(GET_SESSION_BY_ID, () =>
      apiOk({
        ...makeSession({ sessionId: SESSION_ID, members: [ME, OTHER] }),
        messages: messages(),
      }),
    ),
  )
}

describe('chats/[sessionId] page', () => {
  it('renders messages from MSW', async () => {
    seedAuthStorage({ user: makeUser({ email: ME }) })
    installFakeSignalR()
    serveSession(() => [
      makeRawMessage({ messageID: 'm1', messageText: 'Hello from server', senderUserCode: OTHER }),
    ])

    renderPage()

    const container = await screen.findByTestId('messages-container')
    await waitFor(() => expect(within(container).getByText('Hello from server')).toBeTruthy())
  })

  it('rolls back the optimistic message and shows a failed indicator + banner on 500', async () => {
    seedAuthStorage({ user: makeUser({ email: ME }) })
    installFakeSignalR()
    serveSession(() => [
      makeRawMessage({ messageID: 'm1', messageText: 'existing', senderUserCode: OTHER }),
    ])
    server.use(http.post(SEND_TEXT, () => apiError(500)))

    const { queryClient } = renderPage()

    const input = await screen.findByTestId('message-input')
    await fireEvent.update(input, 'hello there')
    await fireEvent.keyDown(input, { key: 'Enter' })

    // The failed user message text is still shown (parked in the store).
    const messages = await screen.findByTestId('messages-container')
    await waitFor(() => expect(within(messages).getByText('hello there')).toBeTruthy())

    // Query cache rolled back: the optimistic temp message is gone from the session.
    const session = queryClient.getQueryData<AISessionDTO>(chatQueryKeys.session(SESSION_ID))
    const cacheTexts = (session?.messages ?? []).map((m) => m.messageText)
    expect(cacheTexts).not.toContain('hello there')

    // And it landed as a failed message in the store.
    const chatStore = useChatStore()
    expect(chatStore.getFailedMessages(SESSION_ID).map((m) => m.messageText)).toContain(
      'hello there',
    )
  })

  it('renders a new message when SignalR emits ReceiveMessage → session query invalidates', async () => {
    seedAuthStorage({ user: makeUser({ email: ME }) })
    const fake = installFakeSignalR()
    // The plugin (not the page) owns the ReceiveMessage listener; expose the
    // auto-imports it relies on so we can run it against the page's QueryClient.
    vi.stubGlobal('useAuthStore', useAuthStore)
    vi.stubGlobal('useSignalR', useSignalR)

    const sessionMessages: Record<string, unknown>[] = [
      makeRawMessage({
        messageID: 'm1',
        messageText: 'first message',
        senderUserCode: OTHER,
        sendDate: '2024-01-01T10:00:00Z',
      }),
    ]
    serveSession(() => sessionMessages)

    const { queryClient } = renderPage()

    const container = await screen.findByTestId('messages-container')
    await waitFor(() => expect(within(container).getByText('first message')).toBeTruthy())

    // Register the ReceiveMessage listener via the real plugin (connects the fake,
    // then wires queryClient.invalidateQueries on the event).
    await signalrInitPlugin({ $queryClient: queryClient } as never)
    await waitFor(() => expect(fake.connect).toHaveBeenCalled(), { timeout: 2000 })

    // Server now has an extra message; the invalidation refetch will pick it up.
    sessionMessages.push(
      makeRawMessage({
        messageID: 'm2',
        messageText: 'live update',
        senderUserCode: OTHER,
        sendDate: '2024-01-01T11:00:00Z',
      }),
    )
    fake.emitFromServer('ReceiveMessage', SESSION_ID, 1)

    await waitFor(() => expect(within(container).getByText('live update')).toBeTruthy())
  })

  it('shows the user message as the header title (not editable) when the session is unnamed', async () => {
    seedAuthStorage({ user: makeUser({ email: ME }) })
    installFakeSignalR()
    // Freshly created session: server has not named it yet (sessionName: '').
    server.use(
      http.post(GET_SESSION_BY_ID, () =>
        apiOk({
          ...makeSession({ sessionId: SESSION_ID, members: [ME, OTHER], sessionName: '' }),
          messages: [
            makeRawMessage({
              messageID: 'm1',
              messageText: 'What is the weather today?',
              senderUserCode: ME,
            }),
          ],
        }),
      ),
    )

    renderPage()

    const title = await screen.findByTestId('session-title')
    expect(title.textContent).toContain('What is the weather today?')
    // No rename affordance while the title is the temporary optimistic message.
    expect(screen.queryByTestId('edit-title-button')).toBeNull()
  })

  it('shows the server session name in the header with an edit button once named', async () => {
    seedAuthStorage({ user: makeUser({ email: ME }) })
    installFakeSignalR()
    server.use(
      http.post(GET_SESSION_BY_ID, () =>
        apiOk({
          ...makeSession({
            sessionId: SESSION_ID,
            members: [ME, OTHER],
            sessionName: 'Weather chat',
          }),
          messages: [makeRawMessage({ messageID: 'm1', messageText: 'hi', senderUserCode: ME })],
        }),
      ),
    )

    renderPage()

    const title = await screen.findByTestId('session-title')
    expect(title.textContent).toContain('Weather chat')
    await waitFor(() => expect(screen.getByTestId('edit-title-button')).toBeTruthy())
  })

  it('renders a non-empty thread without a shimmer while the welcome query is still pending', async () => {
    // Default get-selectable-users returns non-virtual users, so the welcome query
    // never arms. Override with a virtual agent as the OTHER member AND mark the
    // session freshly created so it DOES arm, then hang welcomeText forever: the
    // render gate must still show the cached thread (decoupled from the unrelated
    // welcome query). Without the freshly-created flag this guard would be vacuous,
    // because the query would never fire at all.
    seedAuthStorage({ user: makeUser({ email: ME }) })
    installFakeSignalR()
    serveVirtualAgentSession('cached hello')
    server.use(
      http.post(WELCOME_TEXT, async () => {
        await delay('infinite')
        return apiOk({ message: 'never resolves' })
      }),
    )

    renderFreshlyCreatedPage()

    const container = await screen.findByTestId('messages-container')
    await waitFor(() => expect(within(container).getByText('cached hello')).toBeTruthy())
    expect(screen.queryByTestId('messages-shimmer')).toBeNull()
  })

  it('does not fetch or show the agent greeting for an existing conversation', async () => {
    // The user's report: opening any older conversation fired welcomeText and put the
    // greeting at the top of the thread. Membership alone must not arm the greeting.
    seedAuthStorage({ user: makeUser({ email: ME }) })
    installFakeSignalR()
    serveVirtualAgentSession('older message')
    const welcome = trackPostCalls(WELCOME_TEXT, () => apiOk({ message: GREETING }))

    renderPage()

    const container = await screen.findByTestId('messages-container')
    await waitFor(() => expect(within(container).getByText('older message')).toBeTruthy())

    expect(screen.queryByText(GREETING)).toBeNull()
    expect(welcome.count).toBe(0)
  })

  it('keeps the agent greeting for the conversation the user just created', async () => {
    // The new-chat page navigates here the moment the first message lands, so this
    // thread is already non-empty — emptiness alone could not distinguish it.
    seedAuthStorage({ user: makeUser({ email: ME }) })
    installFakeSignalR()
    serveVirtualAgentSession('my first message')
    const welcome = trackPostCalls(WELCOME_TEXT, () => apiOk({ message: GREETING }))

    renderFreshlyCreatedPage()

    const container = await screen.findByTestId('messages-container')
    await waitFor(() => expect(within(container).getByText(GREETING)).toBeTruthy())
    expect(within(container).getByText('my first message')).toBeTruthy()
    expect(welcome.count).toBe(1)
  })

  it('consumes the freshly-created flag so the next visit gets no greeting', async () => {
    seedAuthStorage({ user: makeUser({ email: ME }) })
    installFakeSignalR()
    serveVirtualAgentSession('my first message')
    server.use(http.post(WELCOME_TEXT, () => apiOk({ message: GREETING })))

    renderFreshlyCreatedPage()
    await screen.findByTestId('messages-container')

    // One-shot: the page resets it at setup, so a later mount is an existing
    // conversation even within the same tab.
    expect(useChatStore().nextSessionIsFreshlyCreated).toBe(false)
  })

  it('shows and hides the typing indicator driven by chatStore typing users', async () => {
    seedAuthStorage({ user: makeUser({ email: ME }) })
    installFakeSignalR()
    serveSession(() => [
      makeRawMessage({ messageID: 'm1', messageText: 'existing', senderUserCode: OTHER }),
    ])

    renderPage()

    await screen.findByTestId('messages-container')
    const indicator = screen.getByTestId('typing-indicator')

    const chatStore = useChatStore()
    chatStore.addTypingUser(SESSION_ID, 'Alice')
    await waitFor(() => expect(indicator.textContent).toContain('chat.typing.single'))

    chatStore.removeTypingUser(SESSION_ID, 'Alice')
    await waitFor(() => expect(indicator.textContent).not.toContain('chat.typing.single'))
  })
})

describe('chats/[sessionId] page — forms header toggle', () => {
  const GET_SESSION_FORMS = '/api/Form/GetSessionForms'
  const closedForms = sessionFormSummaries.filter((form) => form.status !== 'Open')

  function serveForms(forms: SessionFormSummary[], selectedInstanceId: string | null) {
    server.use(http.post(GET_SESSION_FORMS, () => apiOk({ forms, selectedInstanceId })))
  }

  async function renderSessionPage() {
    seedAuthStorage({ user: makeUser({ email: ME }) })
    installFakeSignalR()
    serveAgentMember()
    serveSession(() => [])
    renderPage()
    return screen.findByTestId('forms-sidebar-toggle')
  }

  it('shows the open-form count as a badge and the marker dot for a listed open form', async () => {
    serveForms(sessionFormSummaries, OPEN_FORM_INSTANCE_ID)
    const toggle = await renderSessionPage()

    expect(await within(toggle).findByText('1')).toBeTruthy()
    expect(within(toggle).getByRole('img', { name: 'chat.forms.agentSelected' })).toBeTruthy()
  })

  it('addresses the virtual member of the session, not the agentId of the session DTO', async () => {
    const bodies: { agentId: number }[] = []
    server.use(
      http.post(GET_SESSION_FORMS, async ({ request }) => {
        bodies.push((await request.json()) as { agentId: number })
        return apiOk({ forms: sessionFormSummaries, selectedInstanceId: null })
      }),
    )
    await renderSessionPage()

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]!.agentId).toBe(AGENT_ID)
  })

  it('hides the badge at zero open forms and the dot when the marker is not an open form', async () => {
    serveForms(closedForms, SUBMITTED_FORM_INSTANCE_ID)
    const toggle = await renderSessionPage()

    await fireEvent.click(toggle)
    expect(await screen.findAllByTestId('form-panel-item')).toHaveLength(closedForms.length)
    expect(within(toggle).queryByText(/\d/)).toBeNull()
    expect(within(toggle).queryByRole('img', { name: 'chat.forms.agentSelected' })).toBeNull()
  })

  it('desktop: opens the forms sidebar and closes the sibling sidebars, and vice versa', async () => {
    const toggle = await renderSessionPage()

    await fireEvent.click(screen.getByTestId('focus-sidebar-toggle'))
    expect(screen.getByText('chat.focus.sidebarTitle')).toBeTruthy()

    await fireEvent.click(toggle)
    expect(await screen.findByTestId('forms-sidebar')).toBeTruthy()
    expect(screen.queryByText('chat.focus.sidebarTitle')).toBeNull()
    expect(screen.queryByTestId('forms-slideover')).toBeNull()

    await fireEvent.click(screen.getByTestId('focus-sidebar-toggle'))
    expect(screen.queryByTestId('forms-sidebar')).toBeNull()
    expect(screen.getByText('chat.focus.sidebarTitle')).toBeTruthy()

    await fireEvent.click(toggle)
    await screen.findByTestId('forms-sidebar')
    await fireEvent.click(screen.getByTestId('file-preview-sidebar-toggle'))
    expect(screen.queryByTestId('forms-sidebar')).toBeNull()
  })

  it('mobile: is the only sidebar toggle and opens the slideover', async () => {
    viewport.mobile = true
    const toggle = await renderSessionPage()

    expect(screen.queryByTestId('focus-sidebar-toggle')).toBeNull()
    expect(screen.queryByTestId('file-preview-sidebar-toggle')).toBeNull()

    await fireEvent.click(toggle)
    expect(await screen.findByTestId('forms-slideover')).toBeTruthy()
    expect(screen.queryByTestId('forms-sidebar')).toBeNull()
  })
})

describe('chats/[sessionId] page — open a form from its card', () => {
  const GET_SESSION_FORMS = '/api/Form/GetSessionForms'
  const formFence = (id: string) => '```form\n' + JSON.stringify({ instanceId: id }) + '\n```'

  async function renderPageWithCard(instanceId: string) {
    seedAuthStorage({ user: makeUser({ email: ME }) })
    installFakeSignalR()
    serveAgentMember()
    server.use(
      http.post(GET_SESSION_FORMS, () =>
        apiOk({ forms: sessionFormSummaries, selectedInstanceId: OPEN_FORM_INSTANCE_ID }),
      ),
    )
    serveSession(() => [
      makeRawMessage({
        messageID: 'm-form',
        messageText: `Please fill this in.\n\n${formFence(instanceId)}`,
        senderUserCode: OTHER,
      }),
    ])
    renderPage()
    return screen.findByRole('button', { name: /chat\.forms\.open$/ })
  }

  function panelItem(instanceId: string) {
    return document.querySelector<HTMLElement>(
      `[data-testid="form-panel-item"][data-instance-id="${instanceId}"]`,
    )
  }

  it('desktop: opens the forms sidebar, closes the siblings and focuses the form', async () => {
    const card = await renderPageWithCard(OPEN_FORM_INSTANCE_ID)
    await fireEvent.click(screen.getByTestId('focus-sidebar-toggle'))
    expect(screen.getByText('chat.focus.sidebarTitle')).toBeTruthy()

    await fireEvent.click(card)

    expect(await screen.findByTestId('forms-sidebar')).toBeTruthy()
    expect(screen.queryByText('chat.focus.sidebarTitle')).toBeNull()
    expect(screen.queryByTestId('forms-slideover')).toBeNull()

    const formsStore = useFormsStore()
    await waitFor(() => expect(formsStore.lastFocusedId).toBe(OPEN_FORM_INSTANCE_ID))
    expect(formsStore.sessions[SESSION_ID]?.expandedIds).toEqual([OPEN_FORM_INSTANCE_ID])
    await waitFor(() =>
      expect(
        within(panelItem(OPEN_FORM_INSTANCE_ID)!)
          .getAllByRole('button')[0]!
          .getAttribute('aria-expanded'),
      ).toBe('true'),
    )
  })

  it('desktop: a closed form card expands that form read-only and collapses the open one', async () => {
    const card = await renderPageWithCard(SUBMITTED_FORM_INSTANCE_ID)

    await fireEvent.click(card)

    await screen.findByTestId('forms-sidebar')
    const formsStore = useFormsStore()
    await waitFor(() =>
      expect(formsStore.sessions[SESSION_ID]?.expandedIds).toEqual([SUBMITTED_FORM_INSTANCE_ID]),
    )
    expect(
      await within(panelItem(SUBMITTED_FORM_INSTANCE_ID)!).findByText('chat.forms.closedNotice'),
    ).toBeTruthy()
  })

  it('mobile: opens the slideover and focuses the form', async () => {
    viewport.mobile = true
    const card = await renderPageWithCard(OPEN_FORM_INSTANCE_ID)

    await fireEvent.click(card)

    expect(await screen.findByTestId('forms-slideover')).toBeTruthy()
    expect(screen.queryByTestId('forms-sidebar')).toBeNull()
    const formsStore = useFormsStore()
    await waitFor(() => expect(formsStore.lastFocusedId).toBe(OPEN_FORM_INSTANCE_ID))
    expect(formsStore.sessions[SESSION_ID]?.expandedIds).toEqual([OPEN_FORM_INSTANCE_ID])
  })
})

describe('chats/[sessionId] page — flush dirty forms on leave', () => {
  const SAVE_FORM_INST = '/api/Form/SaveFormInst'

  async function renderPageWithDirtyDraft() {
    seedAuthStorage({ user: makeUser({ email: ME }) })
    installFakeSignalR()
    serveAgentMember()
    serveSession(() => [])
    const saveBodies: { agentId: number }[] = []
    server.use(
      http.post(SAVE_FORM_INST, async ({ request }) => {
        const body = (await request.json()) as { agentId: number }
        saveBodies.push({ agentId: body.agentId })
        return apiOk(openFormInstance)
      }),
    )
    const rendered = renderPage()
    await screen.findByTestId('forms-sidebar-toggle')
    await waitFor(() =>
      expect(rendered.queryClient.getQueryData(chatQueryKeys.session(SESSION_ID))).toBeTruthy(),
    )
    const formsStore = useFormsStore()
    formsStore.createDraft(SESSION_ID, OPEN_FORM_INSTANCE_ID, openFormInstance.data!)
    formsStore.updateDraftData(SESSION_ID, OPEN_FORM_INSTANCE_ID, { company: { name: 'edited' } })
    return { ...rendered, saveBodies, formsStore }
  }

  it('saves the dirty drafts of the old session when the route moves to another session', async () => {
    const route = reactive({
      params: { sessionId: SESSION_ID },
      query: {},
      path: `/chats/${SESSION_ID}`,
      fullPath: `/chats/${SESSION_ID}`,
      name: 'chats-sessionId',
    })
    vi.mocked(useRoute).mockReturnValue(route as never)
    const { saveBodies, formsStore } = await renderPageWithDirtyDraft()

    route.params.sessionId = 'session-2'

    await waitFor(() => expect(saveBodies).toHaveLength(1))
    expect(saveBodies[0]!.agentId).toBe(AGENT_ID)
    await waitFor(() => expect(formsStore.dirtyInstanceIds(SESSION_ID)).toEqual([]))
  })

  it('saves the dirty drafts when the page unmounts', async () => {
    const { saveBodies, formsStore, unmount } = await renderPageWithDirtyDraft()

    unmount()

    await waitFor(() => expect(saveBodies).toHaveLength(1))
    expect(saveBodies[0]!.agentId).toBe(AGENT_ID)
    await waitFor(() => expect(formsStore.dirtyInstanceIds(SESSION_ID)).toEqual([]))
  })
})
