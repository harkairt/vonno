import { toRaw } from 'vue'
import type { QueryClient } from '@tanstack/vue-query'
import { formService } from '@/lib/api/services/FormService'
import type { FormInstance } from '@/types/api/schemas'
import { formQueryKeys } from '~/composables/useFormQueries'
import { isDraftDirty, type FormSaveStatus, useFormsStore } from '~/stores/forms'
import { mergeServerData } from '~/utils/formMerge'
import { diffToJsonPointer, type JsonPointer } from '~/utils/jsonPointer'
import type { AppError } from '@/lib/errors/types'
import { useQueryClient } from '@tanstack/vue-query'

export interface FormDraftTarget {
  sessionId: string
  agentId: number
  instanceId: string
}

export interface FormDraftSaveDeps {
  store: ReturnType<typeof useFormsStore>
  queryClient: QueryClient
  getFocusedPointer?: () => JsonPointer | undefined
}

interface InFlightSave {
  pending: boolean
  done: Promise<FormSaveStatus>
}

const inFlight = new Map<string, InFlightSave>()

export function resetFormDraftSaves(): void {
  inFlight.clear()
}

export function applySavedInstance(
  queryClient: QueryClient,
  sessionId: string,
  instanceId: string,
  instance: FormInstance,
): void {
  queryClient.setQueryData(formQueryKeys.instance(sessionId, instanceId), instance)
  if (instance.status !== 'Open') {
    void queryClient.invalidateQueries({ queryKey: formQueryKeys.list(sessionId) })
  }
}

export function invalidateFormAfterStaleWrite(
  error: AppError,
  queryClient: QueryClient,
  sessionId: string,
  instanceId: string,
): void {
  if (![400, 404, 409].includes(error.statusCode ?? 0)) return
  void queryClient.invalidateQueries({ queryKey: formQueryKeys.list(sessionId) })
  void queryClient.invalidateQueries({
    queryKey: formQueryKeys.instance(sessionId, instanceId),
  })
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? (value as unknown[]) : [])

const statusOf = (value: unknown): unknown => (isRecord(value) ? value.status : undefined)

// The list summary and the instance lag behind each other after a submit, so a
// form is open only while neither source has already closed it.
function isFormOpen(queryClient: QueryClient, sessionId: string, instanceId: string): boolean {
  const instance = queryClient.getQueryData(formQueryKeys.instance(sessionId, instanceId))
  const list = queryClient.getQueryData(formQueryKeys.list(sessionId))
  const forms = asArray(isRecord(list) ? list.forms : undefined)
  const summary = forms.find((form) => isRecord(form) && form.instanceId === instanceId)
  return [statusOf(instance), statusOf(summary)].every(
    (status) => status === undefined || status === 'Open',
  )
}

async function performSave(
  { sessionId, agentId, instanceId }: FormDraftTarget,
  { store, queryClient, getFocusedPointer }: FormDraftSaveDeps,
): Promise<FormSaveStatus> {
  const draft = store.getDraft(sessionId, instanceId)
  if (!draft || !isDraftDirty(draft)) return draft?.saveState.status ?? 'idle'
  // A closed form rejects every write with a 400 and has no save-status row mounted;
  // skipping it keeps the send-flush toast the only place this failure ever surfaces.
  if (!isFormOpen(queryClient, sessionId, instanceId)) return 'idle'

  store.setSaveStatus(sessionId, instanceId, 'saving')
  const sent: Record<string, unknown> = JSON.parse(JSON.stringify(draft.data))
  const result = await formService.saveFormInst({
    agentId,
    sessionId,
    instanceId,
    data: sent,
    lastEditedField: draft.lastEditedPointer,
  })

  const current = store.getDraft(sessionId, instanceId)
  if (!current) return 'idle'

  if (result.isErr()) {
    store.setSaveStatus(sessionId, instanceId, 'error', result.error.message || undefined)
    invalidateFormAfterStaleWrite(result.error, queryClient, sessionId, instanceId)
    return 'error'
  }

  const instance = result.value
  applySavedInstance(queryClient, sessionId, instanceId, instance)

  const serverData = structuredClone(toRaw(instance.data ?? {}))
  store.setBaseline(sessionId, instanceId, serverData)
  // Edits typed while the request was in flight must survive the response; the
  // moved baseline keeps the draft dirty so the follow-up save sends them.
  const editedDuringFlight = diffToJsonPointer(sent, current.data) !== undefined
  if (!editedDuringFlight) {
    store.updateDraftData(
      sessionId,
      instanceId,
      mergeServerData(toRaw(current.data), serverData, [getFocusedPointer?.()]),
    )
    store.setLastEditedPointer(sessionId, instanceId, undefined)
  }
  store.setSaveStatus(sessionId, instanceId, 'saved')
  return 'saved'
}

/**
 * Save a dirty draft with the store and query client alone, so a flush works for
 * collapsed items and before a chat message is sent without a mounted composable.
 * A save requested while one is in flight is coalesced into a single follow-up;
 * every caller receives the status of the last save.
 */
export function saveFormDraft(
  target: FormDraftTarget,
  deps: FormDraftSaveDeps,
): Promise<FormSaveStatus> {
  const key = `${target.sessionId}/${target.instanceId}`
  const running = inFlight.get(key)
  if (running) {
    running.pending = true
    return running.done
  }

  const entry: InFlightSave = { pending: false, done: Promise.resolve('idle') }
  entry.done = (async () => {
    try {
      let status = await performSave(target, deps)
      while (entry.pending) {
        entry.pending = false
        status = await performSave(target, deps)
      }
      return status
    } finally {
      inFlight.delete(key)
    }
  })()
  inFlight.set(key, entry)
  return entry.done
}

export function flushSessionFormDrafts(
  sessionId: string,
  agentId: number | undefined,
  deps: FormDraftSaveDeps,
): Promise<FormSaveStatus[]> {
  if (agentId === undefined) return Promise.resolve([])
  return Promise.allSettled(
    deps.store
      .dirtyInstanceIds(sessionId)
      .map((instanceId) => saveFormDraft({ sessionId, agentId, instanceId }, deps)),
  ).then((results) => results.map((r) => (r.status === 'fulfilled' ? r.value : 'error')))
}

export function useFormDraftFlush() {
  const store = useFormsStore()
  const queryClient = useQueryClient()

  return (sessionId: string, agentId: number | undefined): Promise<FormSaveStatus[]> =>
    flushSessionFormDrafts(sessionId, agentId, { store, queryClient })
}
