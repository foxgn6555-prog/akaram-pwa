import { sdkGuard, sdkVoid, supabase } from './client'

export type GpsOnline = 'online' | 'offline' | 'unknown'
export type GpsOperational = 'moving' | 'idle' | 'parked' | 'unknown'
export interface GpsDashboard {
  total: number
  online: number
  offline: number
  moving: number
  stopped: number
  bound: number
  unbound: number
  stale: number
  alarms: number
  last_success_at: string | null
  last_full_sync_at: string | null
  last_incremental_sync_at: string | null
  last_error_code: string | null
  api_version: string | null
}
export interface GpsDevice {
  id: string
  external_id: string
  device_name: string
  imei: string | null
  vin: string | null
  plate_number: string | null
  registration_number: string | null
  object_owner: string | null
  device_model: string | null
  driver_name: string | null
  online_status: GpsOnline
  engine_status: 'on' | 'off' | 'unknown'
  operational_status: GpsOperational
  alarm: string | null
  last_seen_at: string | null
  latitude: number | null
  longitude: number | null
  speed: number | null
  speed_unit: string | null
  course: number | null
  power: string | null
  address: string | null
  fix_time: string | null
  garage_vehicle_id: string | null
  garage_vehicle_name: string | null
  garage_db_number: string | null
  active_departure_id: string | null
  departure_driver: string | null
  departed_at: string | null
  trip_stage: 'none' | 'to_work' | 'at_work' | 'returning_to_garage'
  assigned_zone_count: number
  inside_assigned_zone: boolean
  total_count: number
}
export interface GpsFilters {
  search?: string
  online?: GpsOnline
  operational?: GpsOperational
  binding?: 'bound' | 'unbound'
  freshness?: 'fresh' | 'stale'
  owner?: string
  model?: string
  trip?: 'active' | 'inactive'
  zone?: 'inside' | 'outside' | 'unassigned'
  page?: number
  pageSize?: number
}
export interface GpsOptions {
  owners: string[]
  models: string[]
  drivers: string[]
}
export interface GpsSyncRun {
  id: string
  sync_type: 'connection_test' | 'full' | 'incremental'
  status: 'running' | 'success' | 'partial' | 'failed'
  started_at: string
  finished_at: string | null
  pages_count: number
  received_count: number
  inserted_count: number
  updated_count: number
  error_code: string | null
  error_message: string | null
}
export interface GpsDeviceDetail extends Omit<GpsDevice, 'device_name' | 'total_count'> {
  name: string
  sim_number: string | null
  msisdn: string | null
  group_id: string | null
  protocol: string | null
  is_active: boolean
  vendor_updated_at: string | null
  sensors: Array<{ name?: string; value?: string; show_in_popup?: string }>
  services: Array<{ name?: string; value?: string }>
  altitude: number | null
  garage_plate_number: string | null
  assigned_zones: Array<{
    id: string
    name: string
    source: 'lvn' | 'platform'
    color: string
    inside: boolean
  }>
}
export interface GpsBindingCandidate {
  id: string
  vehicle_name: string
  db_number: string
  plate_number: string
  chassis_number: string
  current_device_id: string | null
}
export interface GpsGeofence {
  id: string
  name: string
  source: 'lvn' | 'platform'
  color: string
  is_assigned: boolean
}
export interface GpsAlertNotificationPolicy {
  alert_type: GpsAlertType
  enabled: boolean
  priority: 'low' | 'normal' | 'high' | 'critical'
  recipient_roles: string[]
  in_app_enabled: boolean
  push_enabled: boolean
  sound_enabled: boolean
  only_during_departure: boolean
  escalation_minutes: number
  escalation_repeat_minutes: number
  escalation_levels: number
  updated_at: string
}
export interface GpsZoneVehicleCandidate {
  vehicle_id: string
  vehicle_name: string
  db_number: string
  plate_number: string | null
  vehicle_category: string
  is_assigned: boolean
  device_id: string | null
  device_name: string | null
}
export interface GpsMapGeofence {
  id: string
  name: string
  source: 'lvn' | 'platform'
  color: string
  polygon: Array<{ lat: number; lng: number } | [number, number]>
  /** 00154: المنطقة التشغيلية المرتبطة بالزون (اتحاد زونات المنطقة = حدودها) */
  sector_id?: number | null
  area_name?: string | null
  parent_sector?: 'karrada' | 'zaafaraniya' | null
}
export type GpsAlertType = 'gps_offline' | 'gps_stale' | 'outside_zone' | 'engine_idle' | 'route_deviation'
export interface GpsRouteDeviationSettings {
  grace_minutes: number
  updated_at: string
}
export type GpsLandmarkIcon =
  | 'pin'
  | 'building'
  | 'garage'
  | 'fuel'
  | 'maintenance'
  | 'warehouse'
  | 'office'
  | 'checkpoint'
  | 'warning'
  | 'trash'
  | 'tree'
  | 'park'
  | 'hospital'
  | 'school'
  | 'restaurant'
  | 'water'
  | 'camera'
  | 'parking'
  | 'toilet'
  | 'bridge'
  | 'target'
  | 'flag'
