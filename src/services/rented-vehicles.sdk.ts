/**
 * حضوريات الآليات المؤجرة (20261203000100–000400)
 *   · غرفة العمليات: كشف الشهر + إعدادات التفريغ + التعديل اليدوي + إرسال للاعتماد.
 *   · معاون المدير المفوض: قائمة الآليات المؤجرة + ضريبة كل آلية + اعتماد الشهر.
 *   · المالية: رواتب السائقين (شهري/يومي) + كشف المستحقات + الدفع.
 *
 * القاعدة الذهبية: الانطلاق = حاضر. اليوم بلا انطلاقة = غائب.
 */
import { sdkGuard, supabase } from './client'

const rpc = <T>(fn: string, args: Record<string, unknown> = {}) =>
  sdkGuard(supabase.rpc(fn as never, args as never)) as Promise<T>

/**
 * البارامتر `p_month` نوعه `date` في قاعدة البيانات، لكن منتقي الشهر في الواجهة
 * (`<input type="month">` و`baghdadYm()`) يُنتج `YYYY-MM`. تمرير `2026-11` كما هو
 * يرفع 22007 (invalid input syntax for type date) قبل دخول الدالة أصلاً ⇒ 400.
 * التطبيع هنا، عند حدود الـRPC، حتى لا يستطيع أي مستدعٍ تجاوزه.
 *
 * مُصدَّرة للاختبار (tests/contract/rpc-date-params.test.ts) — لا تُستخدم خارج هذا الملف.
 */
export const asMonthStart = (ym: string | null): string | null => {
  if (!ym) return null
  return /^\d{4}-\d{2}$/.test(ym) ? `${ym}-01` : ym
}

/**
 * اليوم قد يصل `YYYY-MM-DD` من الواجهة أو `YYYY-MM` أو كائناً زمنياً؛ القاعدة تريد
 * تاريخاً كاملاً. لا نسمح بمرور قيمة لا تُفسَّر كتاريخ صالح بدل تركها للقاعدة.
 */
export const asDay = (d: string | null): string | null => {
  if (!d) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d
  if (/^\d{4}-\d{2}$/.test(d)) return `${d}-01`
  return d
}

/** يوم واحد في كشف الشهر: 'present' | 'absent' | غير موجود (خارج الشهر) */
export type RentedDayState = 'present' | 'absent'

export interface RentedAttendanceRow {
  driver_external_id: string
  driver_name: string
  contractor_name: string
  vehicle_id: string
  db_number: string
  vehicle_name: string
  vehicle_category: string | null
  garage_parent_sector: string | null
  sector_name: string | null
  present: number
  absent: number
  departures_count: number
  tons_discharged: number
  monthly_target_tons: number
  tons_per_trip: number | null
  trips_required: number | null
  days: Record<string, RentedDayState>
}

export interface RentedAttendanceMonth {
  month: string
  days_in_month: number
  rows: RentedAttendanceRow[]
}

export interface RentedGarage {
  garage_parent_sector: string
  vehicles: number
}

export interface RentedDischargeRow {
  vehicle_id: string
  db_number: string
  vehicle_name: string
  vehicle_category: string | null
  category_label: string | null
  min_tons: number | null
  max_tons: number | null
  tons_per_trip: number | null
  monthly_target_tons: number
  trips_required: number | null
  garage_parent_sector: string | null
  note: string | null
  set_at: string | null
}

export type RentedTaxMode = 'fixed' | 'percent'

export interface RentedTaxRow {
  vehicle_id: string
  db_number: string
  vehicle_name: string
  vehicle_category: string | null
  driver_name: string | null
  contractor_name: string | null
  garage_parent_sector: string | null
  mode: RentedTaxMode | null
  fixed_amount: number | null
  pct: number | null
  reason: string | null
  set_at: string | null
  is_set: boolean
}

export type RentedMonthStatus = 'draft' | 'deputy_approved' | 'finance_paid' | 'rejected'
export type RentedSalaryMode = 'monthly' | 'daily'

export interface RentedSettlementRow {
  driver_external_id: string
  driver_name: string
  contractor_name: string
  vehicle_id: string
  db_number: string
  vehicle_name: string
  garage_parent_sector: string | null
  present_days: number
  absent_days: number
  days_in_month: number
  salary_mode: RentedSalaryMode | null
  monthly_amount: number | null
  daily_amount: number | null
  daily_value: number
  base_amount: number
  absence_deduction: number
  tax_mode: RentedTaxMode | null
  tax_value: number | null
  tax_amount: number
  net_amount: number
  tons_discharged: number
  monthly_target_tons: number
  tons_per_trip: number | null
  trips_required: number | null
  has_salary: boolean
  tax_set: boolean
}

export interface RentedPayroll {
  month: string
  status: RentedMonthStatus
  month_row: {
    status: RentedMonthStatus
    submitted_at: string | null
    deputy_at: string | null
    deputy_note: string | null
    finance_at: string | null
    finance_note: string | null
  } | null
  totals: {
    base: number
    absence: number
    tax: number
    net: number
    drivers: number
    rows_with_salary: number
  }
  rows: RentedSettlementRow[]
}

export interface RentedAuditRow {
  id: string
  entity: string
  entity_id: string | null
  action: string
  before: unknown
  after: unknown
  reason: string | null
  actor_name: string | null
  created_at: string
}

