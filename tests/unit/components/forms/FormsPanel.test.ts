import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/vue'
import { defineComponent, h, nextTick, type Component } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { renderWithProviders, createTestQueryClient } from '@/tests/utils/render'
import { delay } from 'msw'
import { seedAuthStorage } from '@/tests/utils/authSeed'
import { server, http } from '@/tests/msw/server'
import { apiOk, apiError } from '@/tests/msw/http'
import {
  FORM_FIXTURE_AGENT_ID,
  FORM_FIXTURE_SESSION_ID,
  OPEN_FORM_INSTANCE_ID,
  SUBMITTED_FORM_INSTANCE_ID,
  CANCELLED_FORM_INSTANCE_ID,
  sessionFormSummaries,
} from '@/tests/msw/handlers/form'
import { formQueryKeys } from '@/app/composables/useFormQueries'
import { useFormsStore } from '@/app/stores/forms'
import type { SessionFormSummary } from '@/types/api/schemas'
import FormsPanel from '~/components/forms/FormsPanel.vue'
import FormCard from '~/components/chat/FormCard.vue'

const GET_SESSION_FORMS = '/api/Form/GetSessionForms'

const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-name="name" />' },
  USkeleton: {
    name: 'USkeleton',
    inheritAttrs: false,
    template: '<div v-bind="$attrs" data-testid="forms-panel-skeleton" />',
  },
  UBadge: {
    name: 'UBadge',
    props: ['label', 'color'],
    template: '<span data-testid="form-status" :data-color="color">{{ label }}</span>',
  },
  UAlert: {
    name: 'UAlert',
    props: ['title', 'description'],
    template: '<div role="alert">{{ title }}{{ description }}<slot name="actions" /></div>',
  },
  UButton: {
    name: 'UButton',
    inheritAttrs: false,
    props: ['label'],
    template: '<button v-bind="$attrs">{{ label }}<slot /></button>',
  },
  UCollapsible: {
    name: 'UCollapsible',
    props: ['open'],
    template: '<div><slot /><slot v-if="open" name="content" /></div>',
  },
  UModal: {
    name: 'UModal',
    props: ['open', 'title'],
    emits: ['update:open'],
    template: '<div v-if="open" role="dialog"><slot name="content" /></div>',
  },
  FormRenderer: { name: 'FormRenderer', template: '<div data-testid="form-renderer" />' },
}

function renderPanel() {
  seedAuthStorage()
  return renderWithProviders(FormsPanel as Component, {
    props: { sessionId: FORM_FIXTURE_SESSION_ID, agentId: FORM_FIXTURE_AGENT_ID },
    global: { stubs },
  })
}

function serveList(forms = sessionFormSummaries, selectedInstanceId: string | null = null) {
  server.use(http.post(GET_SESSION_FORMS, () => apiOk({ forms, selectedInstanceId })))
}

