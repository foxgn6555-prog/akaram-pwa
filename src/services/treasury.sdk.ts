/**
 * SDK القاصة (00189): مستحقات الشركة · المكافآت · تسديد GPS · فعاليات الشركة
 *  · المدير التنفيذي يسجّل الحركات؛ المالية تؤكد («تأكيد الاستلام» / «تم التسليم» / «تم الدفع») أو تُعيد بسبب
 *  · الرصيد = المقبوضات المؤكَّدة − المكافآت النقدية المسلَّمة − مدفوعات GPS المؤكَّدة
 *  · كتاب الشكر / الإجازة التشجيعية تُسجَّل فوراً بلا مرور بالمالية
 */
import { sdkGuard, supabase } from './client'

export type TreasuryKind = 'receipt' | 'reward' | 'gps_payment'
export type TreasuryStatus = 'pending' | 'confirmed' | 'cancelled'
export type RewardType = 'cash' | 'gift' | 'thanks_letter' | 'incentive_leave'

export const TREASURY_KIND_LABEL: Record<TreasuryKind, string> = { receipt: 'استلام مبلغ', reward: 'مكافأة', gps_payment: 'تسديد مستحقات GPS' }
export const TREASURY_STATUS_LABEL: Record<TreasuryStatus, string> = { pending: 'بانتظار المالية', confirmed: 'مؤكَّدة', cancelled: 'ملغاة' }
export const REWARD_TYPE_LABEL: Record<RewardType, string> = { cash: 'مبلغ نقدي', gift: 'هدية', thanks_letter: 'كتاب شكر', incentive_leave: 'إجازة تشجيعية' }
/** نص زر تأكيد المالية حسب نوع الحركة */
export const CONFIRM_LABEL: Record<TreasuryKind, string> = { receipt: 'تأكيد الاستلام', reward: 'تم التسليم', gps_payment: 'تم الدفع' }
export const GPS_TYPE_NAME = 'تسديد مستحقات GPS'

export interface ReceivableType { id: string; name: string; is_active: boolean; sort_order: number; created_at: string }
export interface TreasuryTx {
  id: string; ref_no: string; kind: TreasuryKind; amount: number; type_id: string | null; type_name: string | null
  employee_id: string | null; employee_name: string | null; employee_number: string | null; reward_type: RewardType | null
  details: string | null; status: TreasuryStatus; affects_balance: boolean; needs_finance: boolean
  created_by: string; created_by_name: string | null; created_at: string
  confirmed_by: string | null; confirmed_by_name: string | null; confirmed_at: string | null; finance_note: string | null
  cancelled_by: string | null; cancelled_by_name: string | null; cancelled_at: string | null; cancel_reason: string | null
}
export interface TreasurySummary {
  balance: number; frozen: number; pending_out: number; pending_count: number
  range: { receipts_confirmed: number; receipts_pending: number; rewards_cash_confirmed: number; rewards_count: number; gps_confirmed: number; gps_pending: number; count: number }
  by_type: { type_id: string | null; name: string | null; confirmed: number; pending: number; count: number }[]
  rewards_by_type: Partial<Record<RewardType, number>>
  by_month: { month: string; receipts: number; rewards: number; gps: number }[]
}
export interface TreasuryListFilter { from?: string | null; to?: string | null; kind?: TreasuryKind | null; status?: TreasuryStatus | null; typeId?: string | null; employeeId?: string | null; search?: string | null; limit?: number }
export interface EmployeeLookupRow { id: string; full_name: string; employee_number: string | null; job_title: string | null; department_name: string | null }
export interface CompletedDesignRow {
  id: string; title: string; sector_parent: 'karrada' | 'zaafaraniya'; period_type: 'daily' | 'weekly' | 'first_half' | 'second_half' | 'monthly'; period_start: string; period_end: string
  cover_image_path: string | null; photo_count: number; completed_at: string | null; completed_by_name: string | null; work_types: string[]
}

