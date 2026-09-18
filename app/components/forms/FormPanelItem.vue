<template>
  <div
    ref="rootEl"
    data-testid="form-panel-item"
    :data-instance-id="form.instanceId"
  >
    <div
      class="flex min-h-[44px] items-center gap-1 pr-2"
      :class="isClosed && 'opacity-60'"
    >
      <button
        type="button"
        class="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2 text-left transition-colors duration-150 hover:bg-[hsl(var(--muted)/0.5)]"
        :aria-expanded="isExpanded"
        :aria-controls="isExpanded ? bodyId : undefined"
        :title="t(isExpanded ? 'chat.forms.collapse' : 'chat.forms.expand')"
        @click="formsStore.toggleExpanded(sessionId, form.instanceId)"
      >
        <UIcon
          name="i-heroicons-chevron-right-20-solid"
          class="size-4 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform duration-200 ease-out"
          :class="isExpanded && 'rotate-90'"
          aria-hidden="true"
        />
        <UIcon
          name="i-heroicons-clipboard-document-list"
          class="size-5 shrink-0"
          aria-hidden="true"
        />
        <span
          class="min-w-0 flex-1 truncate text-sm font-medium"
          :title="name"
        >
          {{ name }}
        </span>
        <UBadge
          :label="t(FORM_STATUS_KEY[form.status])"
          :color="FORM_STATUS_COLOR[form.status]"
          variant="subtle"
          size="sm"
          class="shrink-0"
        />
        <span
          v-if="isMarked"
          role="img"
          :aria-label="t('chat.forms.agentSelected')"
          class="size-2 shrink-0 rounded-full bg-[hsl(var(--brand-soft))] ring-1 ring-[hsl(var(--primary)/0.4)]"
        />
      </button>
      <span
        v-if="!isClosed"
        role="status"
        class="flex shrink-0 items-center gap-1"
      >
        <UTooltip :text="saveStatusLabel">
          <UIcon
            :name="SAVE_STATUS_ICON[saveStatus]"
            aria-hidden="true"
            class="size-4 shrink-0"
            :class="[
              saveStatus === 'error'
                ? 'text-[hsl(var(--destructive))]'
                : 'text-[hsl(var(--muted-foreground))]',
              saveStatus === 'saving' ? 'animate-pulse' : '',
            ]"
          />
        </UTooltip>
        <span class="sr-only">{{ saveStatusLabel }}</span>
        <UButton
          v-if="saveStatus === 'error'"
          data-testid="form-save-retry"
          variant="ghost"
          color="neutral"
          size="xs"
          square
          icon="i-heroicons-arrow-path"
          :aria-label="t('chat.forms.retry')"
          class="min-h-[44px] min-w-[44px] shrink-0"
          @click="flush()"
        />
      </span>
      <UButton
        v-if="!isClosed"
        variant="ghost"
        color="neutral"
        size="xs"
        square
        :icon="isPinned ? 'i-ph-push-pin-fill' : 'i-ph-push-pin'"
        :aria-pressed="isPinned"
        :aria-label="t(isPinned ? 'chat.forms.unpin' : 'chat.forms.pin')"
        class="shrink-0"
        @click="formsStore.togglePinned(sessionId, form.instanceId)"
      />
    </div>

    <UCollapsible :open="isExpanded">
      <template #content>
        <div
          :id="bodyId"
          ref="bodyEl"
          :data-form-instance-id="form.instanceId"
          class="px-3 pb-3"
          @focusin="onFocusIn"
          @focusout="onBodyFocusOut"
        >
          <div
            v-if="isPending && hasAgent"
            class="space-y-2"
          >
            <USkeleton
              v-for="n in 3"
              :key="n"
              class="h-9 w-full rounded-lg !bg-[hsl(var(--muted-foreground)/0.08)]"
            />
          </div>

          <UAlert
            v-else-if="isError"
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

          <div
            v-else-if="instance"
            data-testid="form-panel-body-loaded"
            class="space-y-3"
          >
            <FormRenderer
              :schema="instance.schema"
              :uischema="instance.uischema"
              :data="draft?.data"
              :readonly="isReadonly"
              :show-errors="draft?.showErrors ?? false"
              :focus-request="focusRequest"
              @change="handleChange"
            />
            <p
              v-if="isClosed"
              class="text-xs text-[hsl(var(--muted-foreground))]"
            >
              {{ t('chat.forms.closedNotice') }}
            </p>
            <p
              v-else-if="!hasAgent"
              class="text-xs text-[hsl(var(--muted-foreground))]"
              data-testid="form-panel-item-no-agent"
            >
              {{ t('chat.forms.noAgent') }}
            </p>
            <footer
              v-if="!isClosed"
              class="flex justify-end gap-2"
            >
              <UButton
                variant="ghost"
                color="error"
                :disabled="isSubmitting || isDeleting || !hasAgent"
                class="min-h-11"
                @click="discardOpen = true"
              >
                {{ t('chat.forms.discard') }}
              </UButton>
              <UButton
                color="primary"
                :disabled="isSubmitting || isDeleting || !hasAgent"
                class="min-h-11"
                @click="submit"
              >
                {{ t('chat.forms.submit') }}
              </UButton>
            </footer>
          </div>

          <div
            v-else
            data-testid="form-panel-item-no-agent"
            class="text-xs text-[hsl(var(--muted-foreground))]"
          >
            {{ t('chat.forms.noAgent') }}
          </div>
        </div>
      </template>
    </UCollapsible>

    <FormSubmitModal
      v-model:open="submitModalOpen"
      :pending="isSubmitting"
      @confirm="confirmSubmit"
    />
    <FormDiscardModal
      v-model:open="discardOpen"
      :pending="isDeleting"
      @confirm="discard"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, toRaw, watch } from 'vue'
