/**
 * SDK السُّلَف (00191)
 *  · غرفة العمليات تُدخل الطلب لموظف → سلسلة موافقات (نوع 'advance') → المالية تُبلَّغ وتسلّم من القاصة («تم التسليم»)
 *  · الأقساط تُستقطع تلقائياً من كشف الرواتب ابتداءً من الشهر التالي للتسليم، وتُسجَّل على السلفة عند اعتماد المالية للشهر
 *  · الرؤية: المالية فقط (غرفة العمليات ترى حالة طلباتها؛ المعتمِدون يرون مهامهم؛ لا شيء في بوابة الموظف)
 */
import { sdkGuard, supabase } from './client'

export type AdvanceStatus = 'pending' | 'approved' | 'delivered' | 'settled' | 'rejected' | 'cancelled'
export type RepaymentMethod = 'equal' | 'fixed' | 'percent' | 'single'

export const ADVANCE_STATUS_LABEL: Record<AdvanceStatus, string> = {
  pending: 'قيد الموافقة', approved: 'معتمدة — بانتظار التسليم', delivered: 'مسلَّمة — قيد الاستقطاع', settled: 'مسدَّدة', rejected: 'مرفوضة', cancelled: 'ملغاة',
}
export const REPAYMENT_METHOD_LABEL: Record<RepaymentMethod, string> = { equal: 'أقساط شهرية متساوية', fixed: 'مبلغ شهري ثابت', percent: 'نسبة من الراتب', single: 'دفعة واحدة' }
export const REPAYMENT_METHOD_HINT: Record<RepaymentMethod, string> = {
  equal: 'يُقسَّم المبلغ على عدد الأشهر بالتساوي (آخر قسط يأخذ المتبقي)',
  fixed: 'يُستقطع مبلغ ثابت كل شهر حتى تنتهي السلفة',
  percent: 'يُستقطع من إجمالي راتب كل شهر بالنسبة المحددة حتى تنتهي السلفة',
  single: 'يُستقطع كامل المبلغ من راتب الشهر التالي للتسليم',
}

export interface AdvanceType { id: string; name: string; max_amount: number | null; max_installments: number; is_active: boolean; sort_order: number; created_at: string; updated_at: string }
export interface AdvancePolicy { max_installment_ratio: number; block_if_open: boolean }
export interface AdvanceEmployee { id: string; full_name: string; employee_number: string | null; job_title: string | null; department_name: string | null; open_advance: string | null }
export interface AdvanceStep { step_no: number; label: string; approvers?: string[]; status?: string; decided_by?: string | null; decided_at?: string | null; note?: string | null }
export interface Advance {
  id: string; ref_no: string; employee_id: string; employee_name: string; employee_number: string | null; type_id?: string; type_name: string
  amount: number; requested_amount: number; repayment_method: RepaymentMethod; method_label: string
  installments: number | null; monthly_amount: number | null; percent: number | null; notes: string | null
  status: AdvanceStatus; status_label: string
  requested_by: string; requested_by_name: string | null; chain_id?: string | null
  created_at: string; approved_at: string | null; rejected_at: string | null; reject_note: string | null
  delivered_at: string | null; delivered_by?: string | null; delivered_by_name?: string | null; delivery_note?: string | null; start_month?: string | null; treasury_tx_id?: string | null
  repaid_total?: number; remaining?: number; estimated_installment?: number; installments_posted?: number; next_deduction_month?: string | null
  settled_at?: string | null; cancelled_at: string | null; cancel_reason: string | null
  current_step: AdvanceStep | null
}
export interface AdvanceInstallment { id: string; period_month: string; amount: number; source: 'payroll' | 'cash'; export_id: string | null; note: string | null; created_at: string }
export interface AdvanceEvent { id: number; action: string; actor_name: string | null; amount: number | null; note: string | null; created_at: string }
export interface AdvanceDetail extends Advance { installment_rows: AdvanceInstallment[]; events: AdvanceEvent[]; timeline: AdvanceStep[] }
export interface AdvancesSummary { awaiting_delivery: number; awaiting_delivery_amount: number; pending: number; active: number; outstanding: number; delivered_total: number; repaid_total: number }
export interface AdvancesFilter { status?: AdvanceStatus | 'open' | '' | null; from?: string | null; to?: string | null; q?: string | null; limit?: number }
export interface AdvanceCreateInput { employeeId: string; typeId: string; amount: number; method: RepaymentMethod; installments?: number | null; monthly?: number | null; percent?: number | null; notes?: string | null }

export const EVENT_LABEL: Record<string, string> = {
  created: 'إنشاء الطلب', amended: 'تعديل أثناء الموافقة', step_approved: 'موافقة خطوة', approved: 'اكتمال الموافقات', rejected: 'رفض', cancelled: 'إلغاء',
  delivered: 'تسليم المبلغ', payroll_installment: 'قسط من الراتب', cash_settlement: 'تسديد نقدي', settled: 'تسديد كامل',
}

