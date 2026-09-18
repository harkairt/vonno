import { computed, defineComponent, h, onMounted } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/vue'
import { renderWithProviders } from '@/tests/utils/render'
import { makeMessage } from '@/tests/utils/factories'
import { AIAnswerType } from '@/types/enums'

vi.mock('@/app/composables/useMessagePresentation', () => ({
  useMessagePresentation: () => ({
    ownMessageStyle: computed(() => ({})),
    partnerMessageStyle: computed(() => ({})),
    isUserMessage: () => false,
  }),
}))

const formFence = (id: string) => '```form\n' + JSON.stringify({ instanceId: id }) + '\n```'

let markdownMounts = 0

const stubs = {
  MarkdownContent: defineComponent({
    name: 'MarkdownContent',
    props: { content: { type: String, default: '' } },
    setup(props) {
      onMounted(() => markdownMounts++)
      return () => h('div', { 'data-testid': 'markdown-content' }, props.content)
    },
  }),
  FormCardRow: defineComponent({
    name: 'FormCardRow',
    props: {
      instanceIds: { type: Array, required: true },
      sessionId: { type: String, required: true },
      agentId: { type: Number, default: undefined },
    },
    emits: ['openForm'],
    setup(props, { emit }) {
      return () =>
        h('div', {
          'data-testid': 'form-card-row',
          'data-ids': (props.instanceIds as string[]).join(','),
          'data-session-id': props.sessionId,
          'data-agent-id': props.agentId,
          onClick: () => emit('openForm', props.instanceIds[0]),
        })
    },
  }),
  FormMessage: defineComponent({
    name: 'FormMessage',
    props: {
      messageText: { type: String, default: null },
      sessionId: { type: String, required: true },
      agentId: { type: Number, default: undefined },
    },
    emits: ['openForm'],
    setup(props, { emit }) {
      return () =>
        h('div', {
          'data-testid': 'form-message',
          'data-message-text': props.messageText,
          'data-session-id': props.sessionId,
          'data-agent-id': props.agentId,
          onClick: () => emit('openForm', 'from-form-message'),
        })
    },
  }),
}

async function renderBubble(props: Record<string, unknown>) {
  markdownMounts = 0
  const { default: MessageBubble } = await import('~/components/chat/MessageBubble.vue')
  return renderWithProviders(MessageBubble, { props, global: { stubs } })
}

describe('MessageBubble', () => {
  it('uses the full available width for Mermaid content', async () => {
    const { default: MessageBubble } = await import('~/components/chat/MessageBubble.vue')
    const { container } = renderWithProviders(MessageBubble, {
      props: { message: makeMessage({ messageText: '```mermaid\ngantt\n```' }) },
      global: { stubs: { MarkdownContent: true } },
    })

    expect(container.querySelector('.message-bubble')?.classList.contains('w-full')).toBe(true)
  })

  it('keeps file-message bubbles sized to their content', async () => {
    const { default: MessageBubble } = await import('~/components/chat/MessageBubble.vue')
    const { container } = renderWithProviders(MessageBubble, {
      props: { message: makeMessage({ messageType: AIAnswerType.File }) },
      global: { stubs: { FileMessage: true } },
    })

    expect(container.querySelector('.message-bubble')?.classList.contains('w-full')).toBe(false)
  })
})

