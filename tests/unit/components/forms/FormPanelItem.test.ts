import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent, waitFor, within } from '@testing-library/vue'
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
  openFormInstance,
  sessionFormSummaries,
} from '@/tests/msw/handlers/form'
import { trackPostCalls } from '@/tests/utils/requestCounter'
import { useFakeTimersSafe, advance, useRealTimers } from '@/tests/utils/timers'
import { useFormsStore } from '@/app/stores/forms'
import { formQueryKeys } from '~/composables/useFormQueries'
import { chatQueryKeys } from '~/composables/useChatQueries'
import { SAVE_DEBOUNCE_MS, SAVED_VISIBLE_MS } from '~/composables/useFormDraft'
import type { SessionFormSummary } from '@/types/api/schemas'
import FormPanelItem from '~/components/forms/FormPanelItem.vue'

const GET_FORM_INST = '/api/Form/GetFormInst'

const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vueuse/core')>()
  const { computed } = await import('vue')
  return {
    ...actual,
    usePreferredReducedMotion: () => computed(() => (motion.reduced ? 'reduce' : 'no-preference')),
  }
})

const stubs = {
  UIcon: {
    name: 'UIcon',
    inheritAttrs: false,
    props: ['name'],
    template: '<i v-bind="$attrs" :data-name="name" />',
  },
  USkeleton: {
    name: 'USkeleton',
    inheritAttrs: false,
    template: '<div v-bind="$attrs" data-testid="form-item-skeleton" />',
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
    props: ['label', 'icon'],
    template: '<button v-bind="$attrs" :data-icon="icon">{{ label }}<slot /></button>',
  },
  UCollapsible: {
    name: 'UCollapsible',
    props: ['open'],
    template:
      '<div data-testid="collapsible" :data-open="open"><slot /><slot v-if="open" name="content" /></div>',
  },
  FormRenderer: {
    name: 'FormRenderer',
    props: ['schema', 'uischema', 'data', 'readonly', 'showErrors', 'focusRequest'],
    emits: ['change'],
    template:
      '<div data-testid="form-renderer" :data-readonly="readonly" :data-show-errors="showErrors" :data-form-data="JSON.stringify(data)" :data-focus-request="focusRequest?.pointer">' +
      '<div data-form-path="/notes"><input data-testid="notes-input" /></div>' +
      '<div data-form-path="/tax~1id"><input data-testid="tax-id-input" /></div>' +
      '<button type="button" data-testid="emit-change" @click="$emit(\'change\', { data: { ...data, notes: \'edited\' }, errors: [] })" />' +
      "<button type=\"button\" data-testid=\"emit-invalid\" @click=\"$emit('change', { data, errors: [{ instancePath: '', keyword: 'required', params: { missingProperty: 'notes' } }] })\" />" +
      "<button type=\"button\" data-testid=\"emit-invalid-escaped\" @click=\"$emit('change', { data, errors: [{ instancePath: '', keyword: 'required', params: { missingProperty: 'tax/id' } }] })\" />" +
      '</div>',
  },
  UModal: {
    name: 'UModal',
    props: ['open', 'title'],
    emits: ['update:open'],
    template:
      '<div v-if="open" role="dialog" data-testid="modal" :data-title="title"><slot name="content" /></div>',
  },
}

const openForm = sessionFormSummaries[0]!
const submittedForm = sessionFormSummaries[1]!

function renderItem(form: SessionFormSummary = openForm, agentId?: number) {
  seedAuthStorage()
  const resolvedAgentId = arguments.length >= 2 ? agentId : FORM_FIXTURE_AGENT_ID
  return renderWithProviders(FormPanelItem as Component, {
    props: { form, sessionId: FORM_FIXTURE_SESSION_ID, agentId: resolvedAgentId },
    global: { stubs },
  })
}

function header(form: SessionFormSummary = openForm) {
  return screen.getByRole('button', { name: new RegExp(form.formName!) })
}

function body(instanceId = OPEN_FORM_INSTANCE_ID) {
  return document.querySelector<HTMLElement>(`[data-form-instance-id="${instanceId}"]`)
}

let scrollIntoView: ReturnType<typeof vi.fn>

beforeEach(() => {
  scrollIntoView = vi.fn()
  Element.prototype.scrollIntoView =
    scrollIntoView as unknown as typeof Element.prototype.scrollIntoView
})

