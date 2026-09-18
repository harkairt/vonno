import { describe, it, expect } from 'vitest'
import { fireEvent, waitFor } from '@testing-library/vue'
import { tester } from '~/components/forms/renderers/EnumControl.vue'
import { control, errorIn, fieldByPath, lastChangeData, rank, renderForm } from './harness'

const schema = {
  type: 'object',
  required: ['industry'],
  properties: {
    industry: { type: 'string', enum: ['IT', 'Retail', 'Manufacturing'] },
    priority: {
      type: 'string',
      description: 'How urgent is it?',
      oneOf: [
        { const: 'low', title: 'Low' },
        { const: 'normal', title: 'Normal' },
        { const: 'high', title: 'High' },
      ],
    },
    name: { type: 'string' },
    kind: { type: 'string', const: 'partner' },
  },
}

const optionsOf = (field: HTMLElement | null) =>
  Array.from(field?.querySelectorAll('option') ?? []).map((o) => o.textContent?.trim())

describe('EnumControl — tester', () => {
  it('matches enum and oneOf-enum controls but not plain strings', () => {
    expect(rank(tester, control('industry'), schema)).toBe(10)
    expect(rank(tester, control('priority'), schema)).toBe(10)
    expect(rank(tester, control('name'), schema)).toBe(-1)
  })

  it('claims const controls and offers the const as the single option', async () => {
    expect(rank(tester, control('kind'), schema)).toBe(10)

    const { container, emitted } = await renderForm({
      schema,
      uischema: control('kind'),
      data: {},
    })

    const field = fieldByPath(container, '/kind')
    expect(optionsOf(field)).toEqual(['chat.forms.noSelection', 'partner'])

    await fireEvent.update(field!.querySelector('select')!, 'partner')
    await waitFor(() => expect(lastChangeData<{ kind?: string }>(emitted)?.kind).toBe('partner'))
  })
})

describe('EnumControl — select', () => {
  it('renders a USelect with the enum values and no empty item when required', async () => {
    const { container } = await renderForm({
      schema,
      uischema: control('industry'),
      data: { industry: 'Retail' },
    })

    const field = fieldByPath(container, '/industry')
    expect(field?.dataset.label).toBe('Industry')
    expect(field?.dataset.required).toBe('true')
    expect(optionsOf(field)).toEqual(['IT', 'Retail', 'Manufacturing'])
    expect(field?.querySelector('select')?.value).toBe('Retail')
  })

  it('offers an empty item for optional oneOf enums and writes undefined for it', async () => {
    const { container, emitted } = await renderForm({
      schema,
      uischema: control('priority'),
      data: { priority: 'high' },
    })

    const field = fieldByPath(container, '/priority')
    expect(field?.textContent).toContain('How urgent is it?')
    expect(optionsOf(field)).toEqual(['chat.forms.noSelection', 'Low', 'Normal', 'High'])
    const select = field!.querySelector('select')!
    expect(select.value).toBe('high')

    await fireEvent.update(select, 'low')
    await waitFor(() =>
      expect(lastChangeData<{ priority?: string }>(emitted)?.priority).toBe('low'),
    )

    await fireEvent.update(select, select.options[0]!.value)
    await waitFor(() =>
      expect(lastChangeData<{ priority?: string }>(emitted)?.priority).toBeUndefined(),
    )
  })

  it('is disabled when the form is readonly', async () => {
    const { container } = await renderForm({
      schema,
      uischema: control('industry'),
      data: {},
      readonly: true,
    })

    expect(fieldByPath(container, '/industry')?.querySelector('select')?.disabled).toBe(true)
  })

  it('shows the error only when showErrors is set', async () => {
    const uischema = control('industry')
    const { container, rerender } = await renderForm({ schema, uischema, data: {} })
    expect(errorIn(fieldByPath(container, '/industry'))).toBeNull()

    await rerender({ schema, uischema, data: {}, showErrors: true })
    await waitFor(() =>
      expect(errorIn(fieldByPath(container, '/industry'))?.textContent).toBe(
        'chat.forms.validation.required',
      ),
    )
  })
})

describe('EnumControl — radio', () => {
  it('renders a URadioGroup with oneOf titles when options.format is radio', async () => {
    const { container, emitted } = await renderForm({
      schema,
      uischema: control('priority', { format: 'radio' }),
      data: { priority: 'normal' },
    })

    const field = fieldByPath(container, '/priority')
    expect(field?.querySelector('select')).toBeNull()
    const radios = Array.from(field!.querySelectorAll<HTMLInputElement>('input[type="radio"]'))
    expect(radios.map((r) => r.parentElement?.textContent?.trim())).toEqual([
      'chat.forms.noSelection',
      'Low',
      'Normal',
      'High',
    ])
    expect(radios.find((r) => r.checked)?.value).toBe('normal')

    await fireEvent.click(radios[3]!)
    await waitFor(() =>
      expect(lastChangeData<{ priority?: string }>(emitted)?.priority).toBe('high'),
    )
  })

  it('is disabled when the form is readonly', async () => {
    const { container } = await renderForm({
      schema,
      uischema: control('priority', { format: 'radio' }),
      data: {},
      readonly: true,
    })

    expect(
      fieldByPath(container, '/priority')?.querySelector<HTMLFieldSetElement>('fieldset')?.disabled,
    ).toBe(true)
  })
})
