import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { devCleanup } from '@sdk/dev-cleanup.sdk'
import { useUiStore } from '@stores/ui.store'
import { handleAppError } from '@lib/errors/error.handler'

export const devCleanupKeys = { all: ['dev-cleanup'] as const }
const msg = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e)
  if (m.includes('IT_FORBIDDEN')) return 'هذا الإجراء لحسابات التطوير المركزية فقط'
  if (m.includes('DEV_CLEANUP_OBJECTS_REMAIN')) return 'ما زالت ملفات في التخزين لم تُحذف — أعد التشغيل للاستئناف'
  if (m.includes('DEV_CLEANUP_NO_PROGRESS')) return 'تعذر حذف الملفات من التخزين (صلاحية أو شبكة) — لم يُحذف أي سجل. أعد المحاولة'
  return m
}
export function useDevCleanupPreview() {
  return useQuery({ queryKey: devCleanupKeys.all, queryFn: devCleanup.preview, staleTime: 10_000 })
}
export function useDevCleanupGps() {
  const qc = useQueryClient(), toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: devCleanup.gpsStops,
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: devCleanupKeys.all }); void qc.invalidateQueries({ queryKey: ['gps-lvn'] })
      toast({ type: 'success', message: `نُظّفت نقاط التوقف: ${(r.deleted_rows.gps_stop_events ?? 0).toLocaleString('en-US')} حدث، ${(r.deleted_rows.gps_sync_runs ?? 0).toLocaleString('en-US')} سجل مزامنة` })
    },
    onError: (e) => { handleAppError(e, { scope: 'dev-cleanup' }); toast({ type: 'error', message: msg(e) }) },
  })
}
export function useDevCleanupPhotos() {
  const qc = useQueryClient(), toast = useUiStore((s) => s.addToast)
  const [progress, setProgress] = useState<{ removed: number; planned: number } | null>(null)
  const m = useMutation({
    mutationFn: () => devCleanup.photosRun((removed, planned) => setProgress({ removed, planned })),
    onSuccess: (r) => {
      toast({ type: 'success', message: `نُظّفت الصور: ${r.removed_objects.toLocaleString('en-US')} ملف من التخزين وسجلاتها` })
    },
    onError: (e) => { handleAppError(e, { scope: 'dev-cleanup' }); toast({ type: 'error', message: msg(e) }) },
    onSettled: () => { setProgress(null); void qc.invalidateQueries({ queryKey: devCleanupKeys.all }) },
  })
  return { ...m, progress }
}
