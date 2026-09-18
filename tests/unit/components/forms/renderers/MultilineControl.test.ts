import { describe, it, expect } from 'vitest'
import { fireEvent, waitFor } from '@testing-library/vue'
import { tester } from '~/components/forms/renderers/MultilineControl.vue'
import { control, errorIn, fieldByPath, lastChangeData, rank, renderForm } from './harness'

const schema = {
  type: 'object',
  required: ['notes'],
  properties: { notes: { type: 'string', description: 'Free text' } },
}

const uischema = control('notes', { multi: true })

describe('MultilineControl — tester', () => {
  it('matches a control with options.multi and nothing else', () => {
    expect(rank(tester, uischema, schema)).toBe(10)
    expect(rank(tester, control('notes'), schema)).toBe(-1)
  })
})

describe('MultilineControl — rendering', () => {
  it('renders an autoresizing 3-row UTextarea inside the field', async () => {
    const { container } = await renderForm({ schema, uischema, data: { notes: 'hello' } })

    const field = fieldByPath(container, '/notes')
    expect(field?.dataset.label).toBe('Notes')
    expect(field?.dataset.required).toBe('true')
    expect(field?.textContent).toContain('Free text')

    const textarea = field?.querySelector('textarea')
    expect(textarea?.value).toBe('hello')
    expect(textarea?.getAttribute('rows')).toBe('3')
    expect(textarea?.dataset.autoresize).toBe('true')
  })

  it('writes the text and clears to undefined when emptied', async () => {
    const { container, emitted } = await renderForm({ schema, uischema, data: {} })
    const textarea = fieldByPath(container, '/notes')!.querySelector('textarea')!

    await fireEvent.update(textarea, 'line one')
    await waitFor(() => expect(lastChangeData<{ notes?: string }>(emitted)?.notes).toBe('line one'))

    await fireEvent.update(textarea, '')
    await waitFor(() => expect(lastChangeData<{ notes?: string }>(emitted)?.notes).toBeUndefined())
  })

  it('is disabled when the form is readonly', async () => {
    const { container } = await renderForm({ schema, uischema, data: {}, readonly: true })

    expect(fieldByPath(container, '/notes')?.querySelector('textarea')?.disabled).toBe(true)
  })

  it('shows the error only when showErrors is set', async () => {
    const { container, rerender } = await renderForm({ schema, uischema, data: {} })
    expect(errorIn(fieldByPath(container, '/notes'))).toBeNull()

    await rerender({ schema, uischema, data: {}, showErrors: true })
    await waitFor(() =>
      expect(errorIn(fieldByPath(container, '/notes'))?.textContent).toBe(
        'chat.forms.validation.required',
      ),
    )
  })
})
