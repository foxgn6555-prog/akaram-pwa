import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dataRetention, retentionErrorMessage } from '@sdk/data-retention.sdk'
import { useUiStore } from '@stores/ui.store'
import { handleAppError } from '@lib/errors/error.handler'

export const retentionKeys = {
  all: ['data-retention'] as const,
  settings: () => [...retentionKeys.all, 'settings'] as const,
  requests: () => [...retentionKeys.all, 'requests'] as const,
}

const useAction = <T, R>(fn: (x: T) => Promise<R>, message: string | ((r: R) => string)) => {
  const qc = useQueryClient(), toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: retentionKeys.all }); toast({ type: 'success', message: typeof message === 'function' ? message(r) : message }) },
    onError: (e) => { handleAppError(e, { scope: 'data-retention' }); toast({ type: 'error', message: retentionErrorMessage(e) }) },
  })
}

export const useRetentionSettings = () => useQuery({ queryKey: retentionKeys.settings(), queryFn: () => dataRetention.settings() })
export const useRetentionRequests = () => useQuery({ queryKey: retentionKeys.requests(), queryFn: () => dataRetention.requests(), refetchInterval: 60_000 })
export const useSetRetentionPolicy = () => useAction(dataRetention.setPolicy, 'حُفظت السياسة')
export const useRetentionScanNow = () => useAction(() => dataRetention.scanNow(), (r) => (r.created > 0 ? `أُنشئ ${r.created} طلب حذف جديد — راجعه أدناه` : 'لا توجد بيانات تجاوزت مدتها الآن'))
export const useConfirmRetention = () => useAction((id: string) => dataRetention.confirm(id), 'تم التأكيد — الطلب جاهز للحذف')
export const useCancelRetention = () => useAction((id: string) => dataRetention.cancel(id), 'أُلغي الطلب — لم يُحذف شيء')
