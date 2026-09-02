import { defineStore } from 'pinia'
import { ref, type Ref } from 'vue'
import type { AISessionMessageDTO, AiQuestionRequestDTO } from '@/types/api/schemas'
import type { StagedAttachment } from '@/types/fileAttachment'
import { AIAnswerType, type MessageStatus } from '@/types/enums'

type FailedMessage = {
  optimisticDisplay: AISessionMessageDTO
  request: AiQuestionRequestDTO
  status: MessageStatus
  attachments?: StagedAttachment[]
}

// Pending message + the count of same-content messages already in the session when it
// was sent. Used to tell a genuinely-new server message apart from an identical one
// that predates this send (see getUnconfirmedPendingMessages).
type PendingEntry = { message: AISessionMessageDTO; baselineCount: number }

export type ComposerRequest = { text: string; seq: number }

// Content identity for an outgoing message: same sender + same text.
// Pending messages carry a temporary id, so id-based matching against server messages
// never works — we reconcile by content instead.
function pendingContentKey(
  m: Pick<AISessionMessageDTO, 'senderUserCode' | 'messageText' | 'messageType'>,
): string {
  if (m.messageType === AIAnswerType.File && m.messageText) {
    try {
      const parsed = JSON.parse(m.messageText)
      const fileIds = (parsed.files ?? [])
        .map((f: { id: string }) => f.id)
        .sort()
        .join(',')
      return `${m.senderUserCode}|file|${parsed.text}|${fileIds}`
    } catch {
      // fall through
    }
  }
  return `${m.senderUserCode} ${m.messageText}`
}

// Extracted: failed messages helpers
function createFailedMessageActions(failedMessages: Ref<Record<string, FailedMessage[]>>) {
  return {
    addFailedMessage(sessionId: string, entry: FailedMessage) {
      const entries = failedMessages.value[sessionId] ?? []
      failedMessages.value[sessionId] = [...entries, entry]
    },
    removeFailedMessage(sessionId: string, messageId: string) {
      const entries = failedMessages.value[sessionId] ?? []
      failedMessages.value[sessionId] = entries.filter(
        (e) => e.optimisticDisplay.messageID !== messageId,
      )
    },
    removeAllFailedMessages(sessionId: string) {
      const { [sessionId]: _, ...rest } = failedMessages.value
      failedMessages.value = rest
    },
    getFailedMessages(sessionId: string): AISessionMessageDTO[] {
      return (failedMessages.value[sessionId] ?? []).map((e) => e.optimisticDisplay)
    },
    getFailedEntries(sessionId: string): FailedMessage[] {
      return failedMessages.value[sessionId] ?? []
    },
  }
}

// Extracted: pending messages helpers (ephemeral optimistic messages during mutation)
function createPendingMessageActions(pendingMessages: Ref<Record<string, PendingEntry[]>>) {
  return {
    // baselineCount: how many same-content messages the session already had at send time.
    addPendingMessage(sessionId: string, message: AISessionMessageDTO, baselineCount = 0) {
      const entries = pendingMessages.value[sessionId] ?? []
      pendingMessages.value[sessionId] = [...entries, { message, baselineCount }]
    },
    removePendingMessage(sessionId: string, messageId: string) {
      const entries = pendingMessages.value[sessionId] ?? []
      pendingMessages.value[sessionId] = entries.filter((e) => e.message.messageID !== messageId)
    },
    removeAllPendingMessages(sessionId: string) {
      const { [sessionId]: _, ...rest } = pendingMessages.value
      pendingMessages.value = rest
    },
    getPendingMessages(sessionId: string): AISessionMessageDTO[] {
      return (pendingMessages.value[sessionId] ?? []).map((e) => e.message)
    },
    /**
     * Pending messages the server hasn't confirmed yet, given the current server messages.
     *
     * A pending message can't be matched to its server counterpart by id (it has a temp id),
     * so we reconcile by content. To avoid hiding a freshly-sent message that merely repeats
     * an earlier one (e.g. sending "ok" twice), a pending message counts as confirmed only
     * when the server's count of that content exceeds the baseline captured at send time.
     * The oldest matching pending messages are confirmed first, so N rapid identical sends
     * resolve one-to-one as their server copies arrive.
     */
    getUnconfirmedPendingMessages(
      sessionId: string,
      serverMessages: AISessionMessageDTO[],
    ): AISessionMessageDTO[] {
      const entries = pendingMessages.value[sessionId] ?? []
      if (entries.length === 0) return []

      const serverCount = new Map<string, number>()
      for (const m of serverMessages) {
        const key = pendingContentKey(m)
        serverCount.set(key, (serverCount.get(key) ?? 0) + 1)
      }

      // Group pending entries by content, preserving send order.
      const byKey = new Map<string, PendingEntry[]>()
      for (const entry of entries) {
        const key = pendingContentKey(entry.message)
        const list = byKey.get(key) ?? []
        list.push(entry)
        byKey.set(key, list)
      }

      const confirmedIds = new Set<string>()
      for (const [key, list] of byKey) {
        // Baseline of the oldest still-tracked pending: server messages beyond it are
        // the copies that arrived since this send burst began.
        const earliestBaseline = list[0]!.baselineCount
        const arrivedSinceSend = (serverCount.get(key) ?? 0) - earliestBaseline
        const confirmed = Math.max(0, Math.min(list.length, arrivedSinceSend))
        for (let i = 0; i < confirmed; i++) {
          confirmedIds.add(list[i]!.message.messageID)
        }
      }

      return entries.filter((e) => !confirmedIds.has(e.message.messageID)).map((e) => e.message)
    },
  }
}

