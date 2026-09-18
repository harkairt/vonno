import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { formService } from '@/lib/api/services/FormService'
import type {
  DeleteFormResponse,
  FormInstance,
  FormInstanceRequestDTO,
  SaveFormRequestDTO,
} from '@/types/api/schemas'
import { formQueryKeys } from '~/composables/useFormQueries'
import { useFormsStore } from '~/stores/forms'
import { applySavedInstance } from '~/composables/useFormDraftPersistence'

export function useSaveFormInst() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (request: SaveFormRequestDTO): Promise<FormInstance> => {
      const result = await formService.saveFormInst(request)
      if (result.isErr()) throw result.error
      return result.value
    },

    onSuccess: (instance, request) => {
      applySavedInstance(queryClient, request.sessionId, request.instanceId, instance)
    },
  })
}

export function useDeleteFormInst() {
  const queryClient = useQueryClient()
  const formsStore = useFormsStore()

  return useMutation({
    mutationFn: async (request: FormInstanceRequestDTO): Promise<DeleteFormResponse> => {
      const result = await formService.deleteFormInst(request)
      if (result.isErr()) throw result.error
      return result.value
    },

    onSuccess: (_response, { sessionId, instanceId }) => {
      queryClient.removeQueries({ queryKey: formQueryKeys.instance(sessionId, instanceId) })
      void queryClient.invalidateQueries({ queryKey: formQueryKeys.list(sessionId) })
      formsStore.removeForm(sessionId, instanceId)
    },
  })
}
