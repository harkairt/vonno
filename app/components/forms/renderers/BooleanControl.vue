<template>
  <UFormField
    v-if="control.visible"
    :description="control.description || undefined"
    :error="errorMessage"
    :required="control.required"
    :data-form-path="formPath"
  >
    <USwitch
      v-if="isToggle"
      :model-value="control.data === true"
      :label="control.label"
      :required="control.required"
      :disabled="!control.enabled"
      :ui="{ root: 'min-h-11 items-center' }"
      @update:model-value="onInput"
    />
    <UCheckbox
      v-else
      :model-value="control.data === true"
      :label="control.label"
      :required="control.required"
      :disabled="!control.enabled"
      :ui="{ root: 'min-h-11 items-center' }"
      @update:model-value="onInput"
    />
  </UFormField>
</template>

<script lang="ts">
import { computed, inject, ref } from 'vue'
import { isBooleanControl, rankWith, type ControlElement } from '@jsonforms/core'
import { rendererProps, useJsonFormsControl } from '@jsonforms/vue'
import { FORM_SHOW_ERRORS_KEY } from '@/app/utils/formRendererContext'
import { toJsonPointer } from '@/app/utils/jsonPointer'

export const tester = rankWith(10, isBooleanControl)
</script>

<script setup lang="ts">
const props = defineProps(rendererProps<ControlElement>())

const { control, handleChange } = useJsonFormsControl(props)
const showErrors = inject(FORM_SHOW_ERRORS_KEY, ref(false))

const formPath = computed(() => toJsonPointer(control.value.path))

const isToggle = computed(() => control.value.uischema.options?.toggle === true)

const errorMessage = computed(() =>
  showErrors.value && control.value.errors ? control.value.errors.split('\n')[0] : undefined,
)

const onInput = (value: boolean | 'indeterminate') => {
  handleChange(control.value.path, value === true)
}
</script>