// Extracted: draft messages helpers
function createDraftActions(draftMessages: Ref<Record<string, string>>) {
  return {
    saveDraft(key: string, text: string) {
      if (text.trim()) {
        draftMessages.value[key] = text
      } else {
        const { [key]: _, ...rest } = draftMessages.value
        draftMessages.value = rest
      }
    },
    getDraft(key: string): string {
      return draftMessages.value[key] ?? ''
    },
    clearDraft(key: string) {
      const { [key]: _, ...rest } = draftMessages.value
      draftMessages.value = rest
    },
  }
}

// Extracted: typing indicator helpers
function createTypingActions(typingUsers: Ref<Map<string, Set<string>>>) {
  return {
    addTypingUser(sessionId: string, userName: string) {
      if (!typingUsers.value.has(sessionId)) {
        typingUsers.value.set(sessionId, new Set())
      }
      typingUsers.value.get(sessionId)!.add(userName)
    },
    removeTypingUser(sessionId: string, userName: string) {
      typingUsers.value.get(sessionId)?.delete(userName)
    },
    getTypingUsers(sessionId: string): string[] {
      return Array.from(typingUsers.value.get(sessionId) ?? [])
    },
  }
}

// Synthetic agent activity is intentionally tracked separately from SignalR typing
// events. An agent that is processing a submitted question is thinking, while a
// SignalR typing event always represents a real participant composing a message.
// Counts keep the indicator visible when multiple requests to the same agent are
// awaiting responses at once.
function createAgentThinkingActions(agentThinkingCounts: Ref<Map<string, Map<string, number>>>) {
  return {
    startAgentThinking(sessionId: string, agentName: string) {
      const sessionAgents = agentThinkingCounts.value.get(sessionId) ?? new Map<string, number>()
      sessionAgents.set(agentName, (sessionAgents.get(agentName) ?? 0) + 1)
      agentThinkingCounts.value.set(sessionId, sessionAgents)
    },
    stopAgentThinking(sessionId: string, agentName: string) {
      const sessionAgents = agentThinkingCounts.value.get(sessionId)
      if (!sessionAgents) return

      const remainingRequests = (sessionAgents.get(agentName) ?? 0) - 1
      if (remainingRequests > 0) {
        sessionAgents.set(agentName, remainingRequests)
        return
      }

      sessionAgents.delete(agentName)
      if (sessionAgents.size === 0) agentThinkingCounts.value.delete(sessionId)
    },
    getThinkingAgents(sessionId: string): string[] {
      return Array.from(agentThinkingCounts.value.get(sessionId)?.keys() ?? [])
    },
  }
}

function createErrorResponseActions(errorResponses: Ref<Record<string, string>>) {
  return {
    setErrorResponse(sessionId: string, text: string | null | undefined) {
      const trimmed = text?.trim()
      if (!trimmed) return
      errorResponses.value[sessionId] = trimmed
    },
    clearErrorResponse(sessionId: string) {
      const { [sessionId]: _, ...rest } = errorResponses.value
      errorResponses.value = rest
    },
    getErrorResponse(sessionId: string): string | undefined {
      return errorResponses.value[sessionId] ?? undefined
    },
  }
}

