/**
 * SDK «الحضور اليدوي البديل عند تعطل جهاز البصمة»:
 *   · التفعيل والإيقاف: التطوير المركزية فقط — بوابة × نطاق يختاره المُفعِّل من الهيكل التنظيمي (فرع و/أو قسم وأقسامه الفرعية).
 *   · الكشف اليومي حاضر/غائب: تسجّله حسابات فوّضتها التطوير المركزية على التفعيل (وغرفة العمليات افتراضياً)؛ اليوم بلا كشف «بانتظار الكشف».
 *   · الملخصات: الأيام المعلّقة (تمنع اعتماد حضورية الشهر) وعدد الأيام اليدوية لكل موظف.
 * الإيقاف منطقي: البصمات تُخزَّن ولا تُحتسب في أيام التفعيل، ولا يُمَس الجهاز ولا تسجيل موظفيه؛ وتعود البصمة بالإيقاف.
 */
import { sdkGuard, supabase } from './client'
import { HR_ERROR_MESSAGES, lookupErrorMessage } from './hr.sdk'

export type ManualEntryStatus = 'present' | 'absent'
/** حالة الموظف في كشف اليوم: open = يُسجَّل له؛ غير ذلك مقفل لسبب */
export type ManualEmployeeState = 'open' | 'leave' | 'rest' | 'self' | 'other' | 'no_shift'
export type ManualActivationStatus = 'active' | 'ended'
export type ManualSheetLock = 'month_locked' | 'month_confirmed' | null

/** بادئة سبب التعديل التي يكتبها الخادم على صفوف الحضور المسجَّلة من الكشف اليدوي (يحرسها اختبار قاعدة البيانات) */
export const MANUAL_SHEET_REASON_PREFIX = 'كشف حضور يدوي'
export const isManualSheetReason = (reason: string | null | undefined): boolean => !!reason && reason.startsWith(MANUAL_SHEET_REASON_PREFIX)

export const MANUAL_ENTRY_LABELS: Readonly<Record<ManualEntryStatus, string>> = { present: 'حاضر', absent: 'غائب' }
export const MANUAL_STATE_LABELS: Readonly<Record<Exclude<ManualEmployeeState, 'open'>, string>> = {
  leave: 'في إجازة معتمدة',
  rest: 'يوم راحة',
  no_shift: 'لا يوجد شفت — أَسنِد شفتاً أولاً',
  self: 'حسابك أنت — لا تسجّل حضورك بنفسك',
  other: 'سجل يدوي غير مطابق — يلزم مراجعة مخوّلة',
}
export const MANUAL_ACTIVATION_STATUS_LABELS: Readonly<Record<ManualActivationStatus, string>> = { active: 'مفعّل — البصمة موقوفة', ended: 'منتهٍ — عادت البصمة' }
export const MANUAL_LOCK_LABELS: Readonly<Record<Exclude<ManualSheetLock, null>, string>> = {
  month_locked: 'اعتمدت المالية رواتب هذا الشهر وأُقفل — الكشف للاطلاع فقط',
  month_confirmed: 'حضورية هذا الشهر معتمدة — أعد فتحها من غرفة العمليات قبل أي تعديل',
}

