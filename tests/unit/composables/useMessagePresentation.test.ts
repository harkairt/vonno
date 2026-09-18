import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { AIAnswerType } from '@/types/enums'

const copyMessageRich = vi.fn(async () => {})

vi.mock('@/lib/clipboard/messageCopy', () => ({
  copyMessageRich: (...args: unknown[]) => copyMessageRich(...(args as [])),
}))

const envelope = JSON.stringify({
  text: 'Please fill in the partner details.',
  formName: 'Partner rögzítés',
  instanceId: 'form-inst-open',
})

async function copiedText(messageText: string | null, messageType: AIAnswerType) {
  const { useMessagePresentation } = await import('@/app/composables/useMessagePresentation')
  const { handleCopy } = useMessagePresentation()
  await handleCopy({ messageID: 'm1', messageText, messageType })
  return copyMessageRich.mock.calls.at(-1)?.[1]
}

describe('useMessagePresentation — copying form messages', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    copyMessageRich.mockClear()
  })

  it('copies the envelope text, not the raw JSON', async () => {
    expect(await copiedText(envelope, AIAnswerType.Form)).toBe(
      'Please fill in the partner details.',
    )
  })

  it('copies nothing for an empty envelope text', async () => {
    await copiedText(JSON.stringify({ text: '', instanceId: 'form-inst-open' }), AIAnswerType.Form)

    expect(copyMessageRich).not.toHaveBeenCalled()
  })

  it('falls back to the raw text for an unparseable envelope', async () => {
    expect(await copiedText('{ not json', AIAnswerType.Form)).toBe('{ not json')
  })

  it('copies plain text messages unchanged', async () => {
    expect(await copiedText('Hello **there**', AIAnswerType.Text)).toBe('Hello **there**')
  })
})
