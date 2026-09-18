import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import { createPinia, setActivePinia } from 'pinia'
import { delay } from 'msw'
import { server, http } from '@/tests/msw/server'
import { apiOk, apiError } from '@/tests/msw/http'
import { seedAuthStorage } from '@/tests/utils/authSeed'
import { trackPostCalls } from '@/tests/utils/requestCounter'
import { advance, useRealTimers } from '@/tests/utils/timers'
import { configureApiInterceptors } from '@/lib/api/interceptors/setup'
import { useAuthStore } from '~/stores/auth'
import { useFormsStore } from '~/stores/forms'
import {
  COMPUTED_COMPANY_NAME,
  FORM_FIXTURE_AGENT_ID,
  FORM_FIXTURE_SESSION_ID,
  OPEN_FORM_INSTANCE_ID,
  openFormInstance,
} from '@/tests/msw/handlers/form'
import { formQueryKeys } from '~/composables/useFormQueries'
import { useFormDraft, SAVE_DEBOUNCE_MS, SAVED_VISIBLE_MS } from '~/composables/useFormDraft'
import type { FormInstance } from '@/types/api/schemas'
import type { JsonFormsChangeEvent } from '@jsonforms/vue'
import { createAjv } from '@jsonforms/core'

const SAVE_FORM_INST = '/api/Form/SaveFormInst'
const GET_FORM_INST = '/api/Form/GetFormInst'

const baseData = openFormInstance.data as Record<string, unknown>

function changeEvent(data: Record<string, unknown>): JsonFormsChangeEvent {
  return { data, errors: [] }
}

function focusControl(draft: ReturnType<typeof useFormDraft>, pointer: string) {
  const field = document.createElement('input')
  const wrapperEl = document.createElement('div')
  wrapperEl.setAttribute('data-form-path', pointer)
  wrapperEl.appendChild(field)
  document.body.appendChild(wrapperEl)
  draft.onFocusIn({ target: field } as unknown as FocusEvent)
  return () => wrapperEl.remove()
}

function pushServerData(queryClient: QueryClient, data: Record<string, unknown>) {
  queryClient.setQueryData(formQueryKeys.instance(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID), {
    ...openFormInstance,
    data,
  })
}

function mountDraft(options: { expanded?: boolean; readonly?: boolean } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  seedAuthStorage()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  })
  const expanded = ref(options.expanded ?? true)
  const readonly = ref(options.readonly ?? false)
  let draft!: ReturnType<typeof useFormDraft>
  const Comp = defineComponent({
    setup() {
      draft = useFormDraft({
        sessionId: FORM_FIXTURE_SESSION_ID,
        agentId: () => FORM_FIXTURE_AGENT_ID,
        instanceId: OPEN_FORM_INSTANCE_ID,
        expanded,
        readonly,
      })
      return () => null
    },
  })
  const wrapper: VueWrapper = mount(Comp, {
    global: { plugins: [[VueQueryPlugin, { queryClient }], pinia] },
  })
  configureApiInterceptors({ authStore: useAuthStore(), redirectToLogin: vi.fn() })
  return { draft, wrapper, queryClient, expanded, readonly, store: useFormsStore() }
}

async function untilSeeded(draft: ReturnType<typeof useFormDraft>) {
  for (let i = 0; i < 50 && !draft.draft.value; i++) {
    await advance(10)
    await nextTick()
  }
  expect(draft.draft.value).toBeTruthy()
}

function captureSaves(respond?: (data: Record<string, unknown>) => Record<string, unknown>) {
  const bodies: Array<Record<string, unknown>> = []
  server.use(
    http.post(SAVE_FORM_INST, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      bodies.push(body)
      const data = body.data as Record<string, unknown>
      return apiOk({ ...openFormInstance, data: respond ? respond(data) : data })
    }),
  )
  return bodies
}

let toastAdd: ReturnType<typeof vi.fn>

