/**
 * SDK «طلب تعديل بيانات الحضور» (00397):
 *   نطاق (موظفون/فرع/قسم/قسم وفروعه) × أيام × نوع التعديل — معاينة، إنشاء (مباشر أو بطلب إلى HR عبر سلسلة)،
 *   منضدة الموارد البشرية (تعديل بند/استبعاد/اعتماد)، الإلغاء، التراجع (المعاون)، السجل، التفاصيل، المؤشرات.
 */
import { sdkGuard, sdkVoid, supabase } from './client'
import { HR_ERROR_MESSAGES } from './hr.sdk'

export type AttendanceEditScopeKind = 'employees' | 'branch' | 'department' | 'department_tree'
export type AttendanceEditAction = 'full_presence' | 'set_status' | 'set_times'
export type AttendanceEditMode = 'direct' | 'hr_request'
export type AttendanceEditStatus = 'pending_approval' | 'approved' | 'applied' | 'rejected' | 'cancelled' | 'reverted'

export const ATTENDANCE_EDIT_SCOPE_LABELS: Readonly<Record<AttendanceEditScopeKind, string>> = {
  employees: 'موظفون محددون', branch: 'فرع كامل', department: 'قسم (بلا فروعه)', department_tree: 'قسم وأقسامه الفرعية',
}
export const ATTENDANCE_EDIT_ACTION_LABELS: Readonly<Record<AttendanceEditAction, string>> = {
  full_presence: 'حضور كامل بأوقات الشفت', set_status: 'تغيير حالة اليوم', set_times: 'تحديد أوقات الدخول/الخروج',
}
export const ATTENDANCE_EDIT_ACTION_HINTS: Readonly<Record<AttendanceEditAction, string>> = {
  full_presence: 'يُسجَّل كل موظف حاضراً من بداية شفته الفعلي إلى نهايته (لا تأخير ولا خروج مبكر). أيام الراحة بالشفت تُستبعد تلقائياً.',
  set_status: 'تُثبَّت الحالة التي تختارها (مثل إجازة أو غياب) لكل الأيام المختارة.',
  set_times: 'تُحدَّد أوقات دخول/خروج واحدة، وتُحتسب الحالة والتأخير آلياً بقواعد شفت كل موظف.',
}
export const ATTENDANCE_EDIT_STATUS_LABELS: Readonly<Record<AttendanceEditStatus, string>> = {
  pending_approval: 'بانتظار الموافقات', approved: 'لدى الموارد البشرية', applied: 'نُفّذ', rejected: 'مرفوض', cancelled: 'ملغى', reverted: 'مُتراجَع عنه',
}
export const ATTENDANCE_EDIT_MODE_LABELS: Readonly<Record<AttendanceEditMode, string>> = { direct: 'تعديل مباشر', hr_request: 'بطلب إلى الموارد البشرية' }

/** رسائل الأخطاء الخاصة بالوحدة (تُدمج مع رسائل HR العامة) */
export const ATTENDANCE_EDIT_ERROR_MESSAGES: Record<string, string> = {
  ATT_EDIT_DATES_REQUIRED: 'اختر يوماً واحداً على الأقل',
  ATT_EDIT_TOO_MANY_DAYS: 'الحد الأقصى 62 يوماً في الطلب الواحد — قسّم الطلب',
  ATT_EDIT_ACTION_INVALID: 'نوع التعديل غير معروف',
  ATT_EDIT_TIMES_REQUIRED: 'حدد وقت الدخول ووقت الخروج',
  ATT_EDIT_SCOPE_EMPTY: 'لا موظفين فعليين في هذا النطاق (المنتهية خدمتهم والمؤرشفون لا يُشملون)',
  ATT_EDIT_SCOPE_INVALID: 'نطاق غير صالح',
  ATT_EDIT_TOO_LARGE: 'الطلب كبير جداً (أكثر من 5000 يوم عمل) — قسّمه على طلبات أصغر',
  ATT_EDIT_MODE_INVALID: 'المعاون ينفّذ التعديل مباشرة ولا يرسله طلباً إلى الموارد البشرية',
  ATT_EDIT_NOTHING_TO_APPLY: 'لا بنود صالحة للتنفيذ — كلها مستبعدة',
  ATT_EDIT_NOT_EDITABLE: 'هذا الطلب ليس في مرحلة تسمح بهذا الإجراء',
  ATT_EDIT_NOT_APPLIED: 'لا يمكن التراجع إلا عن طلب نُفّذ فعلاً',
  HR_STATUS_INVALID: 'اختر حالة اليوم',
  HR_FUTURE_DATE: 'لا يمكن تعديل يوم لم يأتِ بعد',
  APPROVAL_NOT_APPROVER: 'لست المعتمد الحالي لهذا الطلب',
}
export function attendanceEditErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error ?? '')
  const all = { ...HR_ERROR_MESSAGES, ...ATTENDANCE_EDIT_ERROR_MESSAGES }
  const code = Object.keys(all).find((k) => text.includes(k))
  return (code && all[code]) || text || 'خطأ غير معروف'
}

