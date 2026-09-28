/** تسميات حالات طلبات الدعم بين المسؤولين (00154) — مشتركة بين بوابة المسؤول وغرفة العمليات */
import type { SupportRequestStatus } from './types'

export const SUPPORT_STATUS_META: Record<SupportRequestStatus, { label: string; cls: string }> = {
  pending: { label: 'بانتظار الرد', cls: 'bg-amber-100 text-amber-800' },
  accepted: { label: 'مقبول — دعم جارٍ', cls: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: 'مرفوض', cls: 'bg-rose-100 text-rose-800' },
  cancelled: { label: 'ملغى', cls: 'bg-slate-200 text-slate-700' },
  completed: { label: 'مكتمل', cls: 'bg-blue-100 text-blue-800' },
}
export const SUPPORT_STATUS_LABEL: Record<SupportRequestStatus, string> = {
  pending: 'بانتظار الرد',
  accepted: 'دعم جارٍ',
  rejected: 'مرفوض',
  cancelled: 'ملغى',
  completed: 'مكتمل',
}
