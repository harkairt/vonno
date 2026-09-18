import { describe, it, expect } from 'vitest'
import { screen, fireEvent } from '@testing-library/vue'
import type { Component } from 'vue'
import { renderWithProviders } from '@/tests/utils/render'
import FormSubmitModal from '~/components/forms/FormSubmitModal.vue'

const stubs = {
  UModal: {
    name: 'UModal',
    props: ['open', 'title'],
    emits: ['update:open'],
    template:
      '<div v-if="open" data-testid="modal" :data-title="title"><slot name="content" /></div>',
  },
  UButton: {
    name: 'UButton',
    inheritAttrs: false,
    props: ['label', 'loading'],
    template: '<button v-bind="$attrs" :data-loading="loading">{{ label }}<slot /></button>',
  },
}

function renderModal(props: { open: boolean; pending?: boolean }) {
  return renderWithProviders(FormSubmitModal as Component, { props, global: { stubs } })
}

const confirmButton = () => screen.getByRole('button', { name: 'chat.forms.submitConfirm' })
const cancelButton = () => screen.getByRole('button', { name: 'chat.forms.cancel' })

describe('FormSubmitModal', () => {
  it('renders nothing while closed', () => {
    renderModal({ open: false })
    expect(screen.queryByTestId('modal')).toBeNull()
  })

  it('shows the title, body and both buttons when open', () => {
    renderModal({ open: true })
    expect(screen.getByTestId('modal').dataset.title).toBe('chat.forms.submitConfirmTitle')
    expect(screen.getByText('chat.forms.submitConfirmBody')).toBeTruthy()
    expect(confirmButton().hasAttribute('disabled')).toBe(false)
    expect(cancelButton().hasAttribute('disabled')).toBe(false)
  })

  it('emits confirm, and closes through update:open on cancel', async () => {
    const { emitted } = renderModal({ open: true })

    await fireEvent.click(confirmButton())
    expect(emitted('confirm')).toHaveLength(1)

    await fireEvent.click(cancelButton())
    expect(emitted('update:open')).toEqual([[false]])
  })

  it('disables both buttons and spins on the confirm button while pending', () => {
    renderModal({ open: true, pending: true })
    expect(confirmButton().hasAttribute('disabled')).toBe(true)
    expect(confirmButton().dataset.loading).toBe('true')
    expect(cancelButton().hasAttribute('disabled')).toBe(true)
  })
})
