<template>
  <UFormField
    v-if="control.visible"
    :label="control.label"
    :description="control.description || undefined"
    :error="errorMessage"
    :required="control.required"
    :data-form-path="formPath"
  >
    <UInput
      :model-value="inputValue"
      type="datetime-local"
      :disabled="!control.enabled"
      class="w-full"
      :ui="{ base: 'min-h-11' }"
      @update:model-value="onInput"
    />
  </UFormField>
</template>

<script lang="ts">
import { computed, inject, ref } from 'vue'
import { isDateTimeControl, rankWith, type ControlElement } from '@jsonforms/core'
import { rendererProps, useJsonFormsControl } from '@jsonforms/vue'
import { FORM_SHOW_ERRORS_KEY } from '@/app/utils/formRendererContext'
import { toJsonPointer } from '@/app/utils/jsonPointer'

export const tester = rankWith(10, isDateTimeControl)

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

// The data is ISO 8601 without offset (`YYYY-MM-DDTHH:mm:ss`); the input works in `YYYY-MM-DDTHH:mm`.
// An offset or `Z` in incoming data is dropped, not converted, so the wall-clock time stays as sent.
const toInputValue = (data: unknown) =>
  typeof data === 'string' ? (LOCAL_DATE_TIME.exec(data)?.[0] ?? '') : ''
const toDataValue = (value: string) => (value.length === 16 ? `${value}:00` : value)
</script>

<script setup lang="ts">
const props = defineProps(rendererProps<ControlElement>())

const { control, handleChange } = useJsonFormsControl(props)
const showErrors = inject(FORM_SHOW_ERRORS_KEY, ref(false))

const formPath = computed(() => toJsonPointer(control.value.path))

const inputValue = computed(() => toInputValue(control.value.data))

const errorMessage = computed(() =>
  showErrors.value && control.value.errors ? control.value.errors.split('\n')[0] : undefined,
)

const onInput = (value: string | number) => {
  const text = String(value)
  handleChange(control.value.path, text === '' ? undefined : toDataValue(text))
}
</script>
