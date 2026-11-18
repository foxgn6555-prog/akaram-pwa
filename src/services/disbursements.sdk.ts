/**
 * SDK مسار الصرف: طلب الصرف يُنشأ بعد إقفال شهر رواتب الموظفين (تلقائياً) أو بـ«اعتماد وإرسال» أجور المتعهدين،
 * يقرره المدير المفوض (اعتماد/رفض بسبب إلزامي)، ثم تصرفه المالية من القاصة بحركة واحدة نهائية.
 *  · القراءة: المالية والمدير المفوض (disbursement_list / _get / _lines / _counts)
 *  · الكتابة: disbursement_decide (المدير المفوض) · disbursement_pay / disbursement_resubmit (المالية) · finance_contractor_wages_close (المالية)
 *  · الأرقام والأسماء في الطلب مجمَّدة وقت الإنشاء؛ المبلغ المخصوم من القاصة = صافي الطلب بالضبط
 */
import { sdkGuard, supabase } from './client'

export type DisbursementKind = 'employee_payroll' | 'contractor_wages'
export type DisbursementStatus = 'pending_approval' | 'approved' | 'paid' | 'rejected'
export type DisbursementFlag = 'all' | 'deduction' | 'adjusted' | 'advance' | 'zero'
export type DisbursementSort = 'number' | 'name' | 'net_desc' | 'net_asc'

export const DISBURSEMENT_KIND_LABEL: Record<DisbursementKind, string> = { employee_payroll: 'رواتب الموظفين', contractor_wages: 'أجور المتعهدين' }
/** تسمية الحالة كما يراها كل طرف: المدير المفوض ينتظر قراره، والمالية تنتظر قرار المدير ثم الصرف */
export const DISBURSEMENT_STATUS_LABEL: Record<DisbursementStatus, string> = { pending_approval: 'بانتظار القرار', approved: 'معتمد — بانتظار الصرف', paid: 'مصروف', rejected: 'مرفوض' }
export const DISBURSEMENT_STATUS_SHORT: Record<DisbursementStatus, string> = { pending_approval: 'بانتظار القرار', approved: 'معتمد', paid: 'مصروف', rejected: 'مرفوض' }
export const DISBURSEMENT_FLAG_LABEL: Record<DisbursementFlag, string> = { all: 'الكل', deduction: 'استقطاع', adjusted: 'معدَّل يدوياً', advance: 'سلفة', zero: 'صافٍ صفر' }

export interface DisbursementRequest {
  id: string; request_no: string; kind: DisbursementKind; kind_label: string
  /** أول يوم في الشهر (YYYY-MM-DD) */
  period_month: string
  version: number; status: DisbursementStatus
  source_export_id: string | null; supersedes_id: string | null
  people_count: number; payable_count: number
  gross_total: number; deductions_total: number; net_total: number; prev_net_total: number | null
  /** الصافي − (الإجمالي − الاستقطاعات): تسويات المالية اليدوية على الصافي */
  other_adjustments: number
  requested_by: string | null; requested_by_name: string | null; requested_at: string
  decided_by: string | null; decided_by_name: string | null; decided_at: string | null; decision_note: string | null
  paid_by: string | null; paid_by_name: string | null; paid_at: string | null
  treasury_tx_id: string | null; treasury_ref_no: string | null
  /** الطلب المرفوض الذي أُعيد إرساله: النسخة التي حلّت محلّه (null = لم يُعَد إرساله بعد) */
  resubmitted_id: string | null; resubmitted_no: string | null; resubmitted_version: number | null
  /** أجور المتعهدين فقط: الأيام والمبلغ المحجوبان بسبب غياب البصمة (null لرواتب الموظفين) */
  blocked_days: number | null; blocked_amount: number | null
  created_at: string; updated_at: string
}
/** rejected = كل المرفوضات في السجل؛ rejected_open = المرفوض الذي لم يُعَد إرساله بعد (هو الذي يحتاج إجراءً من المالية) */
export interface DisbursementCounts { pending_approval: number; approved: number; paid: number; rejected: number; rejected_open: number }
export interface DisbursementList { items: DisbursementRequest[]; counts: DisbursementCounts; balance: number }
export interface DisbursementEvent {
  id: number; event: 'created' | 'approved' | 'rejected' | 'paid' | 'resubmitted'
  actor: string | null; actor_name: string | null; note: string | null; amount: number | null; created_at: string
}
export interface DisbursementFacets {
  groups: { group: string | null; sub_group: string | null; count: number; net: number }[]
  flags: Record<DisbursementFlag, number>
}
export interface DisbursementDetail {
  request: DisbursementRequest; events: DisbursementEvent[]
  balance: number; balance_after: number; shortfall: number
  facets: DisbursementFacets
}

