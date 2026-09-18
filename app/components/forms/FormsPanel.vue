<template>
  <div
    class="flex min-h-full flex-col"
    data-testid="forms-panel"
  >
    <div
      v-if="!hasAgent"
      class="flex flex-1 items-center justify-center p-4"
      data-testid="forms-panel-no-agent"
    >
      <div class="text-center">
        <UIcon
          name="i-heroicons-exclamation-triangle"
          class="mx-auto mb-2 size-8 text-[hsl(var(--muted-foreground)/0.4)]"
          aria-hidden="true"
        />
        <p class="text-sm font-medium text-[hsl(var(--muted-foreground)/0.7)]">
          {{ t('chat.forms.noAgent') }}
        </p>
      </div>
    </div>

    <div
      v-else-if="isPending"
      class="space-y-2 p-3"
    >
      <USkeleton
        v-for="n in 3"
        :key="n"
        class="h-11 w-full rounded-lg !bg-[hsl(var(--muted-foreground)/0.08)]"
      />
    </div>

    <div
      v-else-if="isError"
      class="p-3"
    >
      <UAlert
        color="error"
        variant="soft"
        :title="t('common.error')"
        :description="errorMessage"
      >
        <template #actions>
          <UButton
            size="xs"
            color="error"
            variant="outline"
            :loading="isFetching"
            @click="refetch()"
          >
            {{ t('errors.tryAgain') }}
          </UButton>
        </template>
      </UAlert>
    </div>

    <div
      v-else-if="forms.length === 0"
      class="flex flex-1 items-center justify-center p-4"
    >
      <div class="text-center">
        <UIcon
          name="i-heroicons-clipboard-document-list"
          class="mx-auto mb-2 size-8 text-[hsl(var(--muted-foreground)/0.4)]"
          aria-hidden="true"
        />
        <p class="text-sm font-medium text-[hsl(var(--muted-foreground)/0.7)]">
          {{ t('chat.forms.empty') }}
        </p>
      </div>
    </div>

    <div
      v-else
      class="divide-y divide-[hsl(var(--border)/0.5)]"
    >
      <FormPanelItem
        v-for="form in forms"
        :key="form.instanceId"
        :form="form"
        :session-id="sessionId"
        :agent-id="agentId"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useSessionForms } from '@/app/composables/useFormQueries'
import { useFormsStore } from '@/app/stores/forms'
import type { SessionFormSummary } from '@/types/api/schemas'
import FormPanelItem from '@/app/components/forms/FormPanelItem.vue'
import { getUserFriendlyMessage } from '@/app/utils/error'

const props = defineProps<{
  sessionId: string
  agentId?: number
}>()

const { t } = useI18n()

const { data, error, isPending, isError, isFetching, refetch } = useSessionForms(
  () => props.sessionId,
  () => props.agentId,
)

const hasAgent = computed(() => typeof props.agentId === 'number')
const forms = computed(() => data.value?.forms ?? [])
const errorMessage = computed(() =>
  getUserFriendlyMessage(error.value, t('errors.unexpectedError')),
)

const formsStore = useFormsStore()

// Initial expansion rule: once per panel mount, only when nothing is expanded.
// Runs after the items are mounted so the focused one can scroll and ring.
let initialExpansionDone = false
function applyInitialExpansion(list: SessionFormSummary[]): void {
  if (initialExpansionDone || list.length === 0) return
  initialExpansionDone = true
  const session = formsStore.sessions[props.sessionId]
  if ((session?.expandedIds.length ?? 0) > 0) return
  const openForms = list.filter((form) => form.status === 'Open')
  const target =
    openForms.find((form) => form.instanceId === session?.selectedInstanceId) ?? openForms.at(-1)
  if (target) formsStore.focusForm(props.sessionId, target.instanceId)
}

onMounted(() => applyInitialExpansion(forms.value))
watch(forms, applyInitialExpansion, { flush: 'post' })
</script>