export interface GpsMapLandmark {
  id: string
  name: string
  category:
    'landmark' | 'garage' | 'station' | 'maintenance' | 'office' | 'checkpoint' | 'hazard' | 'other'
  icon: GpsLandmarkIcon
  latitude: number
  longitude: number
  color: string
  notes: string | null
}
export interface GpsLiveDevice {
  device_id: string
  device_name: string
  external_id: string
  latitude: number
  longitude: number
  speed: number | null
  course: number | null
  address: string | null
  fix_time: string | null
  online_status: GpsOnline
  engine_status: 'on' | 'off' | 'unknown'
  operational_status: GpsOperational
  garage_vehicle_id: string | null
  vehicle_name: string | null
  db_number: string | null
  driver_name: string | null
  departure_id: string | null
  trip_stage: GpsDevice['trip_stage']
  assigned_zone_count: number
  inside_assigned_zone: boolean
}
export interface GpsOperationalAlert {
  id: string
  device_id: string
  device_name: string
  garage_vehicle_id: string | null
  vehicle_name: string | null
  db_number: string | null
  departure_id: string | null
  alert_type: GpsAlertType
  severity: 'info' | 'warning' | 'critical'
  title: string
  details: Record<string, unknown>
  opened_at: string
  acknowledged_at: string | null
  acknowledged_by: string | null
  occurrence_count: number
  last_detected_at: string
}
export interface GpsZoneEvent {
  id: number
  event_type: 'enter' | 'exit'
  occurred_at: string
  device_id: string
  device_name: string
  garage_vehicle_id: string | null
  vehicle_name: string | null
  db_number: string | null
  departure_id: string | null
  geofence_id: string
  geofence_name: string
  latitude: number
  longitude: number
  total_count: number
}
export interface GpsRoutePoint {
  latitude: number
  longitude: number
  speed: number | null
  course: number | null
  address: string | null
  fix_time: string
  engine_status: 'on' | 'off' | 'unknown'
  operational_status: GpsOperational
  total_count?: number
}
export interface GpsSchedulerHealth {
  last_incremental_at: string | null
  incremental_age_seconds: number | null
  gps_schedule_healthy: boolean
  push_pending: number
  push_overdue: number
  push_processing_stuck: number
  push_failed_24h: number
  active_push_subscriptions: number
  push_schedule_healthy: boolean
}
export interface GpsTripRouteMetric {
  departure_id: string
  moving_seconds: number
  stopped_seconds: number
  stop_count: number
  gap_count: number
  largest_gap_seconds: number
  stored_points: number
}
export interface GpsTripRouteDiagnostic {
  departure_id: string
  diagnosis_code:
    | 'unbound'
    | 'import_failed'
    | 'no_data'
    | 'provider_payload_rejected'
    | 'storage_deficit'
    | 'late_first_fix'
    | 'early_last_fix'
    | 'internal_gaps'
    | 'windows_not_fully_imported'
    | 'healthy'
  expected_seconds: number
  expected_72h_windows: number
  gps_points: number
  first_fix: string | null
  last_fix: string | null
  leading_gap_seconds: number
  trailing_gap_seconds: number
  internal_gap_count: number
  largest_gap_seconds: number
  import_status: 'running' | 'success' | 'partial' | 'failed' | null
  import_range_from: string | null
  import_range_to: string | null
  chunks_requested: number | null
  chunks_completed: number | null
  source_points: number | null
  valid_points: number | null
  stored_points: number | null
  rejected_points: number | null
  error_code: string | null
  source_storage_delta: number
}
export interface GpsHistoryWindowProgress {
  window_index: number
  range_from: string
  range_to: string
  status: 'pending' | 'running' | 'success' | 'partial' | 'failed'
  run_id: string | null
  chunks_requested: number | null
  chunks_completed: number | null
  source_points: number | null
  valid_points: number | null
  stored_points: number | null
  rejected_points: number | null
  error_code: string | null
  finished_at: string | null
}
export interface GpsTripWindowCoverageAudit {
  window_index: number
  range_from: string
  range_to: string
  expected_seconds: number
  import_status: 'pending' | 'running' | 'success' | 'partial' | 'failed'
  run_id: string | null
  chunks_requested: number | null
  chunks_completed: number | null
  source_points: number | null
  valid_points: number | null
  reported_stored_points: number | null
  rejected_points: number | null
  actual_stored_points: number
  renderable_points: number
  first_fix: string | null
  last_fix: string | null
  leading_gap_seconds: number
  trailing_gap_seconds: number
  internal_gap_count: number
  largest_gap_seconds: number
  covered_seconds: number
  coverage_percent: number
  source_acceptance_percent: number
  storage_match_percent: number
  render_complete: boolean
  diagnosis_code:
    | 'unbound'
    | 'not_audited'
    | 'import_failed'
    | 'provider_payload_rejected'
    | 'storage_deficit'
    | 'render_limit'
    | 'no_data'
    | 'late_first_fix'
    | 'early_last_fix'
    | 'internal_gaps'
    | 'window_incomplete'
    | 'healthy'
  error_code: string | null
  finished_at: string | null
}
export interface GpsTripZoneEvent {
  id: number
  event_type: 'enter' | 'exit'
  occurred_at: string
  geofence_id: string
  geofence_name: string
  latitude: number
  longitude: number
}
export interface GpsTripInvestigation {
  id: string
  event_type: 'route' | 'stop' | 'gap' | 'zone_enter' | 'zone_exit'
  event_at: string
  note: string
  status: 'open' | 'in_review' | 'resolved'
  assigned_to: string | null
  created_by: string
  actor_name: string
  created_at: string
  updated_at: string
}
export interface GpsTripRouteEvent {
  departure_id: string
  event_type: 'stop' | 'gap'
  event_start: string
  event_end: string
  duration_seconds: number
  latitude: number
  longitude: number
  address: string | null
}
export interface GpsTripRouteEventPage extends Omit<GpsTripRouteEvent, 'departure_id'> {
  total_count: number
}
export interface GpsAlertEscalationHistory {
  alert_id?: string
  notification_id: string
  level: number
  user_id: string
  created_at: string
  is_read: boolean
  read_at: string | null
  dismissed_at: string | null
}
export interface GpsTripShiftExportContext {
  departure_id: string
  assignment_id: string
  shift: 'morning' | 'evening' | 'night'
  driver_name: string
  area_name: string
  overlap_from: string
  overlap_to: string
  overlap_seconds: number
  is_departure_driver: boolean
}
export interface GpsTripShiftContext {
  assignment_id: string
  shift: 'morning' | 'evening' | 'night'
  driver_name: string
  sector_id: number
  area_name: string
  starts_at: string
  ends_at: string | null
  overlap_from: string
  overlap_to: string
  overlap_seconds: number
  is_departure_driver: boolean
}
export interface GpsTripHistory {
  departure_id: string
  vehicle_id: string
  device_id: string | null
  db_number: string
  vehicle_name: string
  driver_name: string
  departed_at: string
  returned_at: string | null
  gps_points: number
  first_fix: string | null
  last_fix: string | null
  covered_seconds: number
  total_seconds: number
  coverage_percent: number
  gap_count: number
  largest_gap_seconds: number
  gps_coverage: 'covered' | 'partial' | 'no_data' | 'unbound'
  last_import_status: 'success' | 'partial' | 'failed' | null
  source_points: number | null
  stored_points: number | null
  imported_at: string | null
}
export interface GpsSyncResult {
  ok: boolean
  action: 'test' | 'full' | 'incremental' | 'history'
  message?: string
  pages?: number
  received?: number
  inserted?: number
  updated?: number
  cursorSaved?: boolean
  status?: 'success' | 'partial'
  sourcePoints?: number
  validPoints?: number
  insertedPoints?: number
  storedPoints?: number
  rejectedPoints?: number
  chunks?: number
  rangeTruncated?: boolean
  windowIndex?: number
  nextWindowIndex?: number
}

