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
  /** منطقة أوقات الجهاز ±HH:MM (00140) — أوقات ZKTeco محلية بلا منطقة */
  timezone_offset: string
  /** 00141 · جسر الشبكة الداخلية: بادئة المفتاح (المفتاح نفسه يُعرض مرة واحدة) وآخر اتصال/خطأ من الوكيل */
  bridge_key_prefix: string | null
  bridge_last_seen_at: string | null
  bridge_last_error: string | null
  /** 00173 · تشخيص ADMS */
  last_registered_at?: string | null
  last_heartbeat_at?: string | null
  heartbeat_count?: number
  public_url?: string | null
}

export interface CreateDeviceInput {
  serial_number: string
  name: string
  branch_id?: string
  location_hint?: string
  mode?: BiometricMode
  config?: BiometricDeviceConfig
  timezone_offset?: string
}

// ── 00139: مصادر البصمة القابلة للتوصيل ──
/** adms_push = الجهاز يدفع إلينا · app_api_pull = API تطبيق مشترك · lan_pull = HTTP شبكة داخلية · generic_pull = عام بخريطة حقول · zk_bridge = وكيل داخل الشبكة يسحب من الجهاز (TCP 4370) */
export type BiometricMode = 'adms_push' | 'app_api_pull' | 'lan_pull' | 'generic_pull' | 'zk_bridge'
export const BIOMETRIC_MODES: readonly BiometricMode[] = ['adms_push', 'zk_bridge', 'app_api_pull', 'lan_pull', 'generic_pull'] as const
export const BIOMETRIC_MODE_LABELS: Record<BiometricMode, string> = {
  adms_push: 'جهاز ZKTeco (دفع ADMS)',
  zk_bridge: 'جهاز ZKTeco عبر وكيل الشبكة الداخلية (جسر)',
  app_api_pull: 'API تطبيق مشترك',
  lan_pull: 'سحب HTTP من الجهاز (شبكة داخلية)',
  generic_pull: 'مصدر عام (خريطة حقول)',
}
/** الأنماط التي لا يسحبها الخادم بنفسه (الجهاز/الوكيل هو من يرسل) */
export const BIOMETRIC_PASSIVE_MODES: readonly BiometricMode[] = ['adms_push', 'zk_bridge'] as const

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
  /** اسم المستخدم كما سجّله الجهاز (OPERLOG) — يساعد HR على الربط */
  device_user_name?: string | null
}

