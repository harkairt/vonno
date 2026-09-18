import { screen } from '@testing-library/vue'
import type { Component } from 'vue'
import type { JsonSchema, TesterContext, UISchemaElement } from '@jsonforms/core'
import { renderWithProviders } from '@/tests/utils/render'
import FormRenderer from '~/components/forms/FormRenderer.vue'

export const stubs = {
  UTabs: {
    name: 'UTabs',
    props: ['items', 'ui'],
    template: `
      <div v-bind="$attrs">
        <button
          v-for="item in items"
          :key="item.value"
          type="button"
          data-testid="tab-trigger"
          :data-value="item.value"
        >
          {{ item.label }}
        </button>
        <div v-for="item in items" :key="item.value" data-testid="tab-panel">
          <slot name="content" :item="item" />
        </div>
      </div>`,
  },
  UFormField: {
    name: 'UFormField',
    props: ['label', 'description', 'error', 'required'],
    template: `
      <div data-testid="form-field" :data-label="label" :data-required="required">
        <label v-if="label">{{ label }}</label>
        <slot />
        <p v-if="description" data-testid="form-field-description">{{ description }}</p>
        <p v-if="error" data-testid="form-field-error">{{ error }}</p>
      </div>`,
  },
  UInput: {
    name: 'UInput',
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  UTextarea: {
    name: 'UTextarea',
    props: { modelValue: null, rows: Number, autoresize: Boolean },
    emits: ['update:modelValue'],
    template:
      '<textarea v-bind="$attrs" :rows="rows" :data-autoresize="autoresize" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  UInputNumber: {
    name: 'UInputNumber',
    props: ['modelValue', 'min', 'max', 'step', 'stepSnapping'],
    emits: ['update:modelValue'],
    template:
      '<input type="number" v-bind="$attrs" :min="min" :max="max" :step="step" :data-step-snapping="stepSnapping" :value="modelValue ?? \'\'" @input="$emit(\'update:modelValue\', $event.target.value === \'\' ? null : Number($event.target.value))" />',
  },
  UCheckbox: {
    name: 'UCheckbox',
    props: ['modelValue', 'label', 'description', 'disabled', 'required'],
    emits: ['update:modelValue'],
    template: `
      <label data-testid="checkbox" :data-required="required">
        <input type="checkbox" :checked="modelValue" :disabled="disabled" @change="$emit('update:modelValue', $event.target.checked)" />
        {{ label }}
      </label>`,
  },
  USwitch: {
    name: 'USwitch',
    props: ['modelValue', 'label', 'description', 'disabled', 'required'],
    emits: ['update:modelValue'],
    template: `
      <label data-testid="switch" :data-required="required">
        <input type="checkbox" role="switch" :checked="modelValue" :disabled="disabled" @change="$emit('update:modelValue', $event.target.checked)" />
        {{ label }}
      </label>`,
  },
  USelect: {
    name: 'USelect',
    props: ['modelValue', 'items', 'disabled'],
    emits: ['update:modelValue'],
    template: `
      <select data-testid="select" :value="modelValue" :disabled="disabled" @change="$emit('update:modelValue', $event.target.value)">
        <option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option>
      </select>`,
  },
  URadioGroup: {
    name: 'URadioGroup',
    props: ['modelValue', 'items', 'disabled'],
    emits: ['update:modelValue'],
    template: `
      <fieldset data-testid="radio-group" :disabled="disabled">
        <label v-for="item in items" :key="item.value">
          <input type="radio" :value="item.value" :checked="item.value === modelValue" :disabled="disabled" @change="$emit('update:modelValue', item.value)" />
          {{ item.label }}
        </label>
      </fieldset>`,
  },
}

export interface FormProps {
  schema: Record<string, unknown>
  uischema?: Record<string, unknown> | null
  data: unknown
  readonly?: boolean
  showErrors?: boolean
}

export async function renderForm(props: FormProps) {
  const result = renderWithProviders(FormRenderer as Component, { props, global: { stubs } })
  await screen.findByTestId('form-renderer')
  return result
}

export const control = (property: string, options?: Record<string, unknown>) => ({
  type: 'Control',
  scope: `#/properties/${property}`,
  ...(options ? { options } : {}),
})

export const fieldByPath = (container: HTMLElement, pointer: string) =>
  container.querySelector<HTMLElement>(`[data-form-path="${pointer}"]`)

export const errorIn = (field: HTMLElement | null) =>
  field?.querySelector('[data-testid="form-field-error"]') ?? null

export const lastChangeData = <T>(emitted: (name: string) => unknown[][]) =>
  (emitted('change').at(-1)?.[0] as { data: T } | undefined)?.data

export const rank = (
  tester: (uischema: UISchemaElement, schema: JsonSchema, context: TesterContext) => number,
  uischema: Record<string, unknown>,
  schema: Record<string, unknown>,
) =>
  tester(uischema as unknown as UISchemaElement, schema as JsonSchema, {
    rootSchema: schema as JsonSchema,
    config: {},
  })
