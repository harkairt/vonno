import { computed, onBeforeUnmount, ref, toRaw, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import type { JsonFormsChangeEvent } from '@jsonforms/vue'
import { useFormInstance } from '~/composables/useFormQueries'
import { useFormsStore, type FormSaveStatus } from '~/stores/forms'
import { saveFormDraft } from '~/composables/useFormDraftPersistence'
import { mergeServerData } from '~/utils/formMerge'
import { asJsonPointer, diffToJsonPointer, type JsonPointer } from '~/utils/jsonPointer'
import { createLogger } from '@/lib/utils/logger'

const logger = createLogger('useFormDraft')

export const SAVE_DEBOUNCE_MS = 1500
export const SAVED_VISIBLE_MS = 2000

export interface UseFormDraftOptions {
  sessionId: MaybeRefOrGetter<string>
  agentId: MaybeRefOrGetter<number | undefined>
  instanceId: MaybeRefOrGetter<string>
  expanded: MaybeRefOrGetter<boolean>
  readonly: MaybeRefOrGetter<boolean>
}

export function useFormDraft(options: UseFormDraftOptions) {
  const store = useFormsStore()
  const queryClient = useQueryClient()
  const sessionId = () => toValue(options.sessionId)
  const instanceId = () => toValue(options.instanceId)

  const query = useFormInstance(
    options.sessionId,
    options.agentId,
    options.instanceId,
    options.expanded,
  )

  const draft = computed(() => store.getDraft(sessionId(), instanceId()))
  const saveStatus = computed<FormSaveStatus>(() => draft.value?.saveState.status ?? 'idle')
  const errorMessage = computed(() => {
    const state = draft.value?.saveState
    return state?.status === 'error' ? state.message : undefined
  })
  const focusedPointer = ref<JsonPointer>()

  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let savedTimer: ReturnType<typeof setTimeout> | undefined

  const save = (): Promise<FormSaveStatus> => {
    const agentId = toValue(options.agentId)
    if (typeof agentId !== 'number') {
      logger.warn('Save attempted without a resolved session agent id', {
        sessionId: sessionId(),
        instanceId: instanceId(),
      })
      return Promise.resolve(saveStatus.value)
    }
    return saveFormDraft(
      { sessionId: sessionId(), agentId, instanceId: instanceId() },
      { store, queryClient, getFocusedPointer: () => focusedPointer.value },
    )
  }

  const cancelPendingSave = () => {
    clearTimeout(debounceTimer)
    debounceTimer = undefined
  }

  const flush = (): Promise<FormSaveStatus> => {
    cancelPendingSave()
    return save()
  }

  const scheduleSave = () => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => void save(), SAVE_DEBOUNCE_MS)
  }

  watch(
    query.data,
    (instance) => {
      if (!instance) return
      const serverData = structuredClone(toRaw(instance.data ?? {}))
      const current = draft.value
      if (!current) {
        store.createDraft(sessionId(), instanceId(), serverData)
        return
      }
      if (diffToJsonPointer(current.baseline, serverData) === undefined) return
      const merged = mergeServerData(toRaw(current.data), serverData, [focusedPointer.value])
      store.setBaseline(sessionId(), instanceId(), serverData)
      store.updateDraftData(sessionId(), instanceId(), merged)
      if (diffToJsonPointer(serverData, merged) !== undefined) scheduleSave()
    },
    { immediate: true },
  )

  const onChange = (event: JsonFormsChangeEvent) => {
    if (toValue(options.readonly)) return
    const current = draft.value
    if (!current) return
    const data = (event.data ?? {}) as Record<string, unknown>
    const pointer = diffToJsonPointer(current.data, data)
    if (pointer !== undefined) store.setLastEditedPointer(sessionId(), instanceId(), pointer)
    store.updateDraftData(sessionId(), instanceId(), data)

    clearTimeout(debounceTimer)
    debounceTimer = undefined
    if (diffToJsonPointer(current.baseline, data) !== undefined) scheduleSave()
  }

  const onFocusIn = (event: FocusEvent) => {
    const target = event.target instanceof Element ? event.target : null
    const attr = target?.closest('[data-form-path]')?.getAttribute('data-form-path')
    focusedPointer.value = attr ? asJsonPointer(attr) : undefined
  }

  const onFocusOut = (event: FocusEvent) => {
    const body = event.currentTarget as HTMLElement | null
    const next = event.relatedTarget as Node | null
    if (next && body?.contains(next)) return
    focusedPointer.value = undefined
    void flush()
  }

  watch(
    saveStatus,
    (status) => {
      clearTimeout(savedTimer)
      if (status !== 'saved') return
      savedTimer = setTimeout(() => {
        if (draft.value?.saveState.status === 'saved') {
          store.setSaveStatus(sessionId(), instanceId(), 'idle')
        }
      }, SAVED_VISIBLE_MS)
    },
    { immediate: true },
  )

  watch(
    () => toValue(options.expanded),
    (expanded, wasExpanded) => {
      if (wasExpanded && !expanded) void flush()
    },
  )

  onBeforeUnmount(() => {
    clearTimeout(savedTimer)
    void flush()
  })

  return {
    query,
    instance: query.data,
    draft,
    saveStatus,
    errorMessage,
    focusedPointer,
    onChange,
    onFocusIn,
    onFocusOut,
    flush,
    cancelPendingSave,
  }
}
