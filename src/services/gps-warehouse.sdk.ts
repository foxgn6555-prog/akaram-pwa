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
  settings: { min_stop_minutes: number; max_stop_minutes: number; fault_stop_hours: number; cluster_radius_m: number; raw_retention_days: number; archive_retention_months: number }
  server_time: string
}
export type GpsWarehouseAction = 'ping' | 'sync_registry' | 'enqueue_month'
export interface GpsWarehouseResult { ok: boolean; action: GpsWarehouseAction; host?: string | null; ping?: GpsWarehousePing; sent?: number; result?: Record<string, unknown>; error?: string }

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
  run: async (action: GpsWarehouseAction, extra: { month?: string } = {}): Promise<GpsWarehouseResult> => {
    const { data, error } = await supabase.functions.invoke<GpsWarehouseResult>('gps-warehouse', { body: { action, ...extra } })
    if (error) throw await toError(error)
    if (!data?.ok) throw new LvnSyncError(data?.error ?? 'GPS_WAREHOUSE_FAILED')
    return data
  },
}
