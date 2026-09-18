import { describe, it, expect } from 'vitest'
import { fireEvent, waitFor } from '@testing-library/vue'
import { tester } from '~/components/forms/renderers/NumberControl.vue'
import { tester as enumTester } from '~/components/forms/renderers/EnumControl.vue'
import { control, errorIn, fieldByPath, lastChangeData, rank, renderForm } from './harness'

const schema = {
  type: 'object',
  required: ['headcount'],
  properties: {
    headcount: { type: 'integer', minimum: 0, maximum: 10000 },
    revenue: { type: 'number', minimum: 0 },
    rating: { type: 'integer', enum: [1, 2, 3] },
    tier: {
      type: 'number',
      oneOf: [
        { const: 0.5, title: 'Half' },
        { const: 1, title: 'Full' },
      ],
    },
    name: { type: 'string' },
  },
}

describe('NumberControl — tester', () => {
  it('matches integer and number controls but not strings', () => {
    expect(rank(tester, control('headcount'), schema)).toBe(10)
    expect(rank(tester, control('revenue'), schema)).toBe(10)
    expect(rank(tester, control('name'), schema)).toBe(-1)
  })

  it('leaves numeric enums to EnumControl', () => {
    expect(rank(tester, control('rating'), schema)).toBe(-1)
    expect(rank(tester, control('tier'), schema)).toBe(-1)
    expect(rank(enumTester, control('rating'), schema)).toBe(10)
    expect(rank(enumTester, control('tier'), schema)).toBe(10)
  })
})

describe('NumberControl — rendering', () => {
  it('renders a UInputNumber with step 1 and the schema bounds for integers', async () => {
    const { container } = await renderForm({
      schema,
      uischema: control('headcount'),
      data: { headcount: 12 },
    })

    const field = fieldByPath(container, '/headcount')
    expect(field?.dataset.label).toBe('Headcount')
    const input = field?.querySelector<HTMLInputElement>('input[type="number"]')
    expect(input?.value).toBe('12')
    expect(input?.step).toBe('1')
    expect(input?.min).toBe('0')
    expect(input?.max).toBe('10000')
  })

  it('lets numbers keep their decimals', async () => {
    const { container } = await renderForm({ schema, uischema: control('revenue'), data: {} })

    const input = fieldByPath(container, '/revenue')?.querySelector<HTMLInputElement>('input')
    expect(input?.step).toBe('')
    expect(input?.dataset.stepSnapping).toBe('false')
    expect(input?.min).toBe('0')
    expect(input?.max).toBe('')
  })

  it('writes a number and clears to undefined when emptied', async () => {
    const { container, emitted } = await renderForm({
      schema,
      uischema: control('headcount'),
      data: { headcount: 3 },
    })
    const input = fieldByPath(container, '/headcount')!.querySelector('input')!

    await fireEvent.update(input, '42')
    await waitFor(() => expect(lastChangeData<{ headcount?: number }>(emitted)?.headcount).toBe(42))

    await fireEvent.update(input, '')
    await waitFor(() =>
      expect(lastChangeData<{ headcount?: number }>(emitted)?.headcount).toBeUndefined(),
    )
  })

  it('is disabled when the form is readonly', async () => {
    const { container } = await renderForm({
      schema,
      uischema: control('headcount'),
      data: {},
      readonly: true,
    })

    expect(fieldByPath(container, '/headcount')?.querySelector('input')?.disabled).toBe(true)
  })

  it('shows the error only when showErrors is set', async () => {
    const uischema = control('headcount')
    const { container, rerender } = await renderForm({ schema, uischema, data: {} })
    expect(errorIn(fieldByPath(container, '/headcount'))).toBeNull()

    await rerender({ schema, uischema, data: {}, showErrors: true })
    await waitFor(() =>
      expect(errorIn(fieldByPath(container, '/headcount'))?.textContent).toBe(
        'chat.forms.validation.required',
      ),
    )
  })
})
