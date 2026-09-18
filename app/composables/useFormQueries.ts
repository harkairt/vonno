import { useQuery } from '@tanstack/vue-query'
import { computed, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { formService } from '@/lib/api/services/FormService'
import { useAuthStore } from '@/app/stores/auth'
import { useFormsStore } from '@/app/stores/forms'
import type { FormInstance, SessionFormsResponse } from '@/types/api/schemas'
import { AppError } from '@/lib/errors/types'
import { ErrorCode } from '@/types/enums'

// Own root: instance queries nest under it so `.all(sessionId)` invalidates both together.
export const formQueryKeys = {
  all: (sessionId: string) => ['forms', sessionId] as const,
  list: (sessionId: string) => [...formQueryKeys.all(sessionId), 'list'] as const,
  instance: (sessionId: string, instanceId: string) =>
    [...formQueryKeys.all(sessionId), 'instance', instanceId] as const,
}

export function assertAgentId(value: number | undefined): asserts value is number {
  if (typeof value !== 'number') {
    throw new AppError(ErrorCode.UNKNOWN_ERROR, 'Agent ID is required')
  }
}

const NO_RETRY_CODES = new Set<string>(['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND'])

export function shouldRetryFormQuery(failureCount: number, error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    const appError = error as AppError
    if (NO_RETRY_CODES.has(appError.code)) return false
    if (appError.code === ErrorCode.VALIDATION_ERROR && appError.statusCode === 400) return false
  }
  return failureCount < 2
}

export function useSessionForms(
  sessionId: MaybeRefOrGetter<string>,
  agentId: MaybeRefOrGetter<number | undefined>,
) {
  const authStore = useAuthStore()
  const formsStore = useFormsStore()

  // eslint-disable-next-line @tanstack/query/exhaustive-deps -- agentId is a fetch param, not a cache discriminator
  const query = useQuery({
    queryKey: computed(() => formQueryKeys.list(toValue(sessionId))),
    queryFn: async (): Promise<SessionFormsResponse> => {
      const currentAgentId = toValue(agentId)
      assertAgentId(currentAgentId)

      const result = await formService.getSessionForms({
        agentId: currentAgentId,
        sessionId: toValue(sessionId),
      })

      if (result.isErr()) {
        throw result.error
      }

      return result.value
    },
    enabled: computed(
      () =>
        authStore.isAuthenticated && !!toValue(sessionId) && typeof toValue(agentId) === 'number',
    ),
    // Every card in a thread observes this query; without a long staleTime each
    // mount would refetch the same list. Mutations and SignalR invalidate it.
    staleTime: 5 * 60 * 1000,
    retry: shouldRetryFormQuery,
  })

  const toast = useToast()
  const { t } = useI18n()

  watch(
    query.data,
    (data) => {
      if (!data) return
      formsStore.initSelectedFromList(toValue(sessionId), data.selectedInstanceId)
      if (data.forms.length === 0) return
      const knownIds = data.forms.map((f) => f.instanceId)
      const dirtyPruned = formsStore.pruneStaleDrafts(toValue(sessionId), knownIds)
      if (dirtyPruned.length > 0) {
        toast.add({ title: t('chat.forms.draftPruned'), color: 'warning' })
      }
    },
    { immediate: true },
  )

  return query
}

export function useFormInstance(
  sessionId: MaybeRefOrGetter<string>,
  agentId: MaybeRefOrGetter<number | undefined>,
  instanceId: MaybeRefOrGetter<string>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  const authStore = useAuthStore()

  // eslint-disable-next-line @tanstack/query/exhaustive-deps -- agentId is a fetch param, not a cache discriminator
  return useQuery({
    queryKey: computed(() => formQueryKeys.instance(toValue(sessionId), toValue(instanceId))),
    queryFn: async (): Promise<FormInstance> => {
      const currentAgentId = toValue(agentId)
      assertAgentId(currentAgentId)

      const result = await formService.getFormInst({
        agentId: currentAgentId,
        sessionId: toValue(sessionId),
        instanceId: toValue(instanceId),
      })

      if (result.isErr()) {
        throw result.error
      }

      return result.value
    },
    // Enabled only while the item is expanded, so an invalidation of a collapsed item fetches nothing.
    enabled: computed(
      () =>
        authStore.isAuthenticated &&
        !!toValue(sessionId) &&
        typeof toValue(agentId) === 'number' &&
        !!toValue(instanceId) &&
        toValue(enabled),
    ),
    retry: shouldRetryFormQuery,
  })
}
