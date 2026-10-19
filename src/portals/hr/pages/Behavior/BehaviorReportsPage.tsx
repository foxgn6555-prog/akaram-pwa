/**
 * 00249 · تقارير سلوك الموظفين — تحليل حضوريات البصمة (شهري / ربع سنوي / نصف سنوي / سنوي) مع مقارنة الفترة السابقة.
 *  · المصدر الوحيد للأرقام: public.hr_behavior_report / hr_behavior_employee (درجة 0–100 بأوزان ثابتة وبوابات مهنية).
 *  · للموظفين الذين لديهم بصمة فعلية في الفترة فقط. أرقام لاتينية. القراءة: الموارد البشرية + المدير المفوض ومعاونه.
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { BarsH, Delta, Empty, Kpi, Panel, Tabs } from '@components/executive/exec-ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { Icon } from '@components/ui/Icon/Icon'
import { useBranches } from '@features/branches/hooks/useBranches'
import { useBehaviorEmployee, useBehaviorReport, useHrDepartments } from '@features/hr'
import type { BehaviorEmployeeReport, BehaviorEmployeeRow, BehaviorGrade, BehaviorPeriodKind, BehaviorReport } from '@features/hr'
import { ATTENDANCE_STATUS_LABELS } from '@features/hr/types'
import { BEHAVIOR_KINDS, DOW_LABELS, GRADE_META, GRADE_ORDER, INDEX_META, INDEX_ORDER, defaultAnchor, employeeInsights, gradeOf, periodTitle, radarData, reportInsights, scoreColor, shiftAnchor, type BehaviorInsight } from '@features/hr/lib/behavior'
import { fmtInt, fmtNum } from '@features/executive'
import { field } from '@portals/hr/components/hr-format'
import { Button } from '@components/ui'
import { exportBehaviorExcel, exportEmployeeExcel } from '@features/hr/lib/behavior-export'
import { BehaviorPrintReport } from './BehaviorPrintReport'
import { BehaviorSeriesSection } from './BehaviorSeriesSection'

const STATUS_COLOR: Record<string, string> = { present: '#059669', late: '#d97706', early_leave: '#0e7490', absent: '#dc2626', incomplete: '#7c3aed', leave: '#64748b', time_permit: '#94a3b8' }
const fmtHm = (m: number) => { const h = Math.floor(m / 60), r = m % 60; return h ? `${fmtInt(h)}س ${r ? fmtInt(r) + 'د' : ''}`.trim() : `${fmtInt(r)}د` }
const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Baghdad' }) : '—')
const tipFmt = (v: unknown, n: unknown) => [fmtNum(Number(Array.isArray(v) ? v[0] : v ?? 0), 1), String(n ?? '')] as [string, string]
const TONE_CLS: Record<BehaviorInsight['tone'], string> = { good: 'border-emerald-200 bg-emerald-50 text-emerald-900', warn: 'border-amber-200 bg-amber-50 text-amber-900', bad: 'border-rose-200 bg-rose-50 text-rose-900', info: 'border-slate-200 bg-slate-50 text-slate-700' }
const TONE_ICON: Record<BehaviorInsight['tone'], 'check' | 'alert-triangle' | 'activity'> = { good: 'check', warn: 'alert-triangle', bad: 'alert-triangle', info: 'activity' }

export default function BehaviorReportsPage({ readOnly = false, hero = true }: { readOnly?: boolean; hero?: boolean }) {
  const [kind, setKind] = useState<BehaviorPeriodKind>('monthly')
  const [anchors, setAnchors] = useState<Record<BehaviorPeriodKind, string>>(() => ({ monthly: defaultAnchor('monthly'), quarterly: defaultAnchor('quarterly'), half_yearly: defaultAnchor('half_yearly'), yearly: defaultAnchor('yearly') }))
  const anchor = anchors[kind]
  const [departmentId, setDepartmentId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [view, setView] = useState<'report' | 'compare' | 'print'>('report')
  const q = useBehaviorReport({ kind, anchor, departmentId: departmentId || null, branchId: branchId || null })
  const deps = useHrDepartments(); const branches = useBranches()
  const move = (dir: 1 | -1) => setAnchors((a) => ({ ...a, [kind]: shiftAnchor(kind, a[kind], dir) }))
  const r = q.data
  const title = periodTitle(kind, r?.period.period_from ?? anchor)
  const scope = [departmentId ? deps.data?.find((d) => d.id === departmentId)?.name : null, branchId ? branches.data?.find((b) => b.id === branchId)?.name : null].filter(Boolean).join(' · ') || undefined
  const canExport = !!r?.summary && r.employees.length > 0
  const printPdf = () => { const t = document.title; document.title = `behavior-${kind}-${r?.period.period_from ?? anchor}`; window.print(); document.title = t }
  const actions = (
    <>
      <button type="button" onClick={() => { if (r) void exportBehaviorExcel(r, scope) }} disabled={!canExport} className="inline-flex h-9 items-center gap-1 rounded-xl bg-white px-3 text-xs font-black text-[#0b3d6b] shadow hover:bg-blue-50 disabled:opacity-40" data-testid="behavior-excel"><Icon name="file-spreadsheet" size={14} className="text-[#c9a227]" />Excel</button>
      <button type="button" onClick={() => { setView('print'); setTimeout(printPdf, 50) }} disabled={!canExport} className="inline-flex h-9 items-center gap-1 rounded-xl bg-white/10 px-3 text-xs font-black text-white ring-1 ring-white/25 hover:bg-white/20 disabled:opacity-40" data-testid="behavior-pdf"><Icon name="printer" size={14} />PDF / طباعة</button>
    </>
  )
  return (
    <div className="space-y-4" data-testid="behavior-page">
      {hero && <ExecPageHeader icon="gauge" title="تقارير سلوك الموظفين" subtitle="تحليل انضباط الحضور من بصمات الموظفين: درجة من 100 بأوزان ثابتة، تصنيف، ترتيب، أنماط أسبوعية، ومقارنة بالفترة السابقة — للموظفين الذين لديهم بصمة فقط." testId="behavior-header"
        stats={r?.summary ? [{ label: 'موظف ببصمة', value: fmtInt(r.summary.employees) }, { label: 'متوسط الدرجة', value: fmtNum(r.summary.avg_score, 1) }, { label: 'الفترة', value: title }] : undefined} actions={actions} />}
      {!hero && <div className="flex justify-end gap-2 rounded-2xl bg-[#0b3d6b] p-2 print:hidden">{actions}</div>}
      <Tabs tabs={BEHAVIOR_KINDS.map((k) => ({ key: k.key, label: k.label, icon: k.key === 'monthly' ? 'calendar' as const : k.key === 'yearly' ? 'bar-chart' as const : 'pie-chart' as const }))} value={kind} onChange={setKind} testId="behavior-kind" />
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm print:hidden" data-testid="behavior-controls">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-0.5">{([['report', 'التقرير', 'bar-chart'], ['compare', 'المقارنة بين الفترات', 'activity'], ['print', 'النسخة المطبوعة', 'printer']] as const).map(([k, l, ic]) => <button key={k} type="button" onClick={() => setView(k)} className={clsx('flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-black', view === k ? 'bg-white text-slate-900 shadow' : 'text-slate-500')} data-testid={`view-${k}`}><Icon name={ic} size={12} />{l}</button>)}</div>
        <button type="button" className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 hover:bg-slate-50" onClick={() => move(-1)} aria-label="الفترة السابقة" data-testid="behavior-prev"><Icon name="chevron-right" size={16} /></button>
        <div className="min-w-[10rem] flex-1 text-center">
          <p className="text-sm font-black" data-testid="behavior-period-title">{title}</p>
          {r && <p className="text-[10px] text-slate-400" dir="ltr">{r.period.period_from} → {r.period.period_to_effective}{r.period.period_to_effective < r.period.period_to ? ' (حتى أمس)' : ''}</p>}
        </div>
        <button type="button" className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 hover:bg-slate-50" onClick={() => move(1)} aria-label="الفترة التالية" data-testid="behavior-next"><Icon name="chevron-left" size={16} /></button>
        <select className={clsx(field, 'w-40 py-1.5 text-xs')} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} data-testid="behavior-dept">
          <option value="">كل الأقسام</option>{(deps.data ?? []).filter((d) => !d.is_job_title).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className={clsx(field, 'w-36 py-1.5 text-xs')} value={branchId} onChange={(e) => setBranchId(e.target.value)} data-testid="behavior-branch">
          <option value="">كل الفروع</option>{(branches.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      {view === 'compare' ? <BehaviorSeriesSection kind={kind} anchor={anchor} departmentId={departmentId || null} branchId={branchId || null} />
        : q.isLoading || !r ? <LoadingSpinner /> : !r.summary || !r.employees.length ? <Empty text="لا بصمات لأي موظف في هذه الفترة" />
        : view === 'print' ? <div className="space-y-2"><div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-2 text-[11px] text-slate-500 print:hidden"><span>معاينة النسخة المطبوعة (A4) — كل قسم في صفحة، تُطبع بألوانها بلا رأس/تذييل المتصفح.</span><Button size="sm" onClick={printPdf} data-testid="print-now"><Icon name="printer" size={14} className="ms-1" />طباعة / حفظ PDF</Button></div><BehaviorPrintReport r={r} scope={scope} /></div>
        : <ReportBody r={r} onSelect={setSelected} readOnly={readOnly} />}
      {selected && <EmployeeDrawer employeeId={selected} kind={kind} anchor={anchor} onClose={() => setSelected(null)} />}
    </div>
  )
}

function ReportBody({ r, onSelect, readOnly }: { r: BehaviorReport; onSelect: (id: string) => void; readOnly: boolean }) {
  const s = r.summary!
  const insights = useMemo(() => reportInsights(s, r.weekdays, r.departments, r.employees), [s, r])
  const trend = r.trend.map((t) => ({ ...t, name: t.label, avg_score: t.avg_score ?? 0, late_rate: t.late_rate ?? 0, absence_rate: t.absence_rate ?? 0 }))
  const weekdays = r.weekdays.map((w) => ({ name: DOW_LABELS[w.dow], late_rate: w.late_rate ?? 0, absent_days: w.absent_days, early_days: w.early_days }))
  const top = r.employees.slice(0, 5), bottom = [...r.employees].reverse().slice(0, 5).filter((e) => e.score < 80)
  const delta = s.prev_avg_score != null && s.avg_score != null ? Math.round((s.avg_score - s.prev_avg_score) * 10) / 10 : null
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="behavior-kpis">
        <Kpi title="متوسط درجة الانضباط" value={fmtNum(s.avg_score, 1)} unit="/100" delta={delta} tone="blue" icon="activity" testId="kpi-score" hint={s.prev_avg_score != null ? `السابقة ${fmtNum(s.prev_avg_score, 1)}` : 'لا فترة سابقة'} />
        <Kpi title="نسبة الالتزام بالحضور" value={fmtNum(s.attendance_rate, 1)} unit="٪" tone="emerald" icon="check-square" testId="kpi-attendance" hint={`${fmtInt(s.absent_days)} يوم غياب`} />
        <Kpi title="الانضباط بوقت الدخول" value={fmtNum(s.punctuality_rate, 1)} unit="٪" tone="violet" icon="calendar" testId="kpi-punctuality" hint={`متوسط التأخير ${fmtNum(s.avg_late_minutes_per_late_day, 0)} د`} />
        <Kpi title="الخروج المبكر" value={fmtNum(s.early_leave_rate, 1)} unit="٪" tone="cyan" icon="clipboard" testId="kpi-early" hint={fmtHm(s.early_minutes)} />
        <Kpi title="تأخير مزمن" value={fmtInt(s.chronic_late)} unit="موظف" tone="red" icon="alert-triangle" testId="kpi-chronic" hint="≥ 30٪ من أيام الحضور" />
        <Kpi title="درجة كاملة" value={fmtInt(s.perfect)} unit="موظف" tone="amber" icon="shield" testId="kpi-perfect" hint={`${fmtInt(s.improved)} تحسّن · ${fmtInt(s.declined)} تراجع`} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="مؤشر الانضباط العام" icon="activity" tone="blue" testId="behavior-gauge-panel">
          <div className="flex items-center gap-4">
            <ScoreRing score={s.avg_score ?? 0} size={120} />
            <div className="flex-1 space-y-1">
              {GRADE_ORDER.map((g) => { const n = s.grades[g] ?? 0, p = s.employees ? (100 * n) / s.employees : 0; return (
                <div key={g} className="flex items-center gap-2 text-[11px]" data-testid={`grade-${g}`}>
                  <span className="w-14 font-bold" style={{ color: GRADE_META[g].color }}>{GRADE_META[g].label}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full" style={{ width: `${p}%`, background: GRADE_META[g].color }} /></span>
                  <span className="w-12 text-end tabular-nums text-slate-600">{fmtInt(n)} <span className="text-slate-400">({fmtNum(p, 0)}٪)</span></span>
                </div>) })}
            </div>
          </div>
        </Panel>
        <Panel title="قراءة الفترة" subtitle="استنتاجات مشتقة من الأرقام" icon="eye" tone="violet" className="lg:col-span-2" testId="behavior-insights">
          {insights.length ? <ul className="grid gap-1.5 sm:grid-cols-2">{insights.map((i, k) => <li key={k} className={clsx('flex items-start gap-2 rounded-xl border p-2 text-[11px] leading-5', TONE_CLS[i.tone])}><Icon name={TONE_ICON[i.tone]} size={14} className="mt-0.5 shrink-0" />{i.text}</li>)}</ul> : <Empty />}
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title={`الاتجاه الزمني (${r.period.kind === 'monthly' ? 'أسبوعياً' : 'شهرياً'})`} subtitle="متوسط الدرجة مقابل نسبتي التأخير والغياب" icon="bar-chart" tone="blue" testId="behavior-trend">
          <div className="h-56 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis yAxisId="l" domain={[0, 100]} tick={{ fontSize: 10 }} /><YAxis yAxisId="r" orientation="right" domain={[0, 'auto']} tick={{ fontSize: 10 }} />
                <Tooltip formatter={tipFmt} /><Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="r" dataKey="late_rate" name="تأخير ٪" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={14} />
                <Bar yAxisId="r" dataKey="absence_rate" name="غياب ٪" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={14} />
                <Line yAxisId="l" type="monotone" dataKey="avg_score" name="متوسط الدرجة" stroke="#1d4ed8" strokeWidth={3} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-slate-500" data-testid="behavior-trend-values">{trend.map((t) => <span key={t.label} className="tabular-nums">{t.label}: <b>{fmtNum(t.avg_score, 1)}</b></span>)}</div>
        </Panel>
        <Panel title="النمط الأسبوعي" subtitle="نسبة التأخير وأيام الغياب والخروج المبكر لكل يوم من الأسبوع" icon="calendar" tone="amber" testId="behavior-weekdays">
          <div className="h-56 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekdays} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={tipFmt} /><Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="late_rate" name="تأخير ٪" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="absent_days" name="أيام غياب" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="early_days" name="خروج مبكر" fill="#0e7490" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-slate-500" data-testid="behavior-weekday-values">{weekdays.map((w) => <span key={w.name} className="tabular-nums">{w.name}: <b>{fmtNum(w.late_rate, 1)}٪</b></span>)}</div>
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="الأقسام حسب متوسط الدرجة" icon="layout-grid" tone="cyan" testId="behavior-departments">
          <BarsH data={r.departments.map((d) => ({ name: `${d.name} (${fmtInt(d.employees)})`, count: d.avg_score ?? 0 }))} max={100} color="#0e7490" limit={12} />
        </Panel>
        <Panel title="لوحة الشرف" subtitle="أعلى 5 درجات" icon="shield" tone="emerald" testId="behavior-top">
          <ul className="space-y-1.5">{top.map((e) => <MiniEmployee key={e.employee_id} e={e} onClick={() => onSelect(e.employee_id)} />)}</ul>
        </Panel>
        <Panel title="يحتاجون متابعة" subtitle="أدنى الدرجات (أقل من 80)" icon="alert-triangle" tone="red" testId="behavior-bottom">
          {bottom.length ? <ul className="space-y-1.5">{bottom.map((e) => <MiniEmployee key={e.employee_id} e={e} onClick={() => onSelect(e.employee_id)} />)}</ul> : <Empty text="لا أحد دون 80 — أداء جماعي ممتاز" />}
        </Panel>
      </div>

      <Leaderboard rows={r.employees} onSelect={onSelect} />
      <p className="text-[10px] text-slate-400" data-testid="behavior-method">
        المنهجية: الدرجة = {INDEX_ORDER.map((k) => `${r.weights[k]}٪ ${INDEX_META[k].label}`).join(' + ')}. بوابات: التأخير المزمن (≥ 30٪ من أيام الحضور) أو الغياب المرتفع (≥ 10٪ من الأيام المتوقعة و≥ يومين) يحدّان الدرجة بـ 69.9. الإجازات والزمنيات المعتمدة محايدة. التأخير يُحتسب فوق سماحية الشفت. {readOnly ? 'عرض للقراءة فقط.' : ''}
      </p>
    </>
  )
}

function ScoreRing({ score, size = 96, prev }: { score: number; size?: number; prev?: number | null }) {
  const r = 40, c = 2 * Math.PI * r, color = scoreColor(score), g = gradeOf(score)
  return (
    <div className="flex shrink-0 flex-col items-center" data-testid="score-ring" data-score={score}>
      <svg width={size} height={size} viewBox="0 0 100 100" className="-rotate-90">
        <circle cx="50" cy="50" r={r} stroke="#e2e8f0" strokeWidth="10" fill="none" />
        {prev != null && <circle cx="50" cy="50" r={r} stroke="#cbd5e1" strokeWidth="3" fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - prev / 100)} strokeLinecap="round" />}
        <circle cx="50" cy="50" r={r} stroke={color} strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
        <text x="50" y="47" transform="rotate(90 50 50)" textAnchor="middle" dominantBaseline="central" className="fill-slate-900 font-black" style={{ fontSize: 24 }}>{fmtNum(score, score >= 100 ? 0 : 1)}</text>
        <text x="50" y="66" transform="rotate(90 50 50)" textAnchor="middle" style={{ fontSize: 11, fill: color, fontWeight: 800 }}>{g ? GRADE_META[g].label : ''}</text>
      </svg>
    </div>
  )
}

function GradeChip({ grade }: { grade: BehaviorGrade | null }) {
  return grade ? <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-black', GRADE_META[grade].bg)}>{GRADE_META[grade].label}</span> : <span className="text-[10px] text-slate-400">—</span>
}

function MiniEmployee({ e, onClick }: { e: BehaviorEmployeeRow; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded-xl border border-slate-100 p-2 text-start hover:bg-slate-50" data-testid={`mini-${e.employee_number}`}>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-900 text-[11px] font-black text-white">{fmtInt(e.rank)}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{e.full_name}</span><span className="block truncate text-[10px] text-slate-400">{e.department_name ?? 'بلا قسم'} · تأخير {fmtInt(e.late_days)} · غياب {fmtInt(e.absent_days)}</span></span>
        <span className="text-sm font-black tabular-nums" style={{ color: scoreColor(e.score) }}>{fmtNum(e.score, 1)}</span>
        {e.delta != null && <Delta value={e.delta} suffix="" />}
      </button>
    </li>
  )
}

type SortKey = 'rank' | 'score' | 'late_days' | 'late_minutes' | 'absent_days' | 'early_days' | 'incomplete_days' | 'delta' | 'full_name'
function Leaderboard({ rows, onSelect }: { rows: BehaviorEmployeeRow[]; onSelect: (id: string) => void }) {
  const [search, setSearch] = useState(''); const [grade, setGrade] = useState<BehaviorGrade | ''>(''); const [sort, setSort] = useState<SortKey>('rank'); const [asc, setAsc] = useState(true)
  const list = useMemo(() => {
    const s = search.trim()
    const f = rows.filter((e) => (!grade || e.grade === grade) && (!s || e.full_name.includes(s) || e.employee_number.includes(s) || (e.department_name ?? '').includes(s)))
    return [...f].sort((a, b) => { const va = a[sort] ?? -Infinity, vb = b[sort] ?? -Infinity; const c = typeof va === 'string' ? String(va).localeCompare(String(vb), 'ar') : Number(va) - Number(vb); return asc ? c : -c })
  }, [rows, search, grade, sort, asc])
  const th = (k: SortKey, label: string) => <th className="cursor-pointer select-none whitespace-nowrap px-2 py-2 text-[11px] font-black text-slate-600 hover:text-slate-900" onClick={() => { if (sort === k) setAsc(!asc); else { setSort(k); setAsc(k === 'rank' || k === 'full_name') } }} data-testid={`lb-sort-${k}`}>{label}{sort === k ? (asc ? ' ↑' : ' ↓') : ''}</th>
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="behavior-leaderboard">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <h2 className="flex items-center gap-2 text-sm font-black"><Icon name="list" size={16} className="text-slate-500" />ترتيب الموظفين <span className="rounded-full bg-slate-100 px-2 text-[10px] tabular-nums text-slate-600">{fmtInt(list.length)}</span></h2>
        <input className={clsx(field, 'w-44 py-1.5 text-xs')} placeholder="بحث بالاسم / الرقم / القسم" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="lb-search" />
        <select className={clsx(field, 'w-32 py-1.5 text-xs')} value={grade} onChange={(e) => setGrade(e.target.value as BehaviorGrade | '')} data-testid="lb-grade">
          <option value="">كل التصنيفات</option>{GRADE_ORDER.map((g) => <option key={g} value={g}>{GRADE_META[g].label}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-start text-xs">
          <thead className="bg-slate-50"><tr>{th('rank', '#')}{th('full_name', 'الموظف')}<th className="px-2 py-2 text-[11px] font-black text-slate-600">القسم</th>{th('score', 'الدرجة')}<th className="px-2 py-2 text-[11px] font-black text-slate-600">التصنيف</th>{th('delta', 'التغيّر')}<th className="px-2 py-2 text-[11px] font-black text-slate-600">المؤشرات</th>{th('late_days', 'تأخير')}{th('late_minutes', 'دقائق')}{th('absent_days', 'غياب')}{th('early_days', 'خروج مبكر')}{th('incomplete_days', 'بصمة ناقصة')}<th className="px-2 py-2 text-[11px] font-black text-slate-600">أطول سلسلة مثالية</th></tr></thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.employee_id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => onSelect(e.employee_id)} data-testid={`lb-row-${e.employee_number}`}>
                <td className="px-2 py-1.5 font-black tabular-nums">{fmtInt(e.rank)}</td>
                <td className="px-2 py-1.5"><span className="block font-bold">{e.full_name}</span><span className="text-[10px] text-slate-400" dir="ltr">{e.employee_number}</span>{e.chronic_late && <span className="ms-1 rounded bg-rose-100 px-1 text-[9px] font-bold text-rose-700">مزمن</span>}{e.high_absence && <span className="ms-1 rounded bg-rose-100 px-1 text-[9px] font-bold text-rose-700">غياب مرتفع</span>}</td>
                <td className="px-2 py-1.5 text-slate-600">{e.department_name ?? '—'}</td>
                <td className="px-2 py-1.5"><div className="flex items-center gap-1.5"><span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full" style={{ width: `${e.score}%`, background: scoreColor(e.score) }} /></span><b className="tabular-nums" style={{ color: scoreColor(e.score) }}>{fmtNum(e.score, 1)}</b></div></td>
                <td className="px-2 py-1.5"><GradeChip grade={e.grade} /></td>
                <td className="px-2 py-1.5">{e.delta != null ? <Delta value={e.delta} suffix="" /> : <span className="text-[10px] text-slate-400">جديد</span>}</td>
                <td className="px-2 py-1.5"><div className="flex gap-0.5" title={INDEX_ORDER.map((k) => `${INDEX_META[k].short} ${Math.round(e.indices[k] * 100)}`).join(' · ')}>{INDEX_ORDER.map((k) => <span key={k} className="h-4 w-2 overflow-hidden rounded-sm bg-slate-100"><span className="block w-full" style={{ height: `${Math.round(e.indices[k] * 100)}%`, marginTop: `${100 - Math.round(e.indices[k] * 100)}%`, background: INDEX_META[k].color }} /></span>)}</div></td>
                <td className="px-2 py-1.5 tabular-nums">{fmtInt(e.late_days)}</td>
                <td className="px-2 py-1.5 tabular-nums">{fmtInt(e.late_minutes)}</td>
                <td className={clsx('px-2 py-1.5 tabular-nums', e.absent_days > 0 && 'font-bold text-rose-700')}>{fmtInt(e.absent_days)}</td>
                <td className="px-2 py-1.5 tabular-nums">{fmtInt(e.early_days)}</td>
                <td className="px-2 py-1.5 tabular-nums">{fmtInt(e.incomplete_days)}</td>
                <td className="px-2 py-1.5 tabular-nums">{fmtInt(e.max_perfect_streak)} يوم</td>
              </tr>))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function EmployeeDrawer({ employeeId, kind, anchor, onClose }: { employeeId: string; kind: BehaviorPeriodKind; anchor: string; onClose: () => void }) {
  const q = useBehaviorEmployee(employeeId, kind, anchor)
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onClick={onClose} data-testid="behavior-drawer">
      <div className="max-h-[95vh] w-full max-w-5xl overflow-y-auto rounded-t-3xl bg-slate-50 p-3 shadow-2xl sm:rounded-3xl sm:p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-sm font-black">بطاقة سلوك الموظف</h2><div className="flex items-center gap-2">{q.data && <Button size="sm" variant="secondary" onClick={() => { if (q.data) void exportEmployeeExcel(q.data) }} data-testid="emp-excel"><Icon name="file-spreadsheet" size={14} className="ms-1" />Excel</Button>}<button type="button" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-slate-200" onClick={onClose} aria-label="إغلاق" data-testid="drawer-close"><Icon name="x" size={16} /></button></div></div>
        {q.isLoading || !q.data ? <LoadingSpinner /> : <EmployeeCard r={q.data} />}
      </div>
    </div>
  )
}

function EmployeeCard({ r }: { r: BehaviorEmployeeReport }) {
  const c = r.current, p = r.previous
  const insights = useMemo(() => employeeInsights(r), [r])
  const radar = radarData(r)
  const trend = r.trend.map((t) => ({ name: t.label, score: t.score, late_days: t.late_days, absent_days: t.absent_days }))
  const hist = r.in_histogram.map((h) => ({ name: h.bucket < 0 ? `${h.bucket}` : `+${h.bucket}`, days: h.days, bucket: h.bucket }))
  const weeks = useMemo(() => { const w: Array<Array<BehaviorEmployeeReport['days'][number] | null>> = []; let cur: Array<BehaviorEmployeeReport['days'][number] | null> = []; for (const d of r.days) { if (cur.length === 0) for (let i = 0; i < d.dow; i++) cur.push(null); cur.push(d); if (cur.length === 7) { w.push(cur); cur = [] } } if (cur.length) w.push(cur); return w }, [r.days])
  return (
    <div className="space-y-3" data-testid="employee-card">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
        <ScoreRing score={c?.score ?? 0} size={104} prev={p?.score ?? null} />
        <div className="min-w-0 flex-1">
          <p className="text-base font-black">{r.employee.full_name}</p>
          <p className="text-[11px] text-slate-500">{r.employee.employee_number} · {r.employee.department_name ?? 'بلا قسم'}{r.employee.job_title ? ` · ${r.employee.job_title}` : ''}{r.employee.branch_name ? ` · ${r.employee.branch_name}` : ''}</p>
          <p className="text-[11px] text-slate-500">{periodTitle(r.period.kind, r.period.period_from)} · المرتبة <b>{r.rank ? fmtInt(r.rank) : '—'}</b> من {fmtInt(r.population)} · {p ? <>الفترة السابقة <b>{fmtNum(p.score, 1)}</b> <Delta value={c && p ? Math.round((c.score - p.score) * 10) / 10 : null} suffix="" /></> : 'لا فترة سابقة'}</p>
          {c && <div className="mt-1 grid grid-cols-3 gap-1 sm:grid-cols-6 text-[10px]">
            {[['أيام متوقعة', c.expected_days], ['حضور', c.present_days], ['تأخير', c.late_days], ['غياب', c.absent_days], ['خروج مبكر', c.early_days], ['بصمة ناقصة', c.incomplete_days]].map(([k, v]) => <span key={String(k)} className="rounded-lg bg-slate-50 px-1.5 py-1"><span className="block text-slate-400">{k}</span><b className="tabular-nums">{fmtInt(Number(v))}</b></span>)}
          </div>}
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="بصمة الأداء (رادار)" subtitle="المؤشرات الخمسة 0–100 · الحالية مقابل السابقة" icon="activity" tone="violet" testId="emp-radar">
          <div className="h-56 w-full" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radar} outerRadius="70%">
                <PolarGrid /><PolarAngleAxis dataKey="axis" tick={{ fontSize: 10 }} /><PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                {p && <Radar name="السابقة" dataKey="previous" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.15} />}
                <Radar name="الحالية" dataKey="current" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.35} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-1 space-y-0.5 text-[10px]">{radar.map((x, i) => <li key={x.axis} className="flex justify-between"><span>{INDEX_META[INDEX_ORDER[i]!].label} <span className="text-slate-400">({r.weights[INDEX_ORDER[i]!]}٪)</span></span><b className="tabular-nums">{fmtInt(x.current)}{x.previous != null && <span className="text-slate-400"> / {fmtInt(x.previous)}</span>}</b></li>)}</ul>
        </Panel>
        <Panel title="قراءة السلوك" icon="eye" tone="blue" className="lg:col-span-2" testId="emp-insights">
          <ul className="grid gap-1.5 sm:grid-cols-2">{insights.map((i, k) => <li key={k} className={clsx('flex items-start gap-2 rounded-xl border p-2 text-[11px] leading-5', TONE_CLS[i.tone])}><Icon name={TONE_ICON[i.tone]} size={14} className="mt-0.5 shrink-0" />{i.text}</li>)}</ul>
        </Panel>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="اتجاه الدرجة" icon="bar-chart" tone="blue" testId="emp-trend">
          <div className="h-44 w-full" dir="ltr"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={trend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis yAxisId="l" domain={[0, 100]} tick={{ fontSize: 10 }} /><YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} allowDecimals={false} /><Tooltip /><Bar yAxisId="r" dataKey="late_days" name="أيام تأخير" fill="#f59e0b" barSize={10} /><Bar yAxisId="r" dataKey="absent_days" name="أيام غياب" fill="#ef4444" barSize={10} /><Line yAxisId="l" type="monotone" dataKey="score" name="الدرجة" stroke="#1d4ed8" strokeWidth={3} dot={{ r: 3 }} /></ComposedChart></ResponsiveContainer></div>
          <div className="flex flex-wrap gap-x-2 text-[10px] text-slate-500">{trend.map((t) => <span key={t.name} className="tabular-nums">{t.name}: <b>{fmtNum(t.score, 1)}</b></span>)}</div>
        </Panel>
        <Panel title="توزيع وقت الدخول" subtitle="دقائق قبل (−) / بعد (+) موعد الشفت، سلال 15 د" icon="calendar" tone="amber" testId="emp-hist">
          <div className="h-44 w-full" dir="ltr"><ResponsiveContainer width="100%" height="100%"><BarChart data={hist} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} allowDecimals={false} /><Tooltip /><Bar dataKey="days" name="أيام" radius={[4, 4, 0, 0]}>{hist.map((h) => <Cell key={h.bucket} fill={h.bucket < 0 ? '#059669' : h.bucket < 15 ? '#2563eb' : '#f59e0b'} />)}</Bar></BarChart></ResponsiveContainer></div>
          <div className="flex flex-wrap gap-x-2 text-[10px] text-slate-500">{hist.map((h) => <span key={h.bucket} className="tabular-nums" dir="ltr">{h.name}: <b>{fmtInt(h.days)}</b></span>)}</div>
        </Panel>
        <Panel title="أيام الأسبوع" subtitle="تأخير / غياب / خروج مبكر لكل يوم" icon="layout-grid" tone="cyan" testId="emp-weekdays">
          <ul className="space-y-1 text-[11px]">{r.weekdays.map((w) => <li key={w.dow} className="flex items-center gap-2"><span className="w-14 font-bold">{DOW_LABELS[w.dow]}</span><span className="flex flex-1 gap-0.5">{Array.from({ length: w.late_days }).map((_, i) => <i key={`l${i}`} className="h-3 w-1.5 rounded-sm bg-amber-500" />)}{Array.from({ length: w.absent_days }).map((_, i) => <i key={`a${i}`} className="h-3 w-1.5 rounded-sm bg-rose-500" />)}{Array.from({ length: w.early_days }).map((_, i) => <i key={`e${i}`} className="h-3 w-1.5 rounded-sm bg-cyan-600" />)}</span><span className="tabular-nums text-slate-500">{fmtInt(w.late_days)}/{fmtInt(w.absent_days)}/{fmtInt(w.early_days)}</span></li>)}</ul>
        </Panel>
      </div>
      <Panel title="خريطة الأيام" subtitle="كل خلية يوم دوام — اللون حسب الحالة، والرقم دقائق التأخير" icon="calendar" tone="slate" testId="emp-calendar">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">{Object.entries(STATUS_COLOR).map(([k, v]) => <span key={k} className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: v }} />{ATTENDANCE_STATUS_LABELS[k as keyof typeof ATTENDANCE_STATUS_LABELS]}</span>)}</div>
        <div className="mt-2 overflow-x-auto">
          <div className="grid min-w-[22rem] grid-cols-7 gap-1 text-[9px]">
            {DOW_LABELS.map((d) => <span key={d} className="text-center font-bold text-slate-400">{d.slice(0, 3)}</span>)}
            {weeks.flat().map((d, i) => d ? <span key={d.date} title={`${d.date} · ${ATTENDANCE_STATUS_LABELS[d.status]} · ${clock(d.in)}–${clock(d.out)}`} className="grid h-8 place-items-center rounded-md font-black text-white" style={{ background: STATUS_COLOR[d.status] ?? '#64748b', opacity: d.status === 'present' ? 0.85 : 1 }} data-testid={`day-${d.date}`}>{d.late > 0 ? fmtInt(d.late) : d.date.slice(8)}</span> : <span key={`e${i}`} />)}
          </div>
        </div>
      </Panel>
      <Panel title="السجل اليومي" icon="list" tone="slate" testId="emp-days">
        <div className="max-h-72 overflow-auto"><table className="w-full min-w-[36rem] text-[11px]"><thead className="sticky top-0 bg-slate-50"><tr><th className="px-2 py-1 text-start">التاريخ</th><th className="px-2 py-1 text-start">اليوم</th><th className="px-2 py-1 text-start">الحالة</th><th className="px-2 py-1">دخول</th><th className="px-2 py-1">خروج</th><th className="px-2 py-1">انحراف الدخول</th><th className="px-2 py-1">تأخير</th><th className="px-2 py-1">خروج مبكر</th><th className="px-2 py-1">بقاء</th><th className="px-2 py-1">منجز</th></tr></thead>
          <tbody>{r.days.map((d) => <tr key={d.date} className="border-t border-slate-100"><td className="px-2 py-1 tabular-nums" dir="ltr">{d.date}</td><td className="px-2 py-1">{DOW_LABELS[d.dow]}</td><td className="px-2 py-1"><span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: STATUS_COLOR[d.status] }}>{ATTENDANCE_STATUS_LABELS[d.status]}</span>{d.source === 'manual' && <span className="ms-1 text-[9px] text-slate-400">يدوي</span>}</td><td className="px-2 py-1 text-center tabular-nums" dir="ltr">{clock(d.in)}</td><td className="px-2 py-1 text-center tabular-nums" dir="ltr">{clock(d.out)}</td><td className={clsx('px-2 py-1 text-center tabular-nums', (d.in_offset ?? 0) > 0 ? 'text-amber-700' : 'text-emerald-700')} dir="ltr">{d.in_offset == null ? '—' : d.in_offset > 0 ? `+${d.in_offset}` : d.in_offset}</td><td className="px-2 py-1 text-center tabular-nums">{d.late || ''}</td><td className="px-2 py-1 text-center tabular-nums">{d.early || ''}</td><td className="px-2 py-1 text-center tabular-nums">{d.extra || ''}</td><td className="px-2 py-1 text-center tabular-nums">{d.worked ? fmtHm(d.worked) : ''}</td></tr>)}</tbody></table></div>
      </Panel>
    </div>
  )
}
