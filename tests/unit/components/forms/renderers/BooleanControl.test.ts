import { describe, it, expect } from 'vitest'
import { fireEvent, waitFor } from '@testing-library/vue'
import { tester } from '~/components/forms/renderers/BooleanControl.vue'
import { control, errorIn, fieldByPath, lastChangeData, rank, renderForm } from './harness'

const schema = {
  type: 'object',
  required: ['active'],
  properties: {
    active: { type: 'boolean', description: 'Is the partner active?' },
    newsletter: { type: 'boolean' },
    name: { type: 'string' },
  },
}

describe('BooleanControl — tester', () => {
  it('matches boolean controls only', () => {
    expect(rank(tester, control('active'), schema)).toBe(10)
    expect(rank(tester, control('name'), schema)).toBe(-1)
  })
})

describe('BooleanControl — rendering', () => {
  it('renders a UCheckbox carrying the label itself, not the field', async () => {
    const { container } = await renderForm({
      schema,
      uischema: control('active'),
      data: { active: true },
    })

    const field = fieldByPath(container, '/active')
    expect(field?.dataset.label).toBeUndefined()
    expect(field?.querySelector('[data-testid="form-field-description"]')?.textContent).toBe(
      'Is the partner active?',
    )

    const checkbox = field?.querySelector<HTMLElement>('[data-testid="checkbox"]')
    expect(checkbox?.textContent).toContain('Active')
    expect(checkbox?.dataset.required).toBe('true')
    expect(checkbox?.querySelector('input')?.checked).toBe(true)
    expect(field?.querySelector('[data-testid="switch"]')).toBeNull()
  })

  it('renders a USwitch when options.toggle is set', async () => {
    const { container } = await renderForm({
      schema,
      uischema: control('newsletter', { toggle: true }),
      data: {},
    })

    const field = fieldByPath(container, '/newsletter')
    expect(field?.querySelector('[data-testid="switch"]')?.textContent).toContain('Newsletter')
    expect(field?.querySelector('[data-testid="checkbox"]')).toBeNull()
    expect(field?.querySelector('input')?.checked).toBe(false)
  })

  it('writes true and false', async () => {
    const { container, emitted } = await renderForm({
      schema,
      uischema: control('active'),
      data: {},
    })
    const input = fieldByPath(container, '/active')!.querySelector('input')!

    await fireEvent.click(input)
    await waitFor(() => expect(lastChangeData<{ active?: boolean }>(emitted)?.active).toBe(true))

    await fireEvent.click(input)
    await waitFor(() => expect(lastChangeData<{ active?: boolean }>(emitted)?.active).toBe(false))
  })

  it('is disabled when the form is readonly', async () => {
    const { container } = await renderForm({
      schema,
      uischema: control('active'),
      data: {},
      readonly: true,
    })

    expect(fieldByPath(container, '/active')?.querySelector('input')?.disabled).toBe(true)
  })

  it('shows the error only when showErrors is set', async () => {
    const uischema = control('active')
    const { container, rerender } = await renderForm({ schema, uischema, data: {} })
    expect(errorIn(fieldByPath(container, '/active'))).toBeNull()

    await rerender({ schema, uischema, data: {}, showErrors: true })
    await waitFor(() =>
      expect(errorIn(fieldByPath(container, '/active'))?.textContent).toBe(
        'chat.forms.validation.required',
      ),
    )
  })
})