import { usePreferredReducedMotion } from '@vueuse/core'
import { useQueryClient } from '@tanstack/vue-query'
import type { JsonFormsChangeEvent } from '@jsonforms/vue'
import type { SessionFormSummary } from '@/types/api/schemas'
import { isAppError } from '@/lib/errors/types'
import FormRenderer from '@/app/components/forms/FormRenderer.vue'
import FormSubmitModal from '@/app/components/forms/FormSubmitModal.vue'
import FormDiscardModal from '@/app/components/forms/FormDiscardModal.vue'
import { isDraftDirty, useFormsStore, type FormSaveStatus } from '@/app/stores/forms'
import { useFormDraft } from '@/app/composables/useFormDraft'
import { useDeleteFormInst, useSaveFormInst } from '@/app/composables/useFormMutations'
import { chatQueryKeys } from '@/app/composables/useChatQueries'
import { FORM_STATUS_COLOR, FORM_STATUS_KEY } from '@/app/utils/formStatus'
import type { FormFocusRequest } from '@/app/utils/formRendererContext'
import { getUserFriendlyMessage } from '@/app/utils/error'
import { createLogger } from '@/lib/utils/logger'
import { appendJsonPointerSegment, asJsonPointer, type JsonPointer } from '@/app/utils/jsonPointer'
import { invalidateFormAfterStaleWrite } from '@/app/composables/useFormDraftPersistence'

const logger = createLogger('FormPanelItem')

type ValidationError = NonNullable<JsonFormsChangeEvent['errors']>[number]

const SAVE_STATUS_KEY: Record<FormSaveStatus, string> = {
  idle: 'chat.forms.saved',
  saving: 'chat.forms.saving',
  saved: 'chat.forms.saved',
  error: 'chat.forms.saveFailed',
}

const SAVE_STATUS_ICON: Record<FormSaveStatus, string> = {
  idle: 'i-ph-cloud-check',
  saving: 'i-ph-cloud-arrow-up',
  saved: 'i-ph-cloud-check',
  error: 'i-ph-cloud-warning',
}

const props = defineProps<{
  form: SessionFormSummary
  sessionId: string
  agentId?: number
}>()

const { t } = useI18n()
const toast = useToast()
const queryClient = useQueryClient()
const formsStore = useFormsStore()
const reducedMotion = usePreferredReducedMotion()
const reducedMotionEnabled = computed(() => reducedMotion.value === 'reduce')

const rootEl = ref<HTMLElement | null>(null)
const bodyId = `form-panel-body-${props.form.instanceId}`

const name = computed(() => props.form.formName ?? t('chat.forms.untitled'))
const session = computed(() => formsStore.sessions[props.sessionId])
const isExpanded = computed(
  () => session.value?.expandedIds.includes(props.form.instanceId) ?? false,
)
const isPinned = computed(() => session.value?.pinnedIds.includes(props.form.instanceId) ?? false)
const isMarked = computed(
  () => !isClosed.value && session.value?.selectedInstanceId === props.form.instanceId,
)

const {
  query: { error, isPending, isError, isFetching, refetch },
  instance,
  draft,
  saveStatus,
  errorMessage: saveErrorMessage,
  onChange,
  onFocusIn,
  onFocusOut,
  flush,
  cancelPendingSave,
} = useFormDraft({
  sessionId: () => props.sessionId,
  agentId: () => props.agentId,
  instanceId: () => props.form.instanceId,
  expanded: isExpanded,
  readonly: () => isClosed.value,
})

// The list summary lags behind a submit until its refetch lands; the instance
// query is updated synchronously from the response, so either source closes.
const isClosed = computed(
  () => props.form.status !== 'Open' || (instance.value?.status ?? 'Open') !== 'Open',
)
const saveStatusLabel = computed(() =>
  saveStatus.value === 'error'
    ? (saveErrorMessage.value ?? t('chat.forms.saveFailed'))
    : t(SAVE_STATUS_KEY[saveStatus.value]),
)

const hasAgent = computed(() => typeof props.agentId === 'number')
const isReadonly = computed(() => isClosed.value || !hasAgent.value)