export interface BiometricDeviceUser {
  device_serial: string
  pin: string
  name: string | null
  card: string | null
  updated_at: string
  employee_id: string | null
  employee_name: string | null
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

/** 00173 · نتيجة تشخيص جهاز ADMS */
export type DiagStatus = 'ok' | 'warn' | 'fail'
export interface BiometricDiagCheck { key: string; label: string; status: DiagStatus; at?: string | null; count?: number; count_24h?: number; last_punch_at?: string | null; pending?: boolean; hint?: string | null }
export interface BiometricDiagEvent { at: string; endpoint: string | null; status: string; payload: Record<string, unknown>; error: string | null }
export interface BiometricDiagnostics {
  device_id: string; serial_number: string; name: string; mode: BiometricMode; is_active: boolean
  public_url: string | null; timezone_offset: string | null
  last_seen_at: string | null; last_registered_at: string | null; last_heartbeat_at: string | null; heartbeat_count: number
  last_punch_at: string | null; last_received_at: string | null; punches_total: number; punches_24h: number
  unmatched_pins: number; users_named: number; users_query_pending: boolean
  checks: BiometricDiagCheck[]; events: BiometricDiagEvent[]; server_time: string
}

// ─── 00174: أوامر الأجهزة، الاكتشاف، عناوين الخوادم ───
export type BiometricCommandKind = 'query_userinfo' | 'query_attlog' | 'update_user' | 'delete_user' | 'custom'
export type BiometricCommandStatus = 'queued' | 'sent' | 'done' | 'failed' | 'cancelled'
export interface BiometricCommand {
  id: number
  kind: BiometricCommandKind
  command: string
  status: BiometricCommandStatus
  return_code: number | null
  note: string | null
  created_at: string
  sent_at: string | null
  acked_at: string | null
  created_by_name: string | null
}
export const BIOMETRIC_COMMAND_LABELS: Record<BiometricCommandKind, string> = {
  query_userinfo: 'جلب أسماء المستخدمين',
  query_attlog: 'سحب بصمات فترة',
  update_user: 'إرسال موظف إلى الجهاز',
  delete_user: 'حذف مستخدم من الجهاز',
  custom: 'أمر مخصص',
}
export const BIOMETRIC_COMMAND_STATUS_LABELS: Record<BiometricCommandStatus, string> = {
  queued: 'بانتظار اتصال الجهاز', sent: 'أُرسل للجهاز', done: 'نُفّذ', failed: 'فشل', cancelled: 'أُلغي',
}
export interface BiometricUnregisteredDevice { serial_number: string; first_seen: string; last_seen: string; attempts: number }
export interface BiometricAdmsEndpoint { id: string; label: string; host: string; note: string | null; sort_order: number; is_active: boolean }

// ─── 00175: وحدة «الأشخاص غير المطابقين» ───
export type UnmatchedDayStatus = UnmatchedUnitStatus
export interface UnmatchedDay { d: string; status: UnmatchedDayStatus; n: number; minutes: number; first: string | null; last: string | null }
export interface UnmatchedPersonRow {
  pin: string
  person_name: string | null
  device_serial: string
  device_name: string
  branch_id: string | null
  branch_name: string | null
  days: UnmatchedDay[]
  present_days: number
  missing_days: number
  absent_days: number
  total_minutes: number
  first_seen: string
  last_seen: string
}
export const UNMATCHED_STATUS_LABELS: Record<UnmatchedDayStatus, string> = { present: 'حاضر', missing: 'بصمة ناقصة', absent: 'غائب', leave: 'مجاز', review: 'للمراجعة', previous_exit: 'خروج لليوم السابق', pending: 'اليوم جارٍ', future: 'مستقبل', unknown: 'غير محدد بعد الربط' }
export const UNMATCHED_STATUS_SHORT: Record<UnmatchedDayStatus, string> = { present: 'ح', missing: 'ن', absent: 'غ', leave: 'إ', review: 'مراجعة', previous_exit: 'خروج سابق', pending: 'جارٍ', future: 'مستقبل', unknown: 'غير محدد' }

/** سجلات محفوظة من مرحلة عدم المطابقة، قد يبقى الشخص فيها بعد ربطه. */
export interface UnmatchedArchivePerson {
  device_serial: string; pin: string; device_person_name: string | null; device_name: string | null
  branch_id: string | null; punch_count: number; first_punch: string | null; last_punch: string | null
}
export interface UnmatchedArchivePunch {
  source_punch_id: string; punched_at: string
  original_punch: { direction?: string; method?: string; person_name?: string | null }
  original_device: { timezone_offset?: string | null } | null
}
export interface ArchivePeopleFilters { search?: string; deviceSerial?: string; branchId?: string }
export interface ArchivePersonCursor { device: string; pin: string }
export interface ArchivePunchCursor { at: string; id: string }

export type UnmatchedUnitStatus = 'present' | 'missing' | 'absent' | 'leave' | 'review' | 'previous_exit' | 'pending' | 'future' | 'unknown'
export interface UnmatchedUnitDay {
  date: string; status: UnmatchedUnitStatus; punch_count: number
  entry: string | null; exit: string | null; raw_first: string | null; raw_last: string | null
  manual_revision: number; manual: boolean
}
export interface UnmatchedUnitPerson {
  device_serial: string; pin: string; person_name: string | null; device_name: string | null
  branch_id: string | null; current_pin_linked: boolean; days: UnmatchedUnitDay[]
}
export interface UnmatchedUnitFilters {
  from: string; to: string; branch?: string; device?: string; name?: string; search?: string; pin?: string; status?: UnmatchedUnitStatus; issues?: boolean
}
export interface UnmatchedUnitAccess { can_edit: boolean; can_manage: boolean }
export interface UnmatchedUnitHrPermission { user_id: string; display_name: string; email: string | null; can_edit: boolean }
export interface UnmatchedUnitHistory { id: number; work_day: string | null; action: string; old_value: Record<string, unknown> | null; new_value: Record<string, unknown>; actor: string; actor_name: string; created_at: string }
export interface UnmatchedUnitEdits { person: { display_name: string; revision: number } | null; days: Array<{ work_day: string; status: string; entry_time: string | null; exit_time: string | null; exit_next_day: boolean; revision: number }> }
export interface UnmatchedIndependentCandidate {
  device_serial: string; pin: string; device_name: string; device_user_name: string | null
  employee_name: string; source_punch_count: number; already_confirmed: boolean
}
