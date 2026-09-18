import { describe, it, expect } from 'vitest'
import { within } from '@testing-library/vue'
import { openFormSchema, openFormUiSchema } from '@/tests/msw/handlers/form'
import { renderForm } from './harness'

const customFieldPaths = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-form-path]')).map(
    (el) => el.dataset.formPath,
  )

describe('MSW fixture Open form', () => {
  it('renders every control through a custom renderer except the array', async () => {
    const { container } = await renderForm({
      schema: openFormSchema,
      uischema: openFormUiSchema,
      data: {},
    })

    expect(
      within(container)
        .getAllByTestId('tab-trigger')
        .map((el) => el.textContent?.trim()),
    ).toEqual(['Company', 'Schedule'])
    expect(container.querySelector('.categorization')).toBeNull()
    expect(customFieldPaths(container)).toEqual([
      '/company/name',
      '/company/taxId',
      '/company/email',
      '/company/website',
      '/notes',
      '/headcount',
      '/revenue',
      '/active',
      '/newsletter',
      '/industry',
      '/priority',
      '/foundedOn',
      '/openingTime',
      '/kickoff',
    ])
    expect(container.querySelector('.array-list')).not.toBeNull()
    expect(container.querySelectorAll('.control')).toHaveLength(0)
  })
})