describe('FormsPanel', () => {
  it('renders one row per form in list order and dims closed rows', async () => {
    serveList()
    renderPanel()

    const rows = await screen.findAllByTestId('form-panel-item')
    expect(rows.map((row) => row.getAttribute('data-instance-id'))).toEqual(
      sessionFormSummaries.map((form) => form.instanceId),
    )
    expect(rows[0]!.querySelector('.opacity-60')).toBeNull()
    expect(rows[1]!.querySelector('.opacity-60')).toBeTruthy()
    expect(rows[2]!.querySelector('.opacity-60')).toBeTruthy()
    expect(within(rows[2]!).getByText('chat.forms.untitled')).toBeTruthy()
  })

  it('shows three skeleton rows while the list is loading', async () => {
    server.use(
      http.post(GET_SESSION_FORMS, async () => {
        await delay(200)
        return apiOk({ forms: sessionFormSummaries, selectedInstanceId: null })
      }),
    )
    renderPanel()

    expect(screen.getAllByTestId('forms-panel-skeleton')).toHaveLength(3)

    await screen.findAllByTestId('form-panel-item')
    // Only an expanded item's own instance skeleton may remain, never the list skeleton.
    for (const skeleton of screen.queryAllByTestId('forms-panel-skeleton')) {
      expect(skeleton.closest('[data-testid="form-panel-item"]')).not.toBeNull()
    }
  })

  it('shows the empty state when the session has no forms', async () => {
    serveList([])
    renderPanel()

    expect(await screen.findByText('chat.forms.empty')).toBeTruthy()
    expect(screen.queryByTestId('form-panel-item')).toBeNull()
  })

  it('shows an inline error and refetches on retry', async () => {
    server.use(
      http.post(GET_SESSION_FORMS, () => apiError(404, 'NOT_FOUND', 'gone'), { once: true }),
    )
    renderPanel()

    const alert = await screen.findByRole('alert')
    expect(screen.queryByTestId('form-panel-item')).toBeNull()

    await fireEvent.click(within(alert).getByRole('button', { name: 'errors.tryAgain' }))

    expect(await screen.findAllByTestId('form-panel-item')).toHaveLength(3)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('initialises the marker from the first list response only', async () => {
    serveList(sessionFormSummaries, OPEN_FORM_INSTANCE_ID)
    const { queryClient } = renderPanel()
    const formsStore = useFormsStore()

    const rows = await screen.findAllByTestId('form-panel-item')
    expect(within(rows[0]!).getByRole('img', { name: 'chat.forms.agentSelected' })).toBeTruthy()
    expect(formsStore.sessions[FORM_FIXTURE_SESSION_ID]?.selectedInstanceId).toBe(
      OPEN_FORM_INSTANCE_ID,
    )

    serveList(sessionFormSummaries, SUBMITTED_FORM_INSTANCE_ID)
    await queryClient.refetchQueries({ queryKey: formQueryKeys.list(FORM_FIXTURE_SESSION_ID) })

    await waitFor(() =>
      expect(formsStore.sessions[FORM_FIXTURE_SESSION_ID]?.selectedInstanceId).toBe(
        OPEN_FORM_INSTANCE_ID,
      ),
    )
  })
})

describe('FormsPanel — unresolved agent', () => {
  it('shows a notice instead of a skeleton when there is no resolvable session agent', async () => {
    seedAuthStorage()
    renderWithProviders(FormsPanel as Component, {
      props: { sessionId: FORM_FIXTURE_SESSION_ID, agentId: undefined },
      global: { stubs },
    })

    expect(await screen.findByText('chat.forms.noAgent')).toBeTruthy()
    expect(screen.queryByTestId('forms-panel-skeleton')).toBeNull()
    expect(screen.queryByTestId('form-panel-item')).toBeNull()
  })
})

describe('FormsPanel — initial expansion rule', () => {
  const SECOND_OPEN_ID = 'form-inst-open-2'
  const twoOpenForms: SessionFormSummary[] = [
    sessionFormSummaries[0]!,
    { instanceId: SECOND_OPEN_ID, formId: 9, formName: 'Second open', status: 'Open' },
    sessionFormSummaries[1]!,
  ]

  function expandedIds() {
    return useFormsStore().sessions[FORM_FIXTURE_SESSION_ID]?.expandedIds
  }

  function headerOf(row: HTMLElement) {
    return within(row).getAllByRole('button')[0]!
  }

  it('expands the marker when it points to a listed open form', async () => {
    serveList(twoOpenForms, OPEN_FORM_INSTANCE_ID)
    renderPanel()

    const rows = await screen.findAllByTestId('form-panel-item')
    await waitFor(() => expect(expandedIds()).toEqual([OPEN_FORM_INSTANCE_ID]))
    expect(headerOf(rows[0]!).getAttribute('aria-expanded')).toBe('true')
    expect(headerOf(rows[1]!).getAttribute('aria-expanded')).toBe('false')
  })

  it('expands the newest open form when the marker points to a closed form', async () => {
    serveList(twoOpenForms, SUBMITTED_FORM_INSTANCE_ID)
    renderPanel()

    await screen.findAllByTestId('form-panel-item')
    await waitFor(() => expect(expandedIds()).toEqual([SECOND_OPEN_ID]))
  })

  it('expands the newest open form when there is no marker', async () => {
    serveList(twoOpenForms, null)
    renderPanel()

    await screen.findAllByTestId('form-panel-item')
    await waitFor(() => expect(expandedIds()).toEqual([SECOND_OPEN_ID]))
  })

  it('expands nothing when the session has no open forms', async () => {
    serveList(
      sessionFormSummaries.filter((form) => form.status !== 'Open'),
      SUBMITTED_FORM_INSTANCE_ID,
    )
    renderPanel()

    const rows = await screen.findAllByTestId('form-panel-item')
    await new Promise((r) => setTimeout(r, 20))
    expect(expandedIds() ?? []).toEqual([])
    for (const row of rows) expect(headerOf(row).getAttribute('aria-expanded')).toBe('false')
  })

  it('leaves an existing expansion alone', async () => {
    server.use(
      http.post(GET_SESSION_FORMS, async () => {
        await delay(100)
        return apiOk({ forms: sessionFormSummaries, selectedInstanceId: OPEN_FORM_INSTANCE_ID })
      }),
    )
    renderPanel()
    useFormsStore().focusForm(FORM_FIXTURE_SESSION_ID, SUBMITTED_FORM_INSTANCE_ID)

    await screen.findAllByTestId('form-panel-item')
    await new Promise((r) => setTimeout(r, 20))
    expect(expandedIds()).toEqual([SUBMITTED_FORM_INSTANCE_ID])
  })

  it('applies the rule after mount when the list is already cached, so the item can scroll', async () => {
    seedAuthStorage()
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView =
      scrollIntoView as unknown as typeof Element.prototype.scrollIntoView
    const pinia = createPinia()
    setActivePinia(pinia)
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(formQueryKeys.list(FORM_FIXTURE_SESSION_ID), {
      forms: twoOpenForms,
      selectedInstanceId: null,
    })
    serveList(twoOpenForms, null)

    render(FormsPanel as Component, {
      props: { sessionId: FORM_FIXTURE_SESSION_ID, agentId: FORM_FIXTURE_AGENT_ID },
      global: { stubs, plugins: [pinia, [VueQueryPlugin, { queryClient }]] },
    })
    await nextTick()

    expect(expandedIds()).toEqual([SECOND_OPEN_ID])
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))
  })

  it('a card-driven focus expands a closed form read-only and collapses the open one', async () => {
    serveList(sessionFormSummaries, OPEN_FORM_INSTANCE_ID)
    renderPanel()

    const rows = await screen.findAllByTestId('form-panel-item')
    await waitFor(() => expect(headerOf(rows[0]!).getAttribute('aria-expanded')).toBe('true'))

    useFormsStore().focusForm(FORM_FIXTURE_SESSION_ID, CANCELLED_FORM_INSTANCE_ID)

    await waitFor(() => expect(headerOf(rows[2]!).getAttribute('aria-expanded')).toBe('true'))
    expect(headerOf(rows[0]!).getAttribute('aria-expanded')).toBe('false')
    expect(await within(rows[2]!).findByText('chat.forms.closedNotice')).toBeTruthy()
    expect(within(rows[2]!).queryByRole('button', { name: 'chat.forms.pin' })).toBeNull()
  })
})