/** 00362 — بقع التوقف على الخريطة الحية */
export interface GpsStopHotspotVehicle {
  vehicle_id: string | null
  db_number: string | null
  vehicle_name: string | null
  stops: number
  total_seconds: number
}
export interface GpsStopHotspot {
  id: string
  rank: number
  lat: number
  lng: number
  stops: number
  stops_24h: number
  vehicles: number
  total_seconds: number
  avg_seconds: number
  max_seconds: number
  score: number
  level: 'high' | 'medium' | 'low'
  first_at: string
  last_at: string
  active_now: boolean
  peak_hour: number | null
  address: string | null
  top_vehicles: GpsStopHotspotVehicle[]
}
export interface GpsStopHotspotsResult {
  spots: GpsStopHotspot[]
  totals: { stops: number; total_seconds: number; vehicles: number; excluded: number }
  meta: {
    hours: number
    max_days: number
    enabled: boolean
    cluster_radius_m: number
    last_refresh_at: string | null
    refresh_minutes: number
    generated_at: string
    excluded_zone_ids: string[]
    excluded_landmark_ids: string[]
  }
}
export interface GpsStopHotspotEvent {
  id: number
  vehicle_id: string | null
  db_number: string | null
  vehicle_name: string | null
  started_at: string
  ended_at: string
  duration_seconds: number
  address: string | null
}
export interface GpsStopHotspotSettings {
  enabled: boolean
  max_days: number
  stop_speed_kmh: number
  stop_min_seconds: number
  gap_split_seconds: number
  cluster_radius_m: number
  refresh_minutes: number
  landmark_exclude_radius_m: number
  excluded_zone_ids: string[]
  excluded_landmark_ids: string[]
  excluded_zones: Array<{ id: string; name: string }>
  excluded_landmarks: Array<{ id: string; name: string; category: string }>
  last_refresh_at: string | null
  last_refresh_ms: number | null
  events_count: number
  can_edit: boolean
  updated_at: string
}
export interface GpsStopPullResult {
  ok: boolean
  action: 'stops'
  devices: number
  inserted: number
  source: number
  failed: number
  remaining: boolean
  results: Array<{ device: string; from: string; to: string; inserted: number; error?: string }>
}
export interface GpsStopPullStatus {
  devices: number
  caught_up: number
  never_pulled: number
  errors: number
  oldest_pulled_until: string | null
  last_pull_at: string | null
  points_total: number
  last_error: string | null
  pending_hours: number
}
export type GpsStopHotspotSettingsPatch = Partial<
  Pick<GpsStopHotspotSettings, 'enabled' | 'max_days' | 'stop_speed_kmh' | 'stop_min_seconds' | 'gap_split_seconds' | 'cluster_radius_m' | 'refresh_minutes' | 'landmark_exclude_radius_m' | 'excluded_zone_ids' | 'excluded_landmark_ids'>