/** تفاصيل سطر موظف (لقطة وقت الإقفال) — كل حقل اختياري: القاعدة تحذف الفارغ */
export interface EmployeeLineDetails {
  no_profile?: boolean; pay_type?: string; contract_type?: string
  working_days?: number; days_present?: number; days_late?: number; days_absent?: number; days_leave?: number; days_leave_paid?: number; days_leave_unpaid?: number
  late_minutes?: number; early_minutes?: number; payable_days?: number; unevaluated_days?: number
  base_salary?: number; daily_rate?: number; allowances_total?: number; fixed_deductions_total?: number
  ops_deduction_amount?: number; auto_deduction_amount?: number; advance_installment?: number; overtime_amount?: number
  review_relief_amount?: number; rented_tax_amount?: number; uncollected_amount?: number
  proposed_net?: number; final_net?: number; finance_note?: string
}
export interface ContractorLineDay {
  date: string; headcount: number; state: 'paid' | 'blocked'; reason: 'absent' | 'leave' | 'no_record' | string | null
  required: number; shortfall: number; grace: number; deduct_minutes: number; base: number; deduction: number; pay: number
}
/** تفاصيل سطر متعهد: الأجران، أيام الصرف، الأيام المحجوبة بالبصمة، الاستقطاع، وجدول الأيام */
export interface ContractorLineDetails {
  contractor_daily_wage: number; worker_daily_wage: number
  pay_days: number; paid_days: number; blocked_days: number; late_days: number; deduction_minutes: number
  blocked_amount: number; deduction_amount: number; contractor_pay: number; workers_pay: number; workers_days: number
  days: ContractorLineDay[]
}
export interface DisbursementLine {
  id: string; person_id: string | null; person_number: string | null; full_name: string
  group_name: string | null; sub_group_name: string | null; job_title: string | null
  gross_amount: number; deductions_total: number; net_amount: number
  adjusted: boolean; has_deduction: boolean; has_advance: boolean
  details: EmployeeLineDetails & Partial<ContractorLineDetails>
}
export interface DisbursementLines { total: number; net_total: number; limit: number; offset: number; rows: DisbursementLine[] }
export interface DisbursementLinesFilter { group?: string | null; subGroup?: string | null; flag?: DisbursementFlag | null; search?: string | null; sort?: DisbursementSort; limit?: number; offset?: number }
export interface DisbursementListFilter { kind?: DisbursementKind | null; status?: DisbursementStatus | null; month?: string | null; search?: string | null; limit?: number }