beforeEach(() => {
  // Not useFakeTimersSafe: its shouldAdvanceTime interval can tick the clock +20 ms
  // inside advanceTimersByTimeAsync's first real yield, pushing an exact-boundary
  // advance past the debounce deadline. The MSW round trip here needs no real time.
  vi.useFakeTimers()
  toastAdd = vi.fn()
  vi.mocked(useToast).mockReturnValue({
    add: toastAdd,
    remove: vi.fn(),
    clear: vi.fn(),
  } as unknown as ReturnType<typeof useToast>)
})

afterEach(() => {
  useRealTimers()
})

describe('useFormDraft — seeding', () => {
  it('seeds data and baseline from the instance once it arrives', async () => {
    const { draft } = mountDraft()
    await untilSeeded(draft)

    expect(draft.instance.value).toEqual(openFormInstance)
    expect(draft.draft.value?.data).toEqual(baseData)
    expect(draft.draft.value?.baseline).toEqual(baseData)
    expect(draft.saveStatus.value).toBe('idle')
  })

  it('does not fetch or seed while collapsed', async () => {
    const counter = trackPostCalls(GET_FORM_INST, () => apiOk(openFormInstance))
    const { draft } = mountDraft({ expanded: false })
    await advance(100)

    expect(counter.count).toBe(0)
    expect(draft.draft.value).toBeUndefined()
  })
})

describe('useFormDraft — autosave', () => {
  it('saves 1500 ms after the last change with the last edited field', async () => {
    const { draft } = mountDraft()
    await untilSeeded(draft)
    const bodies = captureSaves()

    draft.onChange(changeEvent({ ...baseData, notes: 'h' }))
    await advance(SAVE_DEBOUNCE_MS - 100)
    draft.onChange(changeEvent({ ...baseData, notes: 'he' }))
    await advance(SAVE_DEBOUNCE_MS - 1)
    expect(bodies).toHaveLength(0)

    await advance(1)
    await advance(20)
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toMatchObject({
      agentId: FORM_FIXTURE_AGENT_ID,
      sessionId: FORM_FIXTURE_SESSION_ID,
      instanceId: OPEN_FORM_INSTANCE_ID,
      data: { ...baseData, notes: 'he' },
      lastEditedField: '/notes',
    })
    expect(draft.saveStatus.value).toBe('saved')
    expect(draft.draft.value?.lastEditedPointer).toBeUndefined()
  })

  it('does not save when the data equals the baseline', async () => {
    const { draft } = mountDraft()
    await untilSeeded(draft)
    const counter = trackPostCalls(SAVE_FORM_INST, () => apiOk(openFormInstance))

    draft.onChange(changeEvent(structuredClone(baseData)))
    draft.onChange(changeEvent({ ...baseData, notes: 'x' }))
    draft.onChange(changeEvent(structuredClone(baseData)))
    await advance(SAVE_DEBOUNCE_MS + 50)

    expect(counter.count).toBe(0)
    expect(draft.saveStatus.value).toBe('idle')
  })

  it('ignores changes while read-only', async () => {
    const { draft } = mountDraft({ readonly: true })
    await untilSeeded(draft)
    const counter = trackPostCalls(SAVE_FORM_INST, () => apiOk(openFormInstance))

    draft.onChange(changeEvent({ ...baseData, notes: 'x' }))
    await advance(SAVE_DEBOUNCE_MS + 50)

    expect(counter.count).toBe(0)
    expect(draft.draft.value?.data).toEqual(baseData)
  })

  it('coalesces a change made during an in-flight save into one follow-up', async () => {
    const { draft } = mountDraft()
    await untilSeeded(draft)
    const bodies: Array<Record<string, unknown>> = []
    server.use(
      http.post(SAVE_FORM_INST, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        bodies.push(body)
        await delay(200)
        return apiOk({ ...openFormInstance, data: body.data })
      }),
    )

    draft.onChange(changeEvent({ ...baseData, notes: '1' }))
    await advance(SAVE_DEBOUNCE_MS + 10)
    expect(draft.saveStatus.value).toBe('saving')

    draft.onChange(changeEvent({ ...baseData, notes: '12' }))
    const flushed = draft.flush()
    await advance(500)

    expect(await flushed).toBe('saved')
    expect(bodies.map((b) => (b.data as Record<string, unknown>).notes)).toEqual(['1', '12'])
    expect(draft.draft.value?.baseline).toEqual({ ...baseData, notes: '12' })
  })

  it('applies the merge rule to the save response so the focused field keeps the local value', async () => {
    const { draft } = mountDraft()
    await untilSeeded(draft)
    captureSaves((data) => ({
      ...data,
      company: { ...(data.company as Record<string, unknown>), name: COMPUTED_COMPANY_NAME },
    }))

    const field = document.createElement('input')
    const wrapperEl = document.createElement('div')
    wrapperEl.setAttribute('data-form-path', '/company/taxId')
    wrapperEl.appendChild(field)
    document.body.appendChild(wrapperEl)
    draft.onFocusIn({ target: field } as unknown as FocusEvent)
    expect(draft.focusedPointer.value).toBe('/company/taxId')

    draft.onChange(changeEvent({ ...baseData, company: { taxId: 'typing' } }))
    await advance(SAVE_DEBOUNCE_MS + 50)

    expect(draft.saveStatus.value).toBe('saved')
    expect(draft.draft.value?.data).toEqual({
      ...baseData,
      company: { taxId: 'typing', name: COMPUTED_COMPANY_NAME },
    })
    expect(draft.draft.value?.baseline).toEqual({
      ...baseData,
      company: { taxId: 'typing', name: COMPUTED_COMPANY_NAME },
    })
    wrapperEl.remove()
  })

  it('hides the saved status after 2 s', async () => {
    const { draft } = mountDraft()
    await untilSeeded(draft)
    captureSaves()

    draft.onChange(changeEvent({ ...baseData, notes: 'x' }))
    await advance(SAVE_DEBOUNCE_MS + 50)
    expect(draft.saveStatus.value).toBe('saved')

    await advance(SAVED_VISIBLE_MS - 100)
    expect(draft.saveStatus.value).toBe('saved')
    await advance(150)
    expect(draft.saveStatus.value).toBe('idle')
  })
})

