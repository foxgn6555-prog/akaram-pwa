/**
 * عناصر واجهة اللوحة الرئيسية — بوابة التطوير المركزية.
 * مكونات عرض فقط (قانون 4) — البيانات والحساب في صفحة الوحدة نفسها.
 */
import type { ReactNode } from 'react'
import { Icon, type IconName } from '@components/ui/Icon/Icon'

/** بطاقة مؤشر حي — قابلة للنقر عند تمرير onClick (توجّه لوحدة الصلاحية) */
export function StatCard({ icon, label, value, sub, tone = '#005f8d', onClick }: {
  icon: IconName
  label: string
  value: string
  sub?: string
  tone?: string
  onClick?: () => void
}) {
  const body = (
    <>
      <span className="mb-2 flex size-9 items-center justify-center rounded-xl"
            style={{ background: `${tone}18`, color: tone }}>
        <Icon name={icon} size={17} />
      </span>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold" data-testid="stat-value">{value}</p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </>
  )
  if (!onClick) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">{body}</div>
  }
  return (
    <button onClick={onClick}
            className="rounded-2xl border border-slate-200 bg-white p-4 text-start shadow-sm transition-shadow hover:shadow-md">
      {body}
    </button>
  )
}

/** إطار رسم بياني بعنوان وتلميح */
export function ChartCard({ title, testId, hint, children }: {
  title: string
  testId: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={testId}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-700">{title}</h2>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </div>
      <div style={{ width: '100%', minHeight: 220 }}>
        {children}
      </div>
    </div>
  )
}

/** بديل الرسم عند غياب البيانات */
export function ChartPlaceholder({ text }: { text: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs text-slate-400">
      {text}
    </div>
  )
}

/** رابط سريع لوحدة من وحدات البوابة */
export function QuickAction({ icon, title, hint, onClick }: {
  icon: IconName
  title: string
  hint?: string
  onClick: () => void
}) {
  return (
    <button onClick={onClick} data-testid={`quick-${icon}`}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-start shadow-sm transition-shadow hover:shadow-md">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold">{title}</span>
        {hint && <span className="block truncate text-xs text-slate-500">{hint}</span>}
      </span>
    </button>
  )
}
