import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/vue'
import type { Component } from 'vue'
import { renderWithProviders } from '@/tests/utils/render'
import { useJsonForms } from '@/app/composables/useJsonForms'
import FormRenderer from '~/components/forms/FormRenderer.vue'

vi.mock('@/app/composables/useJsonForms', () => ({ useJsonForms: vi.fn() }))

const loadJsonForms = vi.fn()

beforeEach(() => {
  vi.mocked(useJsonForms).mockReturnValue({ loadJsonForms })
})

const stubs = {
  UButton: {
    name: 'UButton',
    inheritAttrs: false,
    template: '<button v-bind="$attrs"><slot /></button>',
  },
}

describe('FormRenderer — load failure', () => {
  it('shows the unavailable notice when the libraries fail to load', async () => {
    loadJsonForms.mockRejectedValueOnce(new Error('offline'))

    renderWithProviders(FormRenderer as Component, {
      props: { schema: { type: 'object' }, data: {} },
      global: { stubs },
    })

    expect(await screen.findByText('chat.forms.unavailable')).toBeTruthy()
    expect(screen.queryByTestId('form-renderer-skeleton')).toBeNull()
    expect(screen.queryByTestId('form-renderer')).toBeNull()
  })

  it('offers a try-again button that reloads the bundle and renders the form once it succeeds', async () => {
    loadJsonForms.mockRejectedValueOnce(new Error('offline'))
    loadJsonForms.mockResolvedValueOnce({
      JsonForms: { name: 'StubJsonForms', template: '<div />' },
      renderers: [],
      ajv: {},
    })

    renderWithProviders(FormRenderer as Component, {
      props: { schema: { type: 'object' }, data: {} },
      global: { stubs },
    })

    await screen.findByText('chat.forms.unavailable')

    await fireEvent.click(screen.getByRole('button', { name: 'errors.tryAgain' }))

    expect(await screen.findByTestId('form-renderer')).toBeTruthy()
    expect(screen.queryByText('chat.forms.unavailable')).toBeNull()
    expect(loadJsonForms).toHaveBeenCalledTimes(2)
  })
})
