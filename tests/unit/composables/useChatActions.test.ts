import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useChatActions } from '~/composables/useChatActions'
import { useChatStore } from '~/stores/chat'
import { useSendMessage } from '@/app/composables/useChatMutations'
import { revokeBlobUrls } from '@/app/composables/sendMessageOptimistic'
import { makeMessage } from '@/tests/utils/factories'
import { MessageStatus, AIQuestionType } from '@/types/enums'
import type { AiQuestionRequestDTO } from '@/types/api/schemas'

vi.mock('@/app/composables/useChatMutations', () => ({ useSendMessage: vi.fn() }))
vi.mock('@/app/composables/sendMessageOptimistic', () => ({ revokeBlobUrls: vi.fn() }))

const SESSION_ID = 'session-1'

function makeFailedEntry(messageId: string) {
  const request: AiQuestionRequestDTO = {
    userCode: 'user@test.com',
    sessionId: SESSION_ID,
    agentId: 1,
    members: ['user@test.com'],
    question: 'Hello',
    group: '',
    pquestionType: AIQuestionType.Text,
    options: [],
    files: [],
  }
  return {
    optimisticDisplay: makeMessage({ messageID: messageId, sessionId: SESSION_ID }),
    request,
    status: MessageStatus.FAILED,
  }
}

const mutateAsync = vi.fn()

beforeEach(() => {
  mutateAsync.mockReset().mockResolvedValue(makeMessage())
  vi.mocked(useSendMessage).mockReturnValue({ mutateAsync } as unknown as ReturnType<
    typeof useSendMessage
  >)
  vi.mocked(revokeBlobUrls).mockClear()
})

describe('useChatActions — handleRetryMessage', () => {
  it('removes the failed entry, resends it and scrolls after settling', async () => {
    const chatStore = useChatStore()
    const entry = makeFailedEntry('failed-1')
    chatStore.addFailedMessage(SESSION_ID, entry)
    const scrollToBottom = vi.fn()
    const { handleRetryMessage } = useChatActions(() => SESSION_ID, scrollToBottom)

    handleRetryMessage('failed-1')

    expect(chatStore.getFailedEntries(SESSION_ID)).toHaveLength(0)
    expect(mutateAsync).toHaveBeenCalledWith({ request: entry.request, attachments: undefined })
    await vi.waitFor(() => expect(scrollToBottom).toHaveBeenCalledTimes(1))
  })

  it('does nothing for an unknown message id', () => {
    const chatStore = useChatStore()
    chatStore.addFailedMessage(SESSION_ID, makeFailedEntry('failed-1'))
    const scrollToBottom = vi.fn()
    const { handleRetryMessage } = useChatActions(() => SESSION_ID, scrollToBottom)

    handleRetryMessage('unknown-id')

    expect(chatStore.getFailedEntries(SESSION_ID)).toHaveLength(1)
    expect(mutateAsync).not.toHaveBeenCalled()
    expect(scrollToBottom).not.toHaveBeenCalled()
  })
})

describe('useChatActions — handleDiscardMessage', () => {
  it('revokes blob URLs of the discarded entry and removes it', () => {
    const chatStore = useChatStore()
    const entry = makeFailedEntry('failed-1')
    chatStore.addFailedMessage(SESSION_ID, entry)
    const { handleDiscardMessage } = useChatActions(() => SESSION_ID, vi.fn())

    handleDiscardMessage('failed-1')

    expect(revokeBlobUrls).toHaveBeenCalledWith(entry.optimisticDisplay)
    expect(chatStore.getFailedEntries(SESSION_ID)).toHaveLength(0)
  })

  it('leaves other entries intact when the id is unknown', () => {
    const chatStore = useChatStore()
    chatStore.addFailedMessage(SESSION_ID, makeFailedEntry('failed-1'))
    const { handleDiscardMessage } = useChatActions(() => SESSION_ID, vi.fn())

    handleDiscardMessage('unknown-id')

    expect(revokeBlobUrls).not.toHaveBeenCalled()
    expect(chatStore.getFailedEntries(SESSION_ID)).toHaveLength(1)
  })
})