>
export const gpsLvn = {
  dashboard: async () =>
    (await sdkGuard(supabase.rpc('gps_lvn_dashboard'))) as unknown as GpsDashboard,
  devices: async (filter: GpsFilters = {}) => {
    const size = filter.pageSize ?? 30,
      page = filter.page ?? 1
    return ((await sdkGuard(
      supabase.rpc('gps_lvn_devices_v2', {
        p_search: filter.search?.trim() || null,
        p_online: filter.online ?? null,
        p_operational: filter.operational ?? null,
        p_binding: filter.binding ?? null,
        p_freshness: filter.freshness ?? null,
        p_owner: filter.owner ?? null,
        p_model: filter.model ?? null,
        p_trip: filter.trip ?? null,
        p_zone: filter.zone ?? null,
        p_limit: size,
        p_offset: (page - 1) * size,
      }),
    )) ?? []) as unknown as GpsDevice[]
  },
  options: async () =>
    (await sdkGuard(supabase.rpc('gps_lvn_filter_options'))) as unknown as GpsOptions,
  syncRuns: async () =>
    ((await sdkGuard(supabase.rpc('gps_lvn_sync_runs', { p_limit: 20 }))) ??
      []) as unknown as GpsSyncRun[],
  mapGeofences: async () =>
    ((await sdkGuard(supabase.rpc('gps_lvn_map_geofences'))) ?? []) as unknown as GpsMapGeofence[],
  mapLandmarks: async () =>
    ((await sdkGuard(supabase.rpc('gps_map_landmarks_list'))) ?? []) as unknown as GpsMapLandmark[],
  saveMapLandmark: async (landmark: Omit<GpsMapLandmark, 'id'> & { id: string | null }) =>
    (await sdkGuard(
      supabase.rpc('gps_map_landmark_save', {
        p_id: landmark.id,
        p_name: landmark.name.trim(),
        p_category: landmark.category,
        p_latitude: landmark.latitude,
        p_longitude: landmark.longitude,
        p_color: landmark.color,
        p_notes: landmark.notes?.trim() || null,
        p_icon: landmark.icon,
      }),
    )) as unknown as string,
  archiveMapLandmark: async (id: string) => {
    await sdkVoid(supabase.rpc('gps_map_landmark_archive', { p_id: id }))
  },
  liveMap: async () =>
    ((await sdkGuard(supabase.rpc('gps_lvn_live_map'))) ?? []) as unknown as GpsLiveDevice[],
  // 00362 — بقع التوقف
  stopHotspots: async (hours: number) =>
    (await sdkGuard(supabase.rpc('gps_stop_hotspots', { p_hours: hours }))) as unknown as GpsStopHotspotsResult,
  stopHotspotEvents: async (lat: number, lng: number, hours: number, limit = 30) =>
    ((await sdkGuard(
      supabase.rpc('gps_stop_hotspot_events', { p_lat: lat, p_lng: lng, p_hours: hours, p_limit: limit }),
    )) ?? []) as unknown as GpsStopHotspotEvent[],
  stopHotspotSettings: async () =>
    (await sdkGuard(supabase.rpc('gps_stop_hotspot_settings_get'))) as unknown as GpsStopHotspotSettings,
  saveStopHotspotSettings: async (patch: GpsStopHotspotSettingsPatch) =>
    (await sdkGuard(supabase.rpc('gps_stop_hotspot_settings_save', { p_patch: patch }))) as unknown as GpsStopHotspotSettings,
  /** 00364 — سحب نقاط التوقف من LVN مباشرة لكل الأجهزة (دفعة من الطابور) ثم إعادة الحساب */
  pullStopsNow: async (limit = 4) => {
    const { data, error } = await supabase.functions.invoke<GpsStopPullResult>('lvn-gps-sync', { body: { action: 'stops', limit } })
    if (error) throw await toLvnError(error)
    if (!data?.ok) throw new LvnSyncError((data as { error?: string } | null)?.error ?? 'STOPS_PULL_FAILED')
    if (data.action !== 'stops') throw new LvnSyncError('LVN_FUNCTION_OUTDATED')
    return data
  },
  stopPullStatus: async () =>
    (await sdkGuard(supabase.rpc('gps_stop_pull_status'))) as unknown as GpsStopPullStatus,
  refreshStopHotspots: async () =>
    (await sdkGuard(supabase.rpc('gps_stop_hotspots_refresh_now'))) as unknown as {
      ok: boolean
      busy?: boolean
      devices?: number
      upserted?: number
      purged?: number
      took_ms?: number
    },
  openAlerts: async () =>
    ((await sdkGuard(supabase.rpc('gps_lvn_open_alerts', { p_limit: 100 }))) ??
      []) as unknown as GpsOperationalAlert[],
  acknowledgeAlert: async (alertId: string) => {
    await sdkVoid(supabase.rpc('gps_alert_acknowledge', { p_alert_id: alertId }))
  },
  resolveAlert: async (alertId: string, note: string) => {
    await sdkVoid(supabase.rpc('gps_alert_resolve', { p_alert_id: alertId, p_note: note.trim() }))
  },
  zoneEvents: async (from: string, to: string, page = 1, pageSize = 100) =>
    ((await sdkGuard(
      supabase.rpc('gps_zone_events_list', {
        p_from: from,
        p_to: to,
        p_vehicle_id: null,
        p_geofence_id: null,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      }),
    )) ?? []) as unknown as GpsZoneEvent[],
  savePlatformGeofence: async (
    id: string | null,
    name: string,
    polygon: GpsMapGeofence['polygon'],
    color: string,
    sectorId: number | null = null,
  ) =>
    (await sdkGuard(
      supabase.rpc('gps_platform_geofence_save', {
        p_id: id,
        p_name: name.trim(),
        p_polygon: polygon,
        p_color: color,
        p_sector_id: sectorId,
      }),
    )) as unknown as string,
  /** 00154: ربط أي زون نشط بمنطقة تشغيلية (أو فكّه بـ null) */
  setGeofenceSector: async (id: string, sectorId: number | null) => {
    await sdkVoid(supabase.rpc('gps_geofence_set_sector', { p_id: id, p_sector_id: sectorId }))
  },
  routeDeviationSettings: async () => {
    const rows = ((await sdkGuard(supabase.rpc('gps_route_deviation_settings_get'))) ?? []) as unknown as GpsRouteDeviationSettings[]
    return rows[0] ?? { grace_minutes: 3, updated_at: '' }
  },
  saveRouteDeviationSettings: async (graceMinutes: number) => {
    await sdkVoid(supabase.rpc('gps_route_deviation_settings_save', { p_grace_minutes: graceMinutes }))
  },
  archivePlatformGeofence: async (id: string) => {
    await sdkVoid(supabase.rpc('gps_platform_geofence_archive', { p_id: id }))
  },
  alertNotificationPolicies: async () =>
    ((await sdkGuard(supabase.rpc('gps_alert_notification_policies_list'))) ??
      []) as unknown as GpsAlertNotificationPolicy[],
  saveAlertNotificationPolicy: async (policy: Omit<GpsAlertNotificationPolicy, 'updated_at'>) => {
    await sdkVoid(supabase.rpc('gps_alert_notification_policy_save', {
        p_alert_type: policy.alert_type,
        p_enabled: policy.enabled,
        p_priority: policy.priority,
        p_recipient_roles: policy.recipient_roles,
        p_in_app: policy.in_app_enabled,
        p_push: policy.push_enabled,
        p_sound: policy.sound_enabled,
        p_only_during_departure: policy.only_during_departure,
        p_escalation_minutes: policy.escalation_minutes,
        p_escalation_repeat_minutes: policy.escalation_repeat_minutes,
        p_escalation_levels: policy.escalation_levels,
      }),
    )
  },
  zoneVehicleCandidates: async (geofenceId: string, search = '') =>
    ((await sdkGuard(
      supabase.rpc('gps_zone_vehicle_candidates', {
        p_geofence_id: geofenceId,
        p_search: search.trim() || null,
      }),
    )) ?? []) as unknown as GpsZoneVehicleCandidate[],
  replaceZoneVehicles: async (geofenceId: string, vehicleIds: string[]) =>
    (await sdkGuard(
      supabase.rpc('gps_zone_replace_vehicles', {
        p_geofence_id: geofenceId,
        p_vehicle_ids: vehicleIds,
      }),
    )) as unknown as number,
  detail: async (id: string) =>
    (await sdkGuard(
      supabase.rpc('gps_lvn_device_detail', { p_device_id: id }),
    )) as unknown as GpsDeviceDetail,
  schedulerHealth: async () => {
    const rows = ((await sdkGuard(supabase.rpc('gps_scheduler_health'))) ??
      []) as unknown as GpsSchedulerHealth[]
    return rows[0] ?? null
  },
  tripShiftContext: async (departureId: string) =>
    ((await sdkGuard(supabase.rpc('gps_trip_shift_context', { p_departure_id: departureId }))) ??
      []) as unknown as GpsTripShiftContext[],
  tripShiftContexts: async (departureIds: string[]) =>
    ((await sdkGuard(
      supabase.rpc('gps_trip_shift_context_bulk', { p_departure_ids: departureIds }),
    )) ?? []) as unknown as GpsTripShiftExportContext[],
  tripRouteMetrics: async (departureIds: string[]) =>
    ((await sdkGuard(
      supabase.rpc('gps_trip_route_metrics_bulk', { p_departure_ids: departureIds }),
    )) ?? []) as unknown as GpsTripRouteMetric[],
  tripRouteDiagnostics: async (departureIds: string[]) =>
    ((await sdkGuard(
      supabase.rpc('gps_trip_route_diagnostics_bulk', { p_departure_ids: departureIds }),
    )) ?? []) as unknown as GpsTripRouteDiagnostic[],
  tripHistoryWindows: async (departureId: string) =>
    ((await sdkGuard(supabase.rpc('gps_trip_history_windows', { p_departure_id: departureId }))) ??
      []) as unknown as GpsHistoryWindowProgress[],
  tripWindowCoverageAudit: async (departureId: string) =>
    ((await sdkGuard(
      supabase.rpc('gps_trip_window_coverage_audit', { p_departure_id: departureId }),
    )) ?? []) as unknown as GpsTripWindowCoverageAudit[],
  tripZoneEvents: async (departureId: string) =>
    ((await sdkGuard(supabase.rpc('gps_trip_zone_events', { p_departure_id: departureId }))) ??
      []) as unknown as GpsTripZoneEvent[],
  tripInvestigations: async (departureId: string) =>
    ((await sdkGuard(
      supabase.rpc('gps_trip_investigations_list', { p_departure_id: departureId }),
    )) ?? []) as unknown as GpsTripInvestigation[],
  saveTripInvestigation: async (input: {
    id?: string
    departureId: string
    eventType: GpsTripInvestigation['event_type']
    eventAt: string
    note: string
    status: GpsTripInvestigation['status']
    assignedTo?: string
  }) =>
    (await sdkGuard(
      supabase.rpc('gps_trip_investigation_save', {
        p_id: input.id ?? null,
        p_departure_id: input.departureId,
        p_event_type: input.eventType,
        p_event_at: input.eventAt,
        p_note: input.note.trim(),
        p_status: input.status,
        p_assigned_to: input.assignedTo ?? null,
      }),
    )) as unknown as string,
  tripRouteEvents: async (departureIds: string[]) =>
    ((await sdkGuard(
      supabase.rpc('gps_trip_route_events_bulk', { p_departure_ids: departureIds, p_limit: 10000 }),
    )) ?? []) as unknown as GpsTripRouteEvent[],
  tripRouteEventsPage: async (departureId: string, eventType: '' | 'stop' | 'gap', page: number) =>
    ((await sdkGuard(
      supabase.rpc('gps_trip_route_events_page', {
        p_departure_id: departureId,
        p_event_type: eventType || null,
        p_limit: 20,
        p_offset: (page - 1) * 20,
      }),
    )) ?? []) as unknown as GpsTripRouteEventPage[],
  alertEscalationHistory: async (alertId: string) =>
    ((await sdkGuard(supabase.rpc('gps_alert_escalation_history', { p_alert_id: alertId }))) ??
      []) as unknown as GpsAlertEscalationHistory[],
  alertEscalationsBulk: async (alertIds: string[]) =>
    ((await sdkGuard(supabase.rpc('gps_alert_escalations_bulk', { p_alert_ids: alertIds }))) ??
      []) as unknown as GpsAlertEscalationHistory[],
  routeWindow: async (id: string, from: string, to: string) => {
    const pageSize = 5000,
      rows: GpsRoutePoint[] = []
    for (let offset = 0; offset < 100_000; offset += pageSize) {
      const page = ((await sdkGuard(
        supabase.rpc('gps_lvn_route_window', {
          p_device_id: id,
          p_from: from,
          p_to: to,
          p_limit: pageSize,
          p_offset: offset,
        }),
      )) ?? []) as unknown as GpsRoutePoint[]
      rows.push(...page)
      const total = Number(page[0]?.total_count ?? page.length)
      if (rows.length >= total || page.length < pageSize) return rows
    }
    throw new Error('GPS_ROUTE_PAGE_LIMIT_EXCEEDED')
  },
  route: async (id: string, day: string) => {
    const from = new Date(`${day}T00:00:00+03:00`),
      nextDay = new Date(from.getTime() + 86_400_000),
      to = new Date(Math.min(nextDay.getTime(), Date.now()))
    return gpsLvn.routeWindow(id, from.toISOString(), to.toISOString())
  },
  tripHistory: async (from: string, to: string) =>
    ((await sdkGuard(supabase.rpc('gps_lvn_trip_integrity', { p_from: from, p_to: to }))) ??
      []) as unknown as GpsTripHistory[],
  geofences: async (vehicleId: string) =>
    ((await sdkGuard(supabase.rpc('gps_lvn_geofences', { p_vehicle_id: vehicleId }))) ??
      []) as unknown as GpsGeofence[],
  assignGeofence: async (vehicleId: string, geofenceId: string) => {
    await sdkVoid(supabase.rpc('gps_assign_vehicle_geofence', {
        p_vehicle_id: vehicleId,
        p_geofence_id: geofenceId,
      }),
    )
  },
  unassignGeofence: async (vehicleId: string, geofenceId: string) => {
    await sdkVoid(supabase.rpc('gps_unassign_vehicle_geofence', {
        p_vehicle_id: vehicleId,
        p_geofence_id: geofenceId,
      }),
    )
  },
  candidates: async (search = '') =>
    ((await sdkGuard(
      supabase.rpc('gps_lvn_binding_candidates', { p_search: search.trim() || null }),
    )) ?? []) as unknown as GpsBindingCandidate[],
  bind: async (deviceId: string, vehicleId: string, notes?: string) => {
    await sdkVoid(supabase.rpc('gps_lvn_bind_vehicle', {
        p_device_id: deviceId,
        p_garage_vehicle_id: vehicleId,
        p_notes: notes?.trim() || null,
      }),
    )
  },
  unbind: async (deviceId: string) => {
    await sdkVoid(supabase.rpc('gps_lvn_unbind_vehicle', { p_device_id: deviceId }))
  },
  sync: async (action: 'test' | 'full' | 'incremental') => {
    const { data, error } = await supabase.functions.invoke<GpsSyncResult>('lvn-gps-sync', {
      body: { action },
    })
    if (error) throw await toLvnError(error)
    if (!data?.ok) throw new LvnSyncError((data as { error?: string } | null)?.error ?? 'LVN_SYNC_FAILED')
    return data
  },
  importDayHistory: async (deviceId: string, day: string) => {
    const { data, error } = await supabase.functions.invoke<GpsSyncResult>('lvn-gps-sync', {
      body: { action: 'history', deviceId, day },
    })
    if (error) throw await toLvnError(error)
    if (!data?.ok) throw new LvnSyncError((data as { error?: string } | null)?.error ?? 'LVN_HISTORY_SYNC_FAILED')
    return data
  },
  importDepartureHistory: async (departureId: string, windowIndex = 0) => {
    const { data, error } = await supabase.functions.invoke<GpsSyncResult>('lvn-gps-sync', {
      body: { action: 'history', departureId, windowIndex },
    })
    if (error) throw await toLvnError(error)
    if (!data?.ok) throw new LvnSyncError((data as { error?: string } | null)?.error ?? 'LVN_HISTORY_SYNC_FAILED')
    return data
  },
  /* ─── 00342: محرّك مسار الانطلاقية ─── */
  tripRouteSettings: async () =>
    (await sdkGuard(supabase.rpc('trip_route_settings_get'))) as unknown as TripRouteSettings,
  saveTripRouteSettings: async (patch: Partial<TripRouteSettings>) =>
    (await sdkGuard(supabase.rpc('trip_route_settings_save', { p_patch: patch }))) as unknown as TripRouteSettings,
  tripRoute: async (departureId: string, maxPoints = 3000) =>
    (await sdkGuard(
      supabase.rpc('trip_route_get_v2', { p_departure: departureId, p_max_points: maxPoints }),
    )) as unknown as TripRouteDetail,
  /** 00343: قائمة مسارات الانطلاقيات مع الفلاتر والملخص والترقيم */
  tripRoutesList: async (filters: TripRoutesFilters, limit = 50, offset = 0) =>
    (await sdkGuard(
      supabase.rpc('trip_routes_list', { p_filters: filters, p_limit: limit, p_offset: offset }),
    )) as unknown as TripRoutesListResult,
  tripRoutesFilterOptions: async () =>
    (await sdkGuard(supabase.rpc('trip_routes_filter_options'))) as unknown as TripRoutesFilterOptions,
  /** «سحب الآن»: يقدّم الانطلاقية في الطابور ويسحبها فوراً من LVN */
  pullTripRouteNow: async (departureId: string) => {
    const { data, error } = await supabase.functions.invoke<TripRoutePullResult>('lvn-gps-sync', {
      body: { action: 'trip', departureId },
    })
    if (error) throw await toLvnError(error)
    if (!data?.ok) throw new LvnSyncError((data as { error?: string } | null)?.error ?? 'TRIP_ROUTE_PULL_FAILED')
    // 00347: دالة حافة قديمة (قبل 00342) تجهل action='trip' فتجري مزامنة عادية وترد ok بلا مسار — نكشف ذلك بدل «نجاح» كاذب
    if (data.action !== 'trip') throw new LvnSyncError('LVN_FUNCTION_OUTDATED')
    return data
  },
}

