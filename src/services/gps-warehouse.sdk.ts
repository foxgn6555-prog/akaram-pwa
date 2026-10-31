/**
 * 00380 — مستودع GPS التحليلي (المشروع الثاني): المتصفح لا يلمس المستودع مباشرة؛
 * الحالة من المشروع الأول (gps_warehouse_link_get) والإجراءات عبر دالة الحافة gps-warehouse.
 */
import { supabase } from './client'
import { LvnSyncError } from '@sdk/gps-lvn.sdk'

export interface GpsWarehouseLink {
  id: number
  warehouse_host: string | null
  last_ping_at: string | null
  last_ping_ok: boolean | null
  schema_version: number | null
  ping: GpsWarehousePing | null
  last_registry_sync_at: string | null
  registry_active: number | null
  last_error_code: string | null
  last_error_at: string | null
  updated_at: string
  /** 00381: حالة مجدول السحب (pg_cron في المشروع الأول) */
  cron?: { scheduled: boolean; last_run_at: string | null; last_status: string | null } | null
  /** 00383: آخر نسخ ليلي لملخص البقع إلى المشروع الأول */
  last_hotspots_sync_at?: string | null
  hotspots_rows?: number | null
  hotspots_by_month?: Record<string, number> | null
  hotspots_cron?: { scheduled: boolean; last_run_at: string | null; last_status: string | null } | null
}
export interface GpsWarehouseMonthProgress {
  month: string; total: number; done: number; queued: number; running: number; failed: number; points: number; stops: number; devices: number
  first_started_at: string | null; last_finished_at: string | null; done_last_hour: number
  /** 00382-ب: دور الشهر في النافذة المتجددة */
  role?: 'displayed' | 'collecting' | 'kept' | 'expired'
}
/** 00382-ب: النافذة الشهرية المتجددة — المعروض = الشهر السابق، الجاري يُجمَّع يوماً بيوم، ما قبل cutoff يُمسح */
export interface GpsWarehouseWindow { today: string; collecting_month: string; displayed_month: string; cutoff: string; keep_months: number; auto_enqueue: boolean }
export interface GpsWarehouseProgress {
  window?: GpsWarehouseWindow
  last_rollover_at?: string | null
  last_rollover?: { cutoff: string; jobs: number; raw: number; stops: number } | null
  months: GpsWarehouseMonthProgress[]
  errors: { device_external_id: string; day: string; error_code: string; attempts: number; at: string | null }[]
  paused: boolean; locked: boolean
  /** 00386-ب: مراقبة السحب */
  error_summary?: { error_code: string; failed: number; retrying: number; devices: number; last_at: string | null }[]
  failed_devices?: { device_external_id: string; failed_days: number; last_error_code: string | null; last_at: string | null }[]
  failed_total?: number
  stale_running?: number
  throughput?: { done_last_hour: number; points_last_hour: number; remaining: number; eta_minutes: number | null }
  stops_by_class: Partial<Record<'pending' | 'short' | 'valid' | 'long' | 'fault', number>>
}
export interface GpsWarehousePing {
  ok: boolean
  schema_version: number
  vehicles: number
  jobs: { queued: number; running: number; done: number; failed: number }
  raw_points: number
  stops: number
  archive_files: number
  db_bytes: number
  settings: { min_stop_minutes: number; max_stop_minutes: number; fault_stop_hours: number; cluster_radius_m: number; raw_retention_days: number; archive_retention_months: number; paused?: boolean; max_attempts?: number; keep_months?: number; archive_enabled?: boolean; auto_enqueue?: boolean; hotspot_radius_m?: number; class_light_max_min?: number; class_medium_max_min?: number; recur_mid_days?: number; recur_high_days?: number }
  /** 00383 */
  hotspots?: number
  hotspots_by_month?: Record<string, number>
  /** 00381 */
  progress?: GpsWarehouseProgress
  server_time: string
}
export type GpsWarehouseAction = 'ping' | 'sync_registry' | 'enqueue_month' | 'pull' | 'pause' | 'resume' | 'sync_hotspots' | 'rebuild_hotspots' | 'retry_failed' | 'wipe'
export interface GpsWarehouseResult { ok: boolean; action: GpsWarehouseAction; host?: string | null; ping?: GpsWarehousePing; sent?: number; result?: Record<string, unknown>; error?: string; skipped?: string; jobs?: number; results?: Record<string, unknown>[]; ms?: number; rows?: number; by_month?: Record<string, number>; pending?: number }

async function toError(error: unknown): Promise<LvnSyncError> {
  const context = (error as { context?: Response }).context
  if (context && typeof context.json === 'function') {
    try { const body = (await context.json()) as { error?: string }; if (body?.error) return new LvnSyncError(String(body.error), error) } catch { /* ليس JSON */ }
  }
  return new LvnSyncError((error as { message?: string })?.message ?? 'GPS_WAREHOUSE_FAILED', error)
}

export const gpsWarehouse = {
  link: async (): Promise<GpsWarehouseLink> => {
    const { data, error } = await supabase.rpc('gps_warehouse_link_get')
    if (error) throw new LvnSyncError(error.message)
    return data as unknown as GpsWarehouseLink
  },
  run: async (action: GpsWarehouseAction, extra: { month?: string; limit?: number } = {}): Promise<GpsWarehouseResult> => {
    const { data, error } = await supabase.functions.invoke<GpsWarehouseResult>('gps-warehouse', { body: { action, ...extra } })
    if (error) throw await toError(error)
    if (!data?.ok) throw new LvnSyncError(data?.error ?? 'GPS_WAREHOUSE_FAILED')
    return data
  },
}
