import { defineComponent, h } from 'vue'
import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/vue'
import { renderWithProviders } from '@/tests/utils/render'
import FormMessage from '~/components/chat/FormMessage.vue'

const INSTANCE_ID = 'form-inst-open'

const envelope = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    text: 'Please fill in the partner details.',
    formName: 'Partner rögzítés',
    instanceId: INSTANCE_ID,
    ...overrides,
  })

const stubs = {
  MarkdownContent: defineComponent({
    name: 'MarkdownContent',
    props: { content: { type: String, default: '' } },
    setup(props) {
      return () => h('div', { 'data-testid': 'markdown-content' }, props.content)
    },
  }),
  FormCard: defineComponent({
    name: 'FormCard',
    props: {
      instanceId: { type: String, required: true },
      sessionId: { type: String, required: true },
      agentId: { type: Number, default: undefined },
      fallbackName: { type: String, default: undefined },
    },
    emits: ['openForm'],
    setup(props, { emit }) {
      return () =>
        h('div', {
          'data-testid': 'form-card',
          'data-instance-id': props.instanceId,
          'data-session-id': props.sessionId,
          'data-agent-id': props.agentId,
          'data-fallback-name': props.fallbackName,
          onClick: () => emit('openForm', props.instanceId),
        })
    },
  }),
}

function renderMessage(props: Record<string, unknown> = {}) {
  return renderWithProviders(FormMessage, {
    props: { messageText: envelope(), sessionId: 'session-9', agentId: 7, ...props },
    global: { stubs },
  })
}

describe('FormMessage', () => {
  it('renders the envelope text above exactly one card', () => {
    renderMessage()

    expect(screen.getByTestId('markdown-content').textContent).toBe(
      'Please fill in the partner details.',
    )
    const cards = screen.getAllByTestId('form-card')
    expect(cards).toHaveLength(1)
    expect(cards[0]!.getAttribute('data-instance-id')).toBe(INSTANCE_ID)
    expect(cards[0]!.getAttribute('data-session-id')).toBe('session-9')
    expect(cards[0]!.getAttribute('data-agent-id')).toBe('7')
    expect(cards[0]!.getAttribute('data-fallback-name')).toBe('Partner rögzítés')
  })

  it('renders no text node for an empty text', () => {
    renderMessage({ messageText: envelope({ text: '' }) })

    expect(screen.queryByTestId('markdown-content')).toBeNull()
    expect(screen.getByTestId('form-card')).toBeTruthy()
  })

  it('passes no fallback name for an ad hoc form', () => {
    renderMessage({ messageText: envelope({ formName: null }) })

    expect(screen.getByTestId('form-card').getAttribute('data-fallback-name')).toBeNull()
  })

  it('renders the raw message text and no card for an unparseable envelope', () => {
    renderMessage({ messageText: '{ not json' })

    expect(screen.getByTestId('markdown-content').textContent).toBe('{ not json')
    expect(screen.queryByTestId('form-card')).toBeNull()
  })

  it('renders nothing for a null message text', () => {
    renderMessage({ messageText: null })

    expect(screen.getByTestId('markdown-content').textContent).toBe('')
    expect(screen.queryByTestId('form-card')).toBeNull()
  })

  it('re-emits openForm from the card', async () => {
    const { emitted } = renderMessage()

    screen.getByTestId('form-card').click()

    expect(emitted().openForm).toEqual([[INSTANCE_ID]])
  })
})
