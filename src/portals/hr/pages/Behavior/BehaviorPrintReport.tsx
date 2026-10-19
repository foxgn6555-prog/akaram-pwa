/** 00250 · التقرير المطبوع (PDF/طباعة A4) لسلوك الموظفين — HTML/SVG خالص يطبع بألوانه، كل قسم صفحة، بلا رأس/تذييل المتصفح */
import { useMemo } from 'react'
import clsx from 'clsx'
import { Icon } from '@components/ui/Icon/Icon'
import { fmtInt, fmtNum } from '@features/executive'
import type { BehaviorReport } from '@features/hr'
import { BEHAVIOR_KINDS, DOW_LABELS, GRADE_META, GRADE_ORDER, INDEX_META, INDEX_ORDER, gradeOf, periodTitle, reportInsights, scoreColor } from '@features/hr/lib/behavior'

export const BEHAVIOR_PRINT_CSS = `
#behavior-report { direction: rtl; color: #0f172a; font-size: 11px; }
#behavior-report table { border-collapse: collapse; width: 100%; }
#behavior-report table th, #behavior-report table td { border: 1px solid #cbd5e1; padding: 3px 5px; text-align: right; }
#behavior-report table thead th { background: #0b3d6b; color: #fff; font-weight: 800; }
#behavior-report table tbody tr:nth-child(even) td { background: #f8fafc; }
#behavior-report .bp-page { break-after: page; }
#behavior-report .bp-page:last-child { break-after: auto; }
@media print {
  @page { size: A4; margin: 0; }
  html, body { background: #fff !important; }
  body * { visibility: hidden; }
  #behavior-report, #behavior-report * { visibility: visible; }
  #behavior-report { position: absolute; inset: 0; width: 100%; padding: 12mm 12mm 16mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #behavior-report .bp-cover { min-height: 262mm; display: flex; flex-direction: column; justify-content: space-between; }
  #behavior-report tr, #behavior-report .bp-box { break-inside: avoid; }
  #behavior-report thead { display: table-header-group; }
  #behavior-report .bp-foot { position: fixed; bottom: 5mm; left: 12mm; right: 12mm; font-size: 9px; color: #64748b; display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 2mm; }
}`

const Box = ({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) => (
  <section className={clsx('bp-box mb-3 rounded-xl border border-slate-200 p-3', className)}>{title && <h3 className="mb-2 border-b border-slate-200 pb-1 text-xs font-black text-[#0b3d6b]">{title}</h3>}{children}</section>
)
function MiniBars({ data, max = 100, color = '#1d4ed8', format = (v: number) => fmtNum(v, 1) }: { data: Array<{ label: string; value: number; color?: string }>; max?: number; color?: string; format?: (v: number) => string }) {
  if (!data.length) return null
  const H = 70, W = 500, bw = W / data.length
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full" style={{ direction: 'ltr' }} aria-hidden>
      {data.map((d, i) => { const h = Math.max(1, (Math.min(max, d.value) / max) * H); return (
        <g key={i}><rect x={i * bw + bw * 0.2} y={H - h} width={bw * 0.6} height={h} rx={2} fill={d.color ?? color} /><text x={i * bw + bw / 2} y={H - h - 2} fontSize={8} textAnchor="middle" fill="#334155" fontWeight={700}>{format(d.value)}</text><text x={i * bw + bw / 2} y={H + 12} fontSize={8} textAnchor="middle" fill="#64748b">{d.label}</text></g>) })}
    </svg>
  )
}

