import { describe, it, expect } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/vue'
import type { Component } from 'vue'
import { delay } from 'msw'
import { renderWithProviders } from '@/tests/utils/render'
import { seedAuthStorage } from '@/tests/utils/authSeed'
import { server, http } from '@/tests/msw/server'
import { apiOk, apiError } from '@/tests/msw/http'
import {
  FORM_FIXTURE_AGENT_ID,
  FORM_FIXTURE_SESSION_ID,
  OPEN_FORM_INSTANCE_ID,
  SUBMITTED_FORM_INSTANCE_ID,
  CANCELLED_FORM_INSTANCE_ID,
  DELETED_FORM_INSTANCE_ID,
  sessionFormSummaries,
} from '@/tests/msw/handlers/form'
import { formQueryKeys } from '~/composables/useFormQueries'
import FormCard from '~/components/chat/FormCard.vue'

const GET_SESSION_FORMS = '/api/Form/GetSessionForms'

const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-name="name" />' },
  USkeleton: {
    name: 'USkeleton',
    inheritAttrs: false,
    template: '<div v-bind="$attrs" data-testid="form-card-skeleton" />',
  },
  UBadge: {
    name: 'UBadge',
    props: ['label', 'color'],
    template: '<span data-testid="form-status" :data-color="color">{{ label }}</span>',
  },
  UButton: {
    name: 'UButton',
    inheritAttrs: false,
    props: ['label', 'trailingIcon'],
    template:
      '<span v-bind="$attrs" data-testid="form-cta" :data-trailing-icon="trailingIcon">{{ label }}</span>',
  },
}

function renderCard(props: Record<string, unknown> = {}) {
  seedAuthStorage()
  return renderWithProviders(FormCard as Component, {
    props: {
      instanceId: OPEN_FORM_INSTANCE_ID,
      sessionId: FORM_FIXTURE_SESSION_ID,
      agentId: FORM_FIXTURE_AGENT_ID,
      ...props,
    },
    global: { stubs },
  })
}

function serveList(selectedInstanceId: string | null) {
  server.use(
    http.post(GET_SESSION_FORMS, () => apiOk({ forms: sessionFormSummaries, selectedInstanceId })),
  )
}

async function findCard() {
  return screen.findByRole('button')
}

