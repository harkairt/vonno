import { describe, it, expect } from 'vitest'
import { fireEvent, waitFor } from '@testing-library/vue'
import { tester as dateTester } from '~/components/forms/renderers/DateControl.vue'
import { tester as timeTester } from '~/components/forms/renderers/TimeControl.vue'
import { tester as dateTimeTester } from '~/components/forms/renderers/DateTimeControl.vue'
import { tester as stringTester } from '~/components/forms/renderers/StringControl.vue'
import { control, errorIn, fieldByPath, lastChangeData, rank, renderForm } from './harness'

const schema = {
  type: 'object',
  required: ['foundedOn', 'openingTime', 'kickoff'],
  properties: {
    foundedOn: { type: 'string', format: 'date', description: 'Founding date' },
    openingTime: { type: 'string', format: 'time' },
    kickoff: { type: 'string', format: 'date-time' },
    name: { type: 'string' },
  },
}

type Data = { foundedOn?: string; openingTime?: string; kickoff?: string }

const inputIn = (container: HTMLElement, pointer: string) =>
  fieldByPath(container, pointer)?.querySelector<HTMLInputElement>('input') ?? null

describe('date/time testers', () => {
  it('each claims only its own format', () => {
    expect(rank(dateTester, control('foundedOn'), schema)).toBe(10)
    expect(rank(dateTester, control('openingTime'), schema)).toBe(-1)
    expect(rank(dateTester, control('kickoff'), schema)).toBe(-1)

    expect(rank(timeTester, control('openingTime'), schema)).toBe(10)
    expect(rank(timeTester, control('foundedOn'), schema)).toBe(-1)

    expect(rank(dateTimeTester, control('kickoff'), schema)).toBe(10)
    expect(rank(dateTimeTester, control('foundedOn'), schema)).toBe(-1)
    expect(rank(dateTimeTester, control('name'), schema)).toBe(-1)
  })

  it('leaves no rank-10 tie with StringControl', () => {
    expect(rank(stringTester, control('foundedOn'), schema)).toBe(-1)
    expect(rank(stringTester, control('openingTime'), schema)).toBe(-1)
    expect(rank(stringTester, control('kickoff'), schema)).toBe(-1)
    expect(rank(stringTester, control('name'), schema)).toBe(10)
  })
})

describe('DateControl', () => {
  it('renders a date input carrying the ISO date and writes it back', async () => {
    const { container, emitted } = await renderForm({
      schema,
      uischema: control('foundedOn'),
      data: { foundedOn: '2020-03-15' },
    })

    const field = fieldByPath(container, '/foundedOn')
    expect(field?.dataset.label).toBe('Founded On')
    expect(field?.dataset.required).toBe('true')
    expect(field?.textContent).toContain('Founding date')
    const input = inputIn(container, '/foundedOn')!
    expect(input.type).toBe('date')
    expect(input.value).toBe('2020-03-15')

    await fireEvent.update(input, '2021-12-01')
    await waitFor(() => expect(lastChangeData<Data>(emitted)?.foundedOn).toBe('2021-12-01'))

    await fireEvent.update(input, '')
    await waitFor(() => expect(lastChangeData<Data>(emitted)?.foundedOn).toBeUndefined())
  })

  it('is disabled when readonly and shows the error only when showErrors is set', async () => {
    const uischema = control('foundedOn')
    const readonly = await renderForm({ schema, uischema, data: {}, readonly: true })
    expect(inputIn(readonly.container, '/foundedOn')?.disabled).toBe(true)
    readonly.unmount()

    const { container, rerender } = await renderForm({ schema, uischema, data: {} })
    expect(errorIn(fieldByPath(container, '/foundedOn'))).toBeNull()
    await rerender({ schema, uischema, data: {}, showErrors: true })
    await waitFor(() =>
      expect(errorIn(fieldByPath(container, '/foundedOn'))?.textContent).toBe(
        'chat.forms.validation.required',
      ),
    )
  })
})

describe('TimeControl', () => {
  it('shows HH:mm and stores a full HH:mm:ss time', async () => {
    const { container, emitted } = await renderForm({
      schema,
      uischema: control('openingTime'),
      data: { openingTime: '08:30:00' },
    })

    const input = inputIn(container, '/openingTime')!
    expect(input.type).toBe('time')
    expect(input.value).toBe('08:30')

    await fireEvent.update(input, '17:45')
    await waitFor(() => expect(lastChangeData<Data>(emitted)?.openingTime).toBe('17:45:00'))

    await fireEvent.update(input, '')
    await waitFor(() => expect(lastChangeData<Data>(emitted)?.openingTime).toBeUndefined())
  })

  it('is disabled when readonly', async () => {
    const { container } = await renderForm({
      schema,
      uischema: control('openingTime'),
      data: {},
      readonly: true,
    })
    expect(inputIn(container, '/openingTime')?.disabled).toBe(true)
  })
})

describe('DateTimeControl', () => {
  it('round-trips ISO 8601 without offset through a datetime-local input', async () => {
    const { container, emitted } = await renderForm({
      schema,
      uischema: control('kickoff'),
      data: { kickoff: '2026-09-16T10:30:00' },
    })

    const input = inputIn(container, '/kickoff')!
    expect(input.type).toBe('datetime-local')
    expect(input.value).toBe('2026-09-16T10:30')

    await fireEvent.update(input, '2026-09-17T08:15')
    await waitFor(() => expect(lastChangeData<Data>(emitted)?.kickoff).toBe('2026-09-17T08:15:00'))
    expect(input.value).toBe('2026-09-17T08:15')

    await fireEvent.update(input, '')
    await waitFor(() => expect(lastChangeData<Data>(emitted)?.kickoff).toBeUndefined())
  })

  it('drops a trailing offset when displaying and never adds one when writing', async () => {
    const { container } = await renderForm({
      schema,
      uischema: control('kickoff'),
      data: { kickoff: '2026-09-16T10:30:00+02:00' },
    })

    expect(inputIn(container, '/kickoff')?.value).toBe('2026-09-16T10:30')
  })

  it('is disabled when readonly', async () => {
    const { container } = await renderForm({
      schema,
      uischema: control('kickoff'),
      data: {},
      readonly: true,
    })
    expect(inputIn(container, '/kickoff')?.disabled).toBe(true)
  })
})
