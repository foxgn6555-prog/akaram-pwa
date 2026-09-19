/** أنواع سجلات الأوزان — المحطة التحويلية (جدول ts_weight_records · ميجريشن 00039) */

export type Shift = 'morning' | 'evening'
export type WeightStatus = 'draft' | 'submitted_to_ops'

export interface WeightRecord {
  id: string
  /** ت: رقم التسلسل (يُحسب عند العرض إن خلا) */
  seq: number | null
  /** DB: رقم الآلية / اللوحة */
  db_number: string
  driver_name: string
  vehicle_type: string | null
  /** الوزن الكلي (طن) */
  gross_weight: number | null
  /** الوزن الفارغ (طن) */
  tare_weight: number | null
  /** الوزن الصافي (طن) = الكلي − الفارغ */
  net_weight: number | null
  /** وقت الدخول (HH:mm) */
  entry_time: string | null
  log_date: string
  shift: Shift
  status: WeightStatus
  submitted_to_ops_at: string | null
  archived_at: string | null
  archived_by: string | null
  archive_reason: string | null
  created_by: string | null
  created_at: string | null
}

/** إدخال سجل وزن جديد — الصافي يُحسَب آلياً في الخادم */
export interface CreateWeightInput {
  db_number: string
  driver_name: string
  vehicle_type?: string | null
  gross_weight?: number | null
  tare_weight?: number | null
  entry_time?: string | null
  log_date: string
  shift: Shift
}

export type UpdateWeightInput = Partial<CreateWeightInput>

/** ملخص إحصائي للوحة الرئيسية */
export interface WeightSummary {
  total_records: number
  today_records: number
  pending_ops: number
  submitted_ops: number
  archived: number
  total_net_tons: number
  today_net_tons: number
  today_violations?: number
  total_violations?: number
}

/** تسميات الشفت */
export const SHIFT_LABELS: Record<Shift, string> = {
  morning: 'الصباحي',
  evening: 'المسائي',
}

/* ═══ السكسات الخارجة · النسافات الخارجة (00043) ═══ */

/** حالة سجل الخروج: مسودة → مُرسل فولدره لمعاون المدير المفوض */
export type StationRecordStatus = 'draft' | 'submitted_to_deputy'

/** سجل السكسات الخارجة — وقت الخروج يُسجَّل تلقائياً */
export interface SaksatRecord {
  id: string
  driver_name: string
  vehicle_type: string | null
  /** الوزن (طن) — يدخله مسؤول المحطة (00130) */
  weight_tons: number | null
  /** ISO datetime — يُحدَّد تلقائياً لحظة الحفظ */
  exit_time: string | null
  log_date: string
  status: StationRecordStatus
  submitted_at: string | null
  archived_at: string | null
  archive_reason: string | null
  created_at: string | null
}

/** سجل النسافات الخارجة — نفس بنية السكسات */
export type TripRecord = SaksatRecord

export interface CreateSaksatInput {
  driver_name: string
  vehicle_type?: string | null
  /** الوزن (طن) — مطلوب في النموذج */
  weight_tons?: number | null
  /** ISO — يُولَّد تلقائياً عند غيابه */
  exit_time?: string | null
  log_date: string
}

export type CreateTripInput = CreateSaksatInput

/* ═══ سير العمل بالخطوات · المخالفات · ناقلة الحاويات (00130) ═══ */

/** مخالفة وزن: الأقل من الحد الأدنى غير مسموح — بلا مبالغ، تنبيه وتدقيق */
export interface ViolationRecord {
  id: string
  driver_name: string
  db_number: string
  vehicle_kind: string
  kind_label: string | null
  weight_tons: number
  min_tons: number
  deficit_tons: number
  violated_at: string | null
  visit_leg_id: string
}

/** سجل ناقلة حاويات مكبسية — نفس فكرة السكسات + الوزن */
export interface CarrierRecord extends SaksatRecord {
  weight_tons: number
}

export type CreateCarrierInput = CreateSaksatInput & { weight_tons: number }

/* ═══ التقارير اليومية والمحاسبة الوزنية (00131) ═══ */

export interface DailyUnitSummary { count: number; tons: number; capacity?: number }

export interface DailyStationReport {
  day?: string
  inbound?: Array<Record<string, unknown>>
  inbound_totals?: {
    press?: DailyUnitSummary
    transfer_station?: DailyUnitSummary
    total_count?: number
    total_tons?: number
  }
  outbound?: {
    saksat?: DailyUnitSummary
    trips?: DailyUnitSummary
    carrier?: DailyUnitSummary
    total_count?: number
    total_tons?: number
  }
  violations?: Array<Record<string, unknown>>
}

export interface SectorTonnageRow {
  parent_sector: string
  inbound_count: number
  inbound_tons: number
  press_tons: number
  station_tons: number
  violation_count: number
}

export interface DeputyDailyReport {
  report_day: string
  sent_at: string | null
  sender_name: string | null
  note: string | null
  payload: DailyStationReport
}

/** صف جدول غرفة العمليات لسير عمل المحطة بكل الأزمنة */
export interface WorkflowRow {
  visit_id: string
  departure_id: string
  trip_day: string | null
  db_number: string
  vehicle_name: string
  driver_name: string
  shift: string
  area_name: string
  manager_name: string | null
  inbound_departed_at: string | null
  arrived_at: string | null
  weighed_at: string | null
  completed_at: string | null
  dispatched_at: string | null
  weight_tons: number | null
  destination: string | null
  destination_label: string | null
  vehicle_kind: string | null
  kind_label: string | null
  min_tons: number | null
  violation: boolean
  deficit_tons: number | null
  transit_minutes: number | null
  weigh_wait_minutes: number | null
  process_minutes: number | null
  stay_minutes: number | null
}
