<template>
  <div class="space-y-2">
    <MarkdownContent
      v-if="payload?.text"
      :content="payload.text"
    />

    <FormCard
      v-if="payload"
      :instance-id="payload.instanceId"
      :fallback-name="payload.formName"
      :session-id="sessionId"
      :agent-id="agentId"
      @open-form="(instanceId) => emit('openForm', instanceId)"
    />

    <MarkdownContent
      v-if="!payload"
      :content="messageText ?? ''"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { parseFormMessagePayload } from '@/types/api/schemas'
import MarkdownContent from '@/app/components/chat/MarkdownContent.vue'
import FormCard from '@/app/components/chat/FormCard.vue'

const props = defineProps<{
  messageText: string | null | undefined
  sessionId: string
  agentId?: number
}>()

const emit = defineEmits<{
  openForm: [instanceId: string]
}>()

const payload = computed(() => parseFormMessagePayload(props.messageText))
</script>
