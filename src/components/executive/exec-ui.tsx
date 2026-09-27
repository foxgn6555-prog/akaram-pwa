/**
 * عناصر واجهة الإدارة العليا (مشتركة بين المدير المفوض/التنفيذي/المعاون/المالية) — بلا منطق أعمال.
 * تصميم حديث: بطاقات زجاجية، أرقام جدولية، دلتا ملوّنة، رسوم Recharts متجاوبة تطبع بألوانها.
 */
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts'
import { Icon, type IconName } from '@components/ui/Icon/Icon'
import { fmtInt, fmtNum, type Insight, type InsightTone } from '@features/executive'

import { PALETTE } from './palette'
export { PALETTE }

export function Panel({ title, subtitle, icon, action, children, className, testId }: { title: string; subtitle?: string; icon?: IconName; action?: ReactNode; children: ReactNode; className?: string; testId?: string }) {
  return (
    <section className={clsx('exec-panel rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur print:break-inside-avoid print:shadow-none', className)} data-testid={testId}>
      <header className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon && <span className="grid h-8 w-8 place-items-center rounded-xl bg-slate-900 text-white"><Icon name={icon} className="h-4 w-4" /></span>}
          <div><h3 className="text-sm font-black text-slate-800">{title}</h3>{subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}</div>
        </div>
        {action && <div className="print:hidden">{action}</div>}
      </header>
      {children}
    </section>
  )
}

