/**
 * السُّلَف — الشؤون المالية (00191)
 *  · «جاهزة للتسليم»: السلف التي اكتملت موافقاتها → زر «تم التسليم» (يُخصم المبلغ من القاصة ويبدأ الاستقطاع من الشهر التالي)
 *  · «قيد الاستقطاع»: المسلَّمة مع المتبقي والأقساط المسجَّلة من كشوف الرواتب المعتمدة · تسديد نقدي مبكر
 *  · الكل مع فلاتر (حالة/تاريخ/بحث) وExcel · تفاصيل كل سلفة: المسار، الأقساط، السجل
 *  · الأرقام إنكليزية (0-9) دائماً
 */
import { useState } from 'react'
import clsx from 'clsx'
import { FileSpreadsheet, HandCoins, Wallet, X } from 'lucide-react'
import { useAdvance, useAdvancesList, useAdvancesSummary, useCancelAdvance, useDeliverAdvance, useSettleAdvanceCash } from '@features/advances/hooks'
import { ADVANCE_STATUS_LABEL, EVENT_LABEL, REPAYMENT_METHOD_LABEL, type Advance, type AdvanceStatus } from '@sdk/advances.sdk'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { StatCard } from '@portals/hr/components/hr-ui'
import { field, fmtMoney } from '@portals/hr/components/hr-format'
import { buildExcelReport } from '@lib/export/excel-report'
import { fmtDT, methodDetail } from '@features/advances/format'

type Tab = 'approved' | 'delivered' | 'all'
const STATUS_TONE: Record<AdvanceStatus, string> = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200', approved: 'bg-sky-50 text-sky-800 border-sky-200', delivered: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  settled: 'bg-slate-100 text-slate-700 border-slate-200', rejected: 'bg-rose-50 text-rose-800 border-rose-200', cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
}

export async function downloadAdvancesExcel(rows: Advance[]) {
  await buildExcelReport({
    sheetName: 'السلف', company: 'شركة جزيرة الأكارم', companySub: 'الشؤون المالية — السُّلَف', title: 'سجل السلف',
    meta: `أُنشئ ${new Date().toLocaleString('ar-IQ-u-nu-latn')} · العملة: دينار عراقي · ${rows.length} سلفة`, orientation: 'landscape', fileName: `السلف-${new Date().toISOString().slice(0, 10)}.xlsx`,
    columns: [
      { header: 'ت', key: 'i', width: 5, align: 'center' }, { header: 'الرقم', key: 'ref', width: 15, align: 'center' }, { header: 'الموظف', key: 'name', width: 24 }, { header: 'الرقم الوظيفي', key: 'num', width: 12, align: 'center' },
      { header: 'النوع', key: 'type', width: 16 }, { header: 'المبلغ', key: 'amount', width: 14, align: 'center', numFmt: '#,##0' }, { header: 'طريقة التسديد', key: 'method', width: 20 }, { header: 'التفصيل', key: 'detail', width: 18 },
      { header: 'المسدَّد', key: 'repaid', width: 14, align: 'center', numFmt: '#,##0' }, { header: 'المتبقي', key: 'remaining', width: 14, align: 'center', numFmt: '#,##0' },
      { header: 'الحالة', key: 'status', width: 18, align: 'center' }, { header: 'تاريخ الطلب', key: 'created', width: 18, align: 'center' }, { header: 'التسليم', key: 'delivered', width: 18, align: 'center' }, { header: 'سلّمها', key: 'by', width: 16 },
      { header: 'بداية الاستقطاع', key: 'start', width: 12, align: 'center' }, { header: 'ملاحظة', key: 'notes', width: 26, wrap: true },
    ],
    rows: rows.map((a, i) => ({ i: i + 1, ref: a.ref_no, name: a.employee_name, num: a.employee_number ?? '', type: a.type_name, amount: a.amount, method: REPAYMENT_METHOD_LABEL[a.repayment_method], detail: methodDetail(a),
      repaid: a.repaid_total ?? 0, remaining: a.remaining ?? 0, status: ADVANCE_STATUS_LABEL[a.status], created: fmtDT(a.created_at), delivered: a.delivered_at ? fmtDT(a.delivered_at) : '', by: a.delivered_by_name ?? '', start: a.start_month?.slice(0, 7) ?? '', notes: a.notes ?? '' })),
    totalRow: { i: 'الإجمالي', name: `${rows.length} سلفة`, amount: rows.reduce((s, a) => s + a.amount, 0), repaid: rows.reduce((s, a) => s + (a.repaid_total ?? 0), 0), remaining: rows.reduce((s, a) => s + (a.remaining ?? 0), 0) },
  })
}

