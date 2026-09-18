<template>
  <div
    class="flex flex-col flex-1 h-full bg-[hsl(var(--background))]"
    :style="{ minWidth: `${contentWidth}px` }"
    data-testid="forms-sidebar"
  >
    <div
      class="flex items-center gap-2 px-3 py-2 border-b border-[hsl(var(--border)/0.5)] flex-shrink-0 min-h-[44px]"
    >
      <button
        class="text-[hsl(var(--muted-foreground))] hover:text-foreground transition-colors rounded flex items-center justify-center size-8 flex-shrink-0"
        :aria-label="t('chat.forms.toggleSidebar')"
        @click="emit('close')"
      >
        <UIcon
          name="i-heroicons-x-mark-20-solid"
          class="size-5"
        />
      </button>
      <h2 class="text-sm font-semibold text-foreground truncate flex-1">
        {{ t('chat.forms.title') }}
      </h2>
      <span
        v-if="data"
        class="text-xs text-[hsl(var(--muted-foreground))] flex-shrink-0"
      >
        {{ t('chat.forms.count', { open: openCount, total: data.forms.length }) }}
      </span>
    </div>

    <div
      class="flex-1 overflow-y-auto"
      style="scrollbar-gutter: stable"
    >
      <FormsPanel
        :session-id="sessionId"
        :agent-id="agentId"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSessionForms } from '@/app/composables/useFormQueries'
import FormsPanel from '@/app/components/forms/FormsPanel.vue'

const props = defineProps<{
  sessionId: string
  agentId?: number
  contentWidth: number
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()

const { data } = useSessionForms(
  () => props.sessionId,
  () => props.agentId,
)

const openCount = computed(
  () => data.value?.forms.filter((form) => form.status === 'Open').length ?? 0,
)
</script>