describe('FormsPanel — discard', () => {
  const PanelWithCard = defineComponent({
    setup() {
      const common = { sessionId: FORM_FIXTURE_SESSION_ID, agentId: FORM_FIXTURE_AGENT_ID }
      return () => [
        h(FormsPanel, common),
        h(FormCard, { ...common, instanceId: OPEN_FORM_INSTANCE_ID }),
      ]
    },
  })

  it('removes the item from the panel and the card shows the deleted state after the refetch', async () => {
    let forms = sessionFormSummaries
    server.use(
      http.post(GET_SESSION_FORMS, () => apiOk({ forms, selectedInstanceId: null })),
      http.post('/api/Form/DeleteFormInst', () => {
        forms = forms.filter((form) => form.instanceId !== OPEN_FORM_INSTANCE_ID)
        return apiOk({ instanceId: OPEN_FORM_INSTANCE_ID, deleted: true })
      }),
    )
    seedAuthStorage()
    renderWithProviders(PanelWithCard as Component, { global: { stubs } })

    await screen.findByTestId('form-renderer')
    expect(screen.queryByText('chat.forms.deleted')).toBeNull()
    expect(screen.getAllByRole('button', { name: /Partner rögzítés/ })).toHaveLength(2)

    await fireEvent.click(screen.getByRole('button', { name: 'chat.forms.discard' }))
    await fireEvent.click(screen.getByRole('button', { name: 'chat.forms.discardConfirm' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() =>
      expect(document.querySelector(`[data-instance-id="${OPEN_FORM_INSTANCE_ID}"]`)).toBeNull(),
    )
    expect(await screen.findByText('chat.forms.deleted')).toBeTruthy()
    expect(screen.getAllByTestId('form-panel-item')).toHaveLength(sessionFormSummaries.length - 1)
  })
})
