import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { toRaw } from 'vue'
import { useFormsStore, type FormsSessionState } from '~/stores/forms'

describe('Forms Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('setSelected sets the marker and creates the session on demand', () => {
    const store = useFormsStore()

    store.setSelected('s1', 'a')
    expect(store.sessions['s1']?.selectedInstanceId).toBe('a')

    store.setSelected('s1', null)
    expect(store.sessions['s1']?.selectedInstanceId).toBeNull()
  })

  it('initSelectedFromList sets the marker only on the first call', () => {
    const store = useFormsStore()

    store.initSelectedFromList('s1', 'a')
    expect(store.sessions['s1']?.selectedInstanceId).toBe('a')
    expect(store.sessions['s1']?.selectedInitialized).toBe(true)

    store.initSelectedFromList('s1', 'b')
    expect(store.sessions['s1']?.selectedInstanceId).toBe('a')
  })

  it('focusForm expands the id, collapses every unpinned other id and marks it focused', () => {
    const store = useFormsStore()

    store.focusForm('s1', 'a')
    store.togglePinned('s1', 'p')
    store.focusForm('s1', 'b')
    store.focusForm('s1', 'c')

    expect(store.sessions['s1']?.expandedIds).toEqual(['p', 'c'])
    expect(store.sessions['s1']?.pinnedIds).toEqual(['p'])
    expect(store.lastFocusedId).toBe('c')
  })

  it('focusForm bumps the focus sequence even for an already focused id', () => {
    const store = useFormsStore()

    store.focusForm('s1', 'a')
    const seq = store.lastFocusSeq
    store.focusForm('s1', 'a')

    expect(store.lastFocusSeq).toBe(seq + 1)
    expect(store.sessions['s1']?.expandedIds).toEqual(['a'])
  })

  it('toggleExpanded collapses an expanded id and focuses a collapsed one', () => {
    const store = useFormsStore()

    store.focusForm('s1', 'a')
    store.toggleExpanded('s1', 'b')
    expect(store.sessions['s1']?.expandedIds).toEqual(['b'])
    expect(store.lastFocusedId).toBe('b')

    store.toggleExpanded('s1', 'b')
    expect(store.sessions['s1']?.expandedIds).toEqual([])
  })

  it('collapse removes an unpinned id from expandedIds', () => {
    const store = useFormsStore()

    store.togglePinned('s1', 'a')
    store.togglePinned('s1', 'b')
    store.togglePinned('s1', 'b')
    store.collapse('s1', 'b')

    expect(store.sessions['s1']?.expandedIds).toEqual(['a'])
    expect(store.sessions['s1']?.pinnedIds).toEqual(['a'])
  })

  it('collapse removes a pinned id from expandedIds and keeps the pin', () => {
    const store = useFormsStore()

    store.togglePinned('s1', 'a')
    store.collapse('s1', 'a')

    expect(store.sessions['s1']?.expandedIds).toEqual([])
    expect(store.sessions['s1']?.pinnedIds).toEqual(['a'])

    store.focusForm('s1', 'a')

    expect(store.sessions['s1']?.expandedIds).toEqual(['a'])
    expect(store.sessions['s1']?.pinnedIds).toEqual(['a'])
  })

  it('togglePinned pins and expands; unpinning keeps the item expanded', () => {
    const store = useFormsStore()

    store.togglePinned('s1', 'a')
    expect(store.sessions['s1']?.pinnedIds).toEqual(['a'])
    expect(store.sessions['s1']?.expandedIds).toEqual(['a'])

    store.togglePinned('s1', 'a')
    expect(store.sessions['s1']?.pinnedIds).toEqual([])
    expect(store.sessions['s1']?.expandedIds).toEqual(['a'])
  })

  it('removeForm drops the id everywhere and clears the marker when it is the marker', () => {
    const store = useFormsStore()

    store.togglePinned('s1', 'a')
    store.setSelected('s1', 'a')
    store.createDraft('s1', 'a', {})
    store.removeForm('s1', 'a')

    expect(store.sessions['s1']).toEqual({
      expandedIds: [],
      pinnedIds: [],
      selectedInstanceId: null,
      selectedInitialized: false,
      drafts: {},
    })
  })

  it('removeForm keeps the marker when another id is removed', () => {
    const store = useFormsStore()

    store.setSelected('s1', 'a')
    store.focusForm('s1', 'b')
    store.removeForm('s1', 'b')

    expect(store.sessions['s1']?.selectedInstanceId).toBe('a')
    expect(store.sessions['s1']?.expandedIds).toEqual([])
  })

  it('reset clears every session and the focus marker', () => {
    const store = useFormsStore()

    store.setSelected('s1', 'a')
    store.focusForm('s2', 'b')
    store.reset()
    expect(store.sessions).toEqual({})
    expect(store.lastFocusedId).toBeNull()
  })
})

describe('Forms Store — expandedIds/pinnedIds never hold duplicates', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('pinning an id that is already expanded through focus does not duplicate the pinned or expanded id', () => {
    const store = useFormsStore()

    store.focusForm('s1', 'a')
    store.togglePinned('s1', 'a')

    expect(store.sessions['s1']?.pinnedIds).toEqual(['a'])
    expect(store.sessions['s1']?.expandedIds).toEqual(['a'])
  })

  it('focusing an id that is already expanded through pinning does not duplicate the expanded id', () => {
    const store = useFormsStore()

    store.togglePinned('s1', 'a')
    store.focusForm('s1', 'a')

    expect(store.sessions['s1']?.expandedIds).toEqual(['a'])
  })
})