export default function FinanceAdvancesPage() {
  const [tab, setTab] = useState<Tab>('approved')
  const [status, setStatus] = useState<AdvanceStatus | ''>(''), [from, setFrom] = useState(''), [to, setTo] = useState(''), [q, setQ] = useState('')
  const filter = tab === 'all' ? { status: status || null, from: from || null, to: to || null, q: q || null, limit: 500 } : { status: tab, limit: 500 }
  const list = useAdvancesList(filter), summary = useAdvancesSummary()
  const [openId, setOpenId] = useState<string | null>(null)
  const s = summary.data
  return (
    <div className="space-y-4 pb-6" data-testid="fin-advances">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-black"><Wallet size={18} className="inline" /> السُّلَف</h1>
          <p className="text-xs text-slate-600">السلف التي اكتملت موافقاتها تصل هنا للتسليم. التسليم يُخصم من القاصة، وتُستقطع الأقساط تلقائياً من كشف الرواتب ابتداءً من الشهر التالي وتُسجَّل عند اعتماد الشهر.</p>
        </div>
        <button type="button" data-testid="adv-excel" disabled={(list.data ?? []).length === 0} onClick={() => void downloadAdvancesExcel(list.data ?? [])} className="flex h-10 items-center gap-1 rounded-xl border bg-white px-3 text-xs font-black text-emerald-800 disabled:opacity-40"><FileSpreadsheet size={14} /> Excel</button>
      </header>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4" data-testid="adv-stats">
        <StatCard title="جاهزة للتسليم" value={s?.awaiting_delivery ?? 0} hint={s ? `${fmtMoney(s.awaiting_delivery_amount)} د.ع` : undefined} tone="sky" testId="adv-stat-awaiting" />
        <StatCard title="قيد الاستقطاع" value={s?.active ?? 0} hint={s ? `المتبقي ${fmtMoney(s.outstanding)} د.ع` : undefined} tone="emerald" testId="adv-stat-active" />
        <StatCard title="قيد الموافقة" value={s?.pending ?? 0} tone="amber" testId="adv-stat-pending" />
        <StatCard title="المسلَّم / المسدَّد" value={s ? fmtMoney(s.delivered_total) : '—'} hint={s ? `سُدّد ${fmtMoney(s.repaid_total)} د.ع` : undefined} tone="slate" testId="adv-stat-totals" />
      </div>
      <div className="flex flex-wrap gap-1" data-testid="adv-tabs">
        {([['approved', 'جاهزة للتسليم'], ['delivered', 'قيد الاستقطاع'], ['all', 'الكل والبحث']] as const).map(([k, l]) => (
          <button key={k} type="button" data-testid={`adv-tab-${k}`} onClick={() => setTab(k)} className={clsx('h-9 rounded-full border px-4 text-xs font-bold', tab === k ? 'border-indigo-600 bg-indigo-600 text-white' : 'bg-white text-slate-700')}>{l}</button>
        ))}
      </div>
      {tab === 'all' && (
        <div className="grid gap-2 rounded-2xl border bg-white p-3 sm:grid-cols-4" data-testid="adv-filters">
          <label className="text-[11px] font-bold">الحالة<select data-testid="adv-f-status" value={status} onChange={(e) => setStatus(e.target.value as AdvanceStatus | '')} className={clsx(field, 'mt-1 font-normal')}><option value="">الكل</option>{(Object.keys(ADVANCE_STATUS_LABEL) as AdvanceStatus[]).map((k) => <option key={k} value={k}>{ADVANCE_STATUS_LABEL[k]}</option>)}</select></label>
          <label className="text-[11px] font-bold">من<input type="date" data-testid="adv-f-from" value={from} onChange={(e) => setFrom(e.target.value)} className={clsx(field, 'mt-1 font-normal')} /></label>
          <label className="text-[11px] font-bold">إلى<input type="date" data-testid="adv-f-to" value={to} onChange={(e) => setTo(e.target.value)} className={clsx(field, 'mt-1 font-normal')} /></label>
          <label className="text-[11px] font-bold">بحث<input data-testid="adv-f-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="اسم / رقم وظيفي / رقم السلفة" className={clsx(field, 'mt-1 font-normal')} /></label>
        </div>
      )}
      {list.isLoading ? <LoadingSpinner /> : (list.data ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white p-8 text-center text-sm text-slate-500" data-testid="adv-empty">{tab === 'approved' ? 'لا سلف بانتظار التسليم الآن.' : tab === 'delivered' ? 'لا سلف قيد الاستقطاع.' : 'لا نتائج.'}</div>
      ) : (
        <ul className="space-y-2" data-testid="adv-list">{(list.data ?? []).map((a) => <Row key={a.id} a={a} onOpen={() => setOpenId(a.id)} />)}</ul>
      )}
      {openId && <Detail id={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}

function Row({ a, onOpen }: { a: Advance; onOpen: () => void }) {
  const deliver = useDeliverAdvance()
  const [mode, setMode] = useState<'idle' | 'deliver'>('idle'), [note, setNote] = useState('')
  return (
    <li className="rounded-2xl border bg-white p-3 shadow-sm" data-testid={`adv-${a.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button type="button" onClick={onOpen} className="text-start" data-testid={`adv-open-${a.id}`}>
          <div className="text-sm font-black underline-offset-2 hover:underline">{a.employee_name} <span className="text-[11px] font-normal text-slate-500">{a.employee_number ?? ''}</span></div>
          <div className="text-[11px] text-slate-600">{a.type_name} · <span dir="ltr" className="font-mono">{a.ref_no}</span> · قُدّم {fmtDT(a.created_at)}{a.requested_by_name ? ` · ${a.requested_by_name}` : ''}</div>
        </button>
        <span className={clsx('rounded-full border px-2 py-0.5 text-[11px] font-bold', STATUS_TONE[a.status])} data-testid={`adv-status-${a.id}`}>{a.status_label}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
        <span>المبلغ: <b className="tabular-nums" data-testid={`adv-amount-${a.id}`}>{fmtMoney(a.amount)} د.ع</b>{a.requested_amount !== a.amount && <span className="text-slate-500"> (طُلب {fmtMoney(a.requested_amount)})</span>}</span>
        <span>التسديد: <b>{a.method_label}</b> · {methodDetail(a)}</span>
        {(a.estimated_installment ?? 0) > 0 && a.status !== 'settled' && <span>القسط الشهري: <b className="tabular-nums">{fmtMoney(a.estimated_installment)}</b></span>}
        {a.status === 'delivered' && <span>المتبقي: <b className="tabular-nums text-emerald-800" data-testid={`adv-remaining-${a.id}`}>{fmtMoney(a.remaining)}</b> · سُلّمت {fmtDT(a.delivered_at)}{a.delivered_by_name ? ` (${a.delivered_by_name})` : ''} · الاستقطاع من {a.start_month?.slice(0, 7)}</span>}
        {a.status === 'approved' && a.approved_at && <span>اعتُمدت {fmtDT(a.approved_at)}</span>}
        {a.status === 'settled' && <span>سُدّدت بالكامل {fmtDT(a.settled_at)}</span>}
      </div>
      {a.status === 'approved' && (mode === 'idle' ? (
        <button type="button" data-testid={`adv-deliver-${a.id}`} onClick={() => setMode('deliver')} className="mt-2 flex h-10 items-center gap-1 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white"><HandCoins size={16} /> تم التسليم</button>
      ) : (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2">
          <label className="flex-1 text-[11px] font-bold text-emerald-900">ملاحظة التسليم (اختياري)<input data-testid={`adv-deliver-note-${a.id}`} value={note} onChange={(e) => setNote(e.target.value)} className={clsx(field, 'mt-1 h-9 font-normal')} /></label>
          <button type="button" data-testid={`adv-deliver-confirm-${a.id}`} disabled={deliver.isPending} onClick={() => deliver.mutate({ id: a.id, note: note.trim() || null }, { onSuccess: () => setMode('idle') })} className="h-9 rounded-lg bg-emerald-600 px-3 text-xs font-black text-white disabled:opacity-40">تأكيد التسليم وخصم {fmtMoney(a.amount)} من القاصة</button>
          <button type="button" onClick={() => setMode('idle')} className="h-9 rounded-lg border bg-white px-3 text-xs font-bold">رجوع</button>
        </div>
      ))}
    </li>
  )
}

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: a, isLoading } = useAdvance(id)
  const settle = useSettleAdvanceCash(), cancel = useCancelAdvance()
  const [amt, setAmt] = useState(''), [note, setNote] = useState(''), [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" data-testid="adv-detail">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black">تفاصيل السلفة</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" data-testid="adv-detail-close" className="rounded-lg p-1 hover:bg-slate-100"><X size={18} /></button>
        </div>
        {isLoading || !a ? <LoadingSpinner /> : (
          <div className="mt-3 space-y-3 text-xs">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="text-sm font-black">{a.employee_name} <span className="font-normal text-slate-500">{a.employee_number ?? ''}</span> <span className={clsx('ms-1 rounded-full border px-2 py-0.5 text-[11px] font-bold', STATUS_TONE[a.status])}>{a.status_label}</span></div>
              <div className="mt-1 grid gap-1 sm:grid-cols-2">
                <span>الرقم: <b dir="ltr" className="font-mono">{a.ref_no}</b></span><span>النوع: <b>{a.type_name}</b></span>
                <span>المبلغ: <b className="tabular-nums">{fmtMoney(a.amount)} د.ع</b>{a.requested_amount !== a.amount && <span className="text-slate-500"> (طُلب {fmtMoney(a.requested_amount)})</span>}</span>
                <span>التسديد: <b>{a.method_label}</b> · {methodDetail(a)}</span>
                <span>المسدَّد: <b className="tabular-nums">{fmtMoney(a.repaid_total)}</b></span><span>المتبقي: <b className="tabular-nums text-emerald-800" data-testid="adv-detail-remaining">{fmtMoney(a.remaining)}</b></span>
                <span>قُدّم: {fmtDT(a.created_at)} · {a.requested_by_name ?? ''}</span>
                {a.delivered_at && <span>سُلّمت: {fmtDT(a.delivered_at)} · {a.delivered_by_name ?? ''}{a.delivery_note ? ` · «${a.delivery_note}»` : ''}</span>}
                {a.start_month && <span>بداية الاستقطاع: {a.start_month.slice(0, 7)}</span>}
                {a.notes && <span className="sm:col-span-2">ملاحظة الطلب: «{a.notes}»</span>}
              </div>
            </div>
            <section>
              <h3 className="font-black">مسار الموافقات</h3>
              <ol className="mt-1 space-y-1 rounded-xl border p-2" data-testid="adv-detail-timeline">
                {a.timeline.map((st) => (
                  <li key={st.step_no} className="flex flex-wrap items-center gap-1">
                    <b>{st.step_no}.</b> {st.label} — <span className={st.status === 'approved' ? 'text-emerald-700' : st.status === 'rejected' ? 'text-rose-700' : st.status === 'pending' ? 'text-amber-700' : 'text-slate-500'}>{st.status === 'approved' ? 'موافقة' : st.status === 'rejected' ? 'رفض' : st.status === 'pending' ? 'بانتظار القرار' : st.status === 'waiting' ? 'لاحقاً' : 'تُخطّيت'}</span>
                    {st.decided_by && <span className="text-slate-500">({st.decided_by}{st.decided_at ? ` · ${fmtDT(st.decided_at)}` : ''})</span>}
                    {!st.decided_by && (st.approvers ?? []).length > 0 && <span className="text-slate-500">({(st.approvers ?? []).join('، ')})</span>}
                    {st.note && <span className="text-slate-600">«{st.note}»</span>}
                  </li>
                ))}
              </ol>
            </section>
            <section>
              <h3 className="font-black">الأقساط المسجَّلة ({a.installment_rows.length})</h3>
              {a.installment_rows.length === 0 ? <p className="mt-1 text-slate-500">لم يُسجَّل قسط بعد — يُسجَّل القسط عند اعتماد كشف رواتب الشهر.</p> : (
                <table className="mt-1 w-full text-[11px]" data-testid="adv-detail-installments">
                  <thead className="bg-slate-50 text-slate-600"><tr><th className="p-1 text-start">الشهر</th><th className="p-1">المبلغ</th><th className="p-1">المصدر</th><th className="p-1">التاريخ</th></tr></thead>
                  <tbody>{a.installment_rows.map((r) => <tr key={r.id} className="border-t"><td className="p-1">{r.period_month.slice(0, 7)}</td><td className="p-1 text-center tabular-nums">{fmtMoney(r.amount)}</td><td className="p-1 text-center">{r.source === 'payroll' ? 'كشف الرواتب' : 'نقداً'}{r.note ? ` · ${r.note}` : ''}</td><td className="p-1 text-center">{fmtDT(r.created_at)}</td></tr>)}</tbody>
                </table>
              )}
            </section>
            {a.status === 'delivered' && (
              <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <h3 className="font-black text-emerald-900">تسديد نقدي مبكر</h3>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="text-[11px] font-bold">المبلغ (حتى {fmtMoney(a.remaining)})<input data-testid="adv-settle-amount" type="number" inputMode="numeric" min={1} max={a.remaining ?? undefined} value={amt} onChange={(e) => setAmt(e.target.value)} className={clsx(field, 'mt-1 h-9 w-40 font-normal tabular-nums')} /></label>
                  <label className="flex-1 text-[11px] font-bold">ملاحظة<input data-testid="adv-settle-note" value={note} onChange={(e) => setNote(e.target.value)} className={clsx(field, 'mt-1 h-9 font-normal')} /></label>
                  <button type="button" data-testid="adv-settle-confirm" disabled={!(Number(amt) > 0 && Number(amt) <= (a.remaining ?? 0)) || settle.isPending} onClick={() => settle.mutate({ id: a.id, amount: Math.round(Number(amt)), note: note.trim() || null }, { onSuccess: () => setAmt('') })} className="h-9 rounded-lg bg-emerald-600 px-3 text-xs font-black text-white disabled:opacity-40">تسجيل التسديد (يدخل القاصة)</button>
                </div>
              </section>
            )}
            {a.status === 'approved' && (
              <section className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <h3 className="font-black text-rose-900">إلغاء السلفة قبل التسليم</h3>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="flex-1 text-[11px] font-bold">السبب<input data-testid="adv-fin-cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={clsx(field, 'mt-1 h-9 font-normal')} /></label>
                  <button type="button" data-testid="adv-fin-cancel" disabled={reason.trim().length < 2 || cancel.isPending} onClick={() => cancel.mutate({ id: a.id, reason: reason.trim() }, { onSuccess: onClose })} className="h-9 rounded-lg bg-rose-600 px-3 text-xs font-black text-white disabled:opacity-40">إلغاء السلفة</button>
                </div>
              </section>
            )}
            <section>
              <h3 className="font-black">السجل</h3>
              <ul className="mt-1 space-y-0.5 text-[11px]" data-testid="adv-detail-events">
                {a.events.map((e) => <li key={e.id} className="flex flex-wrap gap-1 text-slate-700"><span className="text-slate-500">{fmtDT(e.created_at)}</span> · <b>{EVENT_LABEL[e.action] ?? e.action}</b>{e.amount != null && <span className="tabular-nums">· {fmtMoney(e.amount)}</span>}{e.actor_name && <span>· {e.actor_name}</span>}{e.note && <span>· «{e.note}»</span>}</li>)}
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
