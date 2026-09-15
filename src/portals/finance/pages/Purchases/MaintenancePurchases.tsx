import { useMemo, useState } from 'react'
import { CalendarRange, Download, Search, ShoppingBag, Wallet } from 'lucide-react'
import { useMaintenancePurchasesFinance } from '@features/vehicle-operations/hooks'
import { money, partCategoryLabel } from '@features/vehicle-operations/purchase-schemas'

const dt = (x: string) =>
  new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'short', timeZone: 'Asia/Baghdad' }).format(new Date(x))

export default function FinanceMaintenancePurchases() {
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const q = useMaintenancePurchasesFinance(from, to, search)
  const rows = useMemo(() => q.data ?? [], [q.data])

  const summary = useMemo(() => {
    const byCategory: Record<string, number> = {}
    let total = 0
    for (const row of rows) {
      total += Number(row.line_total ?? 0)
      byCategory[row.part_category] = (byCategory[row.part_category] ?? 0) + Number(row.line_total ?? 0)
    }
    return { total, byCategory }
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
      <header className="rounded-3xl bg-gradient-to-l from-slate-950 to-emerald-800 p-6 text-white">
        <p className="flex items-center gap-2 text-xs">
          <ShoppingBag size={17} />
          تصل تلقائياً من بوابة الصيانة عند تسجيل أي أمر شراء
        </p>
        <h1 className="mt-2 text-2xl font-black">مشتريات الصيانة</h1>
        <p className="mt-1 text-sm text-emerald-100">
          سجل مصاريف قطع الصيانة بالدينار العراقي — إجمالي الفترة:{' '}
          <b className="text-xl">{money(summary.total)} د.ع</b>
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-2xl border bg-white p-4">
          <p className="text-[11px] font-bold text-slate-500">إجمالي المبالغ</p>
          <b className="mt-1 block text-xl text-emerald-800">{money(summary.total)}</b>
          <p className="text-[10px] text-slate-400">دينار عراقي</p>
        </div>
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
                  {row.quantity.toLocaleString('ar-IQ')} {row.unit}
                </td>
                <td className="px-4 py-3">{money(row.unit_price)}</td>
                <td className="px-4 py-3 font-black text-emerald-800">{money(row.line_total)}</td>
              </tr>
            ))}
            {!q.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                  <Wallet className="mx-auto mb-2 text-slate-300" size={32} />
                  لا توجد مصاريف مشتريات ضمن هذه الفترة.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
