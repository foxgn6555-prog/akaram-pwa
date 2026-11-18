/** عناصر عرض صغيرة مشتركة بين صفحة الكشف (أصحاب البوابة) وصفحة التفعيل (التطوير) */
import type { ReactNode } from 'react'
import clsx from 'clsx'

export type Tone = 'emerald' | 'amber' | 'rose' | 'sky' | 'slate'

const BANNER_TONE: Record<Tone, string> = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  amber: 'border-amber-200 bg-amber-50 text-amber-900',
  rose: 'border-rose-200 bg-rose-50 text-rose-900',
  sky: 'border-sky-200 bg-sky-50 text-sky-900',
  slate: 'border-slate-200 bg-slate-50 text-slate-700',
}
/** شريط تنبيه/معلومة */
export function Banner({ tone, children, action, testId, role = 'status' }: { tone: Tone; children: ReactNode; action?: ReactNode; testId?: string; role?: 'status' | 'alert' }) {
  return (
    <div className={clsx('flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs leading-relaxed', BANNER_TONE[tone])} role={role} data-testid={testId}>
      <span className="min-w-0 basis-full sm:basis-0 sm:flex-1">{children}</span>
      {action && <span className="ms-auto flex shrink-0 flex-wrap gap-1.5">{action}</span>}
    </div>
  )
}

const STAT_TONE: Record<Tone, string> = {
  emerald: 'border-emerald-200 bg-emerald-50/50', amber: 'border-amber-200 bg-amber-50/50', rose: 'border-rose-200 bg-rose-50/50',
  sky: 'border-sky-200 bg-sky-50/50', slate: 'border-slate-200 bg-white',
}
export function MiniStat({ title, value, tone = 'slate', testId }: { title: string; value: ReactNode; tone?: Tone; testId?: string }) {
  return (
    <div className={clsx('rounded-xl border px-3 py-2', STAT_TONE[tone])} data-testid={testId}>
      <p className="text-[11px] text-slate-500">{title}</p>
      <p className="text-xl font-black tabular-nums text-slate-900">{value}</p>
    </div>
  )
}

export function Card({ title, hint, children, testId, badge }: { title: string; hint?: ReactNode; children: ReactNode; testId?: string; badge?: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={testId}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><h2 className="text-sm font-black text-slate-800">{title}</h2>{hint && <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{hint}</p>}</div>
        {badge}
      </header>
      {children}
    </section>
  )
}

export const fieldCls = 'h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-50'