/** جاهزية «اعتماد وإرسال» أجور المتعهدين لشهر: الشروط التي تمنع الإرسال بأسمائها */
export type ContractorWagesBlocker = 'month_not_locked' | 'active_request' | 'attendance_not_confirmed' | 'rates_missing' | 'no_fingerprint' | 'no_days' | 'nothing_payable'
export interface ContractorWagesReadiness {
  month: string; locked: boolean
  attendance_required: boolean; attendance_confirmed: boolean; attendance_pending_auto: number
  contractors: number; missing_rates: number; no_fingerprint: number
  gross_total: number | null; deductions_total: number | null; net_total: number | null
  active_request: { id: string; request_no: string; status: DisbursementStatus; version: number; net_total: number } | null
  latest_rejected: { id: string; request_no: string; version: number; net_total: number; decision_note: string | null } | null
  blockers: ContractorWagesBlocker[]; can_send: boolean
}
/** أجور المتعهدين بعد قواعد البصمة (للعرض في صفحة المالية): الأيام المدفوعة/المحجوبة والاستقطاع والصافي */
export interface ContractorWageAdjustedRow {
  contractor_user_id: string; contractor_name: string; area_name: string | null; sector_id: number | null; parent_sector: string | null
  fingerprint_linked: boolean; rates_set: boolean
  pay_days: number; paid_days: number; blocked_days: number; late_days: number; deduction_minutes: number
  contractor_daily_wage: number | null; worker_daily_wage: number | null
  /** إجمالي أجور أيام الصرف قبل أي حجب أو استقطاع (null = الأجور غير محدَّدة) */
  gross_pay: number | null
  /** أجور الأيام المحجوبة لغياب البصمة (المتعهد وعماله) */
  blocked_pay: number | null
  /** استقطاع نقص الدقائق من أجر المتعهد وحده */
  deduction_amount: number | null
  net_pay: number | null
}
export interface ContractorWageAdjustedDay {
  log_date: string; headcount: number | null; workers: number | null
  state: 'paid' | 'blocked' | null; block_reason: 'absent' | 'leave' | 'no_record' | string | null
  check_in: string | null; check_out: string | null
  required_minutes: number | null; shortfall_minutes: number | null; grace_minutes: number | null; deduct_minutes: number | null
  base_pay: number | null; deduction: number | null; day_pay: number | null; edit_reason: string | null
}

export const DISBURSEMENT_ERROR_MESSAGES: Record<string, string> = {
  DUPLICATE_SUBMIT: 'نُفِّذت هذه العملية قبل لحظات — لم تُكرَّر.',
  PERMISSION_DENIED: 'ليست لديك صلاحية هذا الإجراء — راجع التطوير المركزية.',
  DISBURSEMENT_FORBIDDEN: 'طلبات الصرف لا يراها إلا المدير المفوض والشؤون المالية.',
  DISBURSEMENT_NOT_FOUND: 'طلب الصرف غير موجود.',
  DISBURSEMENT_NOT_PENDING: 'لم يعد الطلب بانتظار القرار — حُدِّثت الصفحة.',
  DISBURSEMENT_NOT_APPROVED: 'لا يُصرف إلا طلب اعتمده المدير المفوض.',
  DISBURSEMENT_ALREADY_PAID: 'صُرف هذا الطلب سابقاً — لم يُخصم شيء جديد.',
  DISBURSEMENT_NOT_REJECTED: 'إعادة الإرسال للطلب المرفوض فقط.',
  DISBURSEMENT_ACTIVE_EXISTS: 'لهذا الشهر طلب صرف قائم من النوع نفسه (بانتظار القرار أو معتمد أو مصروف).',
  DISBURSEMENT_REASON_REQUIRED: 'سبب الرفض مطلوب (ثلاثة أحرف على الأقل).',
  DISBURSEMENT_DECISION_INVALID: 'قرار غير صالح.',
  DISBURSEMENT_FILTER_INVALID: 'مرشّح غير صالح.',
  DISBURSEMENT_RATES_FROZEN: 'أجور هذا الشهر مجمَّدة: لها طلب صرف قائم. تُعدَّل بعد رفضه فقط.',
  CONTRACTOR_MONTH_HAS_DISBURSEMENT: 'لا يمكن إعادة فتح شهر المتعهدين: له طلب صرف قائم.',
  CONTRACTOR_WAGES_MONTH_NOT_LOCKED: 'شهر المتعهدين لم تقفله غرفة العمليات بعد.',
  CONTRACTOR_WAGES_RATES_MISSING: 'أجور بعض المتعهدين غير محدَّدة — حدِّدها ثم أعد المحاولة.',
  CONTRACTOR_WAGES_NO_FINGERPRINT: 'بعض المتعهدين غير مربوطين ببصمة — اربطهم بموظف له رقم بصمة.',
  CONTRACTOR_WAGES_NO_DAYS: 'لا أيام صرف معتمدة في هذا الشهر.',
  CONTRACTOR_WAGES_NOTHING_PAYABLE: 'لا مبلغ مستحق للصرف في هذا الشهر (كل الأيام محجوبة بسبب البصمة).',
  HR_ATTENDANCE_NOT_CONFIRMED: 'حضور الشهر غير مؤكَّد بعد — تؤكده غرفة العمليات أولاً.',
  TREASURY_INSUFFICIENT: 'رصيد القاصة غير كافٍ لهذا الصرف — سجِّل استلاماً يغطيه أولاً. لم يُخصم أي مبلغ.',
}
export function disbursementErrorMessage(error: unknown): string {
  const text = error == null ? '' : error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error)
  const code = Object.keys(DISBURSEMENT_ERROR_MESSAGES).find((k) => text.includes(k))
  const msg = code ? DISBURSEMENT_ERROR_MESSAGES[code] : null
  if (!msg) return text || 'خطأ غير معروف'
  // رموز تحمل عدداً بعد النقطتين (CONTRACTOR_WAGES_RATES_MISSING:3) ⇒ نُظهر العدد
  const n = code ? text.match(new RegExp(`${code}:(\\d+)`))?.[1] : null
  return n ? `${msg} (${n})` : msg
}