/**
 * 00210 — خطأ مزامنة LVN يحمل رمز الدالة الخادمية (مثل LVN_LOGIN_REJECTED) بدل
 * «Edge Function returned a non-2xx status code»: FunctionsHttpError يضع الاستجابة
 * غير المقروءة في error.context، ونقرأ منها { error: 'CODE' }.
 */
export class LvnSyncError extends Error {
  readonly code: string
  constructor(code: string, cause?: unknown) {
    super(code)
    this.name = 'LvnSyncError'
    this.code = code
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause
  }
}
async function toLvnError(error: unknown): Promise<LvnSyncError> {
  if (error instanceof LvnSyncError) return error
  const context = (error as { context?: Response }).context
  if (context && typeof context.json === 'function') {
    try {
      const body = (await context.json()) as { error?: string }
      if (body?.error) return new LvnSyncError(String(body.error), error)
    } catch {
      /* الجسم ليس JSON — نستخدم الرسالة العامة */
    }
  }
  return new LvnSyncError((error as { message?: string })?.message ?? 'LVN_SYNC_FAILED', error)
}

/* ─── 00342: أنواع مسار الانطلاقية ─── */
export interface TripRouteSettings {
  stop_speed_kmh: number
  stop_min_seconds: number
  gap_min_seconds: number
  max_speed_kmh: number
  jitter_meters: number
  live_pull_minutes: number
  final_after_minutes: number
  updated_at?: string | null
  updated_by_name?: string | null
}
export type TripRouteStatus = 'pending' | 'no_device' | 'partial' | 'complete' | 'empty' | 'failed'
export type TripRoutePointState = 'moving' | 'stopped' | 'gap'
export interface TripRoutePoint {
  seq: number
  leg_id: string | null
  t: string
  lat: number
  lng: number
  speed: number | null
  course: number | null
  address: string | null
  dist_m: number
  seconds: number
  state: TripRoutePointState
}
export interface TripRouteStop {
  id: number
  seq: number
  leg_id: string | null
  started_at: string
  ended_at: string
  duration_seconds: number
  lat: number
  lng: number
  address: string | null
  address_source: 'lvn' | 'osm' | 'zone' | null
  geofence_id: string | null
  geofence_name: string | null
}
export interface TripRouteGap {
  seq: number
  leg_id: string | null
  started_at: string
  ended_at: string
  seconds: number
  from_lat: number
  from_lng: number
  to_lat: number
  to_lng: number
}
export interface TripRouteLeg {
  leg_id: string
  sequence_no: number
  origin_type: string
  destination_type: string
  departed_at: string
  arrived_at: string | null
  points: number
  distance_m: number
  moving_seconds: number
  stopped_seconds: number
  max_speed_kmh: number
  avg_speed_kmh: number
  stops_count: number
  gaps_count: number
  first_fix: string | null
  last_fix: string | null
}
export interface TripRouteDetail {
  departure_id: string
  status: TripRouteStatus
  is_final: boolean
  device_id: string | null
  range_from: string | null
  range_to: string | null
  points_source: number
  points_kept: number
  points_rejected: number
  points_returned: number
  downsample_step: number
  distance_m: number
  moving_seconds: number
  stopped_seconds: number
  max_speed_kmh: number
  avg_speed_kmh: number
  stops_count: number
  gaps_count: number
  gap_seconds: number
  first_fix: string | null
  last_fix: string | null
  pulled_at: string | null
  next_pull_at: string | null
  pull_count: number
  error_code: string | null
  legs: TripRouteLeg[]
  stops: TripRouteStop[]
  gaps: TripRouteGap[]
  points: TripRoutePoint[]
  /** 00345: بيانات الانطلاقية للترويسة (trip_route_get_v2) */
  trip?: TripRouteTripInfo | null
}
export interface TripRouteTripInfo {
  departure_id: string
  vehicle_id: string
  vehicle_name: string
  db_number: string | null
  plate_number: string | null
  vehicle_category: string | null
  driver_name: string
  shift: string | null
  sector_id: number | null
  sector_name: string | null
  departed_at: string
  site_arrived_at: string | null
  site_departed_at: string | null
  returned_at: string | null
  departed_by_name: string | null
  returned_by_name: string | null
  notes: string | null
  device_name: string | null
  device_external_id: string | null
}
export interface TripRoutePullResult {
  ok: boolean
  action?: string
  departureId: string
  status: TripRouteStatus
  points: number
  final: boolean
  error?: string
}