describe('useFormDraft — flush', () => {
  it('cancels the debounce timer and saves at once', async () => {
    const { draft } = mountDraft()
    await untilSeeded(draft)
    const bodies = captureSaves()

    draft.onChange(changeEvent({ ...baseData, notes: 'now' }))
    const status = draft.flush()
    await advance(20)

    expect(bodies).toHaveLength(1)
    expect(await status).toBe('saved')

    await advance(SAVE_DEBOUNCE_MS + 50)
    expect(bodies).toHaveLength(1)
  })

  it('cancelPendingSave drops the debounce timer without saving', async () => {
    const { draft, store } = mountDraft()
    await untilSeeded(draft)
    const counter = trackPostCalls(SAVE_FORM_INST, () => apiOk(openFormInstance))

    draft.onChange(changeEvent({ ...baseData, notes: 'discarded' }))
    draft.cancelPendingSave()
    await advance(SAVE_DEBOUNCE_MS + 50)

    expect(counter.count).toBe(0)
    expect(store.getDraft(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID)?.data).toMatchObject({
      notes: 'discarded',
    })
  })

  it('returns the current status when nothing is dirty', async () => {
    const { draft } = mountDraft()
    await untilSeeded(draft)
    const counter = trackPostCalls(SAVE_FORM_INST, () => apiOk(openFormInstance))

    expect(await draft.flush()).toBe('idle')
    expect(counter.count).toBe(0)
  })

  it('flushes when keyboard focus leaves the body, not when it moves inside', async () => {
    const { draft } = mountDraft()
    await untilSeeded(draft)
    const bodies = captureSaves()
    const body = document.createElement('div')
    const inside = document.createElement('input')
    const outside = document.createElement('button')
    body.appendChild(inside)
    document.body.append(body, outside)

    draft.onChange(changeEvent({ ...baseData, notes: 'x' }))
    draft.onFocusOut({ currentTarget: body, relatedTarget: inside } as unknown as FocusEvent)
    await advance(20)
    expect(bodies).toHaveLength(0)

    draft.onFocusOut({ currentTarget: body, relatedTarget: outside } as unknown as FocusEvent)
    await advance(20)
    expect(bodies).toHaveLength(1)
    expect(draft.focusedPointer.value).toBeUndefined()
    body.remove()
    outside.remove()
  })

  it('flushes on collapse before the query is disabled, and on unmount', async () => {
    const { draft, expanded, wrapper } = mountDraft()
    await untilSeeded(draft)
    const bodies = captureSaves()

    draft.onChange(changeEvent({ ...baseData, notes: 'collapse' }))
    expanded.value = false
    await advance(20)
    expect(bodies).toHaveLength(1)

    expanded.value = true
    await advance(20)
    draft.onChange(changeEvent({ ...baseData, notes: 'unmount' }))
    wrapper.unmount()
    await advance(20)
    expect(bodies).toHaveLength(2)
  })

  it('keeps the draft and marks the instance stale when the collapse flush gets a 400', async () => {
    const { draft, expanded, queryClient, store } = mountDraft()
    await untilSeeded(draft)
    const instanceFetches = trackPostCalls(GET_FORM_INST, () => apiOk(openFormInstance))
    server.use(http.post(SAVE_FORM_INST, () => apiError(400, 'VALIDATION_ERROR', 'closed')))

    draft.onChange(changeEvent({ ...baseData, notes: 'x' }))
    expanded.value = false
    await advance(50)

    expect(draft.saveStatus.value).toBe('error')
    expect(store.dirtyInstanceIds(FORM_FIXTURE_SESSION_ID)).toEqual([OPEN_FORM_INSTANCE_ID])
    const key = formQueryKeys.instance(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID)
    expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
    expect(instanceFetches.count).toBe(0)

    expanded.value = true
    await advance(50)
    expect(instanceFetches.count).toBe(1)
  })
})

