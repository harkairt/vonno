<template>
  <UFormField
    v-if="control.visible"
    :label="control.label"
    :description="control.description || undefined"
    :error="errorMessage"
    :required="control.required"
    :data-form-path="formPath"
  >
    <URadioGroup
      v-if="isRadio"
      :model-value="selectedValue"
      :items="items"
      :disabled="!control.enabled"
      :ui="{ item: 'min-h-11 items-center' }"
      @update:model-value="onInput"
    />
    <USelect
      v-else
      :model-value="selectedValue"
      :items="items"
      :disabled="!control.enabled"
      class="w-full"
      :ui="{ base: 'min-h-11' }"
      @update:model-value="onInput"
    />
  </UFormField>
</template>

<script lang="ts">
import { computed, inject, ref } from 'vue'
import {
  isEnumControl,
  isOneOfEnumControl,
  or,
  rankWith,
  type ControlElement,
  type JsonSchema,
} from '@jsonforms/core'
import { rendererProps, useJsonFormsControl } from '@jsonforms/vue'
import { FORM_SHOW_ERRORS_KEY } from '@/app/utils/formRendererContext'
import { toJsonPointer } from '@/app/utils/jsonPointer'

export const tester = rankWith(10, or(isEnumControl, isOneOfEnumControl))

// Reka UI rejects '' as an item value, so the clearing item needs its own marker.
const NO_SELECTION = '__no-selection__'

type EnumValue = string | number
type EnumItem = { label: string; value: EnumValue }

const itemsFromSchema = (schema: JsonSchema): EnumItem[] => {
  if (schema.enum) {
    return schema.enum.map((value) => ({ label: String(value), value: value as EnumValue }))
  }
  if (schema.const !== undefined) {
    return [{ label: String(schema.const), value: schema.const as EnumValue }]
  }
  return (schema.oneOf ?? []).map((option) => ({
    label: option.title ?? String(option.const),
    value: option.const as EnumValue,
  }))
}
</script>

<script setup lang="ts">
const props = defineProps(rendererProps<ControlElement>())

const { t } = useI18n()
const { control, handleChange } = useJsonFormsControl(props)
const showErrors = inject(FORM_SHOW_ERRORS_KEY, ref(false))

const formPath = computed(() => toJsonPointer(control.value.path))

const isRadio = computed(() => control.value.uischema.options?.format === 'radio')

const items = computed<EnumItem[]>(() => {
  const options = itemsFromSchema(control.value.schema)
  return control.value.required
    ? options
    : [{ label: t('chat.forms.noSelection'), value: NO_SELECTION }, ...options]
})

const selectedValue = computed(() =>
  control.value.data === undefined && !control.value.required ? NO_SELECTION : control.value.data,
)

const errorMessage = computed(() =>
  showErrors.value && control.value.errors ? control.value.errors.split('\n')[0] : undefined,
)

const onInput = (value: unknown) => {
  handleChange(control.value.path, value === NO_SELECTION ? undefined : value)
}
</script>