export const TREASURY_ERROR_MESSAGES: Record<string, string> = {
  EXEC_FORBIDDEN: 'هذه الوحدة حصرية للمدير التنفيذي والمالية',
  FINANCE_FORBIDDEN: 'التأكيد من صلاحية الشؤون المالية فقط',
  TREASURY_TYPE_NAME_INVALID: 'اسم النوع مطلوب (حرفان على الأقل)',
  TREASURY_TYPE_DUPLICATE: 'هذا النوع موجود مسبقاً',
  TREASURY_TYPE_NOT_FOUND: 'النوع غير موجود',
  TREASURY_TYPE_INACTIVE: 'هذا النوع موقوف',
  TREASURY_TYPE_REQUIRED: 'اختر اسم الحركة (نوع المستحقات)',
  TREASURY_KIND_INVALID: 'نوع الحركة غير صالح',
  TREASURY_AMOUNT_INVALID: 'أدخل مبلغاً صحيحاً أكبر من صفر',
  TREASURY_EMPLOYEE_REQUIRED: 'اختر الموظف',
  TREASURY_EMPLOYEE_NOT_FOUND: 'الموظف غير موجود',
  TREASURY_REWARD_TYPE_INVALID: 'نوع المكافأة غير صالح',
  TREASURY_DETAILS_REQUIRED: 'اكتب تفاصيل المكافأة',
  TREASURY_NOT_FOUND: 'الحركة غير موجودة',
  TREASURY_NOT_PENDING: 'هذه الحركة ليست معلّقة — لا يمكن تعديلها',
  TREASURY_REASON_REQUIRED: 'سبب الإعادة/الإلغاء مطلوب',
  MEDIA_FORBIDDEN: 'ليست لديك صلاحية عرض هذا التصميم',
  MEDIA_DESIGN_NOT_FOUND: 'التصميم غير موجود',
}
export function treasuryErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error ?? '')
  const code = Object.keys(TREASURY_ERROR_MESSAGES).find((k) => text.includes(k))
  return (code && TREASURY_ERROR_MESSAGES[code]) || text || 'خطأ غير معروف'
}

const rpc = <T,>(fn: string, args: Record<string, unknown> = {}) => sdkGuard(supabase.rpc(fn, args as never)) as Promise<T>

export const treasury = {
  types(): Promise<ReceivableType[]> { return rpc<ReceivableType[]>('treasury_receivable_types_list') },
  saveType(v: { id?: string | null; name: string; isActive?: boolean; sortOrder?: number }): Promise<ReceivableType[]> {
    return rpc<ReceivableType[]>('exec_receivable_type_save', { p_id: v.id ?? null, p_name: v.name, p_is_active: v.isActive ?? true, p_sort_order: v.sortOrder ?? 100 })
  },
  record(v: { kind: TreasuryKind; amount?: number | null; typeId?: string | null; employeeId?: string | null; rewardType?: RewardType | null; details?: string | null }): Promise<TreasuryTx> {
    return rpc<TreasuryTx>('exec_treasury_record', { p_kind: v.kind, p_amount: v.amount ?? null, p_type_id: v.typeId ?? null, p_employee_id: v.employeeId ?? null, p_reward_type: v.rewardType ?? null, p_details: v.details ?? null })
  },
  confirm(id: string, note?: string | null): Promise<TreasuryTx> { return rpc<TreasuryTx>('finance_treasury_confirm', { p_id: id, p_note: note ?? null }) },
  cancel(id: string, reason: string): Promise<TreasuryTx> { return rpc<TreasuryTx>('treasury_cancel', { p_id: id, p_reason: reason }) },
  list(f: TreasuryListFilter = {}): Promise<TreasuryTx[]> {
    return rpc<TreasuryTx[]>('treasury_list', { p_from: f.from ?? null, p_to: f.to ?? null, p_kind: f.kind ?? null, p_status: f.status ?? null, p_type_id: f.typeId ?? null, p_employee_id: f.employeeId ?? null, p_search: f.search ?? null, p_limit: f.limit ?? 500 })
  },
  summary(from?: string | null, to?: string | null): Promise<TreasurySummary> { return rpc<TreasurySummary>('treasury_summary', { p_from: from ?? null, p_to: to ?? null }) },
  employeeLookup(q: string): Promise<EmployeeLookupRow[]> { return rpc<EmployeeLookupRow[]>('exec_employee_lookup', { p_q: q }) },
  completedDesigns(f: { from?: string | null; to?: string | null; sector?: string | null; periodType?: string | null } = {}): Promise<CompletedDesignRow[]> {
    return rpc<CompletedDesignRow[]>('exec_completed_designs', { p_from: f.from ?? null, p_to: f.to ?? null, p_sector: f.sector ?? null, p_period_type: f.periodType ?? null })
  },
}
