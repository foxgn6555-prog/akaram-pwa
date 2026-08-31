/** أنواع الكشوفات التأديبية — وحدة الكشوفات (جدول disclosures · ميجريشن 00040/00041) */

/** الشفت: التشغيل الذاتي بثلاث نوبات (صباحي / مسائي / ليلي) */
export type Shift = 'morning' | 'evening' | 'night'

/** نوع المخالفة (6 أنواع) */
export type ViolationType =
  | 'delay'
  | 'absence'
  | 'collection'
  | 'evasion'
  | 'early_withdrawal'
  | 'load_deficiency'

/**
 * الإجراء التأديبي — «توبيخ» أُلغي من الاختيارات في الواجهة،
 * ويبقى محجوزاً لإظهار السجلات القديمة فقط (ميجريشن 00041).
 */
export type PenaltyType = 'warning' | 'reprimand' | 'termination'

/** نوع المتعهد: التشغيل الذاتي أو الآلية المؤجرة */
export const CONTRACTOR_TYPES = ['ذاتي', 'مؤجر'] as const
export type ContractorType = (typeof CONTRACTOR_TYPES)[number]

export type DisclosureStatus = 'draft' | 'submitted_to_deputy'

export interface Disclosure {
  id: string
  ref_no: string | null
  db_number: string
  driver_name: string
  vehicle_type: string | null
  contractor_name: string | null
  sector: string | null
  shift: Shift
  log_date: string
  violation_type: ViolationType
  penalty_type: PenaltyType | null
  details: string
  status: DisclosureStatus
  submitted_at: string | null
  prepared_by_name: string | null
  archived_at: string | null
  archived_by: string | null
  archive_reason: string | null
  created_by: string | null
  created_at: string | null
}

export interface CreateDisclosureInput {
  db_number: string
  driver_name: string
  vehicle_type?: string | null
  contractor_name?: string | null
  sector?: string | null
  shift: Shift
  log_date: string
  violation_type: ViolationType
  penalty_type?: PenaltyType | null
  details: string
  prepared_by_name?: string | null
}

export interface DisclosureSummary {
  total: number
  drafts: number
  submitted: number
  archived: number
  today: number
  by_violation: Record<ViolationType, number>
}

export const VIOLATION_LABELS: Record<ViolationType, string> = {
  delay: 'تأخير',
  absence: 'غياب',
  collection: 'جباية',
  evasion: 'تهرب من العمل',
  early_withdrawal: 'انسحاب مبكر',
  load_deficiency: 'نقص حمولة',
}

export const PENALTY_LABELS: Record<PenaltyType, string> = {
  warning: 'إنذار',
  // التوبيخ أُلغي من الاختيارات — يبقى للعرض التاريخي فقط (انظر ميجريشن 00041)
  reprimand: 'توبيخ',
  termination: 'إنهاء خدمات',
}

export const SHIFT_LABELS: Record<Shift, string> = {
  morning: 'ذاتي · صباحي',
  evening: 'ذاتي · مسائي',
  night: 'ذاتي · ليلي',
}
