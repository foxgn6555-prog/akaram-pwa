/**
 * 00248 — وحدة «مراجعة الاستقطاعات» في بوابة معاون المدير المفوض.
 *   المرحلة الإلزامية بين تصدير غرفة العمليات والمالية: كل موظف مع استقطاعاته مفكّكة (نقص ساعات · غياب · يدوي غرفة العمليات · غرامات الكشوفات)،
 *   إعفاء كلي بسبب / تعديل مبلغ / تخفيض % للجميع / إلغاء، ثم اعتماد ⇒ المالية ترى الكشف. أرقام التصدير الأصلية لا تُمسّ؛ التخفيف يُسجَّل منفصلاً.
 */
import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { Button } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { StatCard } from '@portals/hr/components/hr-ui'
import { field, fmtMinutes, fmtMoney } from '@portals/hr/components/hr-format'
import { useDeputyAdjust, useDeputyApprove, useDeputyAudit, useDeputyMonths, useDeputyPercent, useDeputyReopen, useDeputyReview, type DeputyDeductionKind, type DeputyReviewRow } from '@features/hr'
import { ACTION_LABELS, KIND_LABELS, KINDS, monthLabel, pctOf, reviewTotals } from './review-utils'

export default function DeputyDeductionsPage() {
  const months = useDeputyMonths()
  const list = useMemo(() => months.data ?? [], [months.data])
  const [month, setMonth] = useState<string>('')
  useEffect(() => { if (!month && list.length) setMonth((list.find((m) => m.review_status === 'pending') ?? list[0])!.period_month) }, [list, month])
  const cur = list.find((m) => m.period_month === month)
  const review = useDeputyReview(month, !!month)
  const rows = useMemo(() => review.data ?? [], [review.data])
  const [filter, setFilter] = useState<'deductions' | 'relieved' | 'all'>('deductions')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [showAudit, setShowAudit] = useState(false)
  const [pct, setPct] = useState(''); const [pctReason, setPctReason] = useState('')
  const adjust = useDeputyAdjust(); const percent = useDeputyPercent(); const approve = useDeputyApprove(); const reopen = useDeputyReopen()
  const audit = useDeputyAudit(showAudit ? cur?.export_id : null)
  useEffect(() => { setPct(cur ? String(cur.review_pct) : '') }, [cur])

  const totals = useMemo(() => reviewTotals(rows), [rows])
  const q = search.trim()
  const shown = rows.filter((r) => (filter === 'deductions' ? r.reviewable_total > 0 : filter === 'relieved' ? r.relief_total > 0 : true))
    .filter((r) => !q || r.full_name.includes(q) || r.employee_number.includes(q) || (r.department_name ?? '').includes(q))
  const editable = !!cur && cur.export_status === 'exported' && cur.review_status === 'pending'
  const pendingMonths = list.filter((m) => m.review_status === 'pending').length

  const doPercent = async () => {
    const v = Number(pct)
    if (!cur || Number.isNaN(v) || v < 0 || v > 100) return
    if (v > 0 && !pctReason.trim()) { window.alert('سبب التخفيض العام إلزامي'); return }
    try { await percent.mutateAsync({ exportId: cur.export_id, pct: v, reason: pctReason.trim() }) } catch { /* toast */ }
  }
  const doApprove = async () => {
    if (!cur) return
    if (!window.confirm(`اعتماد استقطاعات ${monthLabel(cur.period_month)}؟\n${totals.count} موظفاً · إجمالي الاستقطاعات ${fmtMoney(totals.before)} · التخفيف ${fmtMoney(totals.relief)} · بعد المراجعة ${fmtMoney(totals.after)}\nبعد الاعتماد يظهر الكشف للمالية.`)) return
    try { await approve.mutateAsync(cur.export_id) } catch { /* toast */ }
  }
  const doReopen = async () => {
    if (!cur) return
    const reason = window.prompt('سبب إعادة فتح المراجعة (يُحجب الكشف عن المالية حتى الاعتماد مجدداً):')
    if (!reason?.trim()) return
    try { await reopen.mutateAsync({ exportId: cur.export_id, reason: reason.trim() }) } catch { /* toast */ }
  }

  return (
    <div className="space-y-4" data-testid="deputy-deductions">
      <ExecPageHeader icon="wallet" title="مراجعة الاستقطاعات" subtitle="المرحلة الإلزامية قبل المالية: راجع استقطاعات كل موظف (نقص ساعات · غياب · غرفة العمليات · غرامات الكشوفات)، أعفِ بسبب أو عدّل المبلغ أو خفّض نسبة للجميع، ثم اعتمد ليصل الكشف إلى المالية"
        stats={[
          { label: 'أشهر بانتظار المراجعة', value: pendingMonths, tone: pendingMonths ? 'red' : 'green', testId: 'dd-pending-months' },
          { label: 'موظفون باستقطاع', value: totals.withDeductions, tone: 'gold', testId: 'dd-with-deductions' },
          { label: 'إجمالي الاستقطاعات', value: fmtMoney(totals.before), tone: 'plain', testId: 'dd-before' },
          { label: 'التخفيف المقرر', value: fmtMoney(totals.relief), tone: 'green', testId: 'dd-relief' },
        ]} />

      {months.isLoading ? <LoadingSpinner /> : list.length === 0 ? <EmptyState title="لا كشوف مصدَّرة بعد" hint="تظهر الأشهر هنا فور تصدير غرفة العمليات حضورية الشهر" /> : (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <label className="text-xs font-bold text-slate-600">الشهر
              <select className={clsx(field, 'ms-2 inline-block w-auto')} value={month} onChange={(e) => { setMonth(e.target.value); setOpen(null) }} data-testid="dd-month">
                {list.map((m) => <option key={m.export_id} value={m.period_month}>{monthLabel(m.period_month)} · {m.review_status === 'pending' ? 'بانتظار المراجعة' : m.export_status === 'approved' ? 'معتمد من المالية' : 'معتمد — عند المالية'}</option>)}
              </select>
            </label>
            {cur && (
              <span className={clsx('rounded-full px-2.5 py-1 text-[11px] font-bold', cur.review_status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800')} data-testid="dd-status">
                {cur.review_status === 'pending' ? `بانتظار اعتمادك · إصدار ${cur.version}` : `اعتمدته ${cur.reviewed_by_name ?? ''} · ${cur.export_status === 'approved' ? 'المالية اعتمدت الرواتب (مقفل)' : 'الكشف عند المالية'}`}
              </span>
            )}
            <div className="ms-auto flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setShowAudit((v) => !v)} data-testid="dd-audit-toggle">سجل المراجعة</Button>
              {cur && cur.review_status === 'approved' && cur.export_status === 'exported' && <Button size="sm" variant="secondary" onClick={() => void doReopen()} isLoading={reopen.isPending} data-testid="dd-reopen">إعادة فتح المراجعة</Button>}
              <Button size="sm" onClick={() => void doApprove()} disabled={!editable} isLoading={approve.isPending} data-testid="dd-approve">{cur?.review_status === 'approved' ? '✓ معتمد' : 'اعتماد وإرسال إلى المالية'}</Button>
            </div>
          </div>

          {cur && (
            <section className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="dd-stats">
              <StatCard title="نقص ساعات / تأخير" value={fmtMoney(totals.shortfall)} tone="amber" hint={`${pctOf(totals.shortfall, totals.before)}% من الإجمالي`} testId="dd-k-shortfall" />
              <StatCard title="غياب" value={fmtMoney(totals.absence)} tone="red" hint={`${pctOf(totals.absence, totals.before)}% من الإجمالي`} testId="dd-k-absence" />
              <StatCard title="استقطاعات غرفة العمليات" value={fmtMoney(totals.ops)} tone="slate" hint={`${pctOf(totals.ops, totals.before)}% من الإجمالي`} testId="dd-k-ops" />
              <StatCard title="غرامات الكشوفات" value={fmtMoney(totals.fines)} tone="violet" hint={`${pctOf(totals.fines, totals.before)}% من الإجمالي`} testId="dd-k-fines" />
              <StatCard title="قبل المراجعة" value={fmtMoney(totals.before)} tone="slate" testId="dd-t-before" />
              <StatCard title="التخفيف" value={fmtMoney(totals.relief)} tone="emerald" hint={`${pctOf(totals.relief, totals.before)}% · ${totals.relieved} موظفاً`} testId="dd-t-relief" />
              <StatCard title="بعد المراجعة" value={fmtMoney(totals.after)} tone="sky" testId="dd-t-after" />
              <StatCard title="صافي الرواتب بعد المراجعة" value={fmtMoney(totals.net)} tone="emerald" testId="dd-t-net" />
            </section>
          )}

          {cur && (
            <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" data-testid="dd-percent-box">
              <div className="text-xs font-bold text-slate-700">تخفيض عام على ما تبقى من استقطاعات الجميع</div>
              <label className="text-[11px] text-slate-600">النسبة %<input type="number" min={0} max={100} step={0.5} className={clsx(field, 'block w-24')} value={pct} onChange={(e) => setPct(e.target.value)} disabled={!editable} data-testid="dd-pct" /></label>
              <label className="min-w-[14rem] flex-1 text-[11px] text-slate-600">السبب<input className={clsx(field, 'block')} value={pctReason} onChange={(e) => setPctReason(e.target.value)} placeholder="إلزامي عند نسبة أكبر من صفر" disabled={!editable} data-testid="dd-pct-reason" /></label>
              <Button size="sm" variant="secondary" onClick={() => void doPercent()} disabled={!editable} isLoading={percent.isPending} data-testid="dd-pct-apply">تطبيق على الجميع</Button>
              {cur.review_pct > 0 && <span className="text-[11px] text-emerald-700" data-testid="dd-pct-current">النسبة الحالية {cur.review_pct}%</span>}
            </div>
          )}

          {showAudit && cur && (
            <section className="rounded-2xl border border-slate-200 bg-white p-3 text-xs shadow-sm" data-testid="dd-audit">
              <h3 className="mb-2 font-black text-slate-700">سجل المراجعة — {monthLabel(cur.period_month)}</h3>
              {(audit.data ?? []).length === 0 ? <p className="text-slate-500">لا إجراءات بعد</p> : (
                <ul className="divide-y divide-slate-100">
                  {(audit.data ?? []).map((a) => (
                    <li key={a.id} className="flex flex-wrap gap-x-3 gap-y-0.5 py-1.5">
                      <span className="font-bold">{ACTION_LABELS[a.action] ?? a.action}</span>
                      {a.kind && <span className="text-slate-600">{KIND_LABELS[a.kind]}</span>}
                      {a.full_name && <span>{a.full_name} ({a.employee_number})</span>}
                      {a.after && 'relief' in a.after && <span className="tabular-nums" dir="ltr">−{fmtMoney(Number(a.after.relief))}</span>}
                      {a.after && 'pct' in a.after && <span className="tabular-nums" dir="ltr">{String(a.after.pct)}%</span>}
                      {a.reason && <span className="text-slate-500">«{a.reason}»</span>}
                      <span className="ms-auto text-slate-400">{a.actor_name ?? ''} · {new Date(a.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Baghdad', hour12: false })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1.5 text-[11px]" data-testid="dd-filters">
                {([['deductions', `باستقطاع (${totals.withDeductions})`], ['relieved', `بتخفيف (${totals.relieved})`], ['all', `الكل (${totals.count})`]] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setFilter(k)} className={clsx('rounded-full px-2.5 py-1 font-bold ring-1', filter === k ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200')} data-testid={`dd-f-${k}`}>{l}</button>
                ))}
              </div>
              <input className={clsx(field, 'ms-auto max-w-xs')} placeholder="بحث: اسم / رقم / قسم" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="dd-search" />
            </div>
            {review.isLoading ? <LoadingSpinner /> : shown.length === 0 ? <EmptyState title="لا صفوف" hint={rows.length === 0 ? 'لا موظفين في هذا التصدير' : 'غيّر الفلتر أو البحث'} /> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] text-xs" data-testid="dd-table">
                  <thead>
                    <tr className="bg-slate-50 text-[11px] text-slate-500">
                      <th className="p-2 text-start">الموظف</th><th className="p-2 text-start">القسم</th>
                      <th className="p-2">نقص ساعات</th><th className="p-2">غياب</th><th className="p-2">غرفة العمليات</th><th className="p-2">غرامات</th>
                      <th className="p-2">الإجمالي</th><th className="p-2">التخفيف</th><th className="p-2">بعد المراجعة</th><th className="p-2">الصافي النهائي</th><th className="p-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <RowBlock key={r.row_id} r={r} open={open === r.row_id} onToggle={() => setOpen(open === r.row_id ? null : r.row_id)} editable={editable}
                        onAdjust={(kind, mode, amount, reason) => adjust.mutateAsync({ rowId: r.row_id, kind, mode, amount, reason })} busy={adjust.isPending} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function RowBlock({ r, open, onToggle, editable, onAdjust, busy }: {
  r: DeputyReviewRow; open: boolean; onToggle: () => void; editable: boolean; busy: boolean
  onAdjust: (kind: DeputyDeductionKind, mode: 'waive' | 'amount' | 'clear', amount: number | null, reason: string | null) => Promise<unknown>
}) {
  const [kind, setKind] = useState<DeputyDeductionKind>('shortfall')
  const [mode, setMode] = useState<'waive' | 'amount'>('waive')
  const [amount, setAmount] = useState(''); const [reason, setReason] = useState(''); const [err, setErr] = useState('')
  const n = r.employee_number
  const b = r.breakdown
  const submit = async () => {
    setErr('')
    if (!reason.trim()) { setErr('السبب إلزامي'); return }
    const orig = b[kind].original
    if (mode === 'amount') {
      const v = Number(amount)
      if (amount === '' || Number.isNaN(v) || v < 0) { setErr('أدخل مبلغاً صحيحاً'); return }
      if (v > orig) { setErr(`المبلغ لا يتجاوز الأصل ${fmtMoney(orig)}`); return }
    }
    if (orig <= 0) { setErr('لا استقطاع من هذا النوع لهذا الموظف'); return }
    try { await onAdjust(kind, mode, mode === 'amount' ? Number(amount) : null, reason.trim()); setReason(''); setAmount('') } catch { /* toast */ }
  }
  return (
    <>
      <tr className={clsx('border-t border-slate-100', r.relief_total > 0 && 'bg-emerald-50/40')} data-testid={`dd-row-${n}`}>
        <td className="p-2"><div className="font-bold">{r.full_name}</div><div className="text-[10px] text-slate-500" dir="ltr">{n}{r.hour_bank_enabled ? ' · بنك الساعات' : ''}</div></td>
        <td className="p-2 text-slate-600">{r.department_name ?? '—'}</td>
        <td className="p-2 text-center tabular-nums" data-testid={`dd-short-${n}`}>{r.shortfall_amount > 0 ? <>{fmtMoney(r.shortfall_amount)}<div className="text-[10px] text-slate-500">{fmtMinutes(r.shortfall_minutes)}</div></> : '—'}</td>
        <td className="p-2 text-center tabular-nums" data-testid={`dd-abs-${n}`}>{r.absence_amount > 0 ? <>{fmtMoney(r.absence_amount)}<div className="text-[10px] text-slate-500">{r.absence_days} يوم</div></> : '—'}</td>
        <td className="p-2 text-center tabular-nums" data-testid={`dd-ops-${n}`} title={r.ops_reasons ?? undefined}>{r.ops_amount > 0 ? fmtMoney(r.ops_amount) : '—'}</td>
        <td className="p-2 text-center tabular-nums" data-testid={`dd-fines-${n}`}>{r.fines_amount > 0 ? <>{fmtMoney(r.fines_amount)}<div className="text-[10px] text-slate-500">{r.fines_count} كشف</div></> : '—'}</td>
        <td className="p-2 text-center font-bold tabular-nums" data-testid={`dd-total-${n}`}>{fmtMoney(r.reviewable_total)}</td>
        <td className={clsx('p-2 text-center font-bold tabular-nums', r.relief_total > 0 ? 'text-emerald-700' : 'text-slate-400')} data-testid={`dd-relief-${n}`}>{r.relief_total > 0 ? `−${fmtMoney(r.relief_total)}` : '0'}</td>
        <td className="p-2 text-center font-bold tabular-nums" data-testid={`dd-after-${n}`}>{fmtMoney(Math.max(0, r.reviewable_total - r.relief_total))}</td>
        <td className="p-2 text-center font-black tabular-nums" data-testid={`dd-net-${n}`}>{r.final_net == null ? <span className="text-red-600">بلا راتب</span> : fmtMoney(r.final_net)}</td>
        <td className="p-2 text-center"><button type="button" className="rounded-lg bg-slate-100 px-2 py-1 font-bold text-slate-700" onClick={onToggle} data-testid={`dd-open-${n}`}>{open ? 'إغلاق' : 'تفاصيل'}</button></td>
      </tr>
      {open && (
        <tr className="border-t border-slate-100 bg-slate-50/60" data-testid={`dd-detail-${n}`}>
          <td colSpan={11} className="p-3">
            <div className="grid gap-2 sm:grid-cols-4">
              {KINDS.map((k) => (
                <div key={k} className={clsx('rounded-xl border bg-white p-2', b[k].relief > 0 ? 'border-emerald-200' : 'border-slate-200')} data-testid={`dd-kind-${k}-${n}`}>
                  <div className="text-[11px] font-bold text-slate-600">{KIND_LABELS[k]}</div>
                  <div className="tabular-nums"><span className={clsx(b[k].relief > 0 && 'text-slate-400 line-through')}>{fmtMoney(b[k].original)}</span>{b[k].relief > 0 && <> ← <b className="text-emerald-700">{fmtMoney(b[k].after)}</b></>}</div>
                  {b[k].mode !== 'none' && <div className="text-[10px] text-slate-500">{b[k].mode === 'waive' ? 'إعفاء كامل' : 'مبلغ معدَّل'}{b[k].reason ? ` · ${b[k].reason}` : ''}</div>}
                  {editable && b[k].mode !== 'none' && <button type="button" className="mt-1 text-[10px] font-bold text-red-600" onClick={() => void onAdjust(k, 'clear', null, null)} disabled={busy} data-testid={`dd-clear-${k}-${n}`}>إلغاء التخفيف</button>}
                </div>
              ))}
            </div>
            {b.pct > 0 && <p className="mt-2 text-[11px] text-emerald-700" data-testid={`dd-pct-row-${n}`}>تخفيض عام {b.pct}% على الباقي = −{fmtMoney(b.pct_relief)}</p>}
            {r.review_note && <p className="mt-1 text-[11px] text-slate-600">ملاحظة: {r.review_note}</p>}
            {editable ? (
              <div className="mt-3 flex flex-wrap items-end gap-2" data-testid={`dd-form-${n}`}>
                <label className="text-[11px] text-slate-600">النوع<select className={clsx(field, 'block w-auto')} value={kind} onChange={(e) => setKind(e.target.value as DeputyDeductionKind)} data-testid="dd-kind">{KINDS.map((k) => <option key={k} value={k} disabled={b[k].original <= 0}>{KIND_LABELS[k]} ({fmtMoney(b[k].original)})</option>)}</select></label>
                <label className="text-[11px] text-slate-600">الإجراء<select className={clsx(field, 'block w-auto')} value={mode} onChange={(e) => setMode(e.target.value as 'waive' | 'amount')} data-testid="dd-mode"><option value="waive">إعفاء كامل</option><option value="amount">تعديل المبلغ يدوياً</option></select></label>
                {mode === 'amount' && <label className="text-[11px] text-slate-600">المبلغ الجديد<input type="number" min={0} className={clsx(field, 'block w-32')} value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="dd-amount" /></label>}
                <label className="min-w-[14rem] flex-1 text-[11px] text-slate-600">السبب (إلزامي)<input className={clsx(field, 'block')} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="dd-reason" /></label>
                <Button size="sm" onClick={() => void submit()} isLoading={busy} data-testid="dd-submit">تطبيق</Button>
                {err && <span className="text-[11px] font-bold text-red-600" data-testid="dd-form-error">{err}</span>}
              </div>
            ) : <p className="mt-2 text-[11px] text-slate-500">المراجعة معتمدة — لتعديلها أعد فتحها بسبب (قبل اعتماد المالية).</p>}
          </td>
        </tr>
      )}
    </>
  )
}
