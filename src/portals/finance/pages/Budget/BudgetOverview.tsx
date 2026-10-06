/**
 * بوابة الشؤون المالية — وحدة «القاصة» (00189؛ كانت «الميزانية»)
 *  · الرصيد الحالي = المقبوضات المؤكَّدة − المكافآت النقدية المسلَّمة − مدفوعات GPS المؤكَّدة
 *  · المجمّد = مبالغ سجّلها المدير التنفيذي ولم تؤكد المالية استلامها بعد
 *  · بانتظار الإجراء: «تأكيد الاستلام» (مستحقات) · «تم التسليم» (مكافأة نقدية/هدية) · «تم الدفع» (GPS) — أو إعادة بسبب
 *  · السجل الكامل مع فلاتر التاريخ/النوع/الحالة/بحث + Excel · الأرقام إنكليزية
 */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Button } from '@components/ui'
import { StatCard } from '@portals/hr/components/hr-ui'
import { field, fmtMoney } from '@portals/hr/components/hr-format'
import { useTreasuryCancel, useTreasuryConfirm, useTreasuryList, useTreasurySummary } from '@features/treasury/hooks'
import { DateRangeFilter, ReasonPrompt, TxList, defaultRange, downloadTreasuryExcel, type DateRange } from '@features/treasury/components/TreasuryShared'
import { CONFIRM_LABEL, TREASURY_KIND_LABEL, type TreasuryKind, type TreasuryStatus, type TreasuryTx } from '@sdk/treasury.sdk'

