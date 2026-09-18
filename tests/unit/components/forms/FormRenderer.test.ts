import { describe, it, expect, afterEach, type Mock } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/vue'
import type { Component } from 'vue'
import { renderWithProviders } from '@/tests/utils/render'
import FormRenderer from '~/components/forms/FormRenderer.vue'

const stubs = {
  USkeleton: {
    name: 'USkeleton',
    inheritAttrs: false,
    template: '<div v-bind="$attrs" data-testid="form-renderer-skeleton-row" />',
  },
  UFormField: {
    name: 'UFormField',
    props: ['label', 'description', 'error', 'required'],
    template: `
      <div data-testid="form-field" :data-label="label" :data-required="required">
        <label>{{ label }}</label>
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
}

const schema = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', description: 'Your name' },
    email: { type: 'string', format: 'email' },
    website: { type: 'string', format: 'uri' },
    contacts: {
      type: 'array',
      items: { type: 'object', properties: { phone: { type: 'string' } } },
    },
  },
}

const control = (property: string) => ({ type: 'Control', scope: `#/properties/${property}` })

const stringsLayout = {
  type: 'VerticalLayout',
  elements: [control('name'), control('email'), control('website')],
}

type Props = {
  schema: Record<string, unknown>
  uischema?: Record<string, unknown> | null
  data: unknown
  readonly?: boolean
  showErrors?: boolean
}

function renderForm(props: Props) {
  return renderWithProviders(FormRenderer as Component, { props, global: { stubs } })
}

const fieldByPath = (container: HTMLElement, pointer: string) =>
  container.querySelector<HTMLElement>(`[data-form-path="${pointer}"]`)

const inputIn = (field: HTMLElement | null) => field?.querySelector('input') ?? null

describe('FormRenderer — loading', () => {
  it('shows a skeleton until the libraries load, then the form', async () => {
    renderForm({ schema, uischema: stringsLayout, data: {} })

    expect(screen.getByTestId('form-renderer-skeleton')).toBeTruthy()

    await screen.findByTestId('form-renderer')
    expect(screen.queryByTestId('form-renderer-skeleton')).toBeNull()
  })
})

describe('FormRenderer — StringControl and VerticalLayout', () => {
  it('renders one UInput per control with the type derived from the format', async () => {
    const { container } = renderForm({ schema, uischema: stringsLayout, data: { name: 'Ada' } })
    await screen.findByTestId('form-renderer')

    const name = fieldByPath(container, '/name')
    expect(name?.dataset.label).toBe('Name')
    expect(name?.dataset.required).toBe('true')
    expect(name?.textContent).toContain('Your name')
    expect(inputIn(name)?.type).toBe('text')
    expect(inputIn(name)?.value).toBe('Ada')

    expect(inputIn(fieldByPath(container, '/email'))?.type).toBe('email')
    expect(inputIn(fieldByPath(container, '/website'))?.type).toBe('url')
  })

  it('lays the controls out in a vertical flex column', async () => {
    const { container } = renderForm({ schema, uischema: stringsLayout, data: {} })
    await screen.findByTestId('form-renderer')

    const layout = container.querySelector('.flex.flex-col.gap-4')
    expect(layout?.querySelectorAll('[data-testid="form-field"]')).toHaveLength(3)
  })

  it('emits change with the edited data', async () => {
    const { container, emitted } = renderForm({ schema, uischema: stringsLayout, data: {} })
    await screen.findByTestId('form-renderer')

    await fireEvent.update(inputIn(fieldByPath(container, '/name'))!, 'Grace')

    await waitFor(() => {
      const events = emitted<[{ data: { name?: string } }]>('change')
      expect(events.at(-1)?.[0].data.name).toBe('Grace')
    })
  })

  it('renders the label and the input inside the field wrapper', async () => {
    const { container } = renderForm({ schema, uischema: stringsLayout, data: {} })
    await screen.findByTestId('form-renderer')

    const field = fieldByPath(container, '/name')
    expect(field?.querySelector('label')?.textContent).toBe('Name')
    expect(inputIn(field)).toBeTruthy()
  })
})

describe('FormRenderer — fallbacks', () => {
  it('renders a muted line for an unknown element and keeps the rest usable', async () => {
    const uischema = { type: 'VerticalLayout', elements: [control('name'), { type: 'Bogus' }] }
    const { container } = renderForm({ schema, uischema, data: {} })

    expect(await screen.findByText('chat.forms.unsupportedElement')).toBeTruthy()
    expect(inputIn(fieldByPath(container, '/name'))).toBeTruthy()
  })

  it('renders an array control through the vanilla renderers', async () => {
    const { container } = renderForm({
      schema,
      uischema: control('contacts'),
      data: { contacts: [] },
    })
    await screen.findByTestId('form-renderer')

    await waitFor(() => expect(container.querySelector('.array-list')).toBeTruthy())
  })

  it('generates a layout when the uischema is null', async () => {
    const { container } = renderForm({ schema, uischema: null, data: {} })
    await screen.findByTestId('form-renderer')

    await waitFor(() => expect(inputIn(fieldByPath(container, '/name'))).toBeTruthy())
  })
})

describe('FormRenderer — readonly and validation', () => {
  it('disables every input when readonly', async () => {
    const { container } = renderForm({ schema, uischema: stringsLayout, data: {}, readonly: true })
    await screen.findByTestId('form-renderer')

    const inputs = container.querySelectorAll('input')
    expect(inputs.length).toBe(3)
    inputs.forEach((input) => expect(input.disabled).toBe(true))
  })

  it('hides errors until showErrors is set, then shows the translated required message', async () => {
    const { container, rerender } = renderForm({ schema, uischema: stringsLayout, data: {} })
    await screen.findByTestId('form-renderer')

    expect(screen.queryByTestId('form-field-error')).toBeNull()

    await rerender({ schema, uischema: stringsLayout, data: {}, showErrors: true })

    await waitFor(() => {
      const error = fieldByPath(container, '/name')?.querySelector(
        '[data-testid="form-field-error"]',
      )
      expect(error?.textContent).toBe('chat.forms.validation.required')
    })
    expect(
      fieldByPath(container, '/email')?.querySelector('[data-testid="form-field-error"]'),
    ).toBeNull()
  })

  const i18nMock = useI18n as unknown as Mock
  const originalI18n = i18nMock.getMockImplementation()

  afterEach(() => {
    i18nMock.mockImplementation(originalI18n!)
  })

  it('passes ajv limit params to the translated message', async () => {
    i18nMock.mockImplementation(() => ({
      ...(originalI18n?.() as Record<string, unknown>),
      t: (key: string, params?: Record<string, string>) =>
        params ? `${key}:${JSON.stringify(params)}` : key,
    }))

    const minLengthSchema = {
      type: 'object',
      properties: { name: { type: 'string', minLength: 3 } },
    }
    const { container } = renderForm({
      schema: minLengthSchema,
      uischema: control('name'),
      data: { name: 'ab' },
      showErrors: true,
    })
    await screen.findByTestId('form-renderer')

    await waitFor(() => {
      const error = fieldByPath(container, '/name')?.querySelector(
        '[data-testid="form-field-error"]',
      )
      expect(error?.textContent).toBe('chat.forms.validation.minLength:{"limit":"3"}')
    })
  })
})
