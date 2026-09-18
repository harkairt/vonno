<template>
  <UFormField
    v-if="control.visible"
    :label="control.label"
    :description="control.description || undefined"
    :error="errorMessage"
    :required="control.required"
    :data-form-path="formPath"
  >
    <UInputNumber
      :model-value="(control.data as number | undefined) ?? null"
      :min="control.schema.minimum"
      :max="control.schema.maximum"
      :step="isInteger ? 1 : undefined"
      :step-snapping="isInteger"
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
  isEnumControl,
  isIntegerControl,
  isNumberControl,
  isOneOfEnumControl,
  not,
  or,
  rankWith,
  type ControlElement,
} from '@jsonforms/core'
import { rendererProps, useJsonFormsControl } from '@jsonforms/vue'
import { FORM_SHOW_ERRORS_KEY } from '@/app/utils/formRendererContext'
import { toJsonPointer } from '@/app/utils/jsonPointer'

export const tester = rankWith(
  10,
  and(or(isNumberControl, isIntegerControl), not(isEnumControl), not(isOneOfEnumControl)),
)
</script>

<script setup lang="ts">
const props = defineProps(rendererProps<ControlElement>())

const { control, handleChange } = useJsonFormsControl(props)
const showErrors = inject(FORM_SHOW_ERRORS_KEY, ref(false))

const formPath = computed(() => toJsonPointer(control.value.path))

const isInteger = computed(() => control.value.schema.type === 'integer')

const errorMessage = computed(() =>
  showErrors.value && control.value.errors ? control.value.errors.split('\n')[0] : undefined,
)

const onInput = (value: number | null) => {
  handleChange(control.value.path, value === null || Number.isNaN(value) ? undefined : value)
}
</script>
