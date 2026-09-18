<template>
  <div
    v-if="loadFailed"
    class="space-y-2"
  >
    <p class="text-sm text-[hsl(var(--muted-foreground))]">
      {{ t('chat.forms.unavailable') }}
    </p>
    <UButton
      size="xs"
      variant="outline"
      @click="loadBundle"
    >
      {{ t('errors.tryAgain') }}
    </UButton>
  </div>

  <div
    v-else-if="!bundle"
    class="space-y-3"
    data-testid="form-renderer-skeleton"
  >
    <USkeleton
      v-for="n in 3"
      :key="n"
      class="h-11 w-full rounded-lg !bg-[hsl(var(--muted-foreground)/0.08)]"
    />
  </div>

  <div
    v-else
    class="form-renderer @container"
    data-testid="form-renderer"
  >
    <component
      :is="bundle.JsonForms"
      :data="data"
      :schema="schema"
      :uischema="uischema ?? undefined"
      :renderers="bundle.renderers"
      :ajv="bundle.ajv"
      :readonly="readonly"
      :validation-mode="validationMode"
      :i18n="i18n"
      @change="emit('change', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, provide, shallowRef, toRef } from 'vue'
import type { JsonFormsI18nState, Translator } from '@jsonforms/core'
import type { JsonFormsChangeEvent } from '@jsonforms/vue'
import { useJsonForms, type JsonFormsBundle } from '@/app/composables/useJsonForms'
import {
  FORM_FOCUS_REQUEST_KEY,
  FORM_SHOW_ERRORS_KEY,
  type FormFocusRequest,
} from '@/app/utils/formRendererContext'
import { createLogger } from '@/lib/utils/logger'

const logger = createLogger('FormRenderer')

const VALIDATION_KEYWORDS = new Set([
  'required',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'pattern',
  'format',
  'enum',
  'type',
  'const',
  'minItems',
  'maxItems',
])

type TranslateContext = { error?: { keyword?: string; params?: Record<string, unknown> } }

const props = withDefaults(
  defineProps<{
    schema: Record<string, unknown>
    uischema?: Record<string, unknown> | null
    data: unknown
    readonly?: boolean
    showErrors?: boolean
    focusRequest?: FormFocusRequest
  }>(),
  { uischema: null, readonly: false, showErrors: false, focusRequest: undefined },
)

const emit = defineEmits<{ change: [event: JsonFormsChangeEvent] }>()

const { t, locale } = useI18n()

provide(FORM_SHOW_ERRORS_KEY, toRef(props, 'showErrors'))
provide(FORM_FOCUS_REQUEST_KEY, toRef(props, 'focusRequest'))

const bundle = shallowRef<JsonFormsBundle | null>(null)
const loadFailed = shallowRef(false)

function loadBundle(): void {
  loadFailed.value = false
  useJsonForms()
    .loadJsonForms()
    .then((loaded) => {
      bundle.value = loaded
    })
    .catch((error: unknown) => {
      logger.error('Failed to load JSON Forms', error)
      loadFailed.value = true
    })
}

loadBundle()

const validationMode = computed(() => (props.showErrors ? 'ValidateAndShow' : 'ValidateAndHide'))

const toNamedParams = (params: Record<string, unknown> = {}): Record<string, string> =>
  Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.join(', ') : String(value),
    ]),
  )

const translate = ((key: string, defaultMessage?: string, context?: TranslateContext) => {
  const keyword = /(?:^|\.)error\.([A-Za-z]+)$/.exec(key)?.[1]
  if (!keyword || !VALIDATION_KEYWORDS.has(keyword)) return defaultMessage
  return t(`chat.forms.validation.${keyword}`, toNamedParams(context?.error?.params))
}) as Translator

const i18n = computed<JsonFormsI18nState>(() => ({ locale: locale.value, translate }))
</script>

<style scoped>
.form-renderer :deep(.vertical-layout) {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-renderer :deep(.horizontal-layout) {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 1rem;
}

.form-renderer :deep([data-testid='group-layout']),
.form-renderer :deep(.array-list) {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  padding: 0.75rem;
}

.form-renderer :deep(.group-label),
.form-renderer :deep(.array-list-legend),
.form-renderer :deep(.control .label) {
  font-size: 0.875rem;
  font-weight: 500;
}

.form-renderer :deep(.control) {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.form-renderer :deep(.control .input),
.form-renderer :deep(.control .select),
.form-renderer :deep(.control .text-area) {
  width: 100%;
  min-height: 2.75rem;
  padding: 0.5rem 0.75rem;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-md);
}

.form-renderer :deep(.control .input:disabled),
.form-renderer :deep(.control .select:disabled),
.form-renderer :deep(.control .text-area:disabled) {
  opacity: 0.6;
}

.form-renderer :deep(.control .description),
.form-renderer :deep(.array-list-no-data),
.form-renderer :deep(.label-element) {
  font-size: 0.75rem;
  color: hsl(var(--muted-foreground));
}

.form-renderer :deep(.control .error) {
  font-size: 0.75rem;
  color: hsl(var(--destructive));
}

.form-renderer :deep(.array-list-item-wrapper) {
  border-top: 1px solid hsl(var(--border));
  padding-top: 0.75rem;
  margin-top: 0.75rem;
}

.form-renderer :deep(.array-list button) {
  min-height: 2.75rem;
  min-width: 2.75rem;
  padding: 0 0.75rem;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-md);
}
</style>