export function BehaviorPrintReport({ r, scope, preparedBy }: { r: BehaviorReport; scope?: string; preparedBy?: string }) {
  const s = r.summary!
  const title = periodTitle(r.period.kind, r.period.period_from), kind = BEHAVIOR_KINDS.find((k) => k.key === r.period.kind)?.label ?? ''
  const insights = useMemo(() => reportInsights(s, r.weekdays, r.departments, r.employees), [s, r])
  const today = new Date().toISOString().slice(0, 10)
  const g = gradeOf(s.avg_score), followup = r.employees.filter((e) => e.score < 80)
  const totals = r.employees.reduce((a, e) => ({ late: a.late + e.late_days, early: a.early + e.early_days, inc: a.inc + e.incomplete_days }), { late: 0, early: 0, inc: 0 })
  return (
    <div id="behavior-report" data-testid="behavior-print" className="mx-auto max-w-[210mm] bg-white">
      <style>{BEHAVIOR_PRINT_CSS}</style>
      {/* الغلاف */}
      <section className="bp-page bp-cover rounded-2xl border border-slate-200 p-6">
        <div>
          <div className="flex items-center justify-between border-b-4 border-[#c9a227] pb-3">
            <div><p className="text-lg font-black text-[#0b3d6b]">شركة جزيرة الأكارم</p><p className="text-[11px] text-slate-500">الموارد البشرية — وحدة تقارير سلوك الموظفين</p></div>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#0b3d6b] text-white"><Icon name="gauge" size={26} /></span>
          </div>
          <div className="mt-16 text-center">
            <p className="text-sm font-bold text-slate-500">{kind}</p>
            <h1 className="mt-1 text-3xl font-black text-[#0b3d6b]">تقرير سلوك الموظفين</h1>
            <p className="mt-2 text-xl font-black">{title}</p>
            <p className="mt-1 text-xs text-slate-500" dir="ltr">{r.period.period_from} → {r.period.period_to_effective}</p>
            {scope && <p className="mt-1 text-xs font-bold text-slate-600">النطاق: {scope}</p>}
          </div>
          <div className="mx-auto mt-10 flex max-w-md items-center justify-center gap-6">
            <div className="text-center"><p className="text-5xl font-black" style={{ color: scoreColor(s.avg_score) }}>{fmtNum(s.avg_score, 1)}</p><p className="text-xs text-slate-500">متوسط درجة الانضباط من 100</p><p className="text-sm font-black" style={{ color: g ? GRADE_META[g].color : undefined }}>{g ? GRADE_META[g].label : '—'}</p></div>
            {s.prev_avg_score != null && <div className="text-center text-xs text-slate-500"><p>الفترة السابقة</p><p className="text-2xl font-black text-slate-700">{fmtNum(s.prev_avg_score, 1)}</p><p className={clsx('font-black', (s.avg_score ?? 0) >= s.prev_avg_score ? 'text-emerald-700' : 'text-rose-700')}>{(s.avg_score ?? 0) >= s.prev_avg_score ? '▲' : '▼'} {fmtNum(Math.abs((s.avg_score ?? 0) - s.prev_avg_score), 1)}</p></div>}
          </div>
          <div className="mx-auto mt-8 grid max-w-lg grid-cols-4 gap-2 text-center text-[10px]">
            {[['موظف ببصمة', fmtInt(s.employees)], ['الالتزام بالحضور', `${fmtNum(s.attendance_rate, 1)}٪`], ['انضباط الدخول', `${fmtNum(s.punctuality_rate, 1)}٪`], ['تأخير مزمن', fmtInt(s.chronic_late)]].map(([k, v]) => <div key={k} className="rounded-xl border border-slate-200 bg-slate-50 p-2"><p className="text-slate-500">{k}</p><p className="text-base font-black tabular-nums">{v}</p></div>)}
          </div>
        </div>
        <div className="flex items-end justify-between text-[10px] text-slate-500"><p>أُعدّ بتاريخ <span dir="ltr">{today}</span>{preparedBy ? ` · ${preparedBy}` : ''}</p><p>المصدر: بصمات الحضور (ZKTeco/التطبيق) — المحرّك اليومي للموارد البشرية</p></div>
      </section>

      {/* الملخص التنفيذي */}
      <section className="bp-page">
        <h2 className="mb-2 text-base font-black text-[#0b3d6b]">1. الملخص التنفيذي</h2>
        <div className="grid grid-cols-2 gap-3">
          <Box title="المؤشرات الرئيسية">
            <table><tbody>
              {[['الموظفون الذين لديهم بصمة', fmtInt(s.employees)], ['متوسط درجة الانضباط', `${fmtNum(s.avg_score, 1)} / 100${s.prev_avg_score != null ? ` (السابقة ${fmtNum(s.prev_avg_score, 1)})` : ''}`], ['نسبة الالتزام بالحضور', `${fmtNum(s.attendance_rate, 1)}٪`], ['نسبة الانضباط بوقت الدخول', `${fmtNum(s.punctuality_rate, 1)}٪`], ['نسبة الخروج المبكر', `${fmtNum(s.early_leave_rate, 1)}٪`], ['نسبة الغياب بلا إجازة', `${fmtNum(s.absence_rate, 1)}٪`], ['نسبة البصمة الناقصة', `${fmtNum(s.incomplete_rate, 1)}٪`], ['مجموع دقائق التأخير', fmtInt(s.late_minutes)], ['متوسط التأخير في يوم التأخير', `${fmtNum(s.avg_late_minutes_per_late_day, 0)} د`], ['أيام الغياب', fmtInt(s.absent_days)], ['متأخرون بشكل مزمن', fmtInt(s.chronic_late)], ['درجة كاملة', fmtInt(s.perfect)], ['تحسّنوا / تراجعوا', `${fmtInt(s.improved)} / ${fmtInt(s.declined)}`]].map(([k, v]) => <tr key={k}><td className="font-bold">{k}</td><td className="tabular-nums">{v}</td></tr>)}
            </tbody></table>
          </Box>
          <Box title="توزيع التصنيفات">
            {GRADE_ORDER.map((gr) => { const n = s.grades[gr] ?? 0, p = s.employees ? (100 * n) / s.employees : 0; return (
              <div key={gr} className="mb-1.5 flex items-center gap-2 text-[10px]"><span className="w-14 font-bold" style={{ color: GRADE_META[gr].color }}>{GRADE_META[gr].label}</span><span className="h-3 flex-1 overflow-hidden rounded bg-slate-100"><span className="block h-full" style={{ width: `${p}%`, background: GRADE_META[gr].color }} /></span><span className="w-16 text-end tabular-nums">{fmtInt(n)} ({fmtNum(p, 0)}٪)</span></div>) })}
            <p className="mt-2 text-[9px] text-slate-500">ممتاز ≥ 90 · جيد جداً ≥ 80 · جيد ≥ 70 · مقبول ≥ 60 · ضعيف &lt; 60</p>
          </Box>
        </div>
        <Box title="قراءة الفترة"><ol className="list-decimal space-y-1 pe-4 text-[11px] leading-5">{insights.map((i, k) => <li key={k}>{i.text}</li>)}</ol></Box>
      </section>

      {/* الاتجاه والأنماط */}
      <section className="bp-page">
        <h2 className="mb-2 text-base font-black text-[#0b3d6b]">2. الاتجاه الزمني والأنماط</h2>
        <Box title={`متوسط الدرجة (${r.period.kind === 'monthly' ? 'أسبوعياً' : 'شهرياً'})`}>
          <MiniBars data={r.trend.map((t) => ({ label: t.label, value: t.avg_score ?? 0, color: scoreColor(t.avg_score) }))} />
          <table className="mt-2"><thead><tr><th>الفترة</th><th>من</th><th>إلى</th><th>متوسط الدرجة</th><th>تأخير ٪</th><th>غياب ٪</th><th>خروج مبكر ٪</th><th>موظفون</th></tr></thead>
            <tbody>{r.trend.map((t) => <tr key={t.label}><td>{t.label}</td><td dir="ltr">{t.from}</td><td dir="ltr">{t.to}</td><td className="font-black tabular-nums">{fmtNum(t.avg_score, 1)}</td><td className="tabular-nums">{fmtNum(t.late_rate, 1)}</td><td className="tabular-nums">{fmtNum(t.absence_rate, 1)}</td><td className="tabular-nums">{fmtNum(t.early_rate, 1)}</td><td className="tabular-nums">{fmtInt(t.employees)}</td></tr>)}</tbody></table>
        </Box>
        <div className="grid grid-cols-2 gap-3">
          <Box title="النمط الأسبوعي — نسبة التأخير ٪">
            <MiniBars data={r.weekdays.map((w) => ({ label: DOW_LABELS[w.dow]!, value: w.late_rate ?? 0 }))} max={Math.max(10, ...r.weekdays.map((w) => w.late_rate ?? 0))} color="#f59e0b" />
            <table className="mt-2"><thead><tr><th>اليوم</th><th>حضور</th><th>تأخير</th><th>٪</th><th>غياب</th><th>خروج مبكر</th></tr></thead>
              <tbody>{r.weekdays.map((w) => <tr key={w.dow}><td>{DOW_LABELS[w.dow]}</td><td className="tabular-nums">{fmtInt(w.worked_days)}</td><td className="tabular-nums">{fmtInt(w.late_days)}</td><td className="tabular-nums">{fmtNum(w.late_rate, 1)}</td><td className="tabular-nums">{fmtInt(w.absent_days)}</td><td className="tabular-nums">{fmtInt(w.early_days)}</td></tr>)}</tbody></table>
          </Box>
          <Box title="الأقسام حسب متوسط الدرجة">
            <table><thead><tr><th>القسم</th><th>موظفون</th><th>الدرجة</th><th>تأخير ٪</th><th>غياب ٪</th></tr></thead>
              <tbody>{r.departments.map((d) => <tr key={d.name}><td>{d.name}</td><td className="tabular-nums">{fmtInt(d.employees)}</td><td className="font-black tabular-nums" style={{ color: scoreColor(d.avg_score) }}>{fmtNum(d.avg_score, 1)}</td><td className="tabular-nums">{fmtNum(d.late_rate, 1)}</td><td className="tabular-nums">{fmtNum(d.absence_rate, 1)}</td></tr>)}</tbody></table>
          </Box>
        </div>
      </section>

      {/* الترتيب الكامل */}
      <section className="bp-page">
        <h2 className="mb-2 text-base font-black text-[#0b3d6b]">3. ترتيب الموظفين ({fmtInt(r.employees.length)})</h2>
        <table data-testid="print-ranking"><thead><tr><th>#</th><th>الموظف</th><th>القسم</th><th>الدرجة</th><th>التصنيف</th><th>التغيّر</th><th>متوقع</th><th>حضور</th><th>تأخير</th><th>د</th><th>غياب</th><th>خروج مبكر</th><th>ناقصة</th><th>ملاحظة</th></tr></thead>
          <tbody>{r.employees.map((e) => <tr key={e.employee_id}><td className="tabular-nums">{fmtInt(e.rank)}</td><td><b>{e.full_name}</b><br /><span className="text-[9px] text-slate-500" dir="ltr">{e.employee_number}</span></td><td>{e.department_name ?? '—'}</td><td className="font-black tabular-nums" style={{ color: scoreColor(e.score) }}>{fmtNum(e.score, 1)}</td><td style={{ color: GRADE_META[e.grade].color }}>{GRADE_META[e.grade].label}</td><td className="tabular-nums" dir="ltr">{e.delta == null ? '—' : `${e.delta > 0 ? '+' : ''}${fmtNum(e.delta, 1)}`}</td><td className="tabular-nums">{fmtInt(e.expected_days)}</td><td className="tabular-nums">{fmtInt(e.present_days)}</td><td className="tabular-nums">{fmtInt(e.late_days)}</td><td className="tabular-nums">{fmtInt(e.late_minutes)}</td><td className="tabular-nums">{fmtInt(e.absent_days)}</td><td className="tabular-nums">{fmtInt(e.early_days)}</td><td className="tabular-nums">{fmtInt(e.incomplete_days)}</td><td className="text-[9px]">{[e.chronic_late && 'تأخير مزمن', e.high_absence && 'غياب مرتفع', e.score >= 99.5 && 'درجة كاملة'].filter(Boolean).join(' · ')}</td></tr>)}</tbody>
          <tfoot><tr className="font-black"><td colSpan={3}>الإجمالي / المتوسط</td><td className="tabular-nums">{fmtNum(s.avg_score, 1)}</td><td /><td /><td /><td /><td className="tabular-nums">{fmtInt(totals.late)}</td><td className="tabular-nums">{fmtInt(s.late_minutes)}</td><td className="tabular-nums">{fmtInt(s.absent_days)}</td><td className="tabular-nums">{fmtInt(totals.early)}</td><td className="tabular-nums">{fmtInt(totals.inc)}</td><td /></tr></tfoot>
        </table>
      </section>

      {/* المتابعة والمنهجية والتواقيع */}
      <section className="bp-page">
        <h2 className="mb-2 text-base font-black text-[#0b3d6b]">4. يحتاجون متابعة ({fmtInt(followup.length)})</h2>
        {followup.length ? <table data-testid="print-followup"><thead><tr><th>الموظف</th><th>القسم</th><th>الدرجة</th><th>السبب</th><th>الإجراء المقترح</th></tr></thead>
          <tbody>{followup.map((e) => <tr key={e.employee_id}><td><b>{e.full_name}</b></td><td>{e.department_name ?? '—'}</td><td className="font-black tabular-nums" style={{ color: scoreColor(e.score) }}>{fmtNum(e.score, 1)}</td>
            <td>{[e.chronic_late && `تأخير مزمن (${fmtInt(e.late_days)} يوم / ${fmtInt(e.late_minutes)} د)`, e.high_absence && `غياب مرتفع (${fmtInt(e.absent_days)} يوم)`, !e.chronic_late && e.late_days > 0 && `تأخير ${fmtInt(e.late_days)} يوم`, e.early_days > 0 && `خروج مبكر ${fmtInt(e.early_days)} يوم`, e.incomplete_days > 0 && `بصمة ناقصة ${fmtInt(e.incomplete_days)} يوم`].filter(Boolean).join(' · ') || '—'}</td>
            <td>{e.chronic_late || e.high_absence ? 'تنبيه كتابي ومقابلة مع المسؤول المباشر' : e.score < 70 ? 'توجيه شفهي ومتابعة الشهر القادم' : 'متابعة اعتيادية'}</td></tr>)}</tbody></table> : <p className="text-xs text-slate-500">لا أحد دون 80 درجة.</p>}
        <Box title="المنهجية" className="mt-4">
          <p className="text-[10px] leading-5">الدرجة = {INDEX_ORDER.map((k) => `${r.weights[k]}٪ ${INDEX_META[k].label}`).join(' + ')}. {INDEX_ORDER.map((k) => `${INDEX_META[k].label}: ${INDEX_META[k].hint}`).join(' ')} بوابات: التأخير المزمن (≥ 30٪ من أيام الحضور) أو الغياب المرتفع (≥ 10٪ من الأيام المتوقعة و≥ يومين) يحدّان الدرجة بـ 69.9. الإجازات والزمنيات المعتمدة محايدة ولا تُحتسب غياباً. يُستبعد من ليس له بصمة في الفترة.</p>
        </Box>
        <div className="mt-10 grid grid-cols-3 gap-6 text-center text-[11px]">
          {['مسؤول الموارد البشرية', 'معاون المدير المفوض', 'المدير المفوض'].map((t) => <div key={t}><div className="mb-1 h-14 border-b border-slate-400" /><p className="font-black">{t}</p><p className="text-slate-400">الاسم والتوقيع</p></div>)}
        </div>
      </section>
      <div className="bp-foot"><span>شركة جزيرة الأكارم — تقرير سلوك الموظفين — {title}</span><span dir="ltr">{today}</span></div>
    </div>
  )
}