afterEach(() => {
  motion.reduced = false
})

describe('FormPanelItem — header', () => {
  it('renders a collapsed header button that expands through the store', async () => {
    renderItem()
    const formsStore = useFormsStore()

    expect(header().getAttribute('aria-expanded')).toBe('false')
    expect(body()).toBeNull()
    expect(screen.getByTestId('collapsible').getAttribute('data-open')).toBe('false')

    await fireEvent.click(header())

    expect(formsStore.sessions[FORM_FIXTURE_SESSION_ID]?.expandedIds).toEqual([
      OPEN_FORM_INSTANCE_ID,
    ])
    expect(header().getAttribute('aria-expanded')).toBe('true')
    expect(body()!.id).not.toBe('')
    expect(header().getAttribute('aria-controls')).toBe(body()!.id)

    await fireEvent.click(header())
    expect(header().getAttribute('aria-expanded')).toBe('false')
    expect(body()).toBeNull()
  })

  it('rotates the chevron when expanded', async () => {
    renderItem()
    const chevron = document.querySelector('[data-name="i-heroicons-chevron-right-20-solid"]')!

    expect(chevron.className).not.toContain('rotate-90')
    await fireEvent.click(header())
    expect(chevron.className).toContain('rotate-90')
  })

  it('shows the marker dot only for an open marked form', async () => {
    renderItem()
    const formsStore = useFormsStore()
    expect(screen.queryByRole('img', { name: 'chat.forms.agentSelected' })).toBeNull()

    formsStore.setSelected(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID)
    expect(await screen.findByRole('img', { name: 'chat.forms.agentSelected' })).toBeTruthy()
  })
})

describe('FormPanelItem — pin', () => {
  it('pins with aria-pressed, expands, and unpinning keeps it expanded', async () => {
    renderItem()
    const formsStore = useFormsStore()
    const pin = screen.getByRole('button', { name: 'chat.forms.pin' })

    expect(pin.getAttribute('aria-pressed')).toBe('false')
    expect(pin.getAttribute('data-icon')).toBe('i-ph-push-pin')
    expect(header().contains(pin)).toBe(false)

    await fireEvent.click(pin)

    expect(formsStore.sessions[FORM_FIXTURE_SESSION_ID]?.pinnedIds).toEqual([OPEN_FORM_INSTANCE_ID])
    expect(header().getAttribute('aria-expanded')).toBe('true')
    const unpin = screen.getByRole('button', { name: 'chat.forms.unpin' })
    expect(unpin.getAttribute('aria-pressed')).toBe('true')
    expect(unpin.getAttribute('data-icon')).toBe('i-ph-push-pin-fill')

    await fireEvent.click(unpin)

    expect(formsStore.sessions[FORM_FIXTURE_SESSION_ID]?.pinnedIds).toEqual([])
    expect(header().getAttribute('aria-expanded')).toBe('true')
  })

  it('does not toggle the item when the pin is clicked on an expanded item', async () => {
    renderItem()
    await fireEvent.click(header())
    expect(header().getAttribute('aria-expanded')).toBe('true')

    await fireEvent.click(screen.getByRole('button', { name: 'chat.forms.pin' }))
    expect(header().getAttribute('aria-expanded')).toBe('true')
  })
})