export interface AttendanceEditPayload { status?: string; check_in?: string; check_out?: string }
export interface AttendanceEditDraft {
  scopeKind: AttendanceEditScopeKind
  scopeIds: string[]
  dates: string[]
  action: AttendanceEditAction
  payload: AttendanceEditPayload
}
export interface AttendanceEditPreviewRow {
  employee_id: string; full_name: string; employee_number: string; work_date: string
  before: { status: string; status_label: string; check_in: string | null; check_out: string | null; late_minutes: number | null; early_minutes: number | null } | null
  proposed: { status: string; check_in: string | null; check_out: string | null } | null
  proposed_status_label: string | null
  skipped: string | null
}
export interface AttendanceEditPreview {
  employees: number; days: number; items: number; skipped: number; minutes_to_fix: number
  scope_label: string; action_label: string; rows: AttendanceEditPreviewRow[]
}
export interface AttendanceEditCreateResult { id: string; status: AttendanceEditStatus; via_chain: boolean; items?: number; minutes_fixed?: number }

export interface AttendanceEditRow {
  id: string; mode: AttendanceEditMode; mode_label: string; status: AttendanceEditStatus; status_label: string
  scope_kind: AttendanceEditScopeKind; scope_label: string; dates: string[]; first_date: string; last_date: string
  action: AttendanceEditAction; action_label: string; payload: AttendanceEditPayload
  reason: string; requested_by: string; requester_name: string | null; requester_role: string; chain_id: string | null; current_step: string | null
  approved_at: string | null; rejected_note: string | null; hr_note: string | null
  applied_by: string | null; applied_by_name: string | null; applied_at: string | null
  reverted_by: string | null; reverted_by_name: string | null; reverted_at: string | null; revert_reason: string | null
  employees_count: number; days_count: number; items_count: number; minutes_fixed: number; departments: string | null; created_at: string
  can_revert: boolean; can_cancel: boolean; can_hr_apply: boolean
}
export interface AttendanceEditItemSide { status: string; status_label: string; check_in: string | null; check_out: string | null; late_minutes: number; early_minutes: number; worked_minutes: number }
export interface AttendanceEditItem {
  id: string; employee_id: string; full_name: string; employee_number: string; department_name: string | null; work_date: string
  before: AttendanceEditItemSide | null
  proposed: { status: string; status_label: string; check_in: string | null; check_out: string | null }
  after: AttendanceEditItemSide | null
  applied: boolean; skipped_reason: string | null; hr_edited: boolean; hr_edited_by_name: string | null
}
export interface AttendanceEditTimelineStep { step_no: number; step_label: string; status: string; decided_by_name: string | null; decided_at: string | null; note: string | null; approvers: string[] }
export interface AttendanceEditDetail extends AttendanceEditRow { items: AttendanceEditItem[]; timeline: AttendanceEditTimelineStep[] }
export interface AttendanceEditStats {
  month: string; total: number; direct: number; by_request: number; pending_approval: number; awaiting_hr: number; rejected: number; reverted: number
  employees: number; work_days: number; minutes_fixed: number; by_action: Record<string, number>; top_requesters: { name: string | null; n: number }[]
}
export interface AttendanceEditEmployeeOption { id: string; full_name: string; employee_number: string; department_name: string | null }
export interface AttendanceEditFilters {
  from?: string | null; to?: string | null; mode?: AttendanceEditMode | null; status?: AttendanceEditStatus | null
  departmentId?: string | null; employeeId?: string | null; actorId?: string | null; search?: string | null; limit?: number
}

