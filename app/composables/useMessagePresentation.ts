import { computed, ref, type CSSProperties } from 'vue'
import type { AISessionMessageDTO, OptionsMessagePayload } from '@/types/api/schemas'
import {
  parseFileMessagePayload,
  parseFormMessagePayload,
  parseOptionsPayload,
} from '@/types/api/schemas'
import { AIAnswerType } from '@/types/enums'
import { useAuthStore } from '@/app/stores/auth'
import { restoreMultiSelectAnswer } from '@/app/utils/optionAnswer'
import { useClipboard } from '@vueuse/core'
import {
  useUiPreferences,
  FONT_OPTIONS,
  FONT_SIZE_OPTIONS,
  DEFAULT_FONT_FACE,
} from '~/composables/useUiPreferences'
import { copyMessageRich } from '@/lib/clipboard/messageCopy'
import { useMarkdown } from '~/composables/useMarkdown'

// bold/italic from server config intentionally suppressed — local UI prefs are replacing server-driven styling
const baseOwnMessageStyle: CSSProperties = {
  backgroundColor: 'var(--config-own-message-bg)',
  fontSize: 'var(--config-own-message-font-size)',
  fontStyle: 'normal',
  fontWeight: 'normal',
  borderWidth: 'var(--config-message-border-width)',
  borderColor: 'var(--config-message-border-color)',
  borderStyle: 'var(--config-message-border-style)' as CSSProperties['borderStyle'],
  borderRadius: 'var(--config-message-border-radius)',
  color: 'var(--config-own-message-fg)',
}

const basePartnerMessageStyle: CSSProperties = {
  backgroundColor: 'var(--config-partner-message-bg)',
  fontSize: 'var(--config-partner-message-font-size)',
  fontStyle: 'normal',
  fontWeight: 'normal',
  borderWidth: 'var(--config-message-border-width)',
  borderColor: 'var(--config-message-border-color)',
  borderStyle: 'var(--config-message-border-style)' as CSSProperties['borderStyle'],
  borderRadius: 'var(--config-message-border-radius)',
  color: 'hsl(var(--foreground))',
}

type CopyableMessage = Pick<AISessionMessageDTO, 'messageID' | 'messageText' | 'messageType'>

function optionsCopyText(payload: OptionsMessagePayload, selectedAnswer?: string): string {
  const values = payload.Items.map((item) => item.Value)
  let selected: string[] = []
  let custom: string[] = []
  if (selectedAnswer) {
    if (payload.MultiSelectEnabled) {
      const restored = restoreMultiSelectAnswer(selectedAnswer, values)
      selected = restored.matched
      custom = restored.unmatched
    } else if (values.includes(selectedAnswer)) {
      selected = [selectedAnswer]
    } else {
      custom = [selectedAnswer]
    }
  }
  const lines = values.map((value) => `${selected.includes(value) ? '●' : '○'} ${value}`)
  for (const text of custom) lines.push(`● ${text}`)
  return [payload.Text, lines.join('\n')].filter(Boolean).join('\n\n')
}

function copySource(
  message: Pick<AISessionMessageDTO, 'messageText' | 'messageType'>,
  selectedAnswer?: string,
): {
  text: string
  hasImages: boolean
} {
  if (message.messageType === AIAnswerType.Options) {
    const payload = parseOptionsPayload(message.messageText)
    if (payload) {
      return { text: optionsCopyText(payload, selectedAnswer), hasImages: false }
    }
  }
  if (message.messageType === AIAnswerType.File) {
    const payload = parseFileMessagePayload(message.messageText)
    if (payload) {
      return {
        text: payload.text,
        hasImages: payload.files.some((f) => f.mimeType.startsWith('image/')),
      }
    }
  }
  if (message.messageType === AIAnswerType.Form) {
    const payload = parseFormMessagePayload(message.messageText)
    if (payload) {
      return { text: payload.text, hasImages: false }
    }
  }
  return { text: message.messageText ?? '', hasImages: false }
}

export function useMessagePresentation() {
  const authStore = useAuthStore()
  const { copy } = useClipboard()
  const { locale } = useI18n()
  const { fontFace, fontSize } = useUiPreferences()

  const copiedMessageId = ref<string | null>(null)

  const uiOverrides = computed<CSSProperties>(() => {
    const overrides: CSSProperties = {}
    const activeFontFace = fontFace.value ?? DEFAULT_FONT_FACE
    const fontOption = FONT_OPTIONS.find((o) => o.value === activeFontFace)
    if (fontOption) overrides.fontFamily = fontOption.family
    if (fontSize.value) {
      const option = FONT_SIZE_OPTIONS.find((o) => o.value === fontSize.value)
      if (option) overrides.fontSize = `${option.rem}rem`
    }
    return overrides
  })

  const ownMessageStyle = computed<CSSProperties>(() => ({
    ...baseOwnMessageStyle,
    ...uiOverrides.value,
  }))

  const partnerMessageStyle = computed<CSSProperties>(() => ({
    ...basePartnerMessageStyle,
    ...uiOverrides.value,
  }))

  function isUserMessage(message: AISessionMessageDTO): boolean {
    return message.senderUserCode === authStore.user?.email
  }

  function formatActionBarDate(dateString: string): string {
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) return ''

      const now = new Date()
      const isToday =
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()

      if (isToday) {
        return date.toLocaleTimeString(locale.value, {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      }

      return date.toLocaleDateString(locale.value, {
        month: 'short',
        day: 'numeric',
      })
    } catch {
      return ''
    }
  }

  async function handleCopy(message: CopyableMessage, selectedAnswer?: string): Promise<void> {
    const { text, hasImages } = copySource(message, selectedAnswer)
    if (!text && !hasImages) return

    const messageId = message.messageID
    const { parse } = useMarkdown()
    try {
      await copyMessageRich(messageId, text, parse)
    } catch {
      if (text) await copy(text)
    }

    copiedMessageId.value = messageId
    setTimeout(() => {
      if (copiedMessageId.value === messageId) {
        copiedMessageId.value = null
      }
    }, 1500)
  }

  return {
    ownMessageStyle,
    partnerMessageStyle,
    isUserMessage,
    formatActionBarDate,
    handleCopy,
    copiedMessageId,
  }
}