export const rentedAttendance = {
  // ── غرفة العمليات ──
  month: (month: string | null, garage: string | null) =>
    rpc<RentedAttendanceMonth>('rented_attendance_month', { p_month: asMonthStart(month), p_garage: garage }),
  garages: () => rpc<RentedGarage[]>('rented_attendance_garages'),
  setDay: (v: {
    driverId: string
    vehicleId: string
    day: string
    status: RentedDayState
    reason: string
  }) =>
    rpc<void>('rented_attendance_set_day', {
      p_driver_external_id: v.driverId,
      p_vehicle_id: v.vehicleId,
      p_day: asDay(v.day),
      p_status: v.status,
      p_reason: v.reason,
    }),
  dischargeList: () => rpc<RentedDischargeRow[]>('rented_discharge_list'),
  dischargeSave: (v: {
    vehicleId: string
    tonsPerTrip: number | null
    monthlyTargetTons: number
    note: string | null
  }) =>
    rpc<void>('rented_discharge_save', {
      p_vehicle_id: v.vehicleId,
      p_tons_per_trip: v.tonsPerTrip,
      p_monthly_target_tons: v.monthlyTargetTons,
      p_note: v.note,
    }),
  submitMonth: (month: string) => rpc<void>('rented_month_submit', { p_month: asMonthStart(month) }),

  // ── معاون المدير المفوض ──
  taxList: () => rpc<RentedTaxRow[]>('rented_tax_list'),
  taxSave: (v: { vehicleId: string; mode: RentedTaxMode; amount: number; reason: string }) =>
    rpc<void>('rented_tax_save', {
      p_vehicle_id: v.vehicleId,
      p_mode: v.mode,
      p_amount: v.amount,
      p_reason: v.reason,
    }),
  taxClear: (v: { vehicleId: string; reason: string }) =>
    rpc<void>('rented_tax_clear', { p_vehicle_id: v.vehicleId, p_reason: v.reason }),
  decideDeputy: (v: { month: string; approve: boolean; note: string | null }) =>
    rpc<void>('rented_month_decide_deputy', {
      p_month: asMonthStart(v.month),
      p_approve: v.approve,
      p_note: v.note,
    }),

  // ── المالية ──
  payroll: (month: string | null) =>
    rpc<RentedPayroll>('rented_payroll_sheet', { p_month: asMonthStart(month) }),
  salarySave: (v: {
    driverId: string
    vehicleId: string
    month: string
    mode: RentedSalaryMode
    amount: number
    note: string | null
  }) =>
    rpc<void>('rented_salary_save', {
      p_driver_external_id: v.driverId,
      p_vehicle_id: v.vehicleId,
      p_month: asMonthStart(v.month),
      p_salary_mode: v.mode,
      p_amount: v.amount,
      p_note: v.note,
    }),
  payMonth: (v: { month: string; note: string | null }) =>
    rpc<void>('rented_month_pay', { p_month: asMonthStart(v.month), p_note: v.note }),
  audit: (limit = 200) => rpc<RentedAuditRow[]>('rented_attendance_audit_list', { p_limit: limit }),
}

/** رسائل الأخطاء العربية — مطابقة لعُرف بقية الوحدات */
const MESSAGES: Record<string, string> = {
  RENTED_ATT_FORBIDDEN: 'لا تملك صلاحية هذه الوحدة',
  RENTED_TAX_FORBIDDEN: 'ضريبة الآليات المؤجرة يقّرها معاون المدير المفوض فقط',
  RENTED_SALARY_FORBIDDEN: 'رواتب الآليات المؤجرة يقّرها المالية فقط',
  RENTED_MONTH_NOT_ENDED: 'لا يمكن إرسال شهر جارٍ — انتظر انتهاءه',
  RENTED_MONTH_NOT_SUBMITTED: 'لم تُرسَل حضوريات هذا الشهر بعد',
  RENTED_MONTH_WRONG_STATE: 'حالة الشهر لا تسمح بهذه الخطوة',
  RENTED_MONTH_NOT_APPROVED: 'لا دفع قبل اعتماد معاون المدير المفوض',
  RENTED_MONTH_LOCKED: 'الشهر مدفوع — لا تعديل بعده',
  RENTED_SALARY_MISSING: 'سائقون لهم حضور بلا راتب محدَّد — المالية تحدد رواتبهم أولاً',
  RENTED_SALARY_AMOUNT_INVALID: 'المبلغ يجب أن يكون أكبر من صفر',
  RENTED_TAX_REASON_REQUIRED: 'سبب الضريبة إلزامي (٣ أحرف على الأقل)',
  RENTED_ATT_REASON_REQUIRED: 'سبب التعديل إلزامي (٣ أحرف على الأقل)',
  RENTED_VEHICLE_NOT_FOUND: 'الآلية غير موجودة أو ليست مؤجرة',
  RENTED_DISCHARGE_TONS_INVALID: 'طن التفريغة يجب أن يكون أكبر من صفر',
}

export const rentedErrorMessage = (e: unknown): string => {
  const msg = e instanceof Error ? e.message : String(e)
  for (const [code, text] of Object.entries(MESSAGES)) if (msg.includes(code)) return text
  return 'تعذّر إتمام العملية'
}
