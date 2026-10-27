import { useMemo, useState } from 'react'
import { CalendarRange, Download, Search, Wallet } from 'lucide-react'
import { useMaintenancePurchasesFinance } from '@features/vehicle-operations/hooks'
import { money, partCategoryLabel } from '@features/vehicle-operations/purchase-schemas'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { Button } from '@components/ui'
import { useTreasuryCancel, useTreasuryConfirm } from '@features/treasury/hooks'   // 00358: «تم التسليم» يخصم من القاصة
import { ReasonPrompt } from '@features/treasury/components/TreasuryShared'
import { useCanCall } from '@features/permissions/my-permissions'
import type { MaintenanceFinancePurchaseRow } from '@sdk/vehicle-operations.sdk'

const PAY_LABEL: Record<string, string> = { pending: 'بانتظار التسليم', confirmed: 'سُلّم من القاصة', cancelled: 'أُعيد للصيانة' }
const PAY_CLS: Record<string, string> = { pending: 'bg-amber-100 text-amber-800', confirmed: 'bg-emerald-100 text-emerald-800', cancelled: 'bg-slate-200 text-slate-700' }

const dt = (x: string) =>
  new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { dateStyle: 'short', timeZone: 'Asia/Baghdad' }).format(new Date(x))

export default function FinanceMaintenancePurchases() {
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const q = useMaintenancePurchasesFinance(from, to, search)
  const rows = useMemo(() => q.data ?? [], [q.data])

  const confirm = useTreasuryConfirm()
  const cancel = useTreasuryCancel()
  const canConfirm = useCanCall('finance_treasury_confirm')
  const [confirmRow, setConfirmRow] = useState<MaintenanceFinancePurchaseRow | null>(null)
  const [cancelRow, setCancelRow] = useState<MaintenanceFinancePurchaseRow | null>(null)

  const summary = useMemo(() => {
    const byCategory: Record<string, number> = {}
    const orders = new Map<string, MaintenanceFinancePurchaseRow>()
    let total = 0
    for (const row of rows) {
      total += Number(row.line_total ?? 0)
      byCategory[row.part_category] = (byCategory[row.part_category] ?? 0) + Number(row.line_total ?? 0)
      if (!orders.has(row.order_id)) orders.set(row.order_id, row)
    }
    const list = [...orders.values()]
    const pending = list.filter((o) => o.treasury_status === 'pending')
    return { total, byCategory, orders: list, pending, pendingTotal: pending.reduce((a, o) => a + Number(o.order_total ?? 0), 0), paidTotal: list.filter((o) => o.treasury_status === 'confirmed').reduce((a, o) => a + Number(o.order_total ?? 0), 0) }
  }, [rows])

  const exportCsv = () => {
    const header = ['رقم الأمر', 'التاريخ', 'المورد', 'الصنف', 'القسم', 'الكمية', 'الوحدة', 'سعر الوحدة (د.ع)', 'الإجمالي (د.ع)']
    const lines = rows.map((r) =>
      [
        r.order_number, dt(r.order_date), r.supplier_name ?? '', r.item_name,
        partCategoryLabel(r.part_category), r.quantity, r.unit, r.unit_price, r.line_total,
      ]
        .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
        .join(','),
    )
    const csv = [header.map((h) => `"${h}"`).join(','), ...lines].join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `maintenance-purchases-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section dir="rtl" className="space-y-5">
      <ExecPageHeader icon="shopping-cart" title="مشتريات الصيانة" subtitle="كل أمر شراء تسجّله الصيانة يصل هنا بمبلغه بانتظار «تم التسليم» — عند التسليم يُخصم المبلغ من رصيد القاصة ويُبلَّغ قسم الصيانة · الإعادة بسبب تُبلّغه أيضاً"
        stats={[
          { label: 'بانتظار التسليم (د.ع)', value: money(summary.pendingTotal), tone: summary.pending.length > 0 ? 'red' : 'plain', testId: 'mp-stat-pending' },
          { label: 'سُلّم من القاصة (د.ع)', value: money(summary.paidTotal), tone: 'green', testId: 'mp-stat-paid' },
          { label: 'إجمالي بنود النطاق (د.ع)', value: money(summary.total), tone: 'gold', testId: 'mp-stat-total' },
          { label: 'أوامر الشراء', value: summary.orders.length, tone: 'plain', testId: 'mp-stat-orders' },
        ]} />

      {summary.pending.length > 0 && (
        <section className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50/30 p-3" data-testid="mp-pending-section">
          <h2 className="text-sm font-black text-amber-900">أوامر بانتظار تسليم المبلغ ({summary.pending.length})</h2>
          <ul className="divide-y divide-amber-100 text-xs">
            {summary.pending.map((o) => (
              <li key={o.order_id} className="flex flex-wrap items-center gap-2 py-2" data-testid={`mp-pending-${o.order_id}`}>
                <b className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] text-white">{o.order_number}</b>
                <span className="font-mono text-[11px] text-slate-500" dir="ltr">{o.treasury_ref}</span>
                <span className="text-slate-700">{o.supplier_name ?? 'بلا مورد'} · {o.created_by_name ?? '—'} · {dt(o.order_date)}</span>
                <b className="ms-auto tabular-nums text-amber-900" dir="ltr">{money(o.order_total)} د.ع</b>
                <Button size="sm" onClick={() => setConfirmRow(o)} disabled={!canConfirm.allowed} title={canConfirm.title} data-testid={`mp-confirm-${o.order_id}`}>تم التسليم</Button>
                <Button size="sm" variant="ghost" className="text-red-700" onClick={() => setCancelRow(o)} data-testid={`mp-return-${o.order_id}`}>إعادة بسبب</Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Object.entries(summary.byCategory).map(([cat, amount]) => (
          <div key={cat} className="rounded-2xl border bg-white p-4">
            <p className="text-[11px] font-bold text-slate-500">{partCategoryLabel(cat)}</p>
            <b className="mt-1 block text-xl">{money(amount)}</b>
            <p className="text-[10px] text-slate-400">دينار عراقي</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 rounded-2xl border bg-white p-4">
        <label className="relative min-w-64 flex-1">
          <Search className="absolute right-3 top-3 text-slate-400" size={17} />
          <input
            aria-label="بحث المشتريات المالية"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-xl border pr-10"
            placeholder="بحث بالصنف أو المورد أو رقم الأمر…"
          />
        </label>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
          <CalendarRange size={15} />
          من
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11 rounded-xl border px-3" />
          إلى
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-11 rounded-xl border px-3" />
        </label>
        <button
          onClick={exportCsv}
          disabled={!rows.length}
          className="flex h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-xs font-black text-white disabled:opacity-40"
        >
          <Download size={16} />
          تصدير CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full min-w-[55rem] text-sm">
          <thead>
            <tr className="border-b bg-slate-900 text-right text-xs text-white">
              <th className="px-4 py-3 font-black">رقم الأمر</th>
              <th className="px-4 py-3 font-black">التاريخ</th>
              <th className="px-4 py-3 font-black">المورد</th>
              <th className="px-4 py-3 font-black">الصنف</th>
              <th className="px-4 py-3 font-black">القسم</th>
              <th className="px-4 py-3 font-black">الكمية</th>
              <th className="px-4 py-3 font-black">سعر الوحدة (د.ع)</th>
              <th className="px-4 py-3 font-black">الإجمالي (د.ع)</th>
              <th className="px-4 py-3 font-black">الدفع من القاصة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.order_id}-${index}`} className="border-b last:border-0 odd:bg-slate-50/50">
                <td className="px-4 py-3">
                  <b className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] text-white">{row.order_number}</b>
                </td>
                <td className="px-4 py-3 text-slate-600">{dt(row.order_date)}</td>
                <td className="px-4 py-3">{row.supplier_name ?? '—'}</td>
                <td className="px-4 py-3 font-bold">{row.item_name}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-800">
                    {partCategoryLabel(row.part_category)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {row.quantity.toLocaleString('ar-IQ-u-nu-latn')} {row.unit}
                </td>
                <td className="px-4 py-3">{money(row.unit_price)}</td>
                <td className="px-4 py-3 font-black text-emerald-800">{money(row.line_total)}</td>
                <td className="px-4 py-3">{row.treasury_status ? <span className={`rounded-full px-2 py-1 text-[11px] font-black ${PAY_CLS[row.treasury_status] ?? ''}`} data-testid={`mp-pay-${row.order_id}-${index}`}>{PAY_LABEL[row.treasury_status]}</span> : <span className="text-[11px] text-slate-400">—</span>}</td>
              </tr>
            ))}
            {!q.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                  <Wallet className="mx-auto mb-2 text-slate-300" size={32} />
                  لا توجد مصاريف مشتريات ضمن هذه الفترة.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {confirmRow && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" dir="rtl" data-testid="mp-confirm-dialog">
          <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-4 shadow-xl">
            <h3 className="text-sm font-black text-slate-800">تم التسليم — <span dir="ltr" className="font-mono">{confirmRow.order_number}</span></h3>
            <p className="text-xs text-slate-600">سيُخصم <b dir="ltr">{money(confirmRow.order_total)} د.ع</b> من رصيد القاصة فوراً ويُبلَّغ قسم الصيانة ({confirmRow.created_by_name ?? '—'}). إن كان الرصيد لا يكفي سيُرفض التسليم.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmRow(null)}>إغلاق</Button>
              <Button size="sm" disabled={confirm.isPending} onClick={() => confirm.mutate({ id: confirmRow.treasury_tx_id as string, note: null }, { onSuccess: () => setConfirmRow(null) })} data-testid="mp-confirm-submit">تأكيد التسليم</Button>
            </div>
          </div>
        </div>
      )}
      {cancelRow && <ReasonPrompt title={`إعادة أمر الشراء ${cancelRow.order_number} إلى الصيانة — اكتب السبب`} confirmLabel="إعادة" busy={cancel.isPending} onClose={() => setCancelRow(null)} onConfirm={(reason) => cancel.mutate({ id: cancelRow.treasury_tx_id as string, reason }, { onSuccess: () => setCancelRow(null) })} />}
    </section>
  )
}