const rpc = <T,>(fn: string, args: Record<string, unknown> = {}) => sdkGuard(supabase.rpc(fn, args as never)) as Promise<T>
/** أول يوم في الشهر من أي تاريخ ISO */
export const monthStartOf = (iso: string) => `${iso.slice(0, 7)}-01`

export const disbursements = {
  list(f: DisbursementListFilter = {}): Promise<DisbursementList> {
    return rpc<DisbursementList>('disbursement_list', { p_kind: f.kind ?? null, p_status: f.status ?? null, p_month: f.month ? monthStartOf(f.month) : null, p_search: f.search?.trim() || null, p_limit: f.limit ?? 100 })
  },
  get(id: string): Promise<DisbursementDetail> { return rpc<DisbursementDetail>('disbursement_get', { p_id: id }) },
  lines(id: string, f: DisbursementLinesFilter = {}): Promise<DisbursementLines> {
    return rpc<DisbursementLines>('disbursement_lines', {
      p_id: id, p_group: f.group ?? null, p_sub_group: f.subGroup ?? null, p_flag: f.flag && f.flag !== 'all' ? f.flag : null,
      p_search: f.search?.trim() || null, p_sort: f.sort ?? 'number', p_limit: f.limit ?? 50, p_offset: f.offset ?? 0,
    })
  },
  counts(): Promise<{ pending_approval: number; approved: number }> { return rpc('disbursement_counts') },
  decide(id: string, approve: boolean, note?: string | null): Promise<DisbursementRequest> { return rpc<DisbursementRequest>('disbursement_decide', { p_id: id, p_approve: approve, p_note: note?.trim() || null }) },
  pay(id: string, note?: string | null): Promise<DisbursementRequest> { return rpc<DisbursementRequest>('disbursement_pay', { p_id: id, p_note: note?.trim() || null }) },
  resubmit(id: string, note?: string | null): Promise<DisbursementRequest> { return rpc<DisbursementRequest>('disbursement_resubmit', { p_id: id, p_note: note?.trim() || null }) },
  // ── أجور المتعهدين بقواعد البصمة (المالية) ──
  contractorReadiness(month: string): Promise<ContractorWagesReadiness> { return rpc<ContractorWagesReadiness>('finance_contractor_wages_readiness', { p_month: monthStartOf(month) }) },
  contractorWages(month: string): Promise<ContractorWageAdjustedRow[]> { return rpc<ContractorWageAdjustedRow[]>('finance_contractor_wages_adjusted', { p_month: monthStartOf(month) }) },
  contractorWageDays(contractorId: string, month: string): Promise<ContractorWageAdjustedDay[]> {
    return rpc<ContractorWageAdjustedDay[]>('finance_contractor_wage_days_adjusted', { p_contractor: contractorId, p_month: monthStartOf(month) })
  },
  contractorClose(month: string, note?: string | null): Promise<DisbursementRequest> { return rpc<DisbursementRequest>('finance_contractor_wages_close', { p_month: monthStartOf(month), p_note: note?.trim() || null }) },
}
