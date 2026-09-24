/** mirror لـ 00025_integrations.sql */
export interface BiometricDevice {
  id: string
  serial_number: string
  name: string
  branch_id: string | null
  location_hint: string | null
  is_active: boolean
  last_seen_at: string | null
  firmware: string | null
  mode: BiometricMode
  config: BiometricDeviceConfig
}

export interface CreateDeviceInput {
  serial_number: string
  name: string
  branch_id?: string
  location_hint?: string
  mode?: BiometricMode
  config?: BiometricDeviceConfig
}

// ── 00139: مصادر البصمة القابلة للتوصيل ──
/** adms_push = الجهاز يدفع إلينا · app_api_pull = API تطبيق مشترك · lan_pull = شبكة داخلية · generic_pull = عام بخريطة حقول */
export type BiometricMode = 'adms_push' | 'app_api_pull' | 'lan_pull' | 'generic_pull'
export const BIOMETRIC_MODES: readonly BiometricMode[] = ['adms_push', 'app_api_pull', 'lan_pull', 'generic_pull'] as const
export const BIOMETRIC_MODE_LABELS: Record<BiometricMode, string> = {
  adms_push: 'جهاز ZKTeco (دفع ADMS)',
  app_api_pull: 'API تطبيق مشترك',
  lan_pull: 'سحب مباشر من الجهاز (شبكة داخلية)',
  generic_pull: 'مصدر عام (خريطة حقول)',
}

export interface BiometricFieldMapping {
  pin: string
  at?: string
  date?: string
  time?: string
  direction?: string
  name?: string
  device_serial?: string
}

export interface BiometricDeviceConfig {
  base_url?: string
  path?: string
  api_key?: string
  api_key_header?: string
  auth_bearer?: string
  basic_user?: string
  basic_pass?: string
  from_param?: string
  to_param?: string
  timezone_offset?: string
  records_path?: string
  mapping?: BiometricFieldMapping
  in_values?: string[]
  out_values?: string[]
}

export type PunchDirection = 'in' | 'out' | 'unknown'

export interface BiometricPunch {
  id: string
  device_serial: string
  pin: string
  employee_id: string | null
  employee_name: string | null
  employee_number: string | null
  punched_at: string
  direction: PunchDirection
  person_name: string | null
  method: BiometricMode | 'manual'
}

export interface BiometricPunchFilters {
  from?: string | null
  to?: string | null
  pin?: string | null
  deviceId?: string | null
  unmatchedOnly?: boolean
  limit?: number
}

export interface BiometricPullLog {
  id: string
  device_id: string
  device_name: string
  mode: string
  status: 'success' | 'partial' | 'failed'
  received: number
  inserted: number
  duplicates: number
  unmatched: number
  error: string | null
  triggered_by: string | null
  started_at: string
  finished_at: string | null
}

export interface BiometricPullResult {
  ok: boolean
  received: number
  inserted: number
  duplicates: number
  unmatched: number
  window?: { from: string; to: string }
}

export interface BiometricTestResult {
  ok: boolean
  mode: BiometricMode
  available: number
  window: { from: string; to: string }
  sample: Array<{ pin: string; at: string; direction: PunchDirection; name?: string }>
}

export interface GpsProvider {
  id: string
  name: string
  type: 'traccar' | 'osmand' | 'custom_webhook' | 'vendor_api'
  api_key: string | null
  webhook_url: string | null
  is_active: boolean
}

export interface Vehicle {
  id: string
  plate: string
  name: string
  branch_id: string | null
  gps_provider_id: string | null
  device_unique_id: string | null
  is_active: boolean
}

export interface VehiclePosition {
  id: number
  vehicle_id: string
  latitude: number
  longitude: number
  speed_kmh: number | null
  heading: number | null
  ignition: boolean | null
  fix_time: string
}

export interface IntegrationLog {
  id: number
  provider: string
  direction: 'inbound' | 'outbound'
  status: 'success' | 'error' | 'rejected'
  endpoint: string | null
  error_note: string | null
  created_at: string
}

export interface CreateVehicleInput {
  plate: string
  name: string
  branch_id?: string
  gps_provider_id?: string
  device_unique_id?: string
}
