/**
 * SDK المساحة (00370) — IT فقط: حدود الخطة، حجم القاعدة والتخزين، القابل للاسترداد، وطابور الضغط الليلي.
 */
import { sdkGuard, supabase } from './client'

const rpc = <T,>(fn: string, args: Record<string, unknown> = {}) => sdkGuard(supabase.rpc(fn, args as never)) as Promise<T>

export type SpacePlan = 'free' | 'pro' | 'custom'
export interface SpaceTable { table: string; bytes: number; rows: number; dead_rows: number; reclaimable_pct: number; reclaimable_bytes: number }
export interface SpaceBucket { bucket: string; objects: number; bytes: number }
export interface SpaceReclaimEntry {
  id: number; table: string; reason: 'bloat' | 'requested' | 'manual'; status: 'queued' | 'scheduled' | 'done' | 'skipped' | 'failed'
  requested_at: string; scheduled_for: string | null; before_bytes: number | null; after_bytes: number | null; finished_at: string | null; note: string | null
}
export interface SpaceOverview {
  plan: SpacePlan; db_limit_bytes: number; storage_limit_bytes: number; bloat_threshold_pct: number; settings_updated_at: string
  db_bytes: number; db_free_bytes: number; db_pct: number; db_reclaimable_bytes: number
  storage_bytes: number; storage_free_bytes: number; storage_pct: number
  buckets: SpaceBucket[]; tables: SpaceTable[]
  alerts: Array<{ level: 'warning' | 'danger'; kind: 'db' | 'storage'; message: string }>
  reclaim: { cron_available: boolean; queued: number; scheduled: number; nightly_at: string; log: SpaceReclaimEntry[] }
  generated_at: string
}
export const SPACE_BUCKET_LABEL: Record<string, string> = {
  'media-photos': 'صور الإعلام', 'complaint-media': 'مرفقات الشكاوى', 'citizen-complaints': 'شكاوى المواطنين', 'sector-photos': 'صور القواطع',
  'gbs-containers': 'حاويات GBS', 'contractor-photos': 'صور المتعهدين', 'maintenance-attachments': 'مرفقات الصيانة', 'employee-documents': 'وثائق الموظفين',
  'garage-vehicles': 'صور الآليات', avatars: 'الصور الشخصية', payroll: 'ملفات الرواتب',
}
export const SPACE_RECLAIM_STATUS: Record<SpaceReclaimEntry['status'], string> = { queued: 'في الطابور', scheduled: 'مجدول', done: 'تم', skipped: 'مؤجَّل', failed: 'فشل' }
export const SPACE_RECLAIM_NOTE: Record<string, string> = { PG_CRON_MISSING: 'المجدول (pg_cron) غير مفعّل', INSUFFICIENT_HEADROOM: 'لا مساحة مؤقتة كافية للضغط — ارفع الحد أو احذف بيانات أولاً', VACUUM_FAILED: 'فشل الضغط — راجع سجل المجدول' }

export const space = {
  overview: () => rpc<SpaceOverview>('space_overview'),
  setPlan: (plan: SpacePlan, dbLimit?: number, storageLimit?: number, threshold?: number) =>
    rpc<SpaceOverview>('space_settings_set', { p_plan: plan, p_db_limit_bytes: dbLimit ?? null, p_storage_limit_bytes: storageLimit ?? null, p_bloat_threshold_pct: threshold ?? null }),
  reclaimNow: (tables?: string[]) => rpc<{ scheduled: number; skipped: number; start: string }>('space_reclaim_now', { p_tables: tables ?? null }),
  sync: () => rpc<{ finished: number }>('space_reclaim_sync'),
}
