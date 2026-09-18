import { defineStore } from 'pinia'
import { readonly, ref, toRaw } from 'vue'
import { diffToJsonPointer } from '~/utils/jsonPointer'

export type FormSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export type FormSaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved' }
  | { status: 'error'; message: string | undefined }

export interface FormDraftState {
  data: Record<string, unknown>
  baseline: Record<string, unknown>
  lastEditedPointer: string | undefined
  saveState: FormSaveState
  showErrors: boolean
}

export const isDraftDirty = (draft: FormDraftState): boolean =>
  diffToJsonPointer(draft.baseline, draft.data) !== undefined

export interface FormsSessionState {
  expandedIds: string[]
  pinnedIds: string[]
  selectedInstanceId: string | null
  selectedInitialized: boolean
  drafts: Record<string, FormDraftState>
}

function emptySession(): FormsSessionState {
  return {
    expandedIds: [],
    pinnedIds: [],
    selectedInstanceId: null,
    selectedInitialized: false,
    drafts: {},
  }
}

function withId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids : [...ids, id]
}

function withoutId(ids: string[], id: string): string[] {
  return ids.filter((existing) => existing !== id)
}

export const useFormsStore = defineStore('forms', () => {
  const sessions = ref<Record<string, FormsSessionState>>({})
  // Transient scroll/highlight request; the sequence lets a repeated focus of the same id re-trigger.
  const lastFocusedId = ref<string | null>(null)
  const lastFocusSeq = ref(0)

  function ensureSession(sessionId: string): FormsSessionState {
    sessions.value[sessionId] ??= emptySession()
    return sessions.value[sessionId]!
  }

  function focusForm(sessionId: string, instanceId: string): void {
    const session = ensureSession(sessionId)
    const keptExpanded = session.expandedIds.filter(
      (id) => id !== instanceId && session.pinnedIds.includes(id),
    )
    session.expandedIds = withId(keptExpanded, instanceId)
    lastFocusedId.value = instanceId
    lastFocusSeq.value += 1
  }

  function toggleExpanded(sessionId: string, instanceId: string): void {
    const session = ensureSession(sessionId)
    if (session.expandedIds.includes(instanceId)) {
      collapse(sessionId, instanceId)
    } else {
      focusForm(sessionId, instanceId)
    }
  }

  function collapse(sessionId: string, instanceId: string): void {
    const session = ensureSession(sessionId)
    session.expandedIds = withoutId(session.expandedIds, instanceId)
  }

  function togglePinned(sessionId: string, instanceId: string): void {
    const session = ensureSession(sessionId)
    if (session.pinnedIds.includes(instanceId)) {
      session.pinnedIds = withoutId(session.pinnedIds, instanceId)
      session.expandedIds = withId(session.expandedIds, instanceId)
      return
    }
    session.pinnedIds = withId(session.pinnedIds, instanceId)
    session.expandedIds = withId(session.expandedIds, instanceId)
  }

  function removeForm(sessionId: string, instanceId: string): void {
    const session = ensureSession(sessionId)
    session.expandedIds = withoutId(session.expandedIds, instanceId)
    session.pinnedIds = withoutId(session.pinnedIds, instanceId)
    session.drafts = Object.fromEntries(
      Object.entries(session.drafts).filter(([id]) => id !== instanceId),
    )
    if (session.selectedInstanceId === instanceId) session.selectedInstanceId = null
  }

  function setSelected(sessionId: string, instanceId: string | null): void {
    ensureSession(sessionId).selectedInstanceId = instanceId
  }

  function initSelectedFromList(sessionId: string, selectedInstanceId: string | null): void {
    const session = ensureSession(sessionId)
    if (session.selectedInitialized) return
    session.selectedInstanceId = selectedInstanceId
    session.selectedInitialized = true
  }

  function getDraft(sessionId: string, instanceId: string): FormDraftState | undefined {
    return sessions.value[sessionId]?.drafts[instanceId]
  }

  function createDraft(sessionId: string, instanceId: string, data: Record<string, unknown>): void {
    const session = ensureSession(sessionId)
    session.drafts[instanceId] = {
      data,
      // ajv's useDefaults writes schema defaults into `data` in place, so a shared
      // baseline would make those defaults read clean and never be autosaved.
      baseline: structuredClone(toRaw(data)),
      lastEditedPointer: undefined,
      saveState: { status: 'idle' },
      showErrors: false,
    }
  }

  function updateDraftData(
    sessionId: string,
    instanceId: string,
    data: Record<string, unknown>,
  ): void {
    const draft = getDraft(sessionId, instanceId)
    if (draft) draft.data = data
  }

  function setBaseline(
    sessionId: string,
    instanceId: string,
    baseline: Record<string, unknown>,
  ): void {
    const draft = getDraft(sessionId, instanceId)
    if (draft) draft.baseline = baseline
  }

  function setLastEditedPointer(
    sessionId: string,
    instanceId: string,
    pointer: string | undefined,
  ): void {
    const draft = getDraft(sessionId, instanceId)
    if (draft) draft.lastEditedPointer = pointer
  }

  function setSaveStatus(
    sessionId: string,
    instanceId: string,
    status: FormSaveStatus,
    errorMessage?: string,
  ): void {
    const draft = getDraft(sessionId, instanceId)
    if (!draft) return
    draft.saveState = status === 'error' ? { status, message: errorMessage } : { status }
  }

  function setShowErrors(sessionId: string, instanceId: string, showErrors: boolean): void {
    const draft = getDraft(sessionId, instanceId)
    if (draft) draft.showErrors = showErrors
  }

  function pruneStaleDrafts(sessionId: string, knownInstanceIds: string[]): string[] {
    const session = sessions.value[sessionId]
    if (!session) return []
    const known = new Set(knownInstanceIds)
    const dirtyPruned: string[] = []
    for (const [id, draft] of Object.entries(session.drafts)) {
      if (known.has(id)) continue
      if (isDraftDirty(draft)) dirtyPruned.push(id)
      removeForm(sessionId, id)
    }
    return dirtyPruned
  }

  function dirtyInstanceIds(sessionId: string): string[] {
    const drafts = sessions.value[sessionId]?.drafts ?? {}
    return Object.entries(drafts)
      .filter(([, draft]) => isDraftDirty(draft))
      .map(([id]) => id)
  }

  function reset(): void {
    sessions.value = {}
    lastFocusedId.value = null
    lastFocusSeq.value = 0
  }

  return {
    sessions: readonly(sessions),
    lastFocusedId,
    lastFocusSeq,
    focusForm,
    toggleExpanded,
    collapse,
    togglePinned,
    setSelected,
    initSelectedFromList,
    removeForm,
    pruneStaleDrafts,
    getDraft,
    createDraft,
    updateDraftData,
    setBaseline,
    setLastEditedPointer,
    setSaveStatus,
    setShowErrors,
    dirtyInstanceIds,
    reset,
  }
})
