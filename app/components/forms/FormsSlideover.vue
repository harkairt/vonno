<template>
  <USlideover
    :open="open"
    side="right"
    :title="t('chat.forms.title')"
    :ui="{ content: 'max-w-full', body: 'p-0 [scrollbar-gutter:stable]' }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <FormsPanel
        :session-id="sessionId"
        :agent-id="agentId"
      />
    </template>
  </USlideover>
</template>

<script setup lang="ts">
import FormsPanel from '@/app/components/forms/FormsPanel.vue'
import { useFormDraftFlush } from '@/app/composables/useFormDraftPersistence'

const props = defineProps<{
  open: boolean
  sessionId: string
  agentId?: number
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
}>()

const { t } = useI18n()
const flushSessionFormDrafts = useFormDraftFlush()

watch(
  () => props.open,
  (open, wasOpen) => {
    if (wasOpen && !open) {
      void flushSessionFormDrafts(props.sessionId, props.agentId)
    }
  },
)
</script>
