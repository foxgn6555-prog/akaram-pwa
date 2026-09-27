/** ثوابت ودوال الإجازات المشتركة (بلا مكوّنات — لسلامة Fast Refresh) */
import type { HrAlert, LeaveRequestRow, LeaveType } from '@features/hr'

export const LEAVE_STATUS_LABELS: Record<LeaveRequestRow['status'], string> = { pending: 'بانتظار المدير', approved: 'معتمد', rejected: 'مرفوض', cancelled: 'ملغى' }
export const LEAVE_STATUS_STYLES: Record<LeaveRequestRow['status'], string> = {
  pending: 'bg-amber-50 text-amber-700', approved: 'bg-emerald-50 text-emerald-700', rejected: 'bg-red-50 text-red-700', cancelled: 'bg-slate-100 text-slate-500',
}
export const ALERT_LABELS: Record<HrAlert['kind'], string> = { late_repeat: 'تكرار تأخير', shortfall: 'نقص ساعات', absent_repeat: 'تكرار غياب', balance_low: 'رصيد منخفض' }

/** عدد الأيام بين تاريخين (شاملاً) */
export const daysBetween = (a: string, b: string) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1)
/** دقائق بين وقتين HH:MM (سالبة إن كانت النهاية قبل البداية) */
export const minutesBetween = (a: string, b: string) => {
  if (!a || !b) return 0
  const [ah = 0, am = 0] = a.split(':').map(Number); const [bh = 0, bm = 0] = b.split(':').map(Number)
  return (bh * 60 + bm) - (ah * 60 + am)
}
/** تكلفة الطلب من الرصيد بالأيام (0 إن كان النوع لا يستهلك الرصيد) */
export const balanceCost = (t: LeaveType | undefined, days: number, permitsPerDay: number) =>
  !t || !t.consumes_balance ? 0 : t.kind === 'leave' ? days : Math.round((1 / Math.max(1, permitsPerDay)) * 1000) / 1000