describe('Forms Store — consumers cannot bypass the mutators', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('does not expose the ensureSession helper', () => {
    const store = useFormsStore()

    expect('ensureSession' in store).toBe(false)
  })

  it('sessions is a readonly view: writing through it does not change the store state', () => {
    const store = useFormsStore()
    store.focusForm('s1', 'a')
    const before = store.sessions['s1']

    const mutableSessions = store.sessions as unknown as Record<string, FormsSessionState>
    mutableSessions['s1'] = { ...before!, expandedIds: ['a', 'b'] }

    expect(store.sessions['s1']).toEqual(before)
  })
})

describe('Forms Store — drafts', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('createDraft creates a clean draft whose baseline equals the data', () => {
    const store = useFormsStore()

    expect(store.getDraft('s1', 'a')).toBeUndefined()
    store.createDraft('s1', 'a', { company: { taxId: '1' } })

    expect(store.getDraft('s1', 'a')).toEqual({
      data: { company: { taxId: '1' } },
      baseline: { company: { taxId: '1' } },
      lastEditedPointer: undefined,
      saveState: { status: 'idle' },
      showErrors: false,
    })
    expect(store.dirtyInstanceIds('s1')).toEqual([])
  })

  it('createDraft gives the baseline its own copy of the data', () => {
    const store = useFormsStore()
    const data = { company: { taxId: '1' } }
    store.createDraft('s1', 'a', data)

    const draft = store.getDraft('s1', 'a')!
    expect(draft.baseline).toEqual(draft.data)
    expect(toRaw(draft.baseline)).not.toBe(toRaw(draft.data))
    expect(toRaw(draft.baseline.company)).not.toBe(data.company)

    // An in-place write — what ajv's useDefaults does to the rendered data.
    ;(draft.data.company as Record<string, unknown>).country = 'HU'

    expect(draft.baseline).toEqual({ company: { taxId: '1' } })
    expect(store.dirtyInstanceIds('s1')).toEqual(['a'])
  })

  it('createDraft always starts clean, even when a draft already existed for the id', () => {
    const store = useFormsStore()
    store.createDraft('s1', 'a', { notes: 'x' })
    store.updateDraftData('s1', 'a', { notes: 'y' })
    expect(store.dirtyInstanceIds('s1')).toEqual(['a'])

    store.createDraft('s1', 'a', { notes: 'z' })

    expect(store.getDraft('s1', 'a')).toMatchObject({
      data: { notes: 'z' },
      baseline: { notes: 'z' },
    })
    expect(store.dirtyInstanceIds('s1')).toEqual([])
  })

  it('updateDraftData replaces only the data of an existing draft', () => {
    const store = useFormsStore()
    store.createDraft('s1', 'a', { notes: 'x' })
    store.setBaseline('s1', 'a', { notes: 'server' })
    store.setLastEditedPointer('s1', 'a', '/notes')
    store.setShowErrors('s1', 'a', true)
    store.setSaveStatus('s1', 'a', 'error', 'boom')

    store.updateDraftData('s1', 'a', { notes: 'new' })

    expect(store.getDraft('s1', 'a')).toEqual({
      data: { notes: 'new' },
      baseline: { notes: 'server' },
      lastEditedPointer: '/notes',
      saveState: { status: 'error', message: 'boom' },
      showErrors: true,
    })
  })

  it('updateDraftData ignores an instance without a draft', () => {
    const store = useFormsStore()

    store.updateDraftData('s1', 'a', { notes: 'x' })

    expect(store.getDraft('s1', 'a')).toBeUndefined()
  })

  it('setSaveStatus keeps status and message as one value that cannot desynchronize', () => {
    const store = useFormsStore()
    store.createDraft('s1', 'a', { notes: 'x' })

    store.setSaveStatus('s1', 'a', 'error', 'boom')
    expect(store.getDraft('s1', 'a')?.saveState).toEqual({ status: 'error', message: 'boom' })

    store.setSaveStatus('s1', 'a', 'saved')
    expect(store.getDraft('s1', 'a')?.saveState).toEqual({ status: 'saved' })
  })

  it('setters ignore an instance without a draft', () => {
    const store = useFormsStore()

    store.setBaseline('s1', 'a', {})
    store.setSaveStatus('s1', 'a', 'saving')
    store.setShowErrors('s1', 'a', true)
    store.setLastEditedPointer('s1', 'a', '/x')

    expect(store.getDraft('s1', 'a')).toBeUndefined()
  })

  it('dirtyInstanceIds compares data with the baseline by deep equality', () => {
    const store = useFormsStore()

    store.createDraft('s1', 'a', { company: { taxId: '1' }, contacts: [{ name: 'x' }] })
    store.createDraft('s1', 'b', { notes: 'same' })
    store.createDraft('s1', 'c', { notes: 'same' })

    store.updateDraftData('s1', 'a', { company: { taxId: '1' }, contacts: [{ name: 'x' }] })
    expect(store.dirtyInstanceIds('s1')).toEqual([])

    store.updateDraftData('s1', 'a', { company: { taxId: '2' }, contacts: [{ name: 'x' }] })
    store.updateDraftData('s1', 'c', { notes: 'same', extra: true })
    expect(store.dirtyInstanceIds('s1')).toEqual(['a', 'c'])

    store.setBaseline('s1', 'a', { company: { taxId: '2' }, contacts: [{ name: 'x' }] })
    expect(store.dirtyInstanceIds('s1')).toEqual(['c'])

    expect(store.dirtyInstanceIds('unknown')).toEqual([])
  })
})
