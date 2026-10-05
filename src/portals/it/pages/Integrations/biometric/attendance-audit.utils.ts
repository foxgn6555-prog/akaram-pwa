/** أدوات سجل تعديلات الحضور: تسميات الإجراءات والفرق المقروء قبل/بعد (أرقام إنكليزية، توقيت بغداد) */
import type { AttendanceAuditRow } from '@features/hr'
import { fmtTime } from '@portals/hr/components/hr-format'

export const AUDIT_ACTION_LABELS: Record<AttendanceAuditRow['action'], string> = {
  edit: 'تعديل يوم حضور', reset_auto: 'إعادة احتساب', deduction_add: 'إضافة استقطاع يدوي', deduction_delete: 'حذف استقطاع يدوي',
  waive: 'إلغاء استقطاع مقترح', unwaive: 'إعادة استقطاع مقترح', export: 'تصدير شهر إلى المالية', approve: 'اعتماد المالية',
}
export const ACTION_TONE: Record<AttendanceAuditRow['action'], string> = {
  edit: 'bg-amber-50 text-amber-800', reset_auto: 'bg-sky-50 text-sky-800', deduction_add: 'bg-red-50 text-red-700', deduction_delete: 'bg-red-50 text-red-700',
  waive: 'bg-emerald-50 text-emerald-700', unwaive: 'bg-orange-50 text-orange-700', export: 'bg-slate-100 text-slate-700', approve: 'bg-violet-50 text-violet-700',
}
const FIELD_LABELS: Record<string, string> = {
  check_in: 'الدخول', check_out: 'الخروج', status: 'الحالة', late_minutes: 'تأخير', early_minutes: 'مبكر', worked_minutes: 'مدة العمل',
  shortfall_minutes: 'النقص', proposed_deduction_days: 'استقطاع مقترح (أيام)', proposed_deduction_minutes: 'استقطاع مقترح (دقائق)', source: 'المصدر', waived: 'ملغى',
}
const STATUS_AR: Record<string, string> = { present: 'حاضر', late: 'متأخر', early_leave: 'خروج مبكر', absent: 'غائب', incomplete: 'بصمة ناقصة', leave: 'مجاز', time_permit: 'زمنية', auto: 'تلقائي', manual: 'يدوي' }
const TRACKED = ['check_in', 'check_out', 'status', 'late_minutes', 'early_minutes', 'worked_minutes', 'shortfall_minutes', 'proposed_deduction_days', 'proposed_deduction_minutes', 'source', 'waived']

/** عرض قيمة حقل: الأوقات بتوقيت بغداد وأرقام إنكليزية، الحالات بالعربية */
export function auditValue(key: string, v: unknown): string {
  if (v == null || v === '') return '—'
  if (key === 'check_in' || key === 'check_out') return fmtTime(String(v))
  if (typeof v === 'boolean') return v ? 'نعم' : 'لا'
  const s = String(v)
  return STATUS_AR[s] ?? s
}
/** الفروق المهمة فقط بين قبل/بعد (بدون طوابع التحديث والمعرّفات) */
export function auditDiff(before: Record<string, unknown> | null, after: Record<string, unknown> | null): { key: string; label: string; from: string; to: string }[] {
  if (!after) return []
  const keys = TRACKED.filter((k) => k in after || (before && k in before))
  return keys
    .filter((k) => JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after[k] ?? null))
    .map((k) => ({ key: k, label: FIELD_LABELS[k] ?? k, from: auditValue(k, before?.[k]), to: auditValue(k, after[k]) }))
}

