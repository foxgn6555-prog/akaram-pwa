import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { flowbridgeKeys } from '@lib/query-keys/flowbridge.keys'
import { flowbridge } from '@sdk/flowbridge.sdk'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'
import type { CreateEventBindingInput } from '../types'

/** كل الروابط الحالية (تدفق ↔ حدث حقيقي) — تحتاجها المطابقة الفورية */
export function useFlowBridgeBindings() {
  return useQuery({
    queryKey: flowbridgeKeys.bindings(),
    queryFn: () => flowbridge.listBindings(),
    staleTime: 30_000,
  })
}

/** إنشاء ربط تدفق ↔ حدث حقيقي (من صفحة إعدادات FlowBridge) */
export function useCreateFlowBridgeBinding() {
  const queryClient = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (input: CreateEventBindingInput) => flowbridge.createBinding(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: flowbridgeKeys.bindings() })
      addToast({ type: 'success', message: 'تم ربط التدفق بحدث حقيقي' })
    },
    onError: (error) => {
      addToast({ type: 'error', message: handleAppError(error, { scope: 'flowbridge.createBinding' }).message })
    },
  })
}

export function useDeleteFlowBridgeBinding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => flowbridge.deleteBinding(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: flowbridgeKeys.bindings() })
    },
  })
}
