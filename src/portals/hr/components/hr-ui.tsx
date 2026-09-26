/** عناصر واجهة مشتركة لبوابة الموارد البشرية والحضوريات — بلا منطق أعمال */
import clsx from 'clsx'
import type { AttendanceStatus } from '@features/hr'
import { ATTENDANCE_STATUS_LABELS } from '@features/hr'
import { field, label, STATUS_STYLES } from './hr-format'

export function StatusBadge({ status, source }: { status: AttendanceStatus; source?: 'auto' | 'manual' }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold', STATUS_STYLES[status])} data-testid="att-status" data-status={status}>
      {ATTENDANCE_STATUS_LABELS[status]}
      {source === 'manual' && <span title="مُعدَّل يدوياً في غرفة العمليات" className="text-[9px]">✎</span>}
    </span>
  )
}

export function StatCard({ title, value, hint, tone = 'slate', testId }: { title: string; value: string | number; hint?: string; tone?: 'slate' | 'emerald' | 'amber' | 'red' | 'sky' | 'violet'; testId?: string }) {
  const tones = { slate: 'border-slate-200', emerald: 'border-emerald-200 bg-emerald-50/40', amber: 'border-amber-200 bg-amber-50/40', red: 'border-red-200 bg-red-50/40', sky: 'border-sky-200 bg-sky-50/40', violet: 'border-violet-200 bg-violet-50/40' }
  return (
    <div className={clsx('rounded-2xl border bg-white p-4 shadow-sm', tones[tone])} data-testid={testId}>
      <p className="text-xs text-slate-500">{title}</p>
      <p className="mt-1 text-2xl font-black tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  )
}

export function Field({ id, label: l, children, hint }: { id: string; label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label htmlFor={id} className={label}>{l}</label>
      {children}
      {hint && <p className="mt-0.5 text-[10px] text-slate-400">{hint}</p>}
    </div>
  )
}

export function MonthPicker({ value, onChange, testId = 'month-picker' }: { value: string; onChange: (v: string) => void; testId?: string }) {
  // value = 'YYYY-MM-01'
  return (
    <input type="month" className={clsx(field, 'w-auto')} value={value.slice(0, 7)} onChange={(e) => e.target.value && onChange(`${e.target.value}-01`)} data-testid={testId} />
  )
}

