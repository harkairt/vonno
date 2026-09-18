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
      :model-value="(control.data as string | undefined) ?? ''"
      :type="inputType"
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
  and,
  isDateControl,
  isDateTimeControl,
  isEnumControl,
  isMultiLineControl,
  isOneOfEnumControl,
  isStringControl,
  isTimeControl,
  not,
  rankWith,
  type ControlElement,
} from '@jsonforms/core'
import { rendererProps, useJsonFormsControl } from '@jsonforms/vue'
import { FORM_SHOW_ERRORS_KEY } from '@/app/utils/formRendererContext'
import { toJsonPointer } from '@/app/utils/jsonPointer'

export const tester = rankWith(
  10,
  and(
    isStringControl,
    not(isMultiLineControl),
    not(isEnumControl),
    not(isOneOfEnumControl),
    not(isDateControl),
    not(isTimeControl),
    not(isDateTimeControl),
  ),
)
</script>

<script setup lang="ts">
const INPUT_TYPE_BY_FORMAT: Record<string, string> = { email: 'email', uri: 'url' }

const props = defineProps(rendererProps<ControlElement>())

const { control, handleChange } = useJsonFormsControl(props)
const showErrors = inject(FORM_SHOW_ERRORS_KEY, ref(false))

const formPath = computed(() => toJsonPointer(control.value.path))

const inputType = computed(() => INPUT_TYPE_BY_FORMAT[control.value.schema.format ?? ''] ?? 'text')

const errorMessage = computed(() =>
  showErrors.value && control.value.errors ? control.value.errors.split('\n')[0] : undefined,
)

const onInput = (value: string | number) => {
  handleChange(control.value.path, value === '' ? undefined : String(value))
}
</script>
