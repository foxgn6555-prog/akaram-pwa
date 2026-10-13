/**
 * 00245 — ميزان «بنك الساعات الشهري» في حضوريات غرفة العمليات (يُعرض قبل الاعتماد وبعده).
 *   لكل موظف: المطلوب (أيام × دقائق الشفت)، المعمول، الصافي ±، عجز يُستقطع أو فائض يتحول رصيد إجازة (بسقف).
 *   يظهر فقط عندما تكون طريقة النقص في وحدة الاستقطاعات التلقائية = بنك الساعات (لموظف واحد على الأقل).
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import type { HourBankRow } from '@features/hr'
import { StatCard } from '@portals/hr/components/hr-ui'
import { fmtMinutes } from '@portals/hr/components/hr-format'
import { SectionCard } from './AttendanceStages'

const fmtSigned = (m: number) => (m === 0 ? '0' : `${m > 0 ? '+' : '−'}${fmtMinutes(Math.abs(m))}`)

export function HourBankPanel({ rows, month, search }: { rows: HourBankRow[]; month: string; search?: string }) {
  const [filter, setFilter] = useState<'all' | 'deficit' | 'surplus'>('all')
  const active = useMemo(() => rows.filter((r) => r.enabled), [rows])
  const totals = useMemo(() => active.reduce((a, r) => {
    a.required += r.required_minutes; a.credited += r.credited_minutes
    if (r.deduction_minutes > 0) { a.deficitCount += 1; a.deficit += r.deduction_minutes }
    if (r.credit_days > 0) { a.creditCount += 1; a.creditDays += r.credit_days }
    return a
  }, { required: 0, credited: 0, deficit: 0, deficitCount: 0, creditDays: 0, creditCount: 0 }), [active])
  if (active.length === 0) return null
  const q = (search ?? '').trim()
  const list = active.filter((r) => (filter === 'deficit' ? r.deduction_minutes > 0 : filter === 'surplus' ? r.net_minutes > 0 : true))
    .filter((r) => !q || (r.full_name ?? '').includes(q) || (r.employee_number ?? '').includes(q))
  return (
    <SectionCard title={`ميزان بنك الساعات — ${month.slice(0, 7)}`} testId="ops-hour-bank"
      badge={<span className="text-[11px] text-slate-500" data-testid="ops-hb-count">{active.length} موظفاً · السماحية {active[0]?.grace_minutes ?? 0} د · الإجازة الشهرية {Number(active[0]?.off_days ?? 0).toFixed(2)} يوم</span>}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="ops-hb-summary">
        <StatCard title="المطلوب (الكل)" value={fmtMinutes(totals.required)} tone="slate" testId="ops-hb-required" />
        <StatCard title="المعمول (الكل)" value={fmtMinutes(totals.credited)} tone="sky" testId="ops-hb-credited" />
        <StatCard title="موظفون بعجز يُستقطع" value={totals.deficitCount} tone={totals.deficitCount ? 'red' : 'emerald'} testId="ops-hb-deficit" hint={totals.deficit ? `إجمالي العجز ${fmtMinutes(totals.deficit)}` : 'لا عجز'} />
        <StatCard title="موظفون بفائض ⇒ رصيد إجازة" value={totals.creditCount} tone="emerald" testId="ops-hb-credit" hint={totals.creditDays ? `إجمالي ${totals.creditDays} يوم` : '—'} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]" data-testid="ops-hb-filters">
        {([['all', 'الكل'], ['deficit', 'عجز فقط'], ['surplus', 'فائض فقط']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} className={clsx('rounded-full px-2.5 py-1 font-bold ring-1', filter === k ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-200')} data-testid={`ops-hb-filter-${k}`}>{l}</button>
        ))}
        <span className="text-slate-500">القاعدة: المطلوب = min(أيام الشهر − الإجازة الشهرية، أيام الحضور) × دقائق الشفت · العجز يُستقطع بالدقيقة · الفائض رصيد إجازة بسقف · الغياب يوم كامل خارج البنك.</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-xs" data-testid="ops-hb-table" dir="rtl">
          <thead className="bg-slate-50 text-slate-600">
            <tr><th className="p-2 text-start">الموظف</th><th className="p-2">أيام الحضور</th><th className="p-2">غياب</th><th className="p-2">إجازة</th><th className="p-2">المطلوب</th><th className="p-2">المعمول</th><th className="p-2">الصافي</th><th className="p-2 text-start">النتيجة</th></tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.employee_id} className="border-t border-slate-100" data-testid={`ops-hb-row-${r.employee_number ?? r.employee_id}`}>
                <td className="p-2 text-start"><span className="font-bold">{r.full_name}</span><span className="ms-1 text-slate-500" dir="ltr">{r.employee_number}</span>{r.department_name && <span className="block text-[10px] text-slate-500">{r.department_name}</span>}</td>
                <td className="p-2 text-center tabular-nums">{r.days_counted}<span className="text-slate-400"> / {r.covered_days}</span></td>
                <td className={clsx('p-2 text-center tabular-nums', r.days_absent > 0 && 'font-bold text-red-700')}>{r.days_absent}</td>
                <td className="p-2 text-center tabular-nums">{r.days_leave_paid + r.days_leave_unpaid}</td>
                <td className="p-2 text-center tabular-nums" dir="ltr">{fmtMinutes(r.required_minutes)}<span className="block text-[10px] text-slate-400">{Number(r.required_days)} يوم × {r.shift_minutes} د</span></td>
                <td className="p-2 text-center tabular-nums" dir="ltr">{fmtMinutes(r.credited_minutes)}</td>
                <td className={clsx('p-2 text-center font-black tabular-nums', r.net_minutes < 0 ? 'text-red-700' : r.net_minutes > 0 ? 'text-emerald-700' : 'text-slate-600')} dir="ltr" data-testid={`ops-hb-net-${r.employee_number ?? r.employee_id}`}>{fmtSigned(r.net_minutes)}</td>
                <td className="p-2 text-start" data-testid={`ops-hb-result-${r.employee_number ?? r.employee_id}`}>
                  {r.deduction_minutes > 0
                    ? <span className="rounded-full bg-red-50 px-2 py-0.5 font-bold text-red-800 ring-1 ring-red-200">يُستقطع {fmtMinutes(r.deduction_minutes)}</span>
                    : r.credit_days > 0
                      ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-800 ring-1 ring-emerald-200">رصيد إجازة {Number(r.credit_days)} يوم{r.credit_capped ? ` (سقف ${Number(r.credit_cap_days)})` : ''}</span>
                      : r.surplus_minutes > 0
                        ? <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-700">فائض {fmtMinutes(r.surplus_minutes)} دون السقف/التحويل</span>
                        : <span className="text-slate-500">متوازن</span>}
                  {r.days_absent > 0 && <span className="ms-1 text-[10px] text-slate-500">+ {r.days_absent} يوم غياب خارج البنك</span>}
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={8} className="p-3 text-center text-slate-500">لا نتائج لهذا الفلتر</td></tr>}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}