const errorMessage = computed(() =>
  getUserFriendlyMessage(error.value, t('errors.unexpectedError')),
)

const { mutateAsync: saveFormInst, isPending: isSubmitting } = useSaveFormInst()
const bodyEl = ref<HTMLElement | null>(null)
const focusRequest = ref<FormFocusRequest>()
const submitModalOpen = ref(false)
const focusRetryAfterSaveError = ref(false)
let validationErrors: ValidationError[] = []

watch(
  saveStatus,
  async (status) => {
    if (status !== 'error' || !focusRetryAfterSaveError.value) return
    await nextTick()
    rootEl.value?.querySelector<HTMLElement>('[data-testid="form-save-retry"]')?.focus()
    focusRetryAfterSaveError.value = false
  },
  { flush: 'post' },
)

const handleChange = (event: JsonFormsChangeEvent) => {
  validationErrors = event.errors ?? []
  onChange(event)
}

const errorPointer = (error: ValidationError): JsonPointer =>
  error.keyword === 'required'
    ? appendJsonPointerSegment(
        asJsonPointer(error.instancePath),
        String(error.params.missingProperty),
      )
    : asJsonPointer(error.instancePath)

const focusControl = async (pointer: JsonPointer): Promise<boolean> => {
  focusRequest.value = { pointer, seq: (focusRequest.value?.seq ?? 0) + 1 }
  await nextTick()
  const control = bodyEl.value?.querySelector<HTMLElement>(
    `[data-form-path=${JSON.stringify(pointer)}]`,
  )
  if (!control) return false
  const target =
    control.querySelector<HTMLElement>(
      'input, select, textarea, button, [tabindex]:not([tabindex="-1"])',
    ) ?? control
  target.scrollIntoView({
    block: 'center',
    behavior: reducedMotionEnabled.value ? 'auto' : 'smooth',
  })
  target.focus()
  return true
}

const submit = async () => {
  focusRetryAfterSaveError.value = true
  const status = await flush()
  if (status === 'error' && draft.value && isDraftDirty(draft.value)) {
    toast.add({ title: t('chat.forms.submitFlushFailed'), color: 'error' })
    return
  }
  focusRetryAfterSaveError.value = false
  await nextTick()
  formsStore.setShowErrors(props.sessionId, props.form.instanceId, true)
  const pointers = validationErrors.map(errorPointer).filter((pointer) => pointer !== '')
  if (pointers.length > 0) {
    for (const pointer of pointers) {
      if (await focusControl(pointer)) break
    }
    return
  }
  submitModalOpen.value = true
}

const confirmSubmit = async () => {
  const { sessionId, agentId } = props
  const instanceId = props.form.instanceId
  if (typeof agentId !== 'number') {
    logger.warn('Submit attempted without a resolved session agent id', { sessionId, instanceId })
    submitModalOpen.value = false
    return
  }
  await flush()
  try {
    await saveFormInst({
      agentId,
      sessionId,
      instanceId,
      data: toRaw(draft.value?.data ?? {}),
      status: 'Submitted',
    })
    void queryClient.invalidateQueries({ queryKey: chatQueryKeys.session(sessionId) })
    toast.add({ title: t('chat.forms.submitted'), color: 'success' })
  } catch (error) {
    const message = getUserFriendlyMessage(error, t('errors.unexpectedError'))
    toast.add({ title: message, color: 'error' })
    formsStore.setSaveStatus(sessionId, instanceId, 'error', message)
    if (isAppError(error)) {
      invalidateFormAfterStaleWrite(error, queryClient, sessionId, instanceId)
    }
  } finally {
    submitModalOpen.value = false
  }
}

const { mutateAsync: deleteForm, isPending: isDeleting } = useDeleteFormInst()
const discardOpen = ref(false)

function onBodyFocusOut(event: FocusEvent) {
  if (discardOpen.value) return
  onFocusOut(event)
}

async function discard() {
  const { agentId, sessionId } = props
  const instanceId = props.form.instanceId
  if (typeof agentId !== 'number') {
    logger.warn('Discard attempted without a resolved session agent id', { sessionId, instanceId })
    discardOpen.value = false
    return
  }
  cancelPendingSave()
  try {
    await deleteForm({ agentId, sessionId, instanceId })
  } catch (error: unknown) {
    toast.add({
      title: t('common.error'),
      description: getUserFriendlyMessage(error, t('errors.unexpectedError')),
      color: 'error',
    })
    if (isAppError(error)) {
      invalidateFormAfterStaleWrite(error, queryClient, sessionId, instanceId)
    }
  } finally {
    discardOpen.value = false
  }
}

watch(
  () => formsStore.lastFocusSeq,
  () => {
    if (formsStore.lastFocusedId !== props.form.instanceId) return
    void nextTick(() => {
      rootEl.value?.scrollIntoView({
        block: 'nearest',
        behavior: reducedMotionEnabled.value ? 'auto' : 'smooth',
      })
    })
  },
)
</script>
