/** 00250 · المقارنة بين الفترات: آخر N فترة من النوع نفسه — اتجاه المؤشرات العامة، خريطة حرارية موظف × فترة، متحسنون/متراجعون، تصدير Excel */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@components/ui'
import { Icon } from '@components/ui/Icon/Icon'
import { Empty, Panel, Sparkline } from '@components/executive/exec-ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { useBehaviorSeries } from '@features/hr'
import type { BehaviorPeriodKind, BehaviorSeriesEmployee } from '@features/hr'
import { exportSeriesExcel } from '@features/hr/lib/behavior-export'
import { GRADE_META, GRADE_ORDER, scoreColor } from '@features/hr/lib/behavior'
import { fmtInt, fmtNum } from '@features/executive'
import { field } from '@portals/hr/components/hr-format'

const COUNTS: Record<BehaviorPeriodKind, number[]> = { monthly: [3, 6, 12], quarterly: [4, 8], half_yearly: [2, 4, 6], yearly: [2, 3, 5] }
const TREND_META = { improving: { label: 'متحسن', cls: 'bg-emerald-100 text-emerald-800', icon: 'chevron-up' as const }, declining: { label: 'متراجع', cls: 'bg-rose-100 text-rose-800', icon: 'chevron-down' as const }, stable: { label: 'مستقر', cls: 'bg-slate-100 text-slate-700', icon: 'activity' as const }, insufficient: { label: 'فترة واحدة', cls: 'bg-slate-50 text-slate-400', icon: 'activity' as const } }
const tipFmt = (v: unknown, n: unknown) => [fmtNum(Number(Array.isArray(v) ? v[0] : v ?? 0), 1), String(n ?? '')] as [string, string]

