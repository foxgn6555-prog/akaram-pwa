/**
 * SDK تنظيف البيانات التجريبية (00368) — بوابة التطوير المركزية (IT فقط).
 *  الصور: ملفات حاويات البوابات الميدانية تُحذف من المتصفح دفعات 100 بسياسة تخزين مؤقتة تُفتح أثناء التشغيل فقط، ثم السجلات من القاعدة.
 *  نقاط توقف GPS: حذف مباشر (أحداث + حالة سحب + سجل المزامنة).
 */
import { sdkGuard, supabase } from './client'

const rpc = <T,>(fn: string, args: Record<string, unknown> = {}) => sdkGuard(supabase.rpc(fn, args as never)) as Promise<T>

export interface DevCleanupBucket { bucket: string; objects: number; bytes: number }
export interface DevCleanupRun {
  id: string; kind: 'photos' | 'gps_stops'; status: 'running' | 'done' | 'cancelled'; started_by_name: string | null
  started_at: string; finished_at: string | null; removed_objects: number; deleted_rows: Record<string, number>
}
export interface DevCleanupPreview {
  buckets: DevCleanupBucket[]
  photo_rows: Record<string, number>
  gps: { gps_stop_events: number; gps_stop_scan_state: number; gps_sync_runs: number; gps_sync_running: number }
  photos_run: { id: string; started_at: string; planned_objects: number; removed_objects: number } | null
  history: DevCleanupRun[]
}
export const DEV_CLEANUP_BUCKET_LABEL: Record<string, string> = {
  'media-photos': 'صور الإعلام', 'complaint-media': 'مرفقات الشكاوى الرسمية', 'citizen-complaints': 'صور شكاوى المواطنين ومحادثاتهم',
  'sector-photos': 'صور القواطع', 'gbs-containers': 'صور حاويات GBS', 'contractor-photos': 'صور المتعهدين', 'maintenance-attachments': 'مرفقات الصيانة',
}
export const DEV_CLEANUP_ROW_LABEL: Record<string, string> = {
  media_submission_photos: 'صور تذاكر الإعلام', media_design_photos: 'صور التصاميم الإعلامية', complaint_media: 'مرفقات الشكاوى', complaint_media_revisions: 'مراجعات مرفقات الشكاوى',
  complaint_report_files: 'ملفات تقارير الشكاوى', citizen_complaint_photos: 'صور شكاوى المواطنين', citizen_chat_attachments: 'مرفقات محادثات المواطنين', sector_photos: 'صور القواطع',
  gbs_container_photos: 'صور حاويات GBS', contractor_checkin_photos: 'صور تسجيل المتعهدين', vehicle_maintenance_attachments: 'مرفقات الصيانة',
  gps_stop_events: 'أحداث التوقف', gps_stop_scan_state: 'حالة سحب الأجهزة', gps_sync_runs: 'سجل المزامنة', gps_sync_running_released: 'مزامنات عالقة حُرِّرت',
}

export const devCleanup = {
  preview: () => rpc<DevCleanupPreview>('dev_cleanup_preview'),
  gpsStops: () => rpc<{ id: string; deleted_rows: Record<string, number> }>('dev_cleanup_gps_stops'),
  cancel: (id: string) => rpc<{ ok: boolean }>('dev_cleanup_cancel', { p_run: id }),
  /** تنظيف الصور: بدء ← حذف دفعات من التخزين ← إنهاء (حذف السجلات). قابل للاستئناف. */
  photosRun: async (onProgress?: (removed: number, planned: number) => void) => {
    const begun = await rpc<{ id: string; planned_objects: number; resumed: boolean }>('dev_cleanup_photos_begin')
    let removedTotal = 0
    for (let guard = 0; guard < 10_000; guard++) {
      const batch = (await rpc<Array<{ bucket: string; path: string }> | null>('dev_cleanup_photos_objects', { p_run: begun.id, p_limit: 200 })) ?? []
      if (batch.length === 0) break
      const byBucket = new Map<string, string[]>()
      for (const o of batch) byBucket.set(o.bucket, [...(byBucket.get(o.bucket) ?? []), o.path])
      let removed = 0
      for (const [bucket, paths] of byBucket) {
        for (let i = 0; i < paths.length; i += 100) {
          const slice = paths.slice(i, i + 100)
          const { data, error } = await supabase.storage.from(bucket).remove(slice)
          if (error) throw new Error(`فشل حذف ملفات من ${bucket}: ${error.message}`)
          removed += (data ?? []).length
        }
      }
      // لا تقدّم في هذه الدفعة (صلاحية/شبكة) ⇒ نتوقف بدل حلقة لا نهائية
      if (removed === 0) throw new Error('DEV_CLEANUP_NO_PROGRESS')
      removedTotal += removed
      const p = await rpc<{ removed_objects: number; planned_objects: number; remaining: number }>('dev_cleanup_photos_progress', { p_run: begun.id, p_removed: removed })
      onProgress?.(p.removed_objects, p.planned_objects)
      if (p.remaining === 0) break
    }
    return rpc<{ id: string; removed_objects: number; deleted_rows: Record<string, number> }>('dev_cleanup_photos_finish', { p_run: begun.id }).then((r) => ({ ...r, removedTotal }))
  },
}