export default function BudgetOverview() {
  const [range, setRange] = useState<DateRange>(defaultRange())
  const [kind, setKind] = useState<TreasuryKind | ''>('')
  const [status, setStatus] = useState<TreasuryStatus | ''>('')
  const [search, setSearch] = useState('')
  const [confirmTx, setConfirmTx] = useState<TreasuryTx | null>(null)
  const [note, setNote] = useState('')
  const [returnId, setReturnId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const summary = useTreasurySummary(range.from || null, range.to || null)
  const pending = useTreasuryList({ status: 'pending' })
  const ledger = useTreasuryList({ from: range.from || null, to: range.to || null, kind: kind || null, status: status || null, search: search || null })
  const confirm = useTreasuryConfirm()
  const cancel = useTreasuryCancel()
  const s = summary.data
  const pendingRows = useMemo(() => (pending.data ?? []).filter((t) => t.needs_finance), [pending.data])
  const rows = ledger.data ?? []

  return (
    <div className="space-y-4" data-testid="finance-treasury-page">
      <header>
        <h1 className="text-lg font-black text-slate-800">القاصة</h1>
        <p className="text-xs text-slate-500">كل ما يسجّله المدير التنفيذي (مستحقات · مكافآت · GPS) يصل هنا — المبالغ تبقى مجمّدة حتى تؤكدها المالية</p>
      </header>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard title="رصيد القاصة الحالي" value={fmtMoney(s?.balance ?? 0)} hint="د.ع — مؤكَّد فقط" tone="emerald" testId="tr-stat-balance" />
        <StatCard title="مجمّد بانتظار تأكيد الاستلام" value={fmtMoney(s?.frozen ?? 0)} hint="د.ع" tone="amber" testId="tr-stat-frozen" />
        <StatCard title="مكافآت/GPS بانتظار التسليم" value={fmtMoney(s?.pending_out ?? 0)} hint="د.ع" tone="sky" testId="tr-stat-pending-out" />
        <StatCard title="حركات تنتظر إجراءك" value={pendingRows.length} tone={pendingRows.length > 0 ? 'red' : 'slate'} testId="tr-stat-pending-count" />
      </div>

      {/* بانتظار الإجراء */}
      <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/30 p-3" data-testid="tr-pending-section">
        <h2 className="text-sm font-black text-amber-900">بانتظار إجراء المالية ({pendingRows.length})</h2>
        <TxList rows={pendingRows} isLoading={pending.isLoading} empty="لا توجد حركات معلّقة — كل شيء مؤكَّد" testId="tr-pending-list"
          renderActions={(t) => (
            <>
              <Button size="sm" onClick={() => { setConfirmTx(t); setNote('') }} data-testid={`tr-confirm-${t.id}`}>{CONFIRM_LABEL[t.kind]}</Button>
              <Button variant="ghost" size="sm" className="text-red-700" onClick={() => setReturnId(t.id)} data-testid={`tr-return-${t.id}`}>إعادة للمدير التنفيذي</Button>
            </>
          )} />
      </section>

      {/* ملخص النطاق */}
      {s && (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="tr-range-summary">
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <h2 className="mb-2 text-sm font-black text-slate-800">ملخص النطاق المحدد</h2>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <Row k="مقبوضات مؤكَّدة" v={s.range.receipts_confirmed} tone="text-emerald-700" />
              <Row k="مقبوضات مجمّدة" v={s.range.receipts_pending} tone="text-amber-700" />
              <Row k="مكافآت نقدية مسلَّمة" v={s.range.rewards_cash_confirmed} tone="text-violet-700" />
              <Row k="مدفوعات GPS" v={s.range.gps_confirmed} tone="text-sky-700" />
              <Row k="GPS بانتظار الدفع" v={s.range.gps_pending} tone="text-amber-700" />
              <div><dt className="text-slate-500">عدد الحركات</dt><dd className="font-black tabular-nums">{s.range.count} <span className="text-[10px] font-normal text-slate-400">({s.range.rewards_count} مكافأة)</span></dd></div>
            </dl>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <h2 className="mb-2 text-sm font-black text-slate-800">حسب اسم الحركة</h2>
            {s.by_type.length === 0 ? <p className="text-xs text-slate-400">لا مقبوضات في النطاق</p> : (
              <ul className="divide-y divide-slate-100 text-xs">
                {s.by_type.map((t) => <li key={t.type_id ?? t.name ?? '-'} className="flex justify-between py-1.5"><span className="text-slate-700">{t.name ?? '—'}</span><span className="tabular-nums" dir="ltr"><b className="text-emerald-700">{fmtMoney(t.confirmed)}</b>{t.pending > 0 && <span className="text-amber-700"> +{fmtMoney(t.pending)}</span>}</span></li>)}
              </ul>
            )}
            {s.by_month.length > 0 && (
              <table className="mt-3 w-full text-[11px]" data-testid="tr-by-month">
                <thead><tr className="text-slate-500"><th className="text-right font-semibold">الشهر</th><th className="font-semibold">مقبوضات</th><th className="font-semibold">مكافآت</th><th className="font-semibold">GPS</th></tr></thead>
                <tbody>{s.by_month.map((m) => <tr key={m.month} className="border-t border-slate-100 tabular-nums"><td className="py-1" dir="ltr">{m.month}</td><td className="text-center text-emerald-700">{fmtMoney(m.receipts)}</td><td className="text-center text-violet-700">{fmtMoney(m.rewards)}</td><td className="text-center text-sky-700">{fmtMoney(m.gps)}</td></tr>)}</tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {/* السجل */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
        <h2 className="text-sm font-black text-slate-800">سجل الحركات</h2>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <DateRangeFilter value={range} onChange={setRange} />
          <div className="flex flex-wrap items-end gap-2">
            <select className={clsx(field, 'w-44')} value={kind} onChange={(e) => setKind(e.target.value as TreasuryKind | '')} data-testid="tr-filter-kind" aria-label="النوع">
              <option value="">كل الأنواع</option>{(Object.keys(TREASURY_KIND_LABEL) as TreasuryKind[]).map((k) => <option key={k} value={k}>{TREASURY_KIND_LABEL[k]}</option>)}
            </select>
            <select className={clsx(field, 'w-40')} value={status} onChange={(e) => setStatus(e.target.value as TreasuryStatus | '')} data-testid="tr-filter-status" aria-label="الحالة">
              <option value="">كل الحالات</option><option value="pending">معلّقة</option><option value="confirmed">مؤكَّدة</option><option value="cancelled">ملغاة</option>
            </select>
            <input className={clsx(field, 'w-44')} placeholder="بحث: رقم / موظف / تفاصيل" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="tr-search" />
            <Button variant="secondary" size="sm" disabled={exporting || rows.length === 0} data-testid="tr-excel"
              onClick={async () => { setExporting(true); try { await downloadTreasuryExcel(rows, { title: `القاصة ${range.from || ''} → ${range.to || ''}`, sub: 'الشؤون المالية — القاصة', fileName: `القاصة-${range.from || 'all'}.xlsx` }) } finally { setExporting(false) } }}>Excel</Button>
          </div>
        </div>
        <TxList rows={rows} isLoading={ledger.isLoading} testId="tr-ledger" />
      </section>

      {confirmTx && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" dir="rtl" data-testid="tr-confirm-dialog">
          <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-4 shadow-xl">
            <h3 className="text-sm font-black text-slate-800">{CONFIRM_LABEL[confirmTx.kind]} — <span dir="ltr" className="font-mono">{confirmTx.ref_no}</span></h3>
            <p className="text-xs text-slate-600">{TREASURY_KIND_LABEL[confirmTx.kind]}: {confirmTx.kind === 'reward' ? confirmTx.employee_name : confirmTx.type_name}{confirmTx.affects_balance && <> · <b dir="ltr">{fmtMoney(confirmTx.amount)} د.ع</b></>}</p>
            <p className="text-[11px] text-slate-500">{confirmTx.kind === 'receipt' ? 'سيُضاف المبلغ إلى رصيد القاصة' : confirmTx.affects_balance ? 'سيُخصم المبلغ من رصيد القاصة' : 'لا يؤثر في الرصيد'} · سيُبلَّغ المدير التنفيذي{confirmTx.kind === 'reward' && ' والموظف'}</p>
            <input className={field} placeholder="ملاحظة (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} data-testid="tr-confirm-note" />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmTx(null)}>إغلاق</Button>
              <Button size="sm" disabled={confirm.isPending} onClick={() => confirm.mutate({ id: confirmTx.id, note: note.trim() || null }, { onSuccess: () => setConfirmTx(null) })} data-testid="tr-confirm-submit">{CONFIRM_LABEL[confirmTx.kind]}</Button>
            </div>
          </div>
        </div>
      )}
      {returnId && <ReasonPrompt title="إعادة الحركة للمدير التنفيذي — اكتب السبب" confirmLabel="إعادة" busy={cancel.isPending} onClose={() => setReturnId(null)} onConfirm={(reason) => cancel.mutate({ id: returnId, reason }, { onSuccess: () => setReturnId(null) })} />}
    </div>
  )
}

function Row({ k, v, tone }: { k: string; v: number; tone: string }) {
  return <div><dt className="text-slate-500">{k}</dt><dd className={clsx('font-black tabular-nums', tone)} dir="ltr">{fmtMoney(v)}</dd></div>
}