describe('FormPanelItem — body', () => {
  it('shows three skeleton rows while the instance loads, then the loaded region', async () => {
    server.use(
      http.post(GET_FORM_INST, async () => {
        await delay(150)
        return apiOk(openFormInstance)
      }),
    )
    renderItem()
    await fireEvent.click(header())

    expect(screen.getAllByTestId('form-item-skeleton')).toHaveLength(3)

    await screen.findByTestId('form-panel-body-loaded')
    expect(screen.queryByTestId('form-item-skeleton')).toBeNull()
    expect(screen.queryByText('chat.forms.closedNotice')).toBeNull()

    const renderer = screen.getByTestId('form-renderer')
    expect(renderer.dataset.readonly).toBe('false')
    expect(renderer.dataset.showErrors).toBe('false')
  })

  it('seeds the edit buffer with an empty object when the instance has no data', async () => {
    server.use(http.post(GET_FORM_INST, () => apiOk({ ...openFormInstance, data: null })))
    renderItem()
    await fireEvent.click(header())

    await screen.findByTestId('form-panel-body-loaded')
    expect(screen.getByTestId('form-renderer').dataset.formData).toBe('{}')
  })

  it('does not fetch the instance while collapsed', async () => {
    const spy = vi.fn()
    server.use(
      http.post(GET_FORM_INST, () => {
        spy()
        return apiOk(openFormInstance)
      }),
    )
    renderItem()
    await new Promise((r) => setTimeout(r, 50))

    expect(spy).not.toHaveBeenCalled()
  })

  it('shows an inline error with retry when the instance fails', async () => {
    server.use(
      http.post(GET_FORM_INST, () => apiError(404, 'NOT_FOUND', 'form gone'), { once: true }),
    )
    renderItem()
    await fireEvent.click(header())

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('common.error')
    expect(alert.textContent!.length).toBeGreaterThan('common.errorerrors.tryAgain'.length)

    await fireEvent.click(within(alert).getByRole('button', { name: 'errors.tryAgain' }))

    await screen.findByTestId('form-panel-body-loaded')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('dims a closed item, hides the pin and shows the read-only notice without a footer', async () => {
    renderItem(submittedForm)

    const row = screen.getByTestId('form-panel-item')
    expect(row.querySelector('.opacity-60')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'chat.forms.pin' })).toBeNull()

    await fireEvent.click(header(submittedForm))

    expect(await screen.findByText('chat.forms.closedNotice')).toBeTruthy()
    expect(body(SUBMITTED_FORM_INSTANCE_ID)).toBeTruthy()
    expect(screen.getByTestId('form-renderer').dataset.readonly).toBe('true')
    expect(screen.queryByRole('button', { name: 'chat.forms.submit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'chat.forms.discard' })).toBeNull()
  })
})

describe('FormPanelItem — unresolved agent', () => {
  const SAVE_FORM_INST_URL = '/api/Form/SaveFormInst'
  const DELETE_FORM_INST_URL = '/api/Form/DeleteFormInst'

  it('shows a notice instead of a skeleton when expanded with no resolvable agent', async () => {
    renderItem(openForm, undefined)

    await fireEvent.click(header())

    expect(await screen.findByTestId('form-panel-item-no-agent')).toBeTruthy()
    expect(screen.getByText('chat.forms.noAgent')).toBeTruthy()
    expect(screen.queryByTestId('form-item-skeleton')).toBeNull()
  })

  it('renders a cached instance read-only with disabled, explained submit and discard controls', async () => {
    const { queryClient } = renderItem(openForm, undefined)
    queryClient.setQueryData(
      formQueryKeys.instance(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID),
      openFormInstance,
    )

    await fireEvent.click(header())

    await screen.findByTestId('form-panel-body-loaded')
    expect(screen.getByTestId('form-renderer').dataset.readonly).toBe('true')
    expect(screen.getByText('chat.forms.noAgent')).toBeTruthy()
    const submitButton = screen.getByRole<HTMLButtonElement>('button', {
      name: 'chat.forms.submit',
    })
    const discardButton = screen.getByRole<HTMLButtonElement>('button', {
      name: 'chat.forms.discard',
    })
    expect(submitButton.disabled).toBe(true)
    expect(discardButton.disabled).toBe(true)
  })

  it('logs a warning and skips the request when the agent is lost before confirming discard', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const deletes = trackPostCalls(DELETE_FORM_INST_URL, () =>
      apiOk({ instanceId: OPEN_FORM_INSTANCE_ID, deleted: true }),
    )
    const { rerender } = renderItem()
    await fireEvent.click(header())
    await screen.findByTestId('form-panel-body-loaded')
    await fireEvent.click(screen.getByRole('button', { name: 'chat.forms.discard' }))
    expect(screen.getByRole('dialog')).toBeTruthy()

    await rerender({ form: openForm, sessionId: FORM_FIXTURE_SESSION_ID, agentId: undefined })
    await fireEvent.click(screen.getByRole('button', { name: 'chat.forms.discardConfirm' }))

    expect(deletes.count).toBe(0)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })

  it('logs a warning and skips the request when the agent is lost before confirming submit', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const saves = trackPostCalls(SAVE_FORM_INST_URL, () => apiOk(openFormInstance))
    const { rerender } = renderItem()
    await fireEvent.click(header())
    await screen.findByTestId('form-panel-body-loaded')
    await fireEvent.click(screen.getByRole('button', { name: 'chat.forms.submit' }))
    await screen.findByRole('dialog')

    await rerender({ form: openForm, sessionId: FORM_FIXTURE_SESSION_ID, agentId: undefined })
    await fireEvent.click(screen.getByRole('button', { name: 'chat.forms.submitConfirm' }))

    expect(saves.count).toBe(0)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })
})

describe('FormPanelItem — save status', () => {
  const SAVE_FORM_INST = '/api/Form/SaveFormInst'

  afterEach(() => {
    useRealTimers()
  })

  async function expandAndEdit(form: SessionFormSummary = openForm) {
    renderItem(form)
    await fireEvent.click(header(form))
    await screen.findByTestId('form-panel-body-loaded')
    await fireEvent.click(screen.getByTestId('emit-change'))
  }

  it('shows Saved, then Saving…, then Saved again, and stays visible', async () => {
    useFakeTimersSafe()
    server.use(
      http.post(SAVE_FORM_INST, async ({ request }) => {
        const body = (await request.json()) as { data: Record<string, unknown> }
        await delay(100)
        return apiOk({ ...openFormInstance, data: body.data })
      }),
    )
    await expandAndEdit()
    expect(screen.getByRole('status').textContent).toContain('chat.forms.saved')

    await advance(SAVE_DEBOUNCE_MS + 10)
    expect(screen.getByRole('status').textContent).toContain('chat.forms.saving')

    await advance(200)
    expect(screen.getByRole('status').textContent).toContain('chat.forms.saved')
    expect(screen.getByTestId('form-renderer').dataset.formData).toContain('"notes":"edited"')

    await advance(SAVED_VISIBLE_MS + 50)
    expect(screen.getByRole('status').textContent).toContain('chat.forms.saved')
  })

  it('shows Not saved with a retry button that saves again, and never toasts', async () => {
    const toastAdd = vi.fn()
    vi.mocked(useToast).mockReturnValue({
      add: toastAdd,
      remove: vi.fn(),
      clear: vi.fn(),
    } as unknown as ReturnType<typeof useToast>)
    useFakeTimersSafe()
    server.use(
      http.post(SAVE_FORM_INST, () => apiError(500, 'SERVER_ERROR', 'down'), { once: true }),
    )
    await expandAndEdit()
    await advance(SAVE_DEBOUNCE_MS + 50)

    const status = await screen.findByRole('status')
    expect(status.textContent).toContain('down')
    expect(toastAdd).not.toHaveBeenCalled()

    await fireEvent.click(screen.getByRole('button', { name: 'chat.forms.retry' }))
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('chat.forms.saved'),
    )
    expect(screen.queryByRole('button', { name: 'chat.forms.retry' })).toBeNull()
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('shows the friendly error message next to the retry control', async () => {
    useFakeTimersSafe()
    server.use(
      http.post(SAVE_FORM_INST, () => apiError(500, 'SERVER_ERROR', 'agent down'), { once: true }),
    )
    await expandAndEdit()
    await advance(SAVE_DEBOUNCE_MS + 50)

    const status = await screen.findByRole('status')
    expect(status.textContent).toContain('agent down')
  })

  it('flushes at once when keyboard focus leaves the body', async () => {
    const counter = trackPostCalls(SAVE_FORM_INST, () => apiOk(openFormInstance))
    await expandAndEdit()
    const input = screen.getByTestId('notes-input')
    const outside = document.createElement('button')
    document.body.appendChild(outside)

    input.focus()
    await fireEvent.focusOut(input, { relatedTarget: screen.getByTestId('emit-change') })
    await new Promise((r) => setTimeout(r, 20))
    expect(counter.count).toBe(0)

    await fireEvent.focusOut(input, { relatedTarget: outside })
    await waitFor(() => expect(counter.count).toBe(1))
    outside.remove()
  })

  it('flushes when the item collapses', async () => {
    const counter = trackPostCalls(SAVE_FORM_INST, () => apiOk(openFormInstance))
    await expandAndEdit()

    await fireEvent.click(header())

    await waitFor(() => expect(counter.count).toBe(1))
    expect(body()).toBeNull()
  })

  it('passes showErrors from the store draft to the renderer', async () => {
    renderItem()
    await fireEvent.click(header())
    await screen.findByTestId('form-panel-body-loaded')
    expect(screen.getByTestId('form-renderer').dataset.showErrors).toBe('false')

    useFormsStore().setShowErrors(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID, true)
    await waitFor(() => expect(screen.getByTestId('form-renderer').dataset.showErrors).toBe('true'))
  })
})

describe('FormPanelItem — discard', () => {
  const SAVE_FORM_INST = '/api/Form/SaveFormInst'
  const DELETE_FORM_INST = '/api/Form/DeleteFormInst'

  afterEach(() => {
    useRealTimers()
  })

  function toastSpy() {
    const toastAdd = vi.fn()
    vi.mocked(useToast).mockReturnValue({
      add: toastAdd,
      remove: vi.fn(),
      clear: vi.fn(),
    } as unknown as ReturnType<typeof useToast>)
    return toastAdd
  }

  async function expandOpenForm() {
    renderItem()
    await fireEvent.click(header())
    await screen.findByTestId('form-panel-body-loaded')
  }

  function discardButton() {
    return screen.getByRole('button', { name: 'chat.forms.discard' })
  }

  function confirmButton() {
    return screen.getByRole<HTMLButtonElement>('button', { name: 'chat.forms.discardConfirm' })
  }

  it('shows a ghost error discard button in the footer of an open form', async () => {
    await expandOpenForm()

    const footer = body()!.querySelector('footer')!
    expect(footer).toBeTruthy()
    expect(within(footer).getByRole('button', { name: 'chat.forms.discard' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('confirms, cancels the pending autosave and deletes without saving', async () => {
    useFakeTimersSafe()
    const saves = trackPostCalls(SAVE_FORM_INST, () => apiOk(openFormInstance))
    const deletes = trackPostCalls(DELETE_FORM_INST, () =>
      apiOk({ instanceId: OPEN_FORM_INSTANCE_ID, deleted: true }),
    )
    const toastAdd = toastSpy()
    await expandOpenForm()
    await fireEvent.click(screen.getByTestId('emit-change'))

    await fireEvent.click(discardButton())
    expect(screen.getByRole('dialog').dataset.title).toBe('chat.forms.discardConfirmTitle')
    expect(screen.getByText('chat.forms.discardConfirmBody')).toBeTruthy()

    await fireEvent.click(confirmButton())
    await advance(SAVE_DEBOUNCE_MS + 50)

    expect(deletes.count).toBe(1)
    expect(saves.count).toBe(0)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(toastAdd).not.toHaveBeenCalled()
    const store = useFormsStore()
    expect(store.getDraft(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID)).toBeUndefined()
    expect(store.sessions[FORM_FIXTURE_SESSION_ID]?.expandedIds).toEqual([])
  })

  it('does not flush when focus moves into the open discard modal', async () => {
    const saves = trackPostCalls(SAVE_FORM_INST, () => apiOk(openFormInstance))
    await expandOpenForm()
    await fireEvent.click(screen.getByTestId('emit-change'))
    await fireEvent.click(discardButton())

    await fireEvent.focusOut(body()!, { relatedTarget: confirmButton() })
    await new Promise((r) => setTimeout(r, 20))
    expect(saves.count).toBe(0)

    await fireEvent.click(screen.getByRole('button', { name: 'chat.forms.cancel' }))
    await fireEvent.focusOut(body()!, { relatedTarget: document.body })
    await waitFor(() => expect(saves.count).toBe(1))
  })

  it('closes the modal without a request on cancel', async () => {
    const deletes = trackPostCalls(DELETE_FORM_INST, () =>
      apiOk({ instanceId: OPEN_FORM_INSTANCE_ID, deleted: true }),
    )
    await expandOpenForm()

    await fireEvent.click(discardButton())
    await fireEvent.click(screen.getByRole('button', { name: 'chat.forms.cancel' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(deletes.count).toBe(0)
    expect(screen.getByTestId('form-panel-body-loaded')).toBeTruthy()
  })

  it('disables the buttons while pending, then toasts and keeps the item on failure', async () => {
    const toastAdd = toastSpy()
    server.use(
      http.post(DELETE_FORM_INST, async () => {
        await delay(50)
        return apiError(500, 'SERVER_ERROR', 'down')
      }),
    )
    await expandOpenForm()
    await fireEvent.click(screen.getByTestId('emit-change'))

    await fireEvent.click(discardButton())
    await fireEvent.click(confirmButton())

    expect(confirmButton().disabled).toBe(true)
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'chat.forms.cancel' }).disabled,
    ).toBe(true)

    await waitFor(() => expect(toastAdd).toHaveBeenCalledTimes(1))
    expect(toastAdd.mock.calls[0]![0]).toMatchObject({ color: 'error' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('form-panel-body-loaded')).toBeTruthy()
    expect(useFormsStore().getDraft(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID)).toBeTruthy()
  })

  it('refetches the instance when the delete fails with 400', async () => {
    toastSpy()
    server.use(http.post(DELETE_FORM_INST, () => apiError(400, 'VALIDATION_ERROR', 'closed')))
    const instanceFetches = trackPostCalls(GET_FORM_INST, () => apiOk(openFormInstance))
    await expandOpenForm()
    expect(instanceFetches.count).toBe(1)

    await fireEvent.click(discardButton())
    await fireEvent.click(confirmButton())

    await waitFor(() => expect(instanceFetches.count).toBe(2))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it.each([404, 409])(
    'refetches the instance when the delete fails with %d, same as 400',
    async (status) => {
      toastSpy()
      server.use(http.post(DELETE_FORM_INST, () => apiError(status, 'ERROR', 'gone')))
      const instanceFetches = trackPostCalls(GET_FORM_INST, () => apiOk(openFormInstance))
      await expandOpenForm()
      expect(instanceFetches.count).toBe(1)

      await fireEvent.click(discardButton())
      await fireEvent.click(confirmButton())

      await waitFor(() => expect(instanceFetches.count).toBe(2))
      expect(screen.queryByRole('dialog')).toBeNull()
    },
  )
})

describe('FormPanelItem — focus highlight', () => {
  it('scrolls into view smoothly, rings for a while and never moves keyboard focus', async () => {
    renderItem()
    const formsStore = useFormsStore()
    const row = screen.getByTestId('form-panel-item')
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()

    formsStore.focusForm(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID)

    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' }),
    )
    expect(row.className).toContain('ring-2')
    expect(document.activeElement).toBe(outside)

    await waitFor(() => expect(row.className).not.toContain('ring-2'), { timeout: 2500 })
    outside.remove()
  })

  it('ignores a focus request for another form', async () => {
    renderItem()
    const formsStore = useFormsStore()

    formsStore.focusForm(FORM_FIXTURE_SESSION_ID, SUBMITTED_FORM_INSTANCE_ID)
    await new Promise((r) => setTimeout(r, 20))

    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(screen.getByTestId('form-panel-item').className).not.toContain('ring-2')
  })

  it('uses instant scrolling and no ring transition under reduced motion', async () => {
    motion.reduced = true
    renderItem()
    const formsStore = useFormsStore()
    const row = screen.getByTestId('form-panel-item')

    formsStore.focusForm(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID)

    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'auto' }),
    )
    expect(row.className).toContain('ring-2')
    expect(row.className).not.toContain('transition-shadow')
  })
})

describe('FormPanelItem — submit', () => {
  const SAVE_FORM_INST = '/api/Form/SaveFormInst'

  async function expandOpen() {
    const rendered = renderItem()
    await fireEvent.click(header())
    await screen.findByTestId('form-panel-body-loaded')
    return rendered
  }

  const submitButton = () => screen.getByRole('button', { name: 'chat.forms.submit' })
  const confirmButton = () => screen.getByRole('button', { name: 'chat.forms.submitConfirm' })
  const cancelButton = () => screen.getByRole('button', { name: 'chat.forms.cancel' })

  function mockToast() {
    const add = vi.fn()
    vi.mocked(useToast).mockReturnValue({
      add,
      remove: vi.fn(),
      clear: vi.fn(),
    } as unknown as ReturnType<typeof useToast>)
    return add
  }

  it('shows the footer with a submit button for an open form', async () => {
    await expandOpen()
    expect(submitButton().closest('footer')).toBeTruthy()
    expect(submitButton().classList.contains('min-h-11')).toBe(true)
  })

  it('hides errors before the first attempt, then shows them and focuses the first erroring control without a modal', async () => {
    await expandOpen()
    await fireEvent.click(screen.getByTestId('emit-invalid'))
    expect(screen.getByTestId('form-renderer').dataset.showErrors).toBe('false')

    await fireEvent.click(submitButton())

    await waitFor(() => expect(screen.getByTestId('form-renderer').dataset.showErrors).toBe('true'))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('notes-input')))
    expect(screen.getByTestId('form-renderer').dataset.focusRequest).toBe('/notes')
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'center' }))
    expect(screen.queryByTestId('modal')).toBeNull()
  })

  it('escapes a slash in a required field name before focusing its control', async () => {
    await expandOpen()
    await fireEvent.click(screen.getByTestId('emit-invalid-escaped'))

    await fireEvent.click(submitButton())

    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('tax-id-input')))
    expect(screen.getByTestId('form-renderer').dataset.focusRequest).toBe('/tax~1id')
  })

  it('stops with the inline error when the flush fails', async () => {
    server.use(http.post(SAVE_FORM_INST, () => apiError(500, 'SERVER_ERROR', 'boom')))
    await expandOpen()
    await fireEvent.click(screen.getByTestId('emit-change'))

    await fireEvent.click(submitButton())

    expect(await screen.findByText('boom')).toBeTruthy()
    expect(screen.getByTestId('form-renderer').dataset.showErrors).toBe('false')
    expect(screen.queryByTestId('modal')).toBeNull()
  })

  it('shows a toast and focuses the retry control when submit flush fails', async () => {
    const toastAdd = mockToast()
    server.use(http.post(SAVE_FORM_INST, () => apiError(500, 'SERVER_ERROR', 'boom')))
    await expandOpen()
    await fireEvent.click(screen.getByTestId('emit-change'))

    await fireEvent.click(submitButton())

    await screen.findByRole('button', { name: 'chat.forms.retry' })
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'chat.forms.submitFlushFailed', color: 'error' }),
    )
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'chat.forms.retry' }))
  })

  it('confirms a valid form: submits without lastEditedField, locks the item, invalidates and toasts', async () => {
    const toastAdd = mockToast()
    const bodies: Record<string, unknown>[] = []
    server.use(
      http.post(SAVE_FORM_INST, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        bodies.push(body)
        return apiOk({ ...openFormInstance, data: body.data, status: 'Submitted' })
      }),
    )
    const { queryClient } = await expandOpen()
    const listKey = formQueryKeys.list(FORM_FIXTURE_SESSION_ID)
    const sessionKey = chatQueryKeys.session(FORM_FIXTURE_SESSION_ID)
    queryClient.setQueryData(listKey, { forms: [], selectedInstanceId: null })
    queryClient.setQueryData(sessionKey, {})

    await fireEvent.click(submitButton())
    const modal = await screen.findByTestId('modal')
    expect(modal.dataset.title).toBe('chat.forms.submitConfirmTitle')
    expect(within(modal).getByText('chat.forms.submitConfirmBody')).toBeTruthy()

    await fireEvent.click(confirmButton())

    await waitFor(() => expect(screen.queryByTestId('modal')).toBeNull())
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toMatchObject({
      instanceId: OPEN_FORM_INSTANCE_ID,
      status: 'Submitted',
      data: openFormInstance.data,
    })
    expect(bodies[0]).not.toHaveProperty('lastEditedField')
    await waitFor(() => expect(screen.getByTestId('form-renderer').dataset.readonly).toBe('true'))
    expect(body()).toBeTruthy()
    expect(screen.getByText('chat.forms.closedNotice')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'chat.forms.submit' })).toBeNull()
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(sessionKey)?.isInvalidated).toBe(true)
    expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'chat.forms.submitted', color: 'success' }),
    )
  })

  it('cancels the modal without a request', async () => {
    const save = trackPostCalls(SAVE_FORM_INST, () => apiOk(openFormInstance))
    await expandOpen()
    await fireEvent.click(submitButton())
    await screen.findByTestId('modal')

    await fireEvent.click(cancelButton())

    await waitFor(() => expect(screen.queryByTestId('modal')).toBeNull())
    expect(save.count).toBe(0)
  })

  it('disables both modal buttons with a spinner while the request is pending', async () => {
    server.use(
      http.post(SAVE_FORM_INST, async () => {
        await delay(200)
        return apiOk({ ...openFormInstance, status: 'Submitted' })
      }),
    )
    await expandOpen()
    await fireEvent.click(submitButton())
    await screen.findByTestId('modal')

    await fireEvent.click(confirmButton())

    await waitFor(() => expect(confirmButton().hasAttribute('disabled')).toBe(true))
    expect(confirmButton().getAttribute('loading')).toBe('true')
    expect(cancelButton().hasAttribute('disabled')).toBe(true)
    await waitFor(() => expect(screen.queryByTestId('modal')).toBeNull())
  })

  it('on failure closes the modal, toasts, shows the inline error and refetches on 400', async () => {
    const toastAdd = mockToast()
    server.use(http.post(SAVE_FORM_INST, () => apiError(400, 'VALIDATION_ERROR', 'Form closed')))
    const instance = trackPostCalls(GET_FORM_INST, () => apiOk(openFormInstance))
    await expandOpen()
    expect(instance.count).toBe(1)
    await fireEvent.click(submitButton())
    await screen.findByTestId('modal')

    await fireEvent.click(confirmButton())

    await waitFor(() => expect(screen.queryByTestId('modal')).toBeNull())
    expect(await screen.findByText('Form closed')).toBeTruthy()
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'error' }))
    await waitFor(() => expect(instance.count).toBe(2))
    expect(screen.getByTestId('form-renderer').dataset.readonly).toBe('false')
  })

  it.each([404, 409])(
    'on failure with %d refetches the list and instance, same as 400',
    async (status) => {
      mockToast()
      server.use(http.post(SAVE_FORM_INST, () => apiError(status, 'ERROR', 'gone')))
      const instance = trackPostCalls(GET_FORM_INST, () => apiOk(openFormInstance))
      await expandOpen()
      expect(instance.count).toBe(1)
      await fireEvent.click(submitButton())
      await screen.findByTestId('modal')

      await fireEvent.click(confirmButton())

      await waitFor(() => expect(screen.queryByTestId('modal')).toBeNull())
      await waitFor(() => expect(instance.count).toBe(2))
    },
  )

  it('flushes an edit made after the modal opened before sending the submit', async () => {
    const bodies: Record<string, unknown>[] = []
    server.use(
      http.post(SAVE_FORM_INST, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        bodies.push(body)
        return apiOk({ ...openFormInstance, data: body.data, status: body.status ?? 'Open' })
      }),
    )
    await expandOpen()
    await fireEvent.click(submitButton())
    await screen.findByTestId('modal')
    await fireEvent.click(screen.getByTestId('emit-change'))

    await fireEvent.click(confirmButton())

    await waitFor(() => expect(screen.queryByTestId('modal')).toBeNull())
    expect(bodies.map((body) => body.status)).toEqual([undefined, 'Submitted'])
    expect(bodies[0]).toMatchObject({ data: { notes: 'edited' } })
    expect(bodies[1]).toMatchObject({ data: { notes: 'edited' } })
  })
})