export function BehaviorSeriesSection({ kind, anchor, departmentId, branchId }: { kind: BehaviorPeriodKind; anchor: string; departmentId: string | null; branchId: string | null }) {
  const [count, setCount] = useState(COUNTS[kind][1] ?? COUNTS[kind][0]!)
  const [filter, setFilter] = useState<'all' | BehaviorSeriesEmployee['trend']>('all')
  const [search, setSearch] = useState('')
  const q = useBehaviorSeries({ kind, anchor, count, departmentId, branchId })
  const s = q.data
  const rows = useMemo(() => (s?.employees ?? []).filter((e) => (filter === 'all' || e.trend === filter) && (!search.trim() || e.full_name.includes(search.trim()) || e.employee_number.includes(search.trim()))), [s, filter, search])
  const chart = (s?.periods ?? []).map((p) => ({ name: p.label, avg_score: p.avg_score ?? 0, absence_rate: p.absence_rate ?? 0, late_rate: p.punctuality_rate == null ? 0 : Math.round((100 - p.punctuality_rate) * 10) / 10, chronic: p.chronic_late }))
  const counts = useMemo(() => { const c = { improving: 0, declining: 0, stable: 0, insufficient: 0 }; for (const e of s?.employees ?? []) c[e.trend]++; return c }, [s])
  const first = s?.periods[0], last = s?.periods[s.periods.length - 1]
  const overall = first?.avg_score != null && last?.avg_score != null && s!.periods.length > 1 ? Math.round((last.avg_score - first.avg_score) * 10) / 10 : null
  return (
    <section className="space-y-3" data-testid="behavior-series">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50/40 p-3">
        <h2 className="flex items-center gap-2 text-sm font-black text-violet-900"><Icon name="activity" size={16} />المقارنة بين الفترات</h2>
        <div className="flex gap-1">{COUNTS[kind].map((n) => <button key={n} type="button" onClick={() => setCount(n)} className={clsx('rounded-lg px-2.5 py-1 text-[11px] font-black', count === n ? 'bg-violet-700 text-white' : 'bg-white text-violet-800 ring-1 ring-violet-200')} data-testid={`series-count-${n}`}>آخر {n}</button>)}</div>
        {s && first && last && <span className="text-[11px] text-slate-600" data-testid="series-range">{first.label} → {last.label} · {fmtInt(s.employees.length)} موظف</span>}
        <span className="flex-1" />
        <Button size="sm" variant="secondary" disabled={!s?.employees.length} onClick={() => { if (s) void exportSeriesExcel(s) }} data-testid="series-excel"><Icon name="file-spreadsheet" size={14} className="ms-1" />Excel</Button>
      </div>
      {q.isLoading || !s ? <LoadingSpinner /> : !s.periods.length ? <Empty text="لا فترات ببيانات" /> : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="series-kpis">
            {[
              { k: 'التغيّر الإجمالي', v: overall == null ? '—' : `${overall > 0 ? '+' : ''}${fmtNum(overall, 1)}`, hint: overall == null ? '' : `${fmtNum(first?.avg_score, 1)} ← ${fmtNum(last?.avg_score, 1)}`, color: overall == null ? '#64748b' : overall >= 0 ? '#047857' : '#b91c1c', id: 'overall' },
              { k: 'متحسنون', v: fmtInt(counts.improving), hint: 'ميل ≥ +1.5 نقطة/فترة', color: '#047857', id: 'improving' },
              { k: 'متراجعون', v: fmtInt(counts.declining), hint: 'ميل ≤ −1.5 نقطة/فترة', color: '#b91c1c', id: 'declining' },
              { k: 'مستقرون', v: fmtInt(counts.stable), hint: `${fmtInt(counts.insufficient)} بفترة واحدة`, color: '#1d4ed8', id: 'stable' },
            ].map((x) => <div key={x.id} className="rounded-2xl border border-slate-200 bg-white p-3" data-testid={`series-kpi-${x.id}`}><p className="text-[11px] text-slate-500">{x.k}</p><p className="text-2xl font-black tabular-nums" style={{ color: x.color }}>{x.v}</p><p className="text-[10px] text-slate-400">{x.hint}</p></div>)}
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <Panel title="متوسط الدرجة عبر الفترات" subtitle="مع نسبتي التأخير والغياب" icon="bar-chart" tone="violet" className="lg:col-span-2" testId="series-chart">
              <div className="h-60 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis yAxisId="l" domain={[0, 100]} tick={{ fontSize: 10 }} /><YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} />
                    <Tooltip formatter={tipFmt} /><Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="r" dataKey="late_rate" name="تأخير ٪" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={16} /><Bar yAxisId="r" dataKey="absence_rate" name="غياب ٪" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={16} />
                    <Line yAxisId="l" type="monotone" dataKey="avg_score" name="متوسط الدرجة" stroke="#7c3aed" strokeWidth={3} dot={{ r: 4 }} label={{ fontSize: 10, position: 'top' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <table className="mt-2 w-full text-[10px]" data-testid="series-table"><thead><tr className="text-slate-500"><th className="text-start">الفترة</th><th>موظفون</th><th>الدرجة</th><th>حضور ٪</th><th>انضباط ٪</th><th>غياب ٪</th><th>مزمنون</th><th>ممتاز</th><th>ضعيف</th></tr></thead>
                <tbody>{s.periods.map((p) => <tr key={p.label} className="border-t border-slate-100 tabular-nums"><td className="py-1 font-bold" dir="ltr">{p.label}</td><td className="text-center">{fmtInt(p.employees)}</td><td className="text-center font-black" style={{ color: scoreColor(p.avg_score) }}>{fmtNum(p.avg_score, 1)}</td><td className="text-center">{fmtNum(p.attendance_rate, 1)}</td><td className="text-center">{fmtNum(p.punctuality_rate, 1)}</td><td className="text-center">{fmtNum(p.absence_rate, 1)}</td><td className="text-center">{fmtInt(p.chronic_late)}</td><td className="text-center">{fmtInt(p.grades.excellent)}</td><td className="text-center">{fmtInt(p.grades.poor)}</td></tr>)}</tbody></table>
            </Panel>
            <Panel title="تطوّر التصنيفات" subtitle="عدد الموظفين في كل تصنيف لكل فترة" icon="pie-chart" tone="cyan" testId="series-grades">
              <div className="space-y-1.5">{s.periods.map((p) => { const tot = Math.max(1, p.employees); return (
                <div key={p.label} className="text-[10px]"><div className="mb-0.5 flex justify-between"><span className="font-bold" dir="ltr">{p.label}</span><span className="text-slate-400">{fmtInt(p.employees)}</span></div>
                  <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">{GRADE_ORDER.map((g) => <span key={g} title={`${GRADE_META[g].label} ${p.grades[g]}`} style={{ width: `${(100 * (p.grades[g] ?? 0)) / tot}%`, background: GRADE_META[g].color }} />)}</div></div>) })}</div>
              <div className="mt-2 flex flex-wrap gap-x-2 text-[9px] text-slate-500">{GRADE_ORDER.map((g) => <span key={g} className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm" style={{ background: GRADE_META[g].color }} />{GRADE_META[g].label}</span>)}</div>
            </Panel>
          </div>
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="series-heatmap">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
              <h3 className="text-sm font-black">خريطة الموظفين × الفترات</h3>
              <input className={clsx(field, 'w-40 py-1.5 text-xs')} placeholder="بحث" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="series-search" />
              <div className="flex gap-1">{(['all', 'improving', 'declining', 'stable'] as const).map((f) => <button key={f} type="button" onClick={() => setFilter(f)} className={clsx('rounded-lg px-2 py-1 text-[10px] font-black', filter === f ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600')} data-testid={`series-filter-${f}`}>{f === 'all' ? 'الكل' : TREND_META[f].label}</button>)}</div>
              <span className="text-[10px] text-slate-400">مرتب بالميل (الأكثر تحسناً أولاً)</span>
            </div>
            <div className="overflow-x-auto"><table className="w-full min-w-[40rem] text-[11px]">
              <thead className="bg-slate-50"><tr><th className="px-2 py-2 text-start">الموظف</th>{s.periods.map((p) => <th key={p.label} className="px-1 py-2 text-center" dir="ltr">{p.label}</th>)}<th className="px-2 py-2">الاتجاه</th><th className="px-2 py-2">الميل</th><th className="px-2 py-2">المنحنى</th></tr></thead>
              <tbody>{rows.map((e) => <tr key={e.employee_id} className="border-t border-slate-100" data-testid={`series-row-${e.employee_number}`}>
                <td className="px-2 py-1"><span className="block font-bold">{e.full_name}</span><span className="text-[9px] text-slate-400">{e.department_name ?? '—'}</span></td>
                {e.scores.map((v, i) => <td key={i} className="px-1 py-1 text-center"><span className={clsx('inline-block min-w-[2.6rem] rounded-md px-1 py-0.5 font-black tabular-nums', v == null ? 'bg-slate-50 text-slate-300' : 'text-white')} style={v == null ? undefined : { background: scoreColor(v) }}>{v == null ? '—' : fmtNum(v, v >= 100 ? 0 : 1)}</span></td>)}
                <td className="px-2 py-1 text-center"><span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black', TREND_META[e.trend].cls)}><Icon name={TREND_META[e.trend].icon} size={10} />{TREND_META[e.trend].label}</span></td>
                <td className="px-2 py-1 text-center tabular-nums" dir="ltr">{e.slope == null ? '—' : `${e.slope > 0 ? '+' : ''}${fmtNum(e.slope, 2)}`}</td>
                <td className="w-24 px-2 py-1">{e.periods_with_data >= 2 && <Sparkline values={e.scores.map((v) => v ?? 0)} color={e.trend === 'declining' ? '#b91c1c' : e.trend === 'improving' ? '#047857' : '#1d4ed8'} height={20} />}</td>
              </tr>)}</tbody></table></div>
            {!rows.length && <Empty text="لا نتائج" />}
          </section>
        </>
      )}
    </section>
  )
}