describe('useFormDraft — errors', () => {
  it('sets the error status inline without a toast and keeps the draft dirty', async () => {
    const { draft, store } = mountDraft()
    await untilSeeded(draft)
    server.use(http.post(SAVE_FORM_INST, () => apiError(500, 'SERVER_ERROR', 'down')))

    draft.onChange(changeEvent({ ...baseData, notes: 'keep' }))
    await advance(SAVE_DEBOUNCE_MS + 50)

    expect(draft.saveStatus.value).toBe('error')
    expect(draft.errorMessage.value).toEqual(expect.stringMatching(/\S/))
    expect(draft.draft.value?.data).toEqual({ ...baseData, notes: 'keep' })
    expect(store.dirtyInstanceIds(FORM_FIXTURE_SESSION_ID)).toEqual([OPEN_FORM_INSTANCE_ID])
    expect(toastAdd).not.toHaveBeenCalled()

    captureSaves()
    expect(await draft.flush()).toBe('saved')
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('invalidates the list and the instance on a 400', async () => {
    const { draft, queryClient } = mountDraft()
    await untilSeeded(draft)
    server.use(http.post(SAVE_FORM_INST, () => apiError(400, 'VALIDATION_ERROR', 'closed')))
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    draft.onChange(changeEvent({ ...baseData, notes: 'x' }))
    await advance(SAVE_DEBOUNCE_MS + 50)

    expect(draft.saveStatus.value).toBe('error')
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: formQueryKeys.list(FORM_FIXTURE_SESSION_ID),
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: formQueryKeys.instance(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID),
    })
    expect(toastAdd).not.toHaveBeenCalled()
  })
})