describe('FormPanelItem — submit with the real renderer', () => {
  const { FormRenderer: _stubbedRenderer, ...withoutRenderer } = stubs
  const realRendererStubs = {
    ...withoutRenderer,
    UFormField: {
      name: 'UFormField',
      props: ['label', 'error'],
      template:
        '<div data-testid="form-field"><slot /><p v-if="error" data-testid="form-field-error">{{ error }}</p></div>',
    },
    UInput: {
      name: 'UInput',
      props: ['modelValue'],
      template: '<input v-bind="$attrs" :value="modelValue" />',
    },
  }

  it('shows the errors and focuses the first control on the first submit of a pristine form', async () => {
    server.use(
      http.post(GET_FORM_INST, () =>
        apiOk({
          ...openFormInstance,
          schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
          uischema: {
            type: 'VerticalLayout',
            elements: [{ type: 'Control', scope: '#/properties/name' }],
          },
          data: {},
        }),
      ),
    )
    seedAuthStorage()
    renderWithProviders(FormPanelItem as Component, {
      props: { form: openForm, sessionId: FORM_FIXTURE_SESSION_ID, agentId: FORM_FIXTURE_AGENT_ID },
      global: { stubs: realRendererStubs },
    })
    await fireEvent.click(header())
    const control = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-form-path="/name"]')
      expect(el).toBeTruthy()
      return el!
    })
    expect(screen.queryByTestId('form-field-error')).toBeNull()

    await fireEvent.click(screen.getByRole('button', { name: 'chat.forms.submit' }))

    expect(await screen.findByTestId('form-field-error')).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(control.querySelector('input')))
    expect(screen.queryByTestId('modal')).toBeNull()
  })
})