export function Delta({ value, increaseIsGood = true, suffix = '٪' }: { value: number | null | undefined; increaseIsGood?: boolean; suffix?: string }) {
  if (value === null || value === undefined) return <span className="text-[10px] text-slate-400">—</span>
  if (value === 0) return <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-bold text-slate-500">ثابت</span>
  const good = increaseIsGood ? value > 0 : value < 0
  return (
    <span className={clsx('rounded-full px-1.5 text-[10px] font-black tabular-nums', good ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')} data-testid="delta" data-good={good}>
      {value > 0 ? '▲' : '▼'} {fmtInt(Math.abs(value))}{suffix}
    </span>
  )
}

export function Kpi({ title, value, unit, delta, increaseIsGood, hint, icon, tone = 'slate', testId }: {
  title: string; value: string | number; unit?: string; delta?: number | null; increaseIsGood?: boolean; hint?: string; icon?: IconName
  tone?: 'slate' | 'blue' | 'emerald' | 'amber' | 'red' | 'violet' | 'cyan'; testId?: string
}) {
  const tones = {
    slate: 'from-slate-50 to-white border-slate-200', blue: 'from-blue-50 to-white border-blue-200', emerald: 'from-emerald-50 to-white border-emerald-200',
    amber: 'from-amber-50 to-white border-amber-200', red: 'from-red-50 to-white border-red-200', violet: 'from-violet-50 to-white border-violet-200', cyan: 'from-cyan-50 to-white border-cyan-200',
  }
  const iconTone = { slate: 'text-slate-500', blue: 'text-blue-600', emerald: 'text-emerald-600', amber: 'text-amber-600', red: 'text-red-600', violet: 'text-violet-600', cyan: 'text-cyan-600' }
  return (
    <div className={clsx('exec-kpi relative overflow-hidden rounded-2xl border bg-gradient-to-b p-3.5 shadow-sm print:break-inside-avoid', tones[tone])} data-testid={testId}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold text-slate-500">{title}</p>
        {icon && <Icon name={icon} className={clsx('h-4 w-4 shrink-0', iconTone[tone])} />}
      </div>
      <p className="mt-1 flex items-baseline gap-1 text-2xl font-black tabular-nums text-slate-900">{typeof value === 'number' ? fmtNum(value, 1) : value}{unit && <span className="text-xs font-bold text-slate-500">{unit}</span>}</p>
      <div className="mt-1 flex items-center justify-between gap-1">
        {delta !== undefined ? <Delta value={delta} increaseIsGood={increaseIsGood} /> : <span />}
        {hint && <span className="truncate text-[10px] text-slate-400">{hint}</span>}
      </div>
    </div>
  )
}

const TONE_STYLE: Record<InsightTone, string> = { good: 'border-emerald-200 bg-emerald-50/60 text-emerald-900', bad: 'border-red-200 bg-red-50/60 text-red-900', warn: 'border-amber-200 bg-amber-50/60 text-amber-900', neutral: 'border-slate-200 bg-slate-50/60 text-slate-800' }
const TONE_DOT: Record<InsightTone, string> = { good: 'bg-emerald-500', bad: 'bg-red-500', warn: 'bg-amber-500', neutral: 'bg-slate-400' }
export function InsightList({ items, limit, testId = 'insights' }: { items: Insight[]; limit?: number; testId?: string }) {
  const list = limit ? items.slice(0, limit) : items
  if (!list.length) return <p className="text-xs text-slate-400">لا توجد بيانات كافية لاستخلاص نتائج في هذه الفترة.</p>
  return (
    <ul className="grid gap-2 md:grid-cols-2" data-testid={testId}>
      {list.map((i) => (
        <li key={i.id} className={clsx('flex gap-2 rounded-2xl border px-3 py-2 text-[13px] leading-6 print:break-inside-avoid', TONE_STYLE[i.tone])} data-tone={i.tone}>
          <span className={clsx('mt-2 h-2 w-2 shrink-0 rounded-full', TONE_DOT[i.tone])} />
          <span><span className="ml-1 rounded bg-white/70 px-1 text-[10px] font-black text-slate-600">{i.domain}</span>{i.text}</span>
        </li>
      ))}
    </ul>
  )
}

export function HealthGauge({ score, label }: { score: number; label: string }) {
  const r = 34, c = 2 * Math.PI * r, off = c * (1 - score / 100)
  const color = score >= 85 ? '#059669' : score >= 70 ? '#2563eb' : score >= 50 ? '#d97706' : '#dc2626'
  return (
    <div className="flex items-center gap-3" data-testid="health-gauge" data-score={score}>
      <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90">
        <circle cx="44" cy="44" r={r} stroke="#e2e8f0" strokeWidth="9" fill="none" />
        <circle cx="44" cy="44" r={r} stroke={color} strokeWidth="9" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
        <text x="44" y="44" transform="rotate(90 44 44)" textAnchor="middle" dominantBaseline="central" className="fill-slate-900 text-lg font-black">{score}</text>
      </svg>
      <div><p className="text-[11px] text-slate-500">مؤشر الأداء العام</p><p className="text-base font-black" style={{ color }}>{label}</p><p className="text-[10px] text-slate-400">حضور · إنجاز الشكاوى · مخالفات المحطة · الصيانة</p></div>
    </div>
  )
}

// ── الرسوم ──
const tooltipStyle = { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12, direction: 'rtl' as const }
const shortDay = (d: string) => d.slice(5)

export function TrendArea({ data, keys, height = 220, testId }: { data: Array<Record<string, string | number>>; keys: Array<{ key: string; name: string; color?: string }>; height?: number; testId?: string }) {
  if (!data.length) return <Empty />
  return (
    <div style={{ height }} data-testid={testId} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>{keys.map((k, i) => <linearGradient key={k.key} id={`g-${k.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={k.color ?? PALETTE[i]} stopOpacity={0.35} /><stop offset="95%" stopColor={k.color ?? PALETTE[i]} stopOpacity={0.02} /></linearGradient>)}</defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="d" tickFormatter={shortDay} tick={{ fontSize: 10 }} reversed />
          <YAxis tick={{ fontSize: 10 }} orientation="right" allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} />
          {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
          {keys.map((k, i) => <Area key={k.key} type="monotone" dataKey={k.key} name={k.name} stroke={k.color ?? PALETTE[i]} fill={`url(#g-${k.key})`} strokeWidth={2} />)}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function BarsH({ data, valueKey = 'count', nameKey = 'name', height, color = PALETTE[0], testId }: { data: ReadonlyArray<object>; valueKey?: string; nameKey?: string; height?: number; color?: string; testId?: string }) {
  if (!data.length) return <Empty />
  const h = height ?? Math.max(120, data.length * 30)
  return (
    <div style={{ height: h }} data-testid={testId} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data as Array<Record<string, string | number>>} layout="vertical" margin={{ top: 0, right: 30, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
          <XAxis type="number" hide />
          <YAxis type="category" dataKey={nameKey} width={110} tick={{ fontSize: 11 }} orientation="right" />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey={valueKey} fill={color} radius={[0, 6, 6, 0]} label={{ position: 'left', fontSize: 10, fill: '#334155' }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function StackedBars({ data, keys, height = 220, testId }: { data: Array<Record<string, string | number>>; keys: Array<{ key: string; name: string; color: string }>; height?: number; testId?: string }) {
  if (!data.length) return <Empty />
  return (
    <div style={{ height }} data-testid={testId} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="d" tickFormatter={shortDay} tick={{ fontSize: 10 }} reversed />
          <YAxis tick={{ fontSize: 10 }} orientation="right" allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {keys.map((k) => <Bar key={k.key} dataKey={k.key} name={k.name} stackId="a" fill={k.color} radius={[3, 3, 0, 0]} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function Donut({ data, height = 200, testId }: { data: Array<{ name: string; value: number }>; height?: number; testId?: string }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (!total) return <Empty />
  return (
    <div className="flex items-center gap-2" data-testid={testId}>
      <div style={{ height, width: height }} className="shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="90%" paddingAngle={2} stroke="none">{data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 flex-1 space-y-1 text-[11px]">
        {data.slice(0, 8).map((d, i) => (
          <li key={d.name} className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-1.5"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} /><span className="truncate">{d.name}</span></span><span className="font-bold tabular-nums">{fmtInt(d.value)} <span className="text-slate-400">({Math.round((d.value / total) * 100)}٪)</span></span></li>
        ))}
      </ul>
    </div>
  )
}

export function MiniTable({ rows, cols, testId }: { rows: Array<Array<string | number>>; cols: string[]; testId?: string }) {
  if (!rows.length) return <Empty />
  return (
    <div className="overflow-x-auto" data-testid={testId}>
      <table className="w-full text-[12px]">
        <thead><tr className="border-b border-slate-200 text-slate-500">{cols.map((c) => <th key={c} className="py-1.5 text-right font-semibold first:pr-1 last:text-left">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-slate-100 last:border-0">{r.map((c, j) => <td key={j} className={clsx('py-1.5 first:pr-1', j > 0 && 'tabular-nums font-bold text-left')}>{typeof c === 'number' ? fmtNum(c, 1) : c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

export function Empty() { return <p className="grid h-24 place-items-center text-xs text-slate-400">لا بيانات في هذه الفترة</p> }

export function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return <h2 id={id} className="mt-2 flex items-center gap-2 text-sm font-black text-slate-700 print:mt-4"><span className="h-4 w-1 rounded bg-slate-900" />{children}</h2>
}