describe('MessageBubble — form fences', () => {
  it('renders existing text messages unchanged, without a card row', async () => {
    await renderBubble({ message: makeMessage({ messageText: 'Hello **there**\n\n' }) })

    expect(screen.getByTestId('markdown-content').textContent).toBe('Hello **there**\n\n')
    expect(screen.queryByTestId('form-card-row')).toBeNull()
  })

  it('renders the surrounding markdown and a card row for text plus fence', async () => {
    await renderBubble({
      message: makeMessage({
        messageText: `Please fill this in.\n\n${formFence('a1')}`,
        sessionId: 'session-9',
      }),
      agentId: 7,
    })

    expect(screen.getByTestId('markdown-content').textContent).toBe('Please fill this in.')
    const row = screen.getByTestId('form-card-row')
    expect(row.getAttribute('data-ids')).toBe('a1')
    expect(row.getAttribute('data-session-id')).toBe('session-9')
    expect(row.getAttribute('data-agent-id')).toBe('7')
  })

  it('renders only the card row for a fence-only message', async () => {
    await renderBubble({ message: makeMessage({ messageText: formFence('a1') }) })

    expect(screen.queryByTestId('markdown-content')).toBeNull()
    expect(screen.getByTestId('form-card-row').getAttribute('data-ids')).toBe('a1')
  })

  it('renders one row with every id for two fences', async () => {
    await renderBubble({
      message: makeMessage({ messageText: `${formFence('a1')}\n\n${formFence('b2')}` }),
    })

    expect(screen.getAllByTestId('form-card-row')).toHaveLength(1)
    expect(screen.getByTestId('form-card-row').getAttribute('data-ids')).toBe('a1,b2')
  })

  it('renders the original message when a fence body is invalid', async () => {
    const messageText = 'Intro\n\n```form\n{ not json\n```'
    await renderBubble({
      message: makeMessage({ messageText }),
    })

    expect(screen.getByTestId('markdown-content').textContent).toBe(messageText)
    expect(screen.queryByTestId('form-card-row')).toBeNull()
  })

  it('keeps text that follows an unclosed fence visible', async () => {
    await renderBubble({
      message: makeMessage({
        messageText: 'Before\n\n```form\n{ "instanceId": "a\n\nAfter',
      }),
    })

    expect(screen.getByTestId('markdown-content').textContent).toBe('Before\n\nAfter')
    expect(screen.queryByTestId('form-card-row')).toBeNull()
  })

  it('re-emits openForm from the card row', async () => {
    const { emitted } = await renderBubble({
      message: makeMessage({ messageText: formFence('a1') }),
    })

    screen.getByTestId('form-card-row').click()

    expect(emitted().openForm).toEqual([['a1']])
  })

  it('keeps the MarkdownContent instance while a streaming message grows a fence', async () => {
    const { rerender } = await renderBubble({
      message: makeMessage({ messageID: 'm1', messageText: 'Working on' }),
    })
    expect(markdownMounts).toBe(1)

    await rerender({
      message: makeMessage({ messageID: 'm1', messageText: 'Working on it.\n\n```form\n{ "inst' }),
    })
    expect(screen.getByTestId('markdown-content').textContent).toBe('Working on it.')
    expect(screen.queryByTestId('form-card-row')).toBeNull()

    await rerender({
      message: makeMessage({
        messageID: 'm1',
        messageText: `Working on it.\n\n${formFence('a1')}`,
      }),
    })
    expect(screen.getByTestId('markdown-content').textContent).toBe('Working on it.')
    expect(screen.getByTestId('form-card-row')).toBeTruthy()
    expect(markdownMounts).toBe(1)
  })
})

describe('MessageBubble — form messages', () => {
  const envelope = JSON.stringify({
    text: 'Please fill this in.',
    formName: 'Partner rögzítés',
    instanceId: 'a1',
  })

  it('routes the Form message type to FormMessage', async () => {
    await renderBubble({
      message: makeMessage({
        messageType: AIAnswerType.Form,
        messageText: envelope,
        sessionId: 'session-9',
      }),
      agentId: 7,
    })

    const formMessage = screen.getByTestId('form-message')
    expect(formMessage.getAttribute('data-message-text')).toBe(envelope)
    expect(formMessage.getAttribute('data-session-id')).toBe('session-9')
    expect(formMessage.getAttribute('data-agent-id')).toBe('7')
    expect(screen.queryByTestId('markdown-content')).toBeNull()
    expect(screen.queryByTestId('form-card-row')).toBeNull()
  })

  it('re-emits openForm from the form message', async () => {
    const { emitted } = await renderBubble({
      message: makeMessage({ messageType: AIAnswerType.Form, messageText: envelope }),
    })

    screen.getByTestId('form-message').click()

    expect(emitted().openForm).toEqual([['from-form-message']])
  })

  it('keeps text messages out of the form branch', async () => {
    await renderBubble({ message: makeMessage({ messageText: 'Plain text' }) })

    expect(screen.queryByTestId('form-message')).toBeNull()
  })
})
