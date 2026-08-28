import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { metricsKeys } from '@lib/query-keys/metrics.keys'
import { metrics } from '@sdk/metrics.sdk'

/** تاريخ latency لآخر ساعتين */
export function useConnectionHistory() {
  return useQuery({
    queryKey: metricsKeys.connectionHistory(),
    queryFn: () => metrics.connectionHistory(),
    refetchInterval: 30_000,
  })
}

/** قياس فعلي + تسجيله — يعمل مرة عند التحميل ثم كل دقيقة */
export function useLiveLatency() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => metrics.measureLatency(),
    onSuccess: (ms) => {
      void metrics.sampleLatency(ms)
      void queryClient.invalidateQueries({ queryKey: metricsKeys.connectionHistory() })
    },
  })
}