// Extracted: new session callback helpers
function createSessionCallbackActions(callbacks: Map<string, () => void>) {
  return {
    onNewSessionConfirmed(sessionId: string, callback: () => void) {
      callbacks.set(sessionId, callback)
    },
    executeNewSessionCallback(sessionId: string) {
      const cb = callbacks.get(sessionId)
      if (cb) {
        callbacks.delete(sessionId)
        cb()
      }
    },
    removeNewSessionCallback(sessionId: string) {
      callbacks.delete(sessionId)
    },
  }
}

export const useChatStore = defineStore(
  'chat',
  () => {
    // State
    const activeSessionId = ref<string | null>(null)
    const isLoading = ref(false)
    const error = ref<string | null>(null)
    const typingUsers = ref<Map<string, Set<string>>>(new Map())
    const agentThinkingCounts = ref<Map<string, Map<string, number>>>(new Map())
    const failedMessages = ref<Record<string, FailedMessage[]>>({})
    const pendingMessages = ref<Record<string, PendingEntry[]>>({})
    const draftMessages = ref<Record<string, string>>({})
    const errorResponses = ref<Record<string, string>>({})
    const skipNextEntranceAnimation = ref(false)
    // One-shot handoff flag, same lifecycle as skipNextEntranceAnimation: the new-chat
    // page sets it immediately before navigating to /chats/<id>, and that page consumes
    // it once at setup. It marks "this mount continues a conversation the user just
    // started", which is what keeps the agent greeting visible across the handoff while
    // never showing it on an existing conversation opened from the list.
    // Kept separate from skipNextEntranceAnimation on purpose — overloading that flag
    // would let a future animation change silently break the greeting.
    // Not in persist.pick, so it cannot survive a reload. That is deliberate.
    const nextSessionIsFreshlyCreated = ref(false)
    const newSessionCallbacks = new Map<string, () => void>()
    const composerRequest = ref<ComposerRequest | null>(null)
    let composerSeq = 0

    function requestComposerText(text: string) {
      const collapsed = text.replace(/\s+/g, ' ').trim()
      if (!collapsed) return

      composerSeq += 1
      composerRequest.value = { text: collapsed, seq: composerSeq }
    }

    function clearComposerRequest() {
      composerRequest.value = null
    }

    // Composed action groups
    const failedMessageActions = createFailedMessageActions(failedMessages)
    const pendingMessageActions = createPendingMessageActions(pendingMessages)
    const draftActions = createDraftActions(draftMessages)
    const errorResponseActions = createErrorResponseActions(errorResponses)
    const typingActions = createTypingActions(typingUsers)
    const agentThinkingActions = createAgentThinkingActions(agentThinkingCounts)
    const sessionCallbackActions = createSessionCallbackActions(newSessionCallbacks)

    function setActiveSession(sessionId: string | null) {
      activeSessionId.value = sessionId
    }
    function setError(errorMessage: string) {
      error.value = errorMessage
    }
    function clearError() {
      error.value = null
    }

    function resetUserData() {
      activeSessionId.value = null
      isLoading.value = false
      error.value = null
      typingUsers.value = new Map()
      agentThinkingCounts.value = new Map()
      failedMessages.value = {}
      pendingMessages.value = {}
      draftMessages.value = {}
      errorResponses.value = {}
      skipNextEntranceAnimation.value = false
      nextSessionIsFreshlyCreated.value = false
      newSessionCallbacks.clear()
      composerRequest.value = null
    }

    return {
      activeSessionId,
      isLoading,
      error,
      failedMessages,
      draftMessages,
      setActiveSession,
      setError,
      clearError,
      ...failedMessageActions,
      ...pendingMessageActions,
      ...draftActions,
      ...errorResponseActions,
      ...typingActions,
      ...agentThinkingActions,
      skipNextEntranceAnimation,
      nextSessionIsFreshlyCreated,
      ...sessionCallbackActions,
      composerRequest,
      requestComposerText,
      clearComposerRequest,
      resetUserData,
    }
  },
  {
    persist: {
      key: 'innochat-chat',
      pick: ['activeSessionId', 'draftMessages'],
    },
  },
)
