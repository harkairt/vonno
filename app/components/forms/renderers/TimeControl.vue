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
      type="time"
      :disabled="!control.enabled"
      class="w-full"
      :ui="{ base: 'min-h-11' }"
      @update:model-value="onInput"
    />
  </UFormField>
</template>

<script lang="ts">
import { computed, inject, ref } from 'vue'
import { isTimeControl, rankWith, type ControlElement } from '@jsonforms/core'
import { rendererProps, useJsonFormsControl } from '@jsonforms/vue'
import { FORM_SHOW_ERRORS_KEY } from '@/app/utils/formRendererContext'
import { toJsonPointer } from '@/app/utils/jsonPointer'

export const tester = rankWith(10, isTimeControl)

// ajv's `time` format needs seconds; the input works in HH:mm.
const toInputValue = (data: unknown) => (typeof data === 'string' ? data.slice(0, 5) : '')
const toDataValue = (value: string) => (value.length === 5 ? `${value}:00` : value)
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
