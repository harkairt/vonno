<template>
  <div class="flex flex-wrap gap-2">
    <FormCard
      v-for="instanceId in instanceIds"
      :key="instanceId"
      :instance-id="instanceId"
      :session-id="sessionId"
      :agent-id="agentId"
      @open-form="(id) => emit('openForm', id)"
    />
  </div>
</template>

<script setup lang="ts">
import FormCard from '@/app/components/chat/FormCard.vue'

defineProps<{
  instanceIds: string[]
  sessionId: string
  agentId?: number
}>()

const emit = defineEmits<{
  openForm: [instanceId: string]
}>()
</script>