describe('FormCard — states', () => {
  it('shows a skeleton while the list is loading', async () => {
    server.use(
      http.post(GET_SESSION_FORMS, async () => {
        await delay(200)
        return apiOk({ forms: sessionFormSummaries, selectedInstanceId: null })
      }),
    )
    renderCard()

    expect(screen.getByTestId('form-card-skeleton')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()

    await findCard()
    expect(screen.queryByTestId('form-card-skeleton')).toBeNull()
  })

  it('shows a notice instead of a skeleton when there is no resolvable session agent', () => {
    renderCard({ agentId: undefined })

    expect(screen.getByText('chat.forms.noAgent')).toBeTruthy()
    expect(screen.queryByTestId('form-card-skeleton')).toBeNull()
  })

  it('renders an open form as one accessible button with name, status and call to action', async () => {
    renderCard({ instanceId: OPEN_FORM_INSTANCE_ID })

    const card = await findCard()
    expect(card.getAttribute('tabindex')).toBe('0')
    expect(card.getAttribute('aria-label')).toBe(
      'Partner rögzítés, chat.forms.status.open, chat.forms.open',
    )
    expect(screen.getByText('Partner rögzítés')).toBeTruthy()

    const status = screen.getByTestId('form-status')
    expect(status.textContent).toBe('chat.forms.status.open')
    expect(status.getAttribute('data-color')).toBe('primary')

    const cta = screen.getByTestId('form-cta')
    expect(cta.textContent).toBe('chat.forms.open')
    expect(cta.getAttribute('data-trailing-icon')).toBe('i-heroicons-arrow-right')
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('renders a submitted form with the success badge', async () => {
    renderCard({ instanceId: SUBMITTED_FORM_INSTANCE_ID })

    await findCard()
    expect(screen.getByText('Ajánlatkérés')).toBeTruthy()
    const status = screen.getByTestId('form-status')
    expect(status.textContent).toBe('chat.forms.status.submitted')
    expect(status.getAttribute('data-color')).toBe('success')
  })

  it('renders a cancelled form without a name as untitled with the neutral badge', async () => {
    renderCard({ instanceId: CANCELLED_FORM_INSTANCE_ID })

    await findCard()
    expect(screen.getByText('chat.forms.untitled')).toBeTruthy()
    const status = screen.getByTestId('form-status')
    expect(status.textContent).toBe('chat.forms.status.cancelled')
    expect(status.getAttribute('data-color')).toBe('neutral')
  })

  it('shows the marker dot only for the selected open form', async () => {
    serveList(OPEN_FORM_INSTANCE_ID)
    renderCard({ instanceId: OPEN_FORM_INSTANCE_ID })

    await findCard()
    expect(screen.getByRole('img', { name: 'chat.forms.agentSelected' })).toBeTruthy()
  })

  it('hides the marker dot when the marker points elsewhere', async () => {
    renderCard({ instanceId: OPEN_FORM_INSTANCE_ID })

    await findCard()
    expect(screen.queryByRole('img', { name: 'chat.forms.agentSelected' })).toBeNull()
  })

  it('hides the marker dot on a selected form that is not open', async () => {
    serveList(SUBMITTED_FORM_INSTANCE_ID)
    renderCard({ instanceId: SUBMITTED_FORM_INSTANCE_ID })

    await findCard()
    expect(screen.queryByRole('img', { name: 'chat.forms.agentSelected' })).toBeNull()
  })

  it('shows the deleted text when the id is not in the list', async () => {
    renderCard({ instanceId: DELETED_FORM_INSTANCE_ID })

    await screen.findByText('chat.forms.deleted')
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByTestId('form-card-skeleton')).toBeNull()
  })

  it('shows the unavailable text when the list query fails', async () => {
    server.use(http.post(GET_SESSION_FORMS, () => apiError(404, 'NOT_FOUND', 'gone')))
    renderCard()

    await screen.findByText('chat.forms.unavailable')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('keeps the cached form interactive with an out-of-date hint after a failed refetch', async () => {
    const { queryClient } = renderCard({ instanceId: OPEN_FORM_INSTANCE_ID })
    await findCard()
    expect(screen.getByText('Partner rögzítés')).toBeTruthy()

    server.use(http.post(GET_SESSION_FORMS, () => apiError(404, 'NOT_FOUND', 'gone')))
    await queryClient.invalidateQueries({ queryKey: formQueryKeys.list(FORM_FIXTURE_SESSION_ID) })

    await screen.findByText('chat.forms.staleHint')
    expect(screen.getByRole('button')).toBeTruthy()
    expect(screen.getByText('Partner rögzítés')).toBeTruthy()
    expect(screen.queryByText('chat.forms.unavailable')).toBeNull()
  })
})

describe('FormCard — fallbackName', () => {
  it('names the deleted state when the id is not in the list', async () => {
    renderCard({ instanceId: DELETED_FORM_INSTANCE_ID, fallbackName: 'Partner rögzítés' })

    await screen.findByText('chat.forms.deletedNamed')
    expect(screen.queryByText('chat.forms.deleted')).toBeNull()
  })

  it('names the unavailable state when the list query fails', async () => {
    server.use(http.post(GET_SESSION_FORMS, () => apiError(404, 'NOT_FOUND', 'gone')))
    renderCard({ fallbackName: 'Partner rögzítés' })

    await screen.findByText('chat.forms.unavailableNamed')
    expect(screen.queryByText('chat.forms.unavailable')).toBeNull()
  })

  it('keeps the unnamed text when there is no fallback name', async () => {
    renderCard({ instanceId: DELETED_FORM_INSTANCE_ID, fallbackName: null })

    expect(await screen.findByText('chat.forms.deleted')).toBeTruthy()
  })

  it('prefers the list name over the fallback name for a listed form', async () => {
    renderCard({ instanceId: OPEN_FORM_INSTANCE_ID, fallbackName: 'Stale name' })

    await findCard()
    expect(screen.getByText('Partner rögzítés')).toBeTruthy()
    expect(screen.queryByText('Stale name')).toBeNull()
  })
})

describe('FormCard — openForm', () => {
  it('emits openForm on click', async () => {
    const { emitted } = renderCard()
    const card = await findCard()

    await fireEvent.click(card)

    expect(emitted().openForm).toEqual([[OPEN_FORM_INSTANCE_ID]])
  })

  it('emits openForm on Enter and Space', async () => {
    const { emitted } = renderCard({ instanceId: SUBMITTED_FORM_INSTANCE_ID })
    const card = await findCard()

    await fireEvent.keyDown(card, { key: 'Enter' })
    await fireEvent.keyDown(card, { key: ' ' })
    await fireEvent.keyDown(card, { key: 'a' })

    await waitFor(() =>
      expect(emitted().openForm).toEqual([
        [SUBMITTED_FORM_INSTANCE_ID],
        [SUBMITTED_FORM_INSTANCE_ID],
      ]),
    )
  })
})