/** رسائل الأخطاء الخاصة بالوحدة (تُدمج مع رسائل HR العامة) */
export const ATTENDANCE_MANUAL_ERROR_MESSAGES: Record<string, string> = {
  ATT_MANUAL_NOT_FOUND: 'التفعيل غير موجود',
  ATT_MANUAL_PORTAL_INVALID: 'هذه البوابة لا تدعم الحضور اليدوي',
  ATT_MANUAL_SCOPE_REQUIRED: 'اختر فرعاً أو قسماً من الهيكل التنظيمي',
  ATT_MANUAL_SCOPE_INVALID: 'الفرع أو القسم المختار غير موجود أو مؤرشف',
  ATT_MANUAL_SCOPE_EMPTY: 'لا موظفين ببصمة في هذا النطاق — لا حاجة لحضور يدوي له',
  ATT_MANUAL_REASON_REQUIRED: 'اكتب سبب التفعيل (3 أحرف على الأقل)',
  ATT_MANUAL_START_INVALID: 'تاريخ البدء يجب أن يكون اليوم أو أحد الأيام الـ31 الماضية',
  ATT_MANUAL_DUPLICATE_ACTIVE: 'يوجد تفعيل ساري لهذه البوابة بالنطاق نفسه — أوقفه أولاً أو اختر نطاقاً آخر',
  ATT_MANUAL_ALREADY_ENDED: 'هذا التفعيل أُوقف سابقاً',
  ATT_MANUAL_NO_PENDING: 'اكتملت الأيام المعلّقة لهذا التفعيل؛ لا يمكن تغيير حسابات التسجيل الآن',
  ATT_MANUAL_RECORDERS_TOO_MANY: 'لا يجوز اختيار أكثر من 5 حسابات إضافية للتفعيل',
  ATT_MANUAL_RECORDER_INVALID: 'أحد الحسابات المختارة غير موجود على المنصة',
  ATT_MANUAL_RECORDER_DUPLICATE: 'الحساب مكرر في قائمة المخوّلين',
  ATT_MANUAL_RECORDER_PORTAL_ROLE_REQUIRED: 'يجب إسناد دور وصلاحية الكشف في بوابة التفعيل للحساب قبل تفويضه',
  ATT_MANUAL_END_INVALID: 'آخر يوم مغطّى يجب أن يكون بين يوم قبل البدء واليوم',
  ATT_MANUAL_DATE_REQUIRED: 'اختر اليوم',
  ATT_MANUAL_DATE_OUT_OF_RANGE: 'هذا اليوم خارج أيام التفعيل أو خارج نافذة التسجيل',
  ATT_MANUAL_WINDOW_CLOSED: 'انتهت نافذة التسجيل لهذا اليوم — تواصل مع غرفة العمليات',
  ATT_MANUAL_ENTRIES_REQUIRED: 'اختر حاضر أو غائب لموظف واحد على الأقل',
  ATT_MANUAL_TOO_MANY: 'عدد الموظفين في الطلب كبير جداً',
  ATT_MANUAL_ENTRY_INVALID: 'بيانات الكشف غير صالحة',
  ATT_MANUAL_DUPLICATE_ENTRY: 'موظف مكرر في الكشف',
  ATT_MANUAL_EMPLOYEE_NOT_IN_SCOPE: 'موظف خارج نطاق هذا التفعيل — حدّث الصفحة',
  ATT_MANUAL_EMPLOYEE_LOCKED: 'لا يمكن تسجيل هذا الموظف في هذا اليوم (إجازة أو راحة أو حسابك أو تعديل آخر) — حدّث الصفحة',
  ATT_MANUAL_SHIFT_REQUIRED: 'يجب إسناد شفت للموظف قبل تسجيل الحضور اليدوي',
  ATT_MANUAL_NOTE_REQUIRED: 'تعديل مُدخَل سابق يحتاج سبباً (3 أحرف على الأقل)',
  HR_FUTURE_DATE: 'لا يمكن تسجيل يوم لم يأتِ بعد',
}
export function attendanceManualErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error ?? '')
  return lookupErrorMessage(text, { ...HR_ERROR_MESSAGES, ...ATTENDANCE_MANUAL_ERROR_MESSAGES }) || text || 'خطأ غير معروف'
}

export interface ManualScopeSuggestion { id: string; name: string; employees: number }
/** بوابة قابلة للتفعيل مع عدد أصحاب حساباتها واقتراح النطاق من قسم/فرع موظفيهم */
export interface ManualPortalOption { portal: string; label: string; holders: number; departments: ManualScopeSuggestion[]; branches: ManualScopeSuggestion[] }

export interface ManualScopeArgs { branchId: string | null; departmentId: string | null; includeSub: boolean }
export interface ManualScopePreview {
  employees: number; no_pin: number; contractors: number; sample: string[]
  overlapping: { id: string; portal: string; portal_label: string }[]
}
export const MANUAL_RECORDERS_LIMIT = 5
export interface ManualActivateArgs extends ManualScopeArgs { portal: string; reason: string; startsOn: string | null; recorderUserIds: string[] }
export interface ManualActivateResult { id: string; portal: string; starts_on: string; employees: number; cleared_auto_days: number; other_active: { id: string; portal: string }[] }
export interface ManualActivationRecorder {
  user_id: string; name: string; email: string | null; roles: string[]; granted_by_name: string | null; granted_at: string
}
export interface ManualRecordersSetResult { activation_id: string; recorders: number }
export interface ManualDeactivateResult { id: string; ends_on: string; reevaluated_days: number; pending_days: number }

/** صف قائمة التفعيلات لتقنية المعلومات */
export interface ManualActivationRow {
  id: string; portal: string; portal_label: string; status: ManualActivationStatus
  branch_id: string | null; department_id: string | null; include_sub_departments: boolean; scope_label: string
  starts_on: string; ends_on: string | null; reason: string
  activated_by_name: string | null; activated_at: string; ended_by_name: string | null; ended_at: string | null; end_note: string | null
  employees: number; entries: number; pending_days: number; pending_dates: number
}
/** تفعيل يحق لي تسجيل كشفه (مصدر ظهور الصفحة في القائمة الجانبية) */
export interface ManualMyActivation {
  id: string; portal: string; portal_label: string; status: ManualActivationStatus
  starts_on: string; ends_on: string | null; pending: number; scope_label: string
}