describe('useFormDraft — schema defaults', () => {
  it('treats a default ajv wrote into the data in place as an unsaved edit', async () => {
    const { draft, store } = mountDraft()
    await untilSeeded(draft)
    const bodies = captureSaves()

    // The same ajv useJsonForms builds; it writes defaults into the object the
    // renderer was handed, which is draft.data itself.
    createAjv({ useDefaults: true }).validate(
      { type: 'object', properties: { industry: { type: 'string', default: 'IT' } } },
      draft.draft.value!.data,
    )

    expect(draft.draft.value?.data).toEqual({ ...baseData, industry: 'IT' })
    expect(draft.draft.value?.baseline).toEqual(baseData)
    expect(store.dirtyInstanceIds(FORM_FIXTURE_SESSION_ID)).toEqual([OPEN_FORM_INSTANCE_ID])

    expect(await draft.flush()).toBe('saved')
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toMatchObject({ data: { ...baseData, industry: 'IT' } })
  })

  it('does not adopt the query cache object as the draft data', async () => {
    const { draft, queryClient } = mountDraft()
    await untilSeeded(draft)

    createAjv({ useDefaults: true }).validate(
      { type: 'object', properties: { industry: { type: 'string', default: 'IT' } } },
      draft.draft.value!.data,
    )

    const cached = queryClient.getQueryData<FormInstance>(
      formQueryKeys.instance(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID),
    )
    expect(cached?.data).not.toHaveProperty('industry')
  })
})

