<template>
  <p
    v-if="!hasAgent"
    class="text-xs italic text-[hsl(var(--muted-foreground))] opacity-70"
    data-testid="form-card-no-agent"
  >
    {{ t('chat.forms.noAgent') }}
  </p>
  <USkeleton
    v-else-if="isLoading"
    class="h-14 w-full max-w-[320px] rounded-lg !bg-[hsl(var(--muted-foreground)/0.08)]"
  />
  <div
    v-else-if="form"
    role="button"
    tabindex="0"
    :aria-label="ariaLabel"
    class="form-card hover-lift flex min-h-14 w-full max-w-[320px] cursor-pointer select-none items-center gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-[hsl(var(--card-foreground))]"
    @click="open"
    @keydown.enter.prevent="open"
    @keydown.space.prevent="open"
  >
    <UIcon
      name="i-heroicons-clipboard-document-list"
      class="size-5 shrink-0"
      aria-hidden="true"
    />
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <div class="flex min-w-0 items-center gap-1.5">
        <span
          class="truncate text-sm font-medium"
          :title="name"
        >
          {{ name }}
        </span>
        <span
          v-if="isMarked"
          role="img"
          :aria-label="t('chat.forms.agentSelected')"
          class="size-2 shrink-0 rounded-full bg-[hsl(var(--brand-soft))] ring-1 ring-[hsl(var(--primary)/0.4)]"
        />
      </div>
      <UBadge
        :label="statusLabel"
        :color="FORM_STATUS_COLOR[form.status]"
        variant="subtle"
        size="sm"
        class="w-fit"
      />
      <span
        v-if="isStale"
        class="text-xs italic text-[hsl(var(--muted-foreground))] opacity-70"
      >
        {{ t('chat.forms.staleHint') }}
      </span>
    </div>
    <span
      aria-hidden="true"
      class="pointer-events-none shrink-0"
    >
      <UButton
        as="span"
        variant="ghost"
        color="neutral"
        size="xs"
        :label="t('chat.forms.open')"
        :trailing-icon="isMobile ? 'i-heroicons-arrow-up-right' : 'i-heroicons-arrow-right'"
      />
    </span>
  </div>
  <p
    v-else
    class="text-xs italic text-[hsl(var(--muted-foreground))] opacity-70"
  >
    {{ missingLabel }}
  </p>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSessionForms } from '@/app/composables/useFormQueries'
import { useFormsStore } from '@/app/stores/forms'
import { FORM_STATUS_COLOR, FORM_STATUS_KEY } from '@/app/utils/formStatus'

const props = defineProps<{
  instanceId: string
  sessionId: string
  agentId?: number
  fallbackName?: string | null
}>()

const emit = defineEmits<{
  openForm: [instanceId: string]
}>()

const { t } = useI18n()
const { isMobile } = useNavigationVisibility()
const formsStore = useFormsStore()

const { data, isPending, isError } = useSessionForms(
  () => props.sessionId,
  () => props.agentId,
)

const hasAgent = computed(() => typeof props.agentId === 'number')
const isLoading = computed(() => isPending.value && !data.value)
const form = computed(() => data.value?.forms.find((f) => f.instanceId === props.instanceId))
const name = computed(() => form.value?.formName ?? t('chat.forms.untitled'))
const statusLabel = computed(() => (form.value ? t(FORM_STATUS_KEY[form.value.status]) : ''))
const ariaLabel = computed(() => `${name.value}, ${statusLabel.value}, ${t('chat.forms.open')}`)
const missingLabel = computed(() => {
  const named = props.fallbackName
  if (named) {
    return isError.value
      ? t('chat.forms.unavailableNamed', { name: named })
      : t('chat.forms.deletedNamed', { name: named })
  }
  return isError.value ? t('chat.forms.unavailable') : t('chat.forms.deleted')
})
const isStale = computed(() => !!form.value && isError.value)
const isMarked = computed(
  () =>
    form.value?.status === 'Open' &&
    formsStore.sessions[props.sessionId]?.selectedInstanceId === props.instanceId,
)

function open() {
  emit('openForm', props.instanceId)
}
</script>
