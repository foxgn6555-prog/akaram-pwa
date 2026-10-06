/**
 * المدير التنفيذي — وحدة «تسديد مستحقات GPS» (00189)
 *  · المبلغ فقط؛ اسم الحركة «تسديد مستحقات GPS» والتاريخ/الوقت/المنفّذ تلقائياً
 *  · تُبلَّغ المالية وتضغط «تم الدفع» فيُخصم من القاصة · كل الحركات محفوظة مع فلتر تاريخ + Excel
 */
import { useState } from 'react'
import clsx from 'clsx'
import { Button } from '@components/ui'
import { StatCard } from '@portals/hr/components/hr-ui'
import { field, fmtMoney } from '@portals/hr/components/hr-format'
import { useTreasuryCancel, useTreasuryList, useTreasuryRecord, useTreasurySummary } from '@features/treasury/hooks'
import { DateRangeFilter, ReasonPrompt, TxList, defaultRange, downloadTreasuryExcel, type DateRange } from '@features/treasury/components/TreasuryShared'
import { GPS_TYPE_NAME, type TreasuryStatus } from '@sdk/treasury.sdk'

export default function ExecGpsPaymentsPage() {
  const record = useTreasuryRecord()
  const cancel = useTreasuryCancel()
  const [amount, setAmount] = useState('')
  const [details, setDetails] = useState('')
  const [range, setRange] = useState<DateRange>(defaultRange())
  const [status, setStatus] = useState<TreasuryStatus | ''>('')
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const summary = useTreasurySummary(range.from || null, range.to || null)
  const list = useTreasuryList({ from: range.from || null, to: range.to || null, kind: 'gps_payment', status: status || null })
  const rows = list.data ?? []
  const s = summary.data
  const n = Number(amount.replace(/,/g, ''))
  const valid = Number.isFinite(n) && n > 0

  return (
    <div className="space-y-4" data-testid="exec-gps-page">
      <header>
        <h1 className="text-lg font-black text-slate-800">تسديد مستحقات GPS</h1>
        <p className="text-xs text-slate-500">اسم الحركة والتاريخ والوقت والمنفّذ تلقائياً · تُبلَّغ الشؤون المالية وتضغط «تم الدفع»</p>
      </header>
      <form className="space-y-3 rounded-2xl border border-sky-200 bg-white p-4" data-testid="gps-form"
        onSubmit={(e) => { e.preventDefault(); if (!valid) return; record.mutate({ kind: 'gps_payment', amount: n, details: details.trim() || null }, { onSuccess: () => { setAmount(''); setDetails('') } }) }}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-xs font-semibold text-slate-600">المبلغ (دينار عراقي)
            <input inputMode="numeric" dir="ltr" className={clsx(field, 'mt-1 text-left font-black tabular-nums')} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,.]/g, ''))} placeholder="0" data-testid="gps-amount" />
            {n > 0 && <span className="mt-1 block text-[11px] text-slate-500" dir="ltr">{fmtMoney(n)} د.ع</span>}
          </label>
          <label className="text-xs font-semibold text-slate-600">اسم الحركة<input className={clsx(field, 'mt-1')} value={GPS_TYPE_NAME} readOnly disabled data-testid="gps-type-name" /></label>
          <label className="text-xs font-semibold text-slate-600">تفاصيل (اختياري)<input className={clsx(field, 'mt-1')} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="الفترة، رقم الفاتورة…" data-testid="gps-details" /></label>
        </div>
        <div className="flex justify-end"><Button type="submit" size="sm" disabled={!valid || record.isPending} data-testid="gps-submit">تسجيل التسديد وإبلاغ المالية</Button></div>
      </form>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        <StatCard title="مدفوع مؤكَّد في النطاق" value={fmtMoney(s?.range.gps_confirmed ?? 0)} hint="د.ع" tone="sky" testId="gps-stat-confirmed" />
        <StatCard title="بانتظار «تم الدفع»" value={fmtMoney(s?.range.gps_pending ?? 0)} hint="د.ع" tone="amber" testId="gps-stat-pending" />
        <StatCard title="رصيد القاصة الحالي" value={fmtMoney(s?.balance ?? 0)} hint="د.ع" tone="emerald" testId="gps-stat-balance" />
      </div>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <DateRangeFilter value={range} onChange={setRange} />
          <div className="flex flex-wrap items-end gap-2">
            <select className={clsx(field, 'w-40')} value={status} onChange={(e) => setStatus(e.target.value as TreasuryStatus | '')} data-testid="gps-filter-status" aria-label="الحالة">
              <option value="">كل الحالات</option><option value="pending">بانتظار الدفع</option><option value="confirmed">مدفوعة</option><option value="cancelled">ملغاة</option>
            </select>
            <Button variant="secondary" size="sm" disabled={exporting || rows.length === 0} data-testid="gps-excel"
              onClick={async () => { setExporting(true); try { await downloadTreasuryExcel(rows, { title: `تسديد مستحقات GPS ${range.from || ''} → ${range.to || ''}`, sub: 'المدير التنفيذي — تسديد مستحقات GPS', fileName: `تسديد-GPS-${range.from || 'all'}.xlsx` }) } finally { setExporting(false) } }}>Excel</Button>
          </div>
        </div>
        <TxList rows={rows} isLoading={list.isLoading} renderActions={(t) => t.status === 'pending' ? <Button variant="ghost" size="sm" className="text-red-700" onClick={() => setCancelId(t.id)} data-testid={`gps-cancel-${t.id}`}>إلغاء</Button> : null} />
      </section>
      {cancelId && <ReasonPrompt title="إلغاء التسديد المعلّق — اكتب السبب" confirmLabel="تأكيد الإلغاء" busy={cancel.isPending} onClose={() => setCancelId(null)} onConfirm={(reason) => cancel.mutate({ id: cancelId, reason }, { onSuccess: () => setCancelId(null) })} />}
    </div>
  )
}