export const ADVANCE_ERROR_MESSAGES: Record<string, string> = {
  ADVANCE_FORBIDDEN: 'ليست لديك صلاحية على السلف',
  ADVANCE_NOT_FOUND: 'السلفة غير موجودة',
  ADVANCE_EMPLOYEE_NOT_FOUND: 'الموظف غير موجود أو منتهية خدمته',
  ADVANCE_TYPE_NOT_FOUND: 'نوع السلفة غير موجود أو موقوف',
  ADVANCE_TYPE_NAME_INVALID: 'اسم النوع قصير جداً',
  ADVANCE_TYPE_MAX_INVALID: 'سقف المبلغ أو عدد الأقساط غير صالح (1–60)',
  ADVANCE_ALREADY_OPEN: 'لدى الموظف سلفة مفتوحة (قيد الموافقة أو لم تُسدَّد بعد) — لا يمكن طلب سلفة جديدة قبل تسديدها',
  ADVANCE_AMOUNT_INVALID: 'المبلغ غير صالح',
  ADVANCE_AMOUNT_EXCEEDS_TYPE_MAX: 'المبلغ يتجاوز سقف هذا النوع من السلف',
  ADVANCE_METHOD_INVALID: 'طريقة التسديد غير صالحة',
  ADVANCE_INSTALLMENTS_INVALID: 'عدد الأقساط غير صالح أو يتجاوز الحد الأقصى لهذا النوع',
  ADVANCE_MONTHLY_INVALID: 'المبلغ الشهري غير صالح (يجب أن يكون أكبر من صفر ولا يتجاوز مبلغ السلفة)',
  ADVANCE_PERCENT_INVALID: 'النسبة غير صالحة (1–100)',
  ADVANCE_INSTALLMENT_EXCEEDS_CAP: 'القسط الشهري يتجاوز النسبة المسموح بها من راتب الموظف (سياسة التطوير المركزية) — قلّل المبلغ أو زد عدد الأقساط',
  ADVANCE_NOT_PENDING: 'الطلب لم يعد قيد الموافقة',
  ADVANCE_NOT_APPROVED: 'السلفة ليست معتمدة بانتظار التسليم',
  ADVANCE_NOT_DELIVERED: 'السلفة لم تُسلَّم بعد',
  ADVANCE_SETTLE_AMOUNT_INVALID: 'مبلغ التسديد غير صالح أو يتجاوز المتبقي',
  ADVANCE_NOT_CANCELLABLE: 'لا يمكن إلغاء السلفة في حالتها الحالية',
  APPROVAL_REASON_REQUIRED: 'السبب إلزامي',
  APPROVAL_NO_APPROVER: 'لا يوجد مُعتمِد متاح لهذا الطلب — راجع التطوير المركزية لضبط سلسلة الموافقات',
  HR_FORBIDDEN: 'ليست لديك صلاحية',
}
export function advanceErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error ?? '')
  const code = Object.keys(ADVANCE_ERROR_MESSAGES).find((k) => text.includes(k))
  return (code && ADVANCE_ERROR_MESSAGES[code]) || text || 'خطأ غير معروف'
}

const rpc = <T,>(fn: string, args: Record<string, unknown> = {}) => sdkGuard(supabase.rpc(fn, args as never)) as Promise<T>

export const advances = {
  types(all = false): Promise<AdvanceType[]> { return rpc<AdvanceType[]>('advance_types_list', { p_all: all }) },
  saveType(v: { id?: string | null; name: string; maxAmount?: number | null; maxInstallments: number; isActive?: boolean; sortOrder?: number }): Promise<AdvanceType> {
    return rpc<AdvanceType>('advance_type_save', { p_id: v.id ?? null, p_name: v.name, p_max_amount: v.maxAmount ?? null, p_max_installments: v.maxInstallments, p_is_active: v.isActive ?? true, p_sort_order: v.sortOrder ?? 100 })
  },
  policy(): Promise<AdvancePolicy> { return rpc<AdvancePolicy>('advance_policy') },
  employeeLookup(q: string): Promise<AdvanceEmployee[]> { return rpc<AdvanceEmployee[]>('advance_employee_lookup', { p_q: q }) },
  create(v: AdvanceCreateInput): Promise<Advance> {
    return rpc<Advance>('advance_request_create', { p_employee: v.employeeId, p_type: v.typeId, p_amount: v.amount, p_method: v.method, p_installments: v.installments ?? null, p_monthly: v.monthly ?? null, p_percent: v.percent ?? null, p_notes: v.notes ?? null })
  },
  decide(v: { id: string; approve: boolean; note?: string | null; amount?: number | null; installments?: number | null }): Promise<Advance> {
    return rpc<Advance>('advance_decide', { p_id: v.id, p_approve: v.approve, p_note: v.note ?? null, p_amount: v.amount ?? null, p_installments: v.installments ?? null })
  },
  deliver(id: string, note?: string | null): Promise<Advance> { return rpc<Advance>('advance_deliver', { p_id: id, p_note: note ?? null }) },
  settleCash(id: string, amount: number, note?: string | null): Promise<Advance> { return rpc<Advance>('advance_settle_cash', { p_id: id, p_amount: amount, p_note: note ?? null }) },
  cancel(id: string, reason: string): Promise<Advance> { return rpc<Advance>('advance_cancel', { p_id: id, p_reason: reason }) },
  list(f: AdvancesFilter = {}): Promise<Advance[]> {
    return rpc<Advance[]>('advances_list', { p_status: f.status || null, p_from: f.from || null, p_to: f.to || null, p_q: f.q || null, p_limit: f.limit ?? 300 })
  },
  get(id: string): Promise<AdvanceDetail> { return rpc<AdvanceDetail>('advance_get', { p_id: id }) },
  summary(): Promise<AdvancesSummary> { return rpc<AdvancesSummary>('advances_summary') },
}