/* ─── 00343: قائمة المسارات والفلاتر ─── */
export type TripRoutePlaceKind = 'zone' | 'landmark' | 'station' | 'circle'
export interface TripRoutePlace {
  kind: TripRoutePlaceKind
  id?: string
  lat?: number
  lng?: number
  radius_m?: number
  /** للعرض فقط */
  label?: string
}
export type TripRoutesOrder = 'departed_desc' | 'departed_asc' | 'distance_desc' | 'stops_desc' | 'duration_desc' | 'gaps_desc'
export interface TripRoutesFilters {
  date_from?: string
  date_to?: string
  sector_id?: number | null
  vehicle_id?: string | null
  driver?: string
  shift?: string
  trip?: 'open' | 'returned' | ''
  status?: TripRouteStatus | ''
  search?: string
  has_gaps?: boolean | null
  min_stops?: number | null
  min_km?: number | null
  from_place?: TripRoutePlace | null
  to_place?: TripRoutePlace | null
  via_place?: TripRoutePlace | null
  order?: TripRoutesOrder
}
export interface TripRoutesRow {
  departure_id: string
  vehicle_id: string
  vehicle_name: string
  db_number: string | null
  plate_number: string | null
  vehicle_category: string | null
  driver_name: string
  shift: string | null
  sector_id: number | null
  sector_name: string | null
  departed_at: string
  returned_at: string | null
  site_arrived_at: string | null
  site_departed_at: string | null
  status: TripRouteStatus
  is_final: boolean
  distance_m: number
  moving_seconds: number
  stopped_seconds: number
  max_speed_kmh: number
  avg_speed_kmh: number
  stops_count: number
  gaps_count: number
  gap_seconds: number
  points_kept: number
  points_rejected: number
  first_fix: string | null
  last_fix: string | null
  pulled_at: string | null
  next_pull_at: string | null
  error_code: string | null
  device_id: string | null
  legs_count: number
  last_destination: string | null
  last_leg_arrived: boolean | null
  trip_seconds: number
  from_lat: number | null
  from_lng: number | null
  from_address: string | null
  to_lat: number | null
  to_lng: number | null
  to_address: string | null
}
export interface TripRoutesSummary {
  total: number
  distance_m: number
  stops: number
  gaps: number
  open: number
  complete: number
  partial: number
  no_device: number
  pending: number
  empty: number
  moving_seconds: number
  stopped_seconds: number
  max_speed_kmh: number
}
export interface TripRoutesListResult {
  total: number
  limit: number
  offset: number
  summary: TripRoutesSummary
  rows: TripRoutesRow[]
}
export interface TripRoutesFilterOptions {
  sectors: { id: number; name: string }[]
  vehicles: { id: string; name: string; db_number: string | null; plate_number: string | null; sector_id: number | null; has_gps: boolean }[]
  zones: { id: string; name: string; source: string; color: string }[]
  landmarks: { id: string; name: string; category: string; lat: number; lng: number; color: string }[]
  stations: { id: string; name: string; geofence_id: string }[]
  shifts: string[]
}
