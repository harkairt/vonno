import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/vue'
import { ref } from 'vue'
import type { Component } from 'vue'
import { renderWithProviders } from '@/tests/utils/render'
import { seedAuthStorage } from '@/tests/utils/authSeed'
import { useSessionForms } from '@/app/composables/useFormQueries'
import FormsPanel from '~/components/forms/FormsPanel.vue'

vi.mock('@/app/composables/useFormQueries', () => ({ useSessionForms: vi.fn() }))

const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-name="name" />' },
  USkeleton: { name: 'USkeleton', template: '<div />' },
  UAlert: {
    name: 'UAlert',
    props: ['title', 'description'],
    template: '<div role="alert">{{ title }}{{ description }}<slot name="actions" /></div>',
  },
  UButton: {
    name: 'UButton',
    inheritAttrs: false,
    template: '<button v-bind="$attrs"><slot /></button>',
  },
}

function renderPanel() {
  seedAuthStorage()
  return renderWithProviders(FormsPanel as Component, {
    props: { sessionId: 's1', agentId: 1 },
    global: { stubs },
  })
}

beforeEach(() => {
  vi.mocked(useSessionForms).mockReturnValue({
    data: ref(undefined),
    error: ref('boom'),
    isPending: ref(false),
    isFetching: ref(false),
    isError: ref(true),
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useSessionForms>)
})

describe('FormsPanel — error alert', () => {
  it('uses the friendly message helper and falls back to a translated message for a non-Error rejection', async () => {
    renderPanel()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('errors.unexpectedError')
  })
})