const rpc = <T,>(fn: string, args: Record<string, unknown>) => sdkGuard(supabase.rpc(fn, args as never)) as Promise<T>
const draftArgs = (d: AttendanceEditDraft) => ({ p_scope_kind: d.scopeKind, p_scope_ids: d.scopeIds, p_dates: d.dates, p_action: d.action, p_payload: d.payload })

export const attendanceEdits = {
  preview(d: AttendanceEditDraft) { return rpc<AttendanceEditPreview>('attendance_edit_preview', draftArgs(d)) },
  create(d: AttendanceEditDraft, reason: string, mode: AttendanceEditMode) {
    return rpc<AttendanceEditCreateResult>('attendance_edit_create', { ...draftArgs(d), p_reason: reason, p_mode: mode })
  },
  list(f: AttendanceEditFilters = {}) {
    return rpc<AttendanceEditRow[]>('attendance_edit_list', {
      p_from: f.from || null, p_to: f.to || null, p_mode: f.mode || null, p_status: f.status || null,
      p_department: f.departmentId || null, p_employee: f.employeeId || null, p_actor: f.actorId || null, p_search: f.search?.trim() || null, p_limit: f.limit ?? 300,
    })
  },
  /** 00397-ج: بحث خفيف عن الموظفين الفعليين لاختيار النطاق (غرفة العمليات/المعاون) — لا بيانات حساسة */
  searchEmployees(search: string) { return rpc<AttendanceEditEmployeeOption[]>('attendance_edit_employee_search', { p_search: search.trim() || null }) },
  detail(id: string) { return rpc<AttendanceEditDetail>('attendance_edit_detail', { p_id: id }) },
  stats(month?: string | null) { return rpc<AttendanceEditStats>('attendance_edit_stats', { p_month: month || null }) },
  cancel(id: string, reason?: string | null) { return sdkVoid(supabase.rpc('attendance_edit_cancel', { p_id: id, p_reason: reason || null } as never)) },
  /** HR: تعديل بند قبل الاعتماد — الحالة 'auto' تعني «تُشتق من الأوقات» */
  hrUpdateItem(itemId: string, status: string, checkIn: string | null, checkOut: string | null) {
    return sdkVoid(supabase.rpc('attendance_edit_hr_update_item', { p_item: itemId, p_status: status, p_check_in: checkIn, p_check_out: checkOut } as never))
  },
  hrSkipItem(itemId: string, reason: string) { return sdkVoid(supabase.rpc('attendance_edit_hr_skip_item', { p_item: itemId, p_reason: reason } as never)) },
  hrApply(id: string, note?: string | null) { return rpc<{ id: string; status: string; items: number; minutes_fixed: number }>('attendance_edit_hr_apply', { p_id: id, p_note: note || null }) },
  revert(id: string, reason: string) { return rpc<{ id: string; reverted_items: number }>('attendance_edit_revert', { p_id: id, p_reason: reason }) },
}

/** أيام متتالية بين تاريخين (شاملين) بصيغة YYYY-MM-DD — بحد أقصى `max` */
export function enumerateDays(from: string, to: string, max = 62): string[] {
  if (!from || !to || to < from) return []
  const out: string[] = []
  const d = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (d <= end && out.length < max) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1) }
  return out
}
/** تحويل طابع زمني إلى HH:MM ببغداد */
export const hmBaghdad = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Baghdad' }) : '—'
/** تركيب HH:MM على يوم معيّن بتوقيت بغداد (+03:00 ثابت) */
export const composeBaghdad = (day: string, hm: string, nextDay = false): string | null => {
  if (!hm) return null
  const d = new Date(`${day}T${hm}:00+03:00`)
  if (nextDay) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString()
}
