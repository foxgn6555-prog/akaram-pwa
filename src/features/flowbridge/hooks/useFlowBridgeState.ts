import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { flowbridgeKeys } from '@lib/query-keys/flowbridge.keys'
import { flowbridge } from '@sdk/flowbridge.sdk'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'
import type { FlowBridgeStateKey, FlowBridgeStateValueMap } from '../types'

/** قراءة مفتاح واحد من حالة FlowBridge (portals/graph/settings) */
export function useFlowBridgeState<K extends FlowBridgeStateKey>(key: K) {
  return useQuery({
    queryKey: flowbridgeKeys.state(key),
    queryFn: () => flowbridge.getState(key),
  })
}

/** آخر الأحداث الحقيقية — تعبئة أولية قبل بدء الاشتراك الحي */
export function useFlowBridgeRecentEvents(limit = 50) {
  return useQuery({
    queryKey: flowbridgeKeys.recentEvents(),
    queryFn: () => flowbridge.recentEvents(limit),
    staleTime: 15_000,
  })
}

/** حفظ مفتاح — يُستدعى من موصل البيانات (data connector) عند كل onGraphChange/setSettings */
export function useSaveFlowBridgeState<K extends FlowBridgeStateKey>(key: K) {
  const queryClient = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (value: FlowBridgeStateValueMap[K]) => flowbridge.setState(key, value),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: flowbridgeKeys.state(key) })
    },
    onError: (error) => {
      addToast({ type: 'error', message: handleAppError(error, { scope: 'flowbridge.save' }).message })
    },
  })
}
