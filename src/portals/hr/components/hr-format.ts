/** ثوابت ودوال تنسيق مشتركة لوحدات الموارد البشرية والحضوريات والرواتب (بلا مكونات) */
import type { AttendanceStatus } from '@features/hr'

export const field = 'h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-50'
export const label = 'mb-1 block text-xs font-semibold text-slate-600'
export const STATUS_STYLES: Record<AttendanceStatus, string> = {
  present: 'bg-emerald-50 text-emerald-700', late: 'bg-amber-50 text-amber-700', early_leave: 'bg-orange-50 text-orange-700',
  absent: 'bg-red-50 text-red-700', incomplete: 'bg-violet-50 text-violet-700', leave: 'bg-sky-50 text-sky-700', time_permit: 'bg-teal-50 text-teal-700',
}
export const fmtTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('ar-IQ-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Baghdad' }) : '—'
export const fmtMinutes = (m: number) => (m <= 0 ? '—' : m >= 60 ? `${Math.floor(m / 60)}س ${m % 60}د` : `${m}د`)
export const fmtMoney = (n: number | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n))
export const monthStart = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
export const isoDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '')
/** نص الاستقطاع المقترح لصف حضور (أيام و/أو دقائق) */
export const proposedLabel = (r: { proposed_deduction_minutes: number; proposed_deduction_days: number }) => {
  const parts: string[] = []
  if (r.proposed_deduction_days > 0) parts.push(`${r.proposed_deduction_days} يوم`)
  if (r.proposed_deduction_minutes > 0) parts.push(fmtMinutes(r.proposed_deduction_minutes))
  return parts.length ? parts.join(' + ') : '—'
}
