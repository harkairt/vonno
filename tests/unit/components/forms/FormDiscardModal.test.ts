import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/vue'
import type { Component } from 'vue'
import FormDiscardModal from '~/components/forms/FormDiscardModal.vue'

const stubs = {
  UModal: {
    name: 'UModal',
    props: ['open', 'title', 'dismissible'],
    emits: ['update:open'],
    template:
      '<div v-if="open" role="dialog" :data-title="title" :data-dismissible="dismissible"><slot name="content" /></div>',
  },
  UButton: {
    name: 'UButton',
    inheritAttrs: false,
    props: ['label', 'loading'],
    template: '<button v-bind="$attrs" :data-loading="loading">{{ label }}<slot /></button>',
  },
}

function renderModal(props: Record<string, unknown> = {}) {
  return render(FormDiscardModal as Component, {
    props: { open: true, pending: false, ...props },
    global: { stubs },
  })
}

describe('FormDiscardModal', () => {
  it('shows the warning title and body with cancel and discard buttons', () => {
    renderModal()

    expect(screen.getByRole('dialog').dataset.title).toBe('chat.forms.discardConfirmTitle')
    expect(screen.getByRole('dialog').dataset.dismissible).toBe('true')
    expect(screen.getByText('chat.forms.discardConfirmBody')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'chat.forms.cancel' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'chat.forms.discardConfirm' })).toBeTruthy()
  })

  it('renders nothing when closed', () => {
    renderModal({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('emits update:open false on cancel and confirm on discard', async () => {
    const { emitted } = renderModal()

    await fireEvent.click(screen.getByRole('button', { name: 'chat.forms.cancel' }))
    expect(emitted()['update:open']).toEqual([[false]])
    expect(emitted().confirm).toBeUndefined()

    await fireEvent.click(screen.getByRole('button', { name: 'chat.forms.discardConfirm' }))
    expect(emitted().confirm).toHaveLength(1)
  })

  it('disables both buttons and dismissal while pending', () => {
    renderModal({ pending: true })

    expect(screen.getByRole('dialog').dataset.dismissible).toBe('false')
    const cancel = screen.getByRole<HTMLButtonElement>('button', { name: 'chat.forms.cancel' })
    const confirm = screen.getByRole<HTMLButtonElement>('button', {
      name: 'chat.forms.discardConfirm',
    })
    expect(cancel.disabled).toBe(true)
    expect(confirm.disabled).toBe(true)
    expect(confirm.dataset.loading).toBe('true')
  })
})