export interface ManualSheetEmployee {
  id: string; name: string; number: string; job_title: string | null; department: string | null; has_shift: boolean
  state: ManualEmployeeState; entry: ManualEntryStatus | null; note: string | null; by: string | null; at: string | null
  punches: number; first_punch: string | null; last_punch: string | null; status: string | null; source: 'auto' | 'manual' | null
}
export interface ManualSheetDay { date: string; total: number; entered: number; pending: number }
export interface ManualSheet {
  activation: {
    id: string; portal: string; portal_label: string; status: ManualActivationStatus; starts_on: string; ends_on: string | null; reason: string
    branch_id: string | null; department_id: string | null; include_sub_departments: boolean; scope_label: string
  }
  /** غائبة (null) حين لا يوجد يوم داخل نافذة التسجيل */
  date: string | null
  today: string; from: string; to: string
  lock: ManualSheetLock
  /** هل يملك المستخدم الحالي صلاحية مراجعة سجل يدوي قديم لا يطابق إدخال الكشف؟ */
  can_review: boolean
  days: ManualSheetDay[]
  employees: ManualSheetEmployee[]
  excluded: { no_pin: number; contractors: number }
  /** عدد المشمولين في الكشف بلا رقم بصمة مسجّل — لم يعودوا مستبعدين بعد 20261119120000 */
  included_no_pin: number
}
export interface ManualSheetSaveEntry { employee_id: string; status: ManualEntryStatus }
export interface ManualSheetSaveResult { saved: number; changed: number; unchanged: number; present: number; absent: number; pending_left: number; date: string }

/** ما يمنع اعتماد الحضورية: أيام (موظف، يوم) بانتظار الكشف حتى أمس (يوم اليوم لم ينتهِ فلا يُحسب) — هو نفسه رقم رسالة المنع ATT_MANUAL_SHEETS_PENDING */
export interface ManualPendingSummary {
  month: string; total: number
  items: { activation_id: string; portal: string; portal_label: string; days: number; items: number }[]
}
export interface ManualMonthCount { employee_id: string; days: number; present: number; absent: number }

const rpc = <T,>(fn: string, args?: Record<string, unknown>) => sdkGuard(supabase.rpc(fn, (args ?? {}) as never)) as Promise<T>
const scopeArgs = (s: ManualScopeArgs) => ({ p_branch: s.branchId || null, p_department: s.departmentId || null, p_include_sub: s.includeSub })

export const attendanceManual = {
  /** التطوير: البوابات القابلة للتفعيل واقتراح نطاقها */
  portalOptions() { return rpc<ManualPortalOption[]>('attendance_manual_portal_options') },
  /** التطوير: معاينة النطاق قبل التفعيل (لا تكتب شيئاً) */
  scopePreview(s: ManualScopeArgs) { return rpc<ManualScopePreview>('attendance_manual_scope_preview', scopeArgs(s)) },
  activate(a: ManualActivateArgs) {
    return rpc<ManualActivateResult>('attendance_manual_activate', { p_portal: a.portal, ...scopeArgs(a), p_reason: a.reason.trim(), p_starts_on: a.startsOn || null, p_recorders: a.recorderUserIds })
  },
  /** حسابات التسجيل الإضافية لتفعيل — يمكن توثيق حسابات غرفة العمليات هنا أيضاً رغم صلاحيتها الافتراضية */
  recorders(activation: string) { return rpc<ManualActivationRecorder[]>('attendance_manual_recorders_get', { p_activation: activation }) },
  setRecorders(activation: string, userIds: string[]) {
    return rpc<ManualRecordersSetResult>('attendance_manual_recorders_set', { p_activation: activation, p_user_ids: userIds })
  },

  /** lastDay = آخر يوم يبقى مغطّى بالكشف (الافتراضي اليوم)؛ تعود البصمة بعده */
  deactivate(id: string, lastDay: string | null, note: string | null) {
    return rpc<ManualDeactivateResult>('attendance_manual_deactivate', { p_activation: id, p_last_day: lastDay || null, p_note: note?.trim() || null })
  },
  list(onlyActive = false) { return rpc<ManualActivationRow[]>('attendance_manual_list', { p_only_active: onlyActive }) },
  myActivations() { return rpc<ManualMyActivation[]>('manual_att_my_activations') },
  sheet(activation: string, date: string | null) { return rpc<ManualSheet>('manual_att_sheet_get', { p_activation: activation, p_date: date || null }) },
  saveSheet(activation: string, date: string, entries: ManualSheetSaveEntry[], note: string | null) {
    return rpc<ManualSheetSaveResult>('manual_att_sheet_save', { p_activation: activation, p_date: date, p_entries: entries, p_note: note?.trim() || null })
  },
  pendingSummary(month: string) { return rpc<ManualPendingSummary>('attendance_manual_pending_summary', { p_month: month }) },
  monthCounts(month: string) { return rpc<ManualMonthCount[]>('attendance_manual_month_counts', { p_month: month }) },
}

/** تاريخ يوم 'YYYY-MM-DD' بصيغة قصيرة عربية مع اسم اليوم (بلا إزاحة منطقة زمنية) */
export const fmtManualDay = (d: string | null | undefined): string =>
  d ? new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('ar-IQ-u-nu-latn', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' }) : '—'
export const fmtManualDate = (d: string | null | undefined): string =>
  d ? new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }) : '—'
/** وقت HH:MM ببغداد */
export const fmtManualTime = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Baghdad' }) : '—'
