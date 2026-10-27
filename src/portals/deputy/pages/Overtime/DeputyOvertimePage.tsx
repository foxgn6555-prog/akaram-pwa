/**
 * 00353 — وحدة «الساعات الإضافية المدفوعة» في بوابة معاون المدير المفوض.
 *   النظام يفعّله/يوقفه التطوير المركزية من سياسة الموارد البشرية (افتراضياً متوقف)، ولا يسري إلا على موظفين يُدرجهم المعاون بالاسم من تبويب «المشمولون»
 *   (غير المشمول يبقى على رصيد الإجازات كما هو). للمشمول تتوقف إضافة الإضافي إلى رصيد الإجازات وتُعرض هنا دقائقه في الشهر (قبل الشفت / بعده بحسب الإعداد) مع أجر الساعة (من الراتب: أجر اليوم ÷ ساعات الشفت، أو ثابت بقرار المعاون)
 *   والمبلغ المستحق. المعاون يصرف أو يرفض؛ المصروف يظهر في كشف الرواتب سطراً مستقلاً يُضاف إلى الصافي (لا ضريبة ولا استقطاع عليه).
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { StatCard } from '@portals/hr/components/hr-ui'
import { field, fmtMoney, fmtTime, monthStart } from '@portals/hr/components/hr-format'
import { useOvertimeCancel, useOvertimeDays, useOvertimeHistory, useOvertimeMemberEvents, useOvertimeMemberSet, useOvertimeOverview, useOvertimePay, useOvertimeRateSet, useOvertimeRates, useOvertimeReject, type OvertimeEmployee, type OvertimeRateRow } from '@features/hr'

const fmtMin = (m: number) => (m <= 0 ? '0' : m >= 60 ? `${Math.floor(m / 60)}س ${m % 60 ? `${m % 60}د` : ''}`.trim() : `${m}د`)
const fmtHours = (m: number) => (Math.round((m / 60) * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })
const fmtMonth = (m: string | null | undefined) => (m ? m.slice(0, 7) : '—')
const fmtDate = (d: string | null | undefined) => (d ? d.slice(0, 16).replace('T', ' ') : '—')
const shiftMonth = (m: string, delta: number) => { const d = new Date(`${m.slice(0, 7)}-01T00:00:00`); d.setMonth(d.getMonth() + delta); return monthStart(d) }
const SOURCE = { fixed: { label: 'أجر ثابت', cls: 'bg-amber-100 text-amber-800' }, salary: { label: 'من الراتب', cls: 'bg-slate-100 text-slate-700' }, none: { label: 'بلا أجر', cls: 'bg-rose-100 text-rose-800' } } as const
const STATUS = { paid: { label: 'مصروف', cls: 'bg-emerald-100 text-emerald-800' }, rejected: { label: 'مرفوض', cls: 'bg-rose-100 text-rose-800' }, cancelled: { label: 'مُلغى', cls: 'bg-slate-100 text-slate-600' } } as const
type Filter = 'all' | 'pending' | 'paid' | 'rejected'

export default function DeputyOvertimePage() {
  const [month, setMonth] = useState(monthStart())
  const q = useOvertimeOverview(month)
  const o = q.data
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<OvertimeEmployee | null>(null)
  const [tab, setTab] = useState<'month' | 'members' | 'history'>('month')
  const [memberFilter, setMemberFilter] = useState<'all' | 'members' | 'others'>('all')
  const [rateEdit, setRateEdit] = useState<OvertimeRateRow | null>(null)
  const pay = useOvertimePay(); const reject = useOvertimeReject(); const cancel = useOvertimeCancel(); const rateSet = useOvertimeRateSet(); const memberSet = useOvertimeMemberSet()
  const rates = useOvertimeRates(tab === 'members')
  const memberEvents = useOvertimeMemberEvents(tab === 'members')
  const history = useOvertimeHistory(tab === 'history')

  const emps = useMemo(() => o?.employees ?? [], [o])
  const pending = emps.filter((e) => !e.payout && e.payable_minutes > 0)
  const paid = emps.filter((e) => e.payout?.status === 'paid')
  const paidTotal = paid.reduce((s, e) => s + (e.payout?.amount ?? 0), 0)
  const pendingTotal = pending.reduce((s, e) => s + e.amount, 0)
  const qq = search.trim()
  const shown = emps.filter((e) => {
    const st: Filter = e.payout?.status === 'paid' ? 'paid' : e.payout?.status === 'rejected' ? 'rejected' : 'pending'
    return (filter === 'all' || st === filter) && (!qq || e.full_name.includes(qq) || e.employee_number.includes(qq) || (e.department_name ?? '').includes(qq))
  })
  const s = o?.settings
  const unitLabel = s?.unit === 'minutes' ? 'بالدقيقة' : 'بالساعة الكاملة (كسور الساعة لا تُحتسب)'
  const scopeLabel = s ? [s.before_shift && 'قبل الشفت', s.after_shift && 'بعد الشفت'].filter(Boolean).join(' + ') || 'لا شيء' : '—'
  const currentMonth = monthStart()

  const doPay = async (e: OvertimeEmployee) => {
    const note = window.prompt(`صرف ${fmtHours(e.payable_minutes)} ساعة لـ ${e.full_name} عن ${fmtMonth(month)} بمبلغ ${fmtMoney(e.amount)}.\nيُصرف ضمن راتب شهر ${fmtMonth(o?.payroll_month)}.\nملاحظة (اختيارية):`, '')
    if (note === null) return
    try { await pay.mutateAsync({ employeeId: e.employee_id, month, note: note.trim() || null }) } catch { /* toast */ }
  }
  const doReject = async (e: OvertimeEmployee) => {
    const note = window.prompt(`رفض صرف ساعات ${e.full_name} عن ${fmtMonth(month)}.\nالسبب (إلزامي):`)
    if (!note || note.trim().length < 3) return
    try { await reject.mutateAsync({ employeeId: e.employee_id, month, note: note.trim() }) } catch { /* toast */ }
  }
  const doMember = async (r: OvertimeRateRow) => {
    const note = r.member
      ? window.prompt(`إزالة ${r.full_name} من المشمولين — يعود إلى رصيد الإجازات من الشهر غير المقفل.\nالسبب (إلزامي):`)
      : window.prompt(`إدراج ${r.full_name} في الساعات الإضافية المدفوعة — ساعاته تُصرف نقداً ولا تُضاف إلى رصيد إجازاته.\nملاحظة (اختيارية):`, '')
    if (note === null) return
    if (r.member && note.trim().length < 3) return
    try { await memberSet.mutateAsync({ employeeId: r.employee_id, active: !r.member, note: note.trim() || null }) } catch { /* toast */ }
  }
  const doCancel = async (e: OvertimeEmployee) => {
    if (!e.payout) return
    const note = window.prompt(`إلغاء قرار «${STATUS[e.payout.status].label}» لـ ${e.full_name} — يعود إلى «بانتظار القرار».\nالسبب (إلزامي):`)
    if (!note || note.trim().length < 3) return
    try { await cancel.mutateAsync({ payoutId: e.payout.id, note: note.trim() }) } catch { /* toast */ }
  }

  return (
    <div className="space-y-4" data-testid="deputy-overtime">
      <ExecPageHeader icon="clock" title="الساعات الإضافية المدفوعة" subtitle="لموظفين تُدرجهم أنت بالاسم فقط: دقائق العمل قبل الشفت وبعده تُصرف نقداً بقرارك — أجر الساعة من الراتب (أجر اليوم ÷ ساعات الشفت) أو أجر ثابت تحدده للموظف. غير المشمول يبقى على رصيد الإجازات. المصروف سطر مستقل في كشف الرواتب يُضاف إلى الصافي بلا ضريبة ولا استقطاع."
        stats={[
          { label: 'حالة النظام', value: s ? (s.enabled ? 'مفعّل' : 'متوقف') : '—', tone: s?.enabled ? 'green' : 'red', testId: 'ot-enabled' },
          { label: 'الموظفون المشمولون', value: o?.members_count ?? '—', tone: o?.members_count ? 'plain' : 'red', testId: 'ot-members' },
          { label: 'بانتظار القرار', value: pending.length, tone: pending.length ? 'gold' : 'plain', testId: 'ot-pending' },
          { label: 'مصروف هذا الشهر', value: fmtMoney(paidTotal), tone: 'green', testId: 'ot-paid-total' },
        ]} />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-0.5">{([['month', 'ساعات الشهر'], ['members', 'المشمولون وأجر الساعة'], ['history', 'سجل القرارات']] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={clsx('rounded-lg px-3 py-1 text-xs font-bold', tab === k ? 'bg-white shadow' : 'text-slate-600')} data-testid={`ot-tab-${k}`}>{l}</button>))}</div>
        {tab === 'month' && (
          <div className="flex items-center gap-1" data-testid="ot-month-nav">
            <Button size="sm" variant="secondary" onClick={() => setMonth((m) => shiftMonth(m, -1))} data-testid="ot-prev">‹ السابق</Button>
            <input type="month" className={clsx(field, 'w-40')} value={month.slice(0, 7)} onChange={(e) => e.target.value && setMonth(`${e.target.value}-01`)} data-testid="ot-month" />
            <Button size="sm" variant="secondary" onClick={() => setMonth((m) => shiftMonth(m, 1))} disabled={month >= currentMonth} data-testid="ot-next">التالي ›</Button>
          </div>
        )}
        {s && (
          <div className="ms-auto flex flex-wrap gap-1 text-[11px]" data-testid="ot-settings">
            <span className="rounded-full bg-slate-100 px-2 py-0.5">الاحتساب: <b>{unitLabel}</b></span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5">النطاق: <b>{scopeLabel}</b></span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5">أقل كتلة يومية: <b>{s.min_block_minutes} د</b></span>
          </div>
        )}
      </div>

      {s && !s.enabled && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" data-testid="ot-disabled-note">النظام متوقف حالياً: الدقائق تُعرض للاطلاع فقط ولا يمكن صرفها، ويستمر تحويل الإضافي إلى رصيد إجازات كالمعتاد. التفعيل من التطوير المركزية ← سياسة الموارد البشرية.</p>}
      {s?.enabled && o && o.members_count === 0 && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900" data-testid="ot-no-members-note">النظام مفعّل لكن لا أحد مشمول بعد — لن تُصرف ساعات لأي موظف حتى تُدرجه بالاسم من تبويب «المشمولون وأجر الساعة».</p>}

      {tab === 'month' && (q.isLoading || !o ? <LoadingSpinner /> : (
        <>
          <section className="grid grid-cols-2 gap-2 lg:grid-cols-5" data-testid="ot-stats">
            <StatCard title="مشمولون لديهم دقائق" value={emps.filter((e) => e.counted_minutes > 0).length} tone="slate" hint="غير المشمولين لا يظهرون هنا — ساعاتهم رصيد إجازات" testId="ot-k-emps" />
            <StatCard title="مجموع الساعات القابلة للصرف" value={fmtHours(emps.reduce((a, e) => a + e.payable_minutes, 0))} tone="sky" hint={`دقائق خام: قبل ${fmtMin(emps.reduce((a, e) => a + e.early_minutes, 0))} · بعد ${fmtMin(emps.reduce((a, e) => a + e.late_minutes, 0))}`} testId="ot-k-hours" />
            <StatCard title="يُصرف ضمن راتب شهر" value={fmtMonth(o.payroll_month)} tone={o.payroll_month && o.payroll_month !== o.month ? 'amber' : 'emerald'} hint={o.month_locked ? 'شهر العمل معتمد من المالية ⇒ يُرحَّل لأول شهر مفتوح' : 'شهر العمل نفسه'} testId="ot-k-payroll" />
            <StatCard title="مستحق غير مصروف" value={fmtMoney(pendingTotal)} tone={pendingTotal ? 'amber' : 'slate'} hint={`${pending.length} بانتظار القرار`} testId="ot-pending-total" />
            <StatCard title="حالة كشف الشهر" value={o.export_status === 'approved' ? 'معتمد' : o.export_status === 'exported' ? 'مُصدَّر' : 'لم يُصدَّر'} tone="violet" hint={o.export_review_status === 'approved' ? 'مراجعة المعاون معتمدة' : ''} testId="ot-k-export" />
          </section>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <input className={clsx(field, 'w-56')} placeholder="بحث: اسم، رقم، قسم" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="ot-search" />
            <div className="flex gap-1">{(['all', 'pending', 'paid', 'rejected'] as const).map((f) => <button key={f} type="button" onClick={() => setFilter(f)} className={clsx('rounded-lg px-2.5 py-1 text-[11px] font-bold', filter === f ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700')} data-testid={`ot-filter-${f}`}>{{ all: 'الكل', pending: 'بانتظار القرار', paid: 'مصروف', rejected: 'مرفوض' }[f]}</button>)}</div>
          </div>

          {emps.length === 0 ? <EmptyState title="لا دقائق إضافية للمشمولين في هذا الشهر" hint="تظهر الأسماء تلقائياً عندما يبصم موظف مشمول قبل بداية شفته أو بعد نهايته (ويومه بلا نقص). أدرج الموظفين من تبويب «المشمولون وأجر الساعة»." /> : (
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="ot-table">
              <div className="overflow-x-auto"><table className="w-full min-w-[64rem] text-xs">
                <thead className="bg-slate-50 text-[11px] text-slate-600"><tr>
                  <th className="px-3 py-2 text-start">الموظف</th><th className="px-2 py-2">أيام</th><th className="px-2 py-2">قبل الشفت</th><th className="px-2 py-2">بعد الشفت</th><th className="px-2 py-2">المحتسب</th><th className="px-2 py-2">ساعات الصرف</th>
                  <th className="px-2 py-2">أجر الساعة</th><th className="px-2 py-2">المبلغ</th><th className="px-2 py-2">الحالة</th><th className="px-2 py-2">إجراء</th></tr></thead>
                <tbody>{shown.map((e) => {
                  const p = e.payout
                  return (
                    <tr key={e.employee_id} className="border-t border-slate-100" data-testid={`ot-row-${e.employee_number}`}>
                      <td className="px-3 py-2"><button type="button" className="text-start" onClick={() => setDetail(e)} data-testid={`ot-open-${e.employee_number}`}><div className="font-bold underline decoration-dotted">{e.full_name}</div><div className="text-[10px] text-slate-500">{e.employee_number}{e.department_name ? ` · ${e.department_name}` : ''}{!e.member && <span className="ms-1 rounded bg-rose-100 px-1 font-bold text-rose-800" data-testid={`ot-notmember-${e.employee_number}`}>غير مشمول حالياً</span>}</div></button></td>
                      <td className="px-2 py-2 text-center tabular-nums">{e.days_count}</td>
                      <td className="px-2 py-2 text-center tabular-nums" data-testid={`ot-early-${e.employee_number}`}>{fmtMin(e.early_minutes)}</td>
                      <td className="px-2 py-2 text-center tabular-nums" data-testid={`ot-late-${e.employee_number}`}>{fmtMin(e.late_minutes)}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{fmtMin(e.counted_minutes)}</td>
                      <td className="px-2 py-2 text-center text-sm font-black tabular-nums" data-testid={`ot-hours-${e.employee_number}`}>{fmtHours(e.payable_minutes)}</td>
                      <td className="px-2 py-2 text-center tabular-nums"><div>{fmtMoney(p?.hour_rate ?? e.hour_rate)}</div><span className={clsx('rounded-full px-1.5 py-0.5 text-[10px] font-black', SOURCE[p?.rate_source ?? e.rate_source].cls)} data-testid={`ot-source-${e.employee_number}`}>{SOURCE[p?.rate_source ?? e.rate_source].label}</span></td>
                      <td className="px-2 py-2 text-center text-sm font-black tabular-nums" data-testid={`ot-amount-${e.employee_number}`}>{fmtMoney(p?.status === 'paid' ? p.amount : e.amount)}</td>
                      <td className="px-2 py-2 text-center">
                        {p ? <><span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-black', STATUS[p.status].cls)} data-testid={`ot-status-${e.employee_number}`}>{STATUS[p.status].label}</span>
                          <div className="text-[10px] text-slate-500">{p.status === 'paid' ? `راتب ${fmtMonth(p.payroll_month)}${p.settled ? ' · معتمد' : ''}` : ''}{p.note ? ` · ${p.note}` : ''}</div>
                          {p.changed_since && <div className="text-[10px] font-bold text-amber-700" data-testid={`ot-changed-${e.employee_number}`}>تغيّرت الدقائق بعد الصرف (الآن {fmtMin(e.counted_minutes)} مقابل {fmtMin(p.counted_minutes)})</div>}</>
                          : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800" data-testid={`ot-status-${e.employee_number}`}>{e.payable_minutes > 0 ? 'بانتظار القرار' : 'أقل من ساعة'}</span>}
                      </td>
                      <td className="px-2 py-2"><div className="flex justify-center gap-1">
                        {!p && <Button size="sm" onClick={() => void doPay(e)} disabled={!s?.enabled || !e.member || e.payable_minutes <= 0 || e.rate_source === 'none'} isLoading={pay.isPending} data-testid={`ot-pay-${e.employee_number}`}>صرف</Button>}
                        {!p && <Button size="sm" variant="secondary" onClick={() => void doReject(e)} disabled={!s?.enabled} isLoading={reject.isPending} data-testid={`ot-reject-${e.employee_number}`}>رفض</Button>}
                        {p && !p.settled && <Button size="sm" variant="secondary" onClick={() => void doCancel(e)} isLoading={cancel.isPending} data-testid={`ot-cancel-${e.employee_number}`}>إلغاء القرار</Button>}
                      </div></td>
                    </tr>
                  )
                })}</tbody>
              </table></div>
              {!shown.length && <p className="p-4 text-center text-xs text-slate-500">لا نتائج</p>}
            </section>
          )}
          <p className="text-[11px] text-slate-500" data-testid="ot-formula">المعادلة: أجر الساعة من الراتب = أجر اليوم ÷ (دقائق الشفت ÷ 60) · المبلغ = ساعات الصرف × أجر الساعة. مثال: راتب 900,000 ÷ 30 يوماً = 30,000 لليوم ÷ 8 ساعات = 3,750 للساعة؛ 10 ساعات إضافية = <b>37,500</b> تُضاف إلى الصافي دون ضريبة.</p>
        </>
      ))}

      {tab === 'members' && (rates.isLoading ? <LoadingSpinner /> : (
        <>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="ot-rates">
            <div className="flex flex-wrap items-center gap-2 p-3">
              <input className={clsx(field, 'w-56')} placeholder="بحث: اسم، رقم، قسم" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="ot-rates-search" />
              <div className="flex gap-1">{(['all', 'members', 'others'] as const).map((f) => <button key={f} type="button" onClick={() => setMemberFilter(f)} className={clsx('rounded-lg px-2.5 py-1 text-[11px] font-bold', memberFilter === f ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700')} data-testid={`ot-mfilter-${f}`}>{{ all: 'الكل', members: 'المشمولون', others: 'غير المشمولين' }[f]}</button>)}</div>
              <span className="text-[11px] text-slate-500">الصرف النقدي يسري فقط على من تُدرجه هنا بالاسم؛ الباقون يبقون على رصيد الإجازات. الافتراضي للمشمول: أجر الساعة من راتبه — ويمكنك تحديد أجر ثابت له.</span>
            </div>
            <div className="overflow-x-auto"><table className="w-full min-w-[56rem] text-xs">
              <thead className="bg-slate-50 text-[11px] text-slate-600"><tr><th className="px-3 py-2 text-start">الموظف</th><th className="px-2 py-2">الشمول</th><th className="px-2 py-2">من الراتب</th><th className="px-2 py-2">أجر ثابت</th><th className="px-2 py-2">الفعّال</th><th className="px-2 py-2">ملاحظة</th><th className="px-2 py-2">إجراء</th></tr></thead>
              <tbody>{(rates.data ?? []).filter((r) => (memberFilter === 'all' || (memberFilter === 'members') === r.member) && (!qq || r.full_name.includes(qq) || r.employee_number.includes(qq) || (r.department_name ?? '').includes(qq))).map((r) => (
                <tr key={r.employee_id} className={clsx('border-t border-slate-100', !r.member && 'bg-slate-50/60 text-slate-500')} data-testid={`ot-rate-row-${r.employee_number}`}>
                  <td className="px-3 py-2"><div className="font-bold">{r.full_name}</div><div className="text-[10px] text-slate-500">{r.employee_number}{r.department_name ? ` · ${r.department_name}` : ''}</div></td>
                  <td className="px-2 py-2 text-center"><span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-black', r.member ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600')} data-testid={`ot-member-${r.employee_number}`}>{r.member ? `مشمول منذ ${r.member_since ?? ''}` : 'غير مشمول'}</span>{r.member && r.member_note && <div className="text-[10px] text-slate-500">{r.member_note}</div>}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{r.salary_source === 'none' && !r.enabled ? <span className="text-rose-700">بلا ملف راتب</span> : r.enabled ? '—' : fmtMoney(r.salary_hour_rate)}</td>
                  <td className="px-2 py-2 text-center tabular-nums" data-testid={`ot-rate-fixed-${r.employee_number}`}>{r.enabled ? fmtMoney(r.hourly_amount) : <span className="text-slate-400">متوقف</span>}</td>
                  <td className="px-2 py-2 text-center">{r.member ? <span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-black', SOURCE[r.enabled ? 'fixed' : r.salary_source].cls)}>{SOURCE[r.enabled ? 'fixed' : r.salary_source].label}</span> : <span className="text-[10px]">رصيد إجازات</span>}</td>
                  <td className="px-2 py-2 text-[11px] text-slate-600">{r.note ?? ''}</td>
                  <td className="px-2 py-2"><div className="flex justify-center gap-1">
                    <Button size="sm" variant={r.member ? 'secondary' : 'primary'} onClick={() => void doMember(r)} isLoading={memberSet.isPending} data-testid={`ot-member-toggle-${r.employee_number}`}>{r.member ? 'إزالة من المشمولين' : 'إدراج'}</Button>
                    {r.member && <Button size="sm" variant="secondary" onClick={() => setRateEdit(r)} data-testid={`ot-rate-edit-${r.employee_number}`}>{r.enabled ? 'تعديل الأجر' : 'أجر ثابت'}</Button>}
                  </div></td>
                </tr>))}</tbody>
            </table></div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" data-testid="ot-member-events">
            <h3 className="text-xs font-black">سجل الإدراج والإزالة</h3>
            {memberEvents.isLoading ? <LoadingSpinner /> : !memberEvents.data?.length ? <p className="mt-2 text-[11px] text-slate-500">لا تغييرات بعد</p> : (
              <ul className="mt-2 divide-y divide-slate-100 text-[11px]">{memberEvents.data.map((ev) => <li key={ev.id} className="flex flex-wrap items-center gap-2 py-1.5" data-testid="ot-member-event">
                <span className={clsx('rounded px-1.5 py-0.5 font-black', ev.action === 'add' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800')}>{ev.action === 'add' ? 'إدراج' : 'إزالة'}</span>
                <span className="font-bold">{ev.full_name}</span><span className="text-slate-500">{ev.employee_number}</span>
                {ev.note && <span className="text-slate-600">— {ev.note}</span>}
                <span className="ms-auto text-slate-400">{ev.actor_name ?? ''} · {fmtDate(ev.created_at)}</span>
              </li>)}</ul>
            )}
          </section>
        </>
      ))}

      {tab === 'history' && (history.isLoading ? <LoadingSpinner /> : !history.data?.length ? <EmptyState title="لا قرارات بعد" /> : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid="ot-history">
          <table className="w-full text-xs"><thead className="bg-slate-50 text-[11px] text-slate-600"><tr><th className="px-3 py-2 text-start">الموظف</th><th>شهر العمل</th><th>شهر الراتب</th><th>الساعات</th><th>أجر الساعة</th><th>المبلغ</th><th>القرار</th><th className="text-start">بواسطة / السبب</th></tr></thead>
            <tbody>{history.data.map((h) => <tr key={h.id} className="border-t border-slate-100 tabular-nums" data-testid="ot-history-row">
              <td className="px-3 py-1.5"><b>{h.full_name}</b> <span className="text-[10px] text-slate-500">{h.employee_number}</span></td><td className="text-center">{fmtMonth(h.period_month)}</td><td className="text-center">{fmtMonth(h.payroll_month)}</td>
              <td className="text-center">{fmtHours(h.payable_minutes)}</td><td className="text-center">{fmtMoney(h.hour_rate)}</td><td className="text-center font-black">{fmtMoney(h.amount)}</td>
              <td className="text-center"><span className={clsx('rounded-full px-2 py-0.5 text-[10px] font-black', STATUS[h.status].cls)}>{STATUS[h.status].label}</span></td>
              <td className="px-2 py-1.5 text-[11px] text-slate-600">{h.decided_by_name ?? ''} · {fmtDate(h.decided_at)}{h.note ? ` — ${h.note}` : ''}{h.status === 'cancelled' ? ` · أُلغي: ${h.cancelled_by_name ?? ''} ${fmtDate(h.cancelled_at)} — ${h.cancel_note ?? ''}` : ''}</td>
            </tr>)}</tbody></table>
        </section>
      ))}

      {detail && <DaysDialog e={detail} month={month} onClose={() => setDetail(null)} />}
      {rateEdit && <RateDialog r={rateEdit} busy={rateSet.isPending} onClose={() => setRateEdit(null)}
        onSave={async (enabled, amount, note) => { try { await rateSet.mutateAsync({ employeeId: rateEdit.employee_id, enabled, amount, note }); setRateEdit(null) } catch { /* toast */ } }} />}
    </div>
  )
}

function DaysDialog({ e, month, onClose }: { e: OvertimeEmployee; month: string; onClose: () => void }) {
  const q = useOvertimeDays(e.employee_id, month)
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3" role="dialog" aria-modal="true" data-testid="ot-days-dialog">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-black">تفصيل أيام {e.full_name} — {fmtMonth(month)}</h2><button type="button" className="text-slate-500" onClick={onClose} aria-label="إغلاق">✕</button></div>
        <p className="mb-2 text-[11px] text-slate-600">أجر اليوم {e.day_rate != null ? fmtMoney(e.day_rate) : '—'} · دقائق الشفت {e.shift_minutes} · أجر الساعة <b>{fmtMoney(e.hour_rate)}</b> ({SOURCE[e.rate_source].label}) · المحتسب {fmtMin(e.counted_minutes)} ⇒ ساعات الصرف <b>{fmtHours(e.payable_minutes)}</b> ⇒ <b>{fmtMoney(e.amount)}</b></p>
        {q.isLoading ? <LoadingSpinner /> : !q.data?.length ? <p className="text-xs text-slate-500">لا أيام</p> : (
          <table className="w-full text-[11px]"><thead className="text-slate-500"><tr><th className="text-start">اليوم</th><th>الشفت</th><th>المتوقع</th><th>الفعلي</th><th>قبل</th><th>بعد</th><th>المحتسب</th></tr></thead>
            <tbody>{q.data.map((d) => <tr key={d.work_date} className="border-t border-slate-100 tabular-nums" data-testid="ot-day-row">
              <td className="py-1">{d.work_date}</td><td className="text-center">{d.shift_name ?? ''}</td><td className="text-center" dir="ltr">{fmtTime(d.expected_in)}–{fmtTime(d.expected_out)}</td><td className="text-center" dir="ltr">{fmtTime(d.check_in)}–{fmtTime(d.check_out)}</td>
              <td className="text-center">{fmtMin(d.early_minutes)}</td><td className="text-center">{fmtMin(d.late_minutes)}</td><td className={clsx('text-center font-bold', d.counted_minutes === 0 && 'text-slate-400')}>{fmtMin(d.counted_minutes)}</td>
            </tr>)}</tbody></table>
        )}
      </div>
    </div>
  )
}

function RateDialog({ r, busy, onClose, onSave }: { r: OvertimeRateRow; busy: boolean; onClose: () => void; onSave: (enabled: boolean, amount: number, note: string | null) => Promise<void> }) {
  const [enabled, setEnabled] = useState(r.enabled)
  const [amount, setAmount] = useState(String(r.hourly_amount || ''))
  const [note, setNote] = useState(r.note ?? '')
  const v = Number(amount)
  const bad = enabled && (Number.isNaN(v) || v <= 0)
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-3" role="dialog" aria-modal="true" data-testid="ot-rate-dialog">
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-black">أجر الساعة الثابت — {r.full_name}</h2><button type="button" className="text-slate-500" onClick={onClose} aria-label="إغلاق">✕</button></div>
        <p className="mb-3 text-[11px] text-slate-500">من الراتب حالياً: {r.salary_source === 'none' ? 'بلا ملف راتب' : `${fmtMoney(r.salary_hour_rate)} للساعة`}</p>
        <label className="mb-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} data-testid="ot-rate-enabled" /> تفعيل أجر ثابت لكل ساعة (بدل الحساب من الراتب)</label>
        {enabled && <label className="mb-3 block text-[11px] text-slate-600">المبلغ لكل ساعة (دينار)<input type="number" min={1} className={clsx(field, 'block w-40')} value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="ot-rate-amount" /></label>}
        <label className="mb-3 block text-[11px] text-slate-600">ملاحظة (اختيارية)<input className={clsx(field, 'block')} value={note} onChange={(e) => setNote(e.target.value)} data-testid="ot-rate-note" /></label>
        <div className="flex justify-end gap-2"><Button size="sm" variant="secondary" onClick={onClose}>إلغاء</Button><Button size="sm" disabled={bad} isLoading={busy} onClick={() => void onSave(enabled, enabled ? v : 0, note.trim() || null)} data-testid="ot-rate-save">حفظ</Button></div>
      </div>
    </div>
  )
}
