import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dataRetention, retentionErrorMessage, type RetentionRequest } from '@sdk/data-retention.sdk'
import { useUiStore } from '@stores/ui.store'
import { handleAppError } from '@lib/errors/error.handler'
import { pickDirectory } from '@features/cold-archive/browser-pull'
import { exportRequestToDirectory, type ExportProgress } from './browser-export'

export const retentionKeys = {
  all: ['data-retention'] as const,
  settings: () => [...retentionKeys.all, 'settings'] as const,
  requests: () => [...retentionKeys.all, 'requests'] as const,
  gpsPurge: () => [...retentionKeys.all, 'gps-purge'] as const,
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
/** 00382-أ: التفريغ اليومي لنقاط GPS التفصيلية */
export const useGpsHistoryPurge = () => useQuery({ queryKey: retentionKeys.gpsPurge(), queryFn: () => dataRetention.gpsPurgeGet(), refetchInterval: 60_000 })
export const useSetGpsHistoryPurge = () => useAction((enabled: boolean) => dataRetention.gpsPurgeSet(enabled), (r) => (r.enabled ? 'التفريغ اليومي مفعّل — يعمل كل يوم 00:00 بغداد' : 'أُوقف التفريغ اليومي — النقاط ستتراكم حتى تعيد تفعيله'))
export const useRunGpsHistoryPurge = () => useAction(() => dataRetention.gpsPurgeRunNow(), (r) => `فُرِّغت ${(r.last_rows ?? 0).toLocaleString('en-US')} نقطة وأُعيدت ${(r.last_freed_bytes / (1024 * 1024)).toLocaleString('en-US', { maximumFractionDigits: 1 })} م.ب فوراً`)
export const useRetentionRequests = () => useQuery({ queryKey: retentionKeys.requests(), queryFn: () => dataRetention.requests(), refetchInterval: 60_000 })
export const useSetRetentionPolicy = () => useAction(dataRetention.setPolicy, 'حُفظت السياسة')
export const useRetentionScanNow = () => useAction(() => dataRetention.scanNow(), (r) => (r.created > 0 ? `أُنشئ ${r.created} طلب حذف جديد — راجعه أدناه` : 'لا توجد بيانات تجاوزت مدتها الآن'))
export const useConfirmRetention = () => useAction((id: string) => dataRetention.confirm(id), 'تم التأكيد — الطلب جاهز للحذف')
/** 00327: تشغيل الحذف بدفعات؛ التوقف اليدوي ليس خطأً */
export const useRunRetentionDelete = () => useAction(
  (x: { id: string; onProgress?: (r: RetentionRequest) => void; signal?: AbortSignal }) => dataRetention.deleteRun(x.id, { onProgress: x.onProgress, signal: x.signal }),
  (r) => (r.status === 'done' ? `اكتمل الحذف: ${r.rows_deleted.toLocaleString('en-US')} صفاً — بقيت ${r.rows_locked.toLocaleString('en-US')} محمية` : `توقف الحذف عند ${r.rows_deleted.toLocaleString('en-US')} صفاً — يمكنك الاستئناف لاحقاً`))
export const useCancelRetention = () => useAction((id: string) => dataRetention.cancel(id), 'أُلغي الطلب — لم يُحذف شيء')
export const usePostponeRetention = () => useAction((x: { id: string; days?: number }) => dataRetention.postpone(x.id, x.days ?? 7), 'أُجِّل الحذف التلقائي')

/** تصدير مُثبَت: اختيار مجلد → كتابة CSV/JSON → بصمة → تسجيل الإثبات. يعيد null إذا أُلغي اختيار المجلد. */
export const useBrowserExport = () => {
  const qc = useQueryClient(), toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: async ({ id, onProgress }: { id: string; onProgress?: (p: ExportProgress) => void }) => {
      const root = await pickDirectory(); if (!root) return null
      return exportRequestToDirectory({ id }, root, { onProgress })
    },
    onSuccess: (r) => { if (!r) return; void qc.invalidateQueries({ queryKey: retentionKeys.all }); toast({ type: 'success', message: `صُدِّر ${r.rows.toLocaleString('en-US')} صفاً وسُجِّل الإثبات — يمكنك التأكيد الآن` }) },
    onError: (e) => { handleAppError(e, { scope: 'data-retention' }); toast({ type: 'error', message: retentionErrorMessage(e) }) },
  })
}
