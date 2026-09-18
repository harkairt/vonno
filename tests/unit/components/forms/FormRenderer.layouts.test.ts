import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/vue'
import type { Component } from 'vue'
import { renderWithProviders } from '@/tests/utils/render'
import FormRenderer from '~/components/forms/FormRenderer.vue'

const stubs = {
  UFormField: {
    name: 'UFormField',
    props: ['label'],
    template: '<div data-testid="form-field" :data-label="label"><slot /></div>',
  },
  UInput: {
    name: 'UInput',
    props: ['modelValue'],
    template: '<input v-bind="$attrs" :value="modelValue" />',
  },
  UTabs: {
    name: 'UTabs',
    props: ['items', 'ui', 'modelValue'],
    template: `
      <div v-bind="$attrs" :data-active="modelValue">
        <button
          v-for="item in items"
          :key="item.value"
          type="button"
          data-testid="tab-trigger"
          :data-value="item.value"
          :class="ui?.trigger"
        >
          {{ item.label }}
        </button>
        <div v-for="item in items" :key="item.value" data-testid="tab-panel">
          <slot name="content" :item="item" />
        </div>
      </div>`,
  },
}

const schema = {
  type: 'object',
  properties: {
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    city: { type: 'string' },
    note: { type: 'string' },
  },
}

const control = (property: string) => ({ type: 'Control', scope: `#/properties/${property}` })

const horizontal = (...properties: string[]) => ({
  type: 'HorizontalLayout',
  elements: properties.map(control),
})

const group = (label: string, ...elements: Record<string, unknown>[]) => ({
  type: 'Group',
  label,
  elements,
})

const categorization = {
  type: 'Categorization',
  elements: [
    {
      type: 'Category',
      label: 'Person',
      elements: [group('Name', horizontal('firstName', 'lastName')), control('city')],
    },
    { type: 'Category', label: 'Extra', elements: [control('note')] },
  ],
}

const VANILLA_LAYOUT_SELECTOR = '.vertical-layout, .horizontal-layout, .group, .categorization'

const hideWhenNoteIs = (value: string) => ({
  effect: 'HIDE',
  condition: { scope: '#/properties/note', schema: { const: value } },
})

async function renderForm(
  uischema: Record<string, unknown>,
  readonly = false,
  data: Record<string, unknown> = {},
) {
  const result = renderWithProviders(FormRenderer as Component, {
    props: { schema, uischema, data, readonly },
    global: { stubs },
  })
  await screen.findByTestId('form-renderer')
  return result
}

const fields = (root: ParentNode) => root.querySelectorAll('[data-testid="form-field"]')

describe('FormRenderer — HorizontalLayout', () => {
  it('renders the children in a grid with one column per element', async () => {
    const { container } = await renderForm(horizontal('firstName', 'lastName', 'city'))

    const grid = container.querySelector<HTMLElement>('[data-testid="horizontal-layout"]')
    expect(grid?.classList.contains('grid')).toBe(true)
    expect(grid?.getAttribute('style')).toContain('repeat(3, minmax(0, 1fr))')
    expect(fields(grid!)).toHaveLength(3)
  })
})

describe('FormRenderer — Group', () => {
  it('renders a card with the label as heading and the children below', async () => {
    const { container } = await renderForm(group('Address', control('city'), control('note')))

    const card = container.querySelector<HTMLElement>('[data-testid="group-layout"]')
    expect(card?.querySelector('h3')?.textContent?.trim()).toBe('Address')
    expect(card?.className).toContain('bg-[hsl(var(--card))]')
    expect(card?.className).toContain('border')
    expect(fields(card!)).toHaveLength(2)
  })

  it('omits the heading when the group has no label', async () => {
    const { container } = await renderForm({ type: 'Group', elements: [control('city')] })

    const card = container.querySelector<HTMLElement>('[data-testid="group-layout"]')
    expect(card?.querySelector('h3')).toBeNull()
    expect(fields(card!)).toHaveLength(1)
  })

  it('renders nothing when a rule hides the group', async () => {
    const { container } = await renderForm(
      { ...group('Address', control('city')), rule: hideWhenNoteIs('hide') },
      false,
      { note: 'hide' },
    )

    expect(container.querySelector('[data-testid="group-layout"]')).toBeNull()
    expect(fields(container)).toHaveLength(0)
  })
})

describe('FormRenderer — Categorization', () => {
  it('renders one tab per category with the category elements inside', async () => {
    await renderForm(categorization)

    const triggers = screen.getAllByTestId('tab-trigger').map((el) => el.textContent?.trim())
    expect(triggers).toEqual(['Person', 'Extra'])

    const panels = screen.getAllByTestId('tab-panel')
    expect(fields(panels[0]!)).toHaveLength(3)
    expect(fields(panels[1]!)).toHaveLength(1)
  })

  it('skips hidden categories and keeps the first visible tab as the default "0"', async () => {
    const [person, extra] = categorization.elements
    const uischema = {
      type: 'Categorization',
      elements: [{ ...person, rule: hideWhenNoteIs('hide') }, extra],
    }

    await renderForm(uischema, false, { note: 'hide' })

    const triggers = screen.getAllByTestId('tab-trigger')
    expect(triggers.map((el) => el.textContent?.trim())).toEqual(['Extra'])
    expect(triggers[0]?.dataset.value).toBe('0')
  })

  it('gives every tab trigger the 44px touch target', async () => {
    await renderForm(categorization)

    screen.getAllByTestId('tab-trigger').forEach((el) => {
      expect(el.classList.contains('min-h-11')).toBe(true)
    })
  })

  it('switches to the tab that holds the requested focus path', async () => {
    const { rerender } = await renderForm(categorization)
    const tabs = () => screen.getByTestId('categorization-layout')
    expect(tabs().dataset.active).toBe('0')

    await rerender({
      schema,
      uischema: categorization,
      data: {},
      focusRequest: { pointer: '/note', seq: 1 },
    })
    await waitFor(() => expect(tabs().dataset.active).toBe('1'))

    await rerender({
      schema,
      uischema: categorization,
      data: {},
      focusRequest: { pointer: '/lastName', seq: 2 },
    })
    await waitFor(() => expect(tabs().dataset.active).toBe('0'))
  })
})

describe('FormRenderer — combined layouts', () => {
  it('renders the nested fixture without any vanilla layout renderer', async () => {
    const { container } = await renderForm(categorization)

    expect(container.querySelector(VANILLA_LAYOUT_SELECTOR)).toBeNull()
    expect(container.querySelector('[data-testid="horizontal-layout"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="group-layout"]')).toBeTruthy()
    expect(screen.getByTestId('categorization-layout')).toBeTruthy()
    expect(fields(container)).toHaveLength(4)
  })

  it('disables every input inside the layouts when readonly', async () => {
    const { container } = await renderForm(categorization, true)

    const inputs = container.querySelectorAll('input')
    expect(inputs).toHaveLength(4)
    inputs.forEach((input) => expect(input.disabled).toBe(true))
  })
})