describe('useFormDraft — server updates', () => {
  it('merges refetched instance data into an existing draft, keeping the focused field', async () => {
    const { draft, queryClient } = mountDraft()
    await untilSeeded(draft)

    const field = document.createElement('input')
    const wrapperEl = document.createElement('div')
    wrapperEl.setAttribute('data-form-path', '/company/taxId')
    wrapperEl.appendChild(field)
    document.body.appendChild(wrapperEl)
    draft.onFocusIn({ target: field } as unknown as FocusEvent)
    draft.onChange(changeEvent({ ...baseData, company: { taxId: 'typing' } }))

    const serverData = {
      ...baseData,
      company: { taxId: 'agent', name: 'Agent Kft.' },
      notes: 'agent',
    }
    queryClient.setQueryData(
      formQueryKeys.instance(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID),
      {
        ...openFormInstance,
        data: serverData,
      },
    )
    await nextTick()

    expect(draft.draft.value?.baseline).toEqual(serverData)
    expect(draft.draft.value?.data).toEqual({
      ...serverData,
      company: { taxId: 'typing', name: 'Agent Kft.' },
    })
    wrapperEl.remove()
  })

  it('saves the merged draft after the debounce when the focused field kept a local value', async () => {
    const { draft, queryClient } = mountDraft()
    await untilSeeded(draft)
    const bodies = captureSaves()

    const field = document.createElement('input')
    const wrapperEl = document.createElement('div')
    wrapperEl.setAttribute('data-form-path', '/company/taxId')
    wrapperEl.appendChild(field)
    document.body.appendChild(wrapperEl)
    draft.onFocusIn({ target: field } as unknown as FocusEvent)

    const serverData = { ...baseData, company: { taxId: 'agent' } }
    queryClient.setQueryData(
      formQueryKeys.instance(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID),
      { ...openFormInstance, data: serverData },
    )
    await nextTick()
    const merged = {
      ...serverData,
      company: { taxId: (baseData.company as Record<string, unknown>).taxId },
    }
    expect(draft.draft.value?.data).toEqual(merged)
    expect(bodies).toHaveLength(0)

    await advance(SAVE_DEBOUNCE_MS + 50)
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toMatchObject({ data: merged })
    expect(draft.saveStatus.value).toBe('saved')
    wrapperEl.remove()
  })

  it('does not schedule a save when a refetch replaces the draft without a focused field', async () => {
    const { draft, queryClient } = mountDraft()
    await untilSeeded(draft)
    const counter = trackPostCalls(SAVE_FORM_INST, () => apiOk(openFormInstance))

    const serverData = { ...baseData, notes: 'agent' }
    queryClient.setQueryData(
      formQueryKeys.instance(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID),
      { ...openFormInstance, data: serverData },
    )
    await nextTick()
    await advance(SAVE_DEBOUNCE_MS + 50)

    expect(draft.draft.value?.data).toEqual(serverData)
    expect(counter.count).toBe(0)
  })

  it('takes server data for an unsaved edit outside the focused field', async () => {
    const { draft, queryClient } = mountDraft()
    await untilSeeded(draft)
    const bodies = captureSaves()

    draft.onChange(changeEvent({ ...baseData, notes: 'USER TYPED THIS' }))
    const blur = focusControl(draft, '/company/taxId')

    pushServerData(queryClient, { ...baseData, headcount: 12 })
    await nextTick()

    expect(draft.draft.value?.data).toEqual({ ...baseData, headcount: 12 })

    await advance(SAVE_DEBOUNCE_MS + 50)
    expect(bodies).toHaveLength(0)
    blur()
  })

  it('takes server data for every unfocused edit when a server update lands', async () => {
    const { draft, queryClient } = mountDraft()
    await untilSeeded(draft)
    const bodies = captureSaves()

    draft.onChange(changeEvent({ ...baseData, notes: 'n' }))
    draft.onChange(changeEvent({ ...baseData, notes: 'n', headcount: 7 }))
    draft.onChange(changeEvent({ ...baseData, notes: 'n', headcount: 7, revenue: 42 }))
    const blur = focusControl(draft, '/company/taxId')

    pushServerData(queryClient, { ...baseData, industry: 'IT' })
    await nextTick()

    expect(draft.draft.value?.data).toEqual({ ...baseData, industry: 'IT' })

    await advance(SAVE_DEBOUNCE_MS + 50)
    expect(bodies).toHaveLength(0)
    blur()
  })

  it('takes server data when no control reported a focused pointer', async () => {
    const { draft, queryClient } = mountDraft()
    await untilSeeded(draft)
    const bodies = captureSaves()

    draft.onChange(changeEvent({ ...baseData, notes: 'no focus path' }))
    expect(draft.focusedPointer.value).toBeUndefined()

    pushServerData(queryClient, { ...baseData, headcount: 3 })
    await nextTick()

    expect(draft.draft.value?.data).toEqual({ ...baseData, headcount: 3 })

    await advance(SAVE_DEBOUNCE_MS + 50)
    expect(bodies).toHaveLength(0)
  })

  it('takes all server values when the edited field is not focused', async () => {
    const { draft, queryClient } = mountDraft()
    await untilSeeded(draft)
    captureSaves()

    draft.onChange(changeEvent({ ...baseData, notes: 'mine' }))

    pushServerData(queryClient, { ...baseData, company: { taxId: 'agent changed it' } })
    await nextTick()

    expect(draft.draft.value?.data).toEqual({
      ...baseData,
      company: { taxId: 'agent changed it' },
    })
  })

  it('takes the server value when the changed field is not focused', async () => {
    const { draft, queryClient } = mountDraft()
    await untilSeeded(draft)
    const bodies = captureSaves()

    draft.onChange(changeEvent({ ...baseData, notes: 'local edit' }))
    const blur = focusControl(draft, '/company/taxId')

    pushServerData(queryClient, { ...baseData, notes: 'server changed it too' })
    await nextTick()

    expect(draft.draft.value?.data).toEqual({ ...baseData, notes: 'server changed it too' })

    await advance(SAVE_DEBOUNCE_MS + 50)
    expect(bodies).toHaveLength(0)
    blur()
  })

  it('leaves a dirty draft alone when the arriving data equals the baseline', async () => {
    const { draft, queryClient } = mountDraft()
    await untilSeeded(draft)

    draft.onChange(changeEvent({ ...baseData, notes: 'unsaved' }))
    queryClient.setQueryData(
      formQueryKeys.instance(FORM_FIXTURE_SESSION_ID, OPEN_FORM_INSTANCE_ID),
      {
        ...openFormInstance,
        modDate: '2026-09-16T13:00:00',
      },
    )
    await nextTick()

    expect(draft.draft.value?.data).toEqual({ ...baseData, notes: 'unsaved' })
  })
})
