/**
 * SDK وحدة الكشوفات داخل غرفة العمليات (00170)
 *  · الأنواع (IT) · البحث عن آلية/موظف · حفظ/رفع/قرار/إلغاء · القائمة · صندوق الوارد · إحصاءات
 *  · إخفاء وحدات بوابة لحساب (IT) + وحداتي المخفية
 */
import { sdkGuard, supabase } from './client'

export type DisclosureTargetKind = 'vehicle' | 'employee'
export type DisclosureStatusV2 = 'draft' | 'pending' | 'returned' | 'approved' | 'cancelled'
export type PenaltyKey = 'warning' | 'reprimand' | 'termination'

export interface DisclosureType {
  key: string; label: string; description: string | null; allowed_penalties: PenaltyKey[]; default_amount: number | null
  is_active: boolean; sort_order: number; updated_at: string; updated_by_name: string | null; used: number
}
export interface VehicleOption {
  id: string; db_number: string; plate_number: string; vehicle_name: string; driver_name: string; shift: string; sector: string | null; parent_sector: string | null
  driver_employee_id: string | null; driver_employee_name: string | null; driver_employee_number: string | null
}
export interface EmployeeOption { id: string; full_name: string; employee_number: string; job_title: string | null; department_name: string | null }

export interface DisclosureEvent { id: number; action: string; actor_name: string | null; note: string | null; amount: number | null; at: string }
export interface DisclosureStep { step_no: number; label: string; status: 'waiting' | 'pending' | 'approved' | 'rejected' | 'skipped'; decided_by: string | null; decided_at: string | null; note: string | null; approvers: string[] }

export interface DisclosureV2 {
  id: string; ref_no: string | null; status: DisclosureStatusV2; target_kind: DisclosureTargetKind; target_label: string
  vehicle_id: string | null; employee_id: string | null; employee_name: string | null; employee_number: string | null; department_name: string | null; job_title: string | null
  db_number: string; driver_name: string; vehicle_type: string | null; contractor_name: string | null; sector: string | null; shift: string
  log_date: string; period_month: string; violation_type: string; type_label: string; penalty_type: PenaltyKey | null; details: string
  amount: number | null; amount_by_name: string | null; amount_note: string | null
  prepared_by: string | null; prepared_by_name: string | null; submitted_at: string | null; resubmit_count: number; chain_id: string | null
  current_step: string | null; current_approvers: string[]; can_decide: boolean
  return_reason: string | null; returned_by_name: string | null; returned_at: string | null
  approved_by_name: string | null; approved_at: string | null; cancelled_by_name: string | null; cancelled_at: string | null; cancel_reason: string | null
  deduction_posted: boolean; deduction_month: string | null; deduction_note: string | null
  created_at: string; updated_at: string
  events?: DisclosureEvent[]; timeline?: DisclosureStep[]
}
export interface DisclosureInput {
  target_kind: DisclosureTargetKind; vehicle_id?: string | null; employee_id?: string | null; db_number?: string | null; driver_name?: string | null
  vehicle_type?: string | null; contractor_name?: string | null; sector?: string | null; shift?: string | null; log_date: string
  violation_type: string; penalty_type?: PenaltyKey | null; details: string; amount?: number | null
}
export type DisclosureScope = 'active' | 'returned' | 'pending' | 'draft' | 'archive' | 'approved' | 'cancelled' | 'all'
export interface DisclosureListFilter { scope?: DisclosureScope; from?: string | null; to?: string | null; type?: string | null; q?: string | null; month?: string | null; limit?: number }
export interface DisclosureStats {
  month: string; total: number; by_status: Partial<Record<DisclosureStatusV2, number>>; by_type: Array<{ key: string; label: string; count: number }>
  by_preparer: Array<{ name: string | null; count: number }>; amount_approved: number; amount_pending: number; deductions_posted: number; inbox: number
  months: Array<{ month: string; count: number }>
}

export const DISCLOSURE_STATUS_LABEL: Record<DisclosureStatusV2, string> = { draft: 'مسودة', pending: 'قيد الموافقة', returned: 'مُعاد للتصحيح', approved: 'معتمد', cancelled: 'ملغى' }
export const PENALTY_LABEL: Record<PenaltyKey, string> = { warning: 'إنذار', reprimand: 'توبيخ', termination: 'إنهاء خدمة' }
export const SHIFT_LABEL: Record<string, string> = { morning: 'صباحي', evening: 'مسائي', night: 'ليلي' }
export const EVENT_LABEL: Record<string, string> = {
  created: 'أُنشئ', updated: 'عُدّل', submitted: 'رُفع للموافقة', resubmitted: 'أُعيد رفعه بعد التصحيح', step_approved: 'وافق', returned: 'أُعيد بسبب', approved: 'اعتُمد نهائياً',
  cancelled: 'أُلغي', amount_set: 'حدّد/عدّل المبلغ', deduction_posted: 'أُضيف الاستقطاع للحضورية',
}

