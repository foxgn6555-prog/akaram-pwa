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
}

/** تسميات الشفت */
export const SHIFT_LABELS: Record<Shift, string> = {
  morning: 'الصباحي',
  evening: 'المسائي',
}
