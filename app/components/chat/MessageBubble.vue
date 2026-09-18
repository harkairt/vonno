<template>
  <div
    class="message-bubble px-2.5 py-2.5"
    :class="[
      fullWidth ? 'w-full max-w-full' : wide ? 'max-w-full' : maxWidthClass,
      {
        'own-message rounded-br-md': isOwn,
        'rounded-bl-md': !isOwn,
      },
    ]"
    :style="isOwn ? ownMessageStyle : partnerMessageStyle"
  >
    <slot name="header" />

    <template v-if="message.messageType === AIAnswerType.Options">
      <MarkdownContent
        v-if="!parseOptionsPayload(message.messageText)"
        :content="message.messageText"
      />
      <OptionsMessage
        v-else
        :payload="parseOptionsPayload(message.messageText)!"
        :is-active="optionsActive"
        :selected-answer="selectedAnswer"
        @submit="(answer: string) => emit('optionSubmitted', answer)"
      />
    </template>
    <FileMessage
      v-else-if="message.messageType === AIAnswerType.File"
      :message-text="message.messageText"
      :interactive="interactive"
      @preview-file="(file) => emit('previewFile', file, message.messageID, message.sendDate)"
    />
    <FormMessage
      v-else-if="message.messageType === AIAnswerType.Form"
      :message-text="message.messageText"
      :session-id="message.sessionId"
      :agent-id="agentId"
      @open-form="(instanceId) => emit('openForm', instanceId)"
    />
    <div
      v-else
      class="space-y-2"
    >
      <MarkdownContent
        v-if="!usesSplitMarkdown || formSplit.markdown"
        :content="usesSplitMarkdown ? formSplit.markdown : message.messageText"
      />
      <FormCardRow
        v-if="hasFormCards"
        :instance-ids="formSplit.instanceIds"
        :session-id="message.sessionId"
        :agent-id="agentId"
        @open-form="(instanceId) => emit('openForm', instanceId)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AISessionMessageDTO, ReceivedFile } from '@/types/api/schemas'
import { parseOptionsPayload } from '@/types/api/schemas'
import { AIAnswerType } from '@/types/enums'
import { useMessagePresentation } from '@/app/composables/useMessagePresentation'
import { hasFullWidthContent, hasWideContent } from '@/app/utils/messageContent'
import { hasClosedFormFence, hasFormFence, splitFormFences } from '@/app/utils/formFence'
import MarkdownContent from '@/app/components/chat/MarkdownContent.vue'
import OptionsMessage from '@/app/components/chat/OptionsMessage.vue'
import FileMessage from '@/app/components/chat/FileMessage.vue'
import FormMessage from '@/app/components/chat/FormMessage.vue'
import FormCardRow from '@/app/components/chat/FormCardRow.vue'

const { ownMessageStyle, partnerMessageStyle, isUserMessage } = useMessagePresentation()
const props = withDefaults(
  defineProps<{
    message: AISessionMessageDTO
    optionsActive?: boolean
    selectedAnswer?: string
    maxWidthClass?: string
    interactive?: boolean
    agentId?: number
  }>(),
  {
    optionsActive: false,
    selectedAnswer: undefined,
    maxWidthClass: 'w-fit max-w-full',
    interactive: true,
    agentId: undefined,
  },
)

const emit = defineEmits<{
  optionSubmitted: [answer: string]
  previewFile: [file: ReceivedFile, messageId: string, messageDate: string]
  openForm: [instanceId: string]
}>()

const isOwn = computed(() => isUserMessage(props.message))
const wide = computed(() => hasWideContent(props.message))
const fullWidth = computed(() => hasFullWidthContent(props.message))
const hasFence = computed(() => hasFormFence(props.message.messageText))
const formSplit = computed(() =>
  hasFence.value ? splitFormFences(props.message.messageText) : { markdown: '', instanceIds: [] },
)
const hasFormCards = computed(() => formSplit.value.instanceIds.length > 0)
const usesSplitMarkdown = computed(
  () => hasFormCards.value || (hasFence.value && !hasClosedFormFence(props.message.messageText)),
)
</script>

<style scoped>
.message-bubble {
  overflow-wrap: break-word;
  word-break: break-word;
}
</style>