const ERRORS: Record<string, string> = {
  DISCLOSURE_FORBIDDEN: 'ليست لديك صلاحية على هذا الكشف',
  DISCLOSURE_NOT_FOUND: 'الكشف غير موجود',
  DISCLOSURE_TARGET_INVALID: 'حدّد: كشف على آلية أم على موظف',
  DISCLOSURE_TYPE_INVALID: 'نوع الكشف غير متاح — اختر نوعاً فعّالاً',
  DISCLOSURE_PENALTY_NOT_ALLOWED: 'هذه العقوبة غير مسموحة لهذا النوع من الكشف',
  DISCLOSURE_DETAILS_REQUIRED: 'اكتب تفاصيل الكشف (5 أحرف على الأقل)',
  DISCLOSURE_DATE_INVALID: 'تاريخ المخالفة غير صالح (لا يكون مستقبلياً)',
  DISCLOSURE_AMOUNT_INVALID: 'المبلغ غير صالح',
  DISCLOSURE_VEHICLE_REQUIRED: 'اختر الآلية من قاعدة الآليات',
  DISCLOSURE_VEHICLE_NOT_FOUND: 'الآلية غير موجودة أو مؤرشفة',
  DISCLOSURE_EMPLOYEE_REQUIRED: 'اختر الموظف من النظام',
  DISCLOSURE_EMPLOYEE_NOT_FOUND: 'الموظف غير موجود',
  DISCLOSURE_NOT_EDITABLE: 'لا يُعدَّل الكشف إلا وهو مسودة أو مُعاد',
  DISCLOSURE_NOT_SUBMITTABLE: 'لا يُرفع الكشف إلا وهو مسودة أو مُعاد',
  DISCLOSURE_NOT_PENDING: 'الكشف ليس قيد الموافقة',
  DISCLOSURE_RETURN_REASON_REQUIRED: 'اكتب سبب الإعادة (3 أحرف على الأقل)',
  DISCLOSURE_CANCEL_REASON_REQUIRED: 'اكتب سبب الإلغاء',
  DISCLOSURE_NOT_CANCELLABLE: 'لا يُلغى كشف معتمد أو ملغى',
  DISCLOSURE_TYPE_KEY_INVALID: 'رمز النوع: حروف إنجليزية صغيرة وأرقام وشرطة سفلية (مثل: speeding)',
  DISCLOSURE_TYPE_LABEL_INVALID: 'اسم النوع مطلوب',
  DISCLOSURE_PENALTY_INVALID: 'عقوبة غير معروفة',
  APPROVAL_NO_APPROVER: 'لا يوجد مُعتمِد (معاون/مدير مفوض) — راجع التطوير المركزية',
  HR_MONTH_LOCKED: 'كل الأشهر القادمة مقفلة من المالية — تعذّر تسجيل الاستقطاع',
  IT_FORBIDDEN: 'هذه الصلاحية للتطوير المركزية فقط',
}
export function disclosureErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  for (const [k, v] of Object.entries(ERRORS)) if (msg.includes(k)) return v
  return msg || 'حدث خطأ غير متوقع'
}

const rpc = <T,>(fn: string, args: Record<string, unknown>) => sdkGuard(supabase.rpc(fn, args as never)) as Promise<T>

export const disclosuresUnit = {
  types() { return rpc<DisclosureType[]>('disclosure_types_list', {}) },
  saveType(t: { key: string; label: string; description?: string | null; allowed_penalties: PenaltyKey[]; default_amount?: number | null; is_active: boolean; sort_order: number }) {
    return rpc<DisclosureType[]>('disclosure_type_save', { p_key: t.key, p_label: t.label, p_description: t.description ?? null, p_allowed_penalties: t.allowed_penalties, p_default_amount: t.default_amount ?? null, p_is_active: t.is_active, p_sort_order: t.sort_order })
  },
  vehicles(q: string) { return rpc<VehicleOption[]>('disclosure_vehicle_lookup', { p_q: q.trim() || null, p_limit: 20 }) },
  employees(q: string) { return rpc<EmployeeOption[]>('disclosure_employee_lookup', { p_q: q.trim() || null, p_limit: 20 }) },
  save(id: string | null, input: DisclosureInput) { return rpc<DisclosureV2>('disclosure_save', { p_id: id, p: input }) },
  submit(id: string) { return rpc<DisclosureV2>('disclosure_submit', { p_id: id }) },
  decide(id: string, approve: boolean, note?: string | null, amount?: number | null) { return rpc<DisclosureV2>('disclosure_decide', { p_id: id, p_approve: approve, p_note: note ?? null, p_amount: amount ?? null }) },
  cancel(id: string, reason: string) { return rpc<DisclosureV2>('disclosure_cancel', { p_id: id, p_reason: reason }) },
  get(id: string) { return rpc<DisclosureV2>('disclosure_get', { p_id: id }) },
  list(f: DisclosureListFilter = {}) {
    return rpc<DisclosureV2[]>('disclosures_list', { p_scope: f.scope ?? 'active', p_from: f.from ?? null, p_to: f.to ?? null, p_type: f.type || null, p_q: f.q?.trim() || null, p_month: f.month ? `${f.month.slice(0, 7)}-01` : null, p_limit: f.limit ?? 500 })
  },
  inbox() { return rpc<DisclosureV2[]>('disclosure_inbox', {}) },
  stats(month?: string | null) { return rpc<DisclosureStats>('disclosure_stats', { p_month: month ? `${month.slice(0, 7)}-01` : null }) },
  // إخفاء الوحدات
  myHiddenUnits() { return rpc<Record<string, string[]>>('my_hidden_units', {}) },
  hiddenUnitsGet(userId: string, portal: string) { return rpc<string[]>('it_hidden_units_get', { p_user: userId, p_portal: portal }) },
  hiddenUnitsSet(userId: string, portal: string, paths: string[]) { return rpc<string[]>('it_hidden_units_set', { p_user: userId, p_portal: portal, p_paths: paths }) },
}
