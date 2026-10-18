/**
 * SDK البث المباشر (00246/00285) — مشاركة الموقع المباشر لمسؤول القسم والمتعهد أثناء شفت HR فقط،
 * وخريطة/بيانات غرفة العمليات، وإعدادات التطوير المركزية.
 */
import { sdkGuard, supabase } from './client'

export type LiveKind = 'manager' | 'contractor'
export type LiveDenyReason = 'LIVE_NOT_ELIGIBLE' | 'LIVE_NO_SHIFT' | 'LIVE_OUTSIDE_SHIFT'

export interface LiveShareStatus {
  kind: LiveKind | 'none'
  allowed: boolean
  reason: LiveDenyReason | null
  shift_name: string | null; shift_start: string | null; shift_end: string | null
  interval_minutes: number
  sectors: number[]; area_names: string; zone_defined: boolean
  active_session_id: string | null; session_started_at: string | null; last_seen_at: string | null
  point_count: number; last_in_zone: boolean | null
}
export interface LivePingResult { session_id: string; in_zone: boolean | null; zone_sector_id: number | null; shift_end: string; interval_minutes: number; point_count: number; recorded_at: string }
export interface LiveMapRow {
  session_id: string; user_id: string; kind: LiveKind; full_name: string; sectors: number[]; area_names: string
  shift_name: string | null; shift_start: string; shift_end: string; started_at: string; last_seen_at: string
  latitude: number; longitude: number; accuracy_m: number | null; in_zone: boolean | null; point_count: number; out_of_zone_count: number; stale: boolean
}
export interface LiveSessionRow {
  session_id: string; user_id: string; kind: LiveKind; full_name: string; sectors: number[]; area_names: string; manager_name: string | null
  shift_name: string | null; shift_start: string; shift_end: string; started_at: string; last_seen_at: string; ended_at: string | null; end_reason: 'shift_end' | 'manual' | null
  first_lat: number | null; first_lng: number | null; first_in_zone: boolean | null; last_lat: number | null; last_lng: number | null; last_in_zone: boolean | null
  point_count: number; out_of_zone_count: number; duration_minutes: number
}
export interface LivePoint { recorded_at: string; latitude: number; longitude: number; accuracy_m: number | null; in_zone: boolean | null; zone_sector_id: number | null }
export interface LiveTrackSettings { ping_interval_minutes: number; retention_days: number; updated_at: string }

export const liveTracking = {
  // ── المشارِك ──
  async status(): Promise<LiveShareStatus> { return (await sdkGuard(supabase.rpc('live_share_status'))) as unknown as LiveShareStatus },
  async ping(x: { latitude: number; longitude: number; accuracy?: number | null }): Promise<LivePingResult> {
    return (await sdkGuard(supabase.rpc('live_share_ping', { p_lat: x.latitude, p_lng: x.longitude, p_accuracy: x.accuracy ?? null }))) as unknown as LivePingResult
  },
  async stop(): Promise<boolean> { return Boolean(await sdkGuard(supabase.rpc('live_share_stop'))) },
  // ── غرفة العمليات ──
  async mapCurrent(kind: LiveKind | null = null): Promise<LiveMapRow[]> {
    return ((await sdkGuard(supabase.rpc('live_map_current', { p_kind: kind }))) as LiveMapRow[] | null) ?? []
  },
  async sessions(x: { from: string; to: string; kind?: LiveKind | null; userId?: string | null }): Promise<LiveSessionRow[]> {
    return ((await sdkGuard(supabase.rpc('live_sessions_list', { p_from: x.from, p_to: x.to, p_kind: x.kind ?? null, p_user: x.userId ?? null }))) as LiveSessionRow[] | null) ?? []
  },
  async points(sessionId: string): Promise<LivePoint[]> {
    return ((await sdkGuard(supabase.rpc('live_session_points', { p_session: sessionId }))) as LivePoint[] | null) ?? []
  },
  // ── الإعدادات ──
  async settings(): Promise<LiveTrackSettings> { return (await sdkGuard(supabase.rpc('live_track_settings_get'))) as unknown as LiveTrackSettings },
  async setSettings(x: { intervalMinutes: number; retentionDays: number }): Promise<LiveTrackSettings> {
    return (await sdkGuard(supabase.rpc('live_track_settings_set', { p_interval_minutes: x.intervalMinutes, p_retention_days: x.retentionDays }))) as unknown as LiveTrackSettings
  },
}
