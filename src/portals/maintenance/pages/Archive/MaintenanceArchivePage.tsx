import { useState } from 'react'
import { Archive, CalendarRange, Download, Search } from 'lucide-react'
import { useMaintenanceArchive } from '@features/vehicle-operations/hooks'
import { money } from '@features/vehicle-operations/purchase-schemas'

const dt = (x: string) =>
  new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'short', timeZone: 'Asia/Baghdad' }).format(new Date(x))

const finalLabels: Record<string, string> = {
  returned_to_work: 'عادت إلى العمل',
  closed_at_garage: 'أغلقت في الكراج',
}

export default function MaintenanceArchivePage() {
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const q = useMaintenanceArchive(search, from, to)
  const rows = q.data ?? []
  const totalCost = rows.reduce((sum, r) => sum + Number(r.actual_cost ?? 0), 0)

  const exportCsv = () => {
    const header = [
      'رقم DB', 'الآلية', 'السائق', 'العطل', 'التشخيص', 'الكلفة الفعلية (د.ع)',
      'كلفة القطع (د.ع)', 'عدد القطع', 'مدة الصيانة (أيام)', 'تاريخ الإكمال',
    ]
    const lines = rows.map((r) =>
      [
        r.db_number, r.vehicle_name, r.driver_name, r.fault_type, r.diagnosis ?? '',
        r.actual_cost, r.parts_actual_cost, r.parts_count, r.duration_days ?? '', dt(r.completed_at),
      ]
        .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
        .join(','),
    )
    const csv = [header.map((h) => `"${h}"`).join(','), ...lines].join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `maintenance-archive-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section dir="rtl" className="space-y-5">
      <header className="rounded-3xl bg-gradient-to-l from-slate-950 to-indigo-900 p-6 text-white">
        <p className="flex items-center gap-2 text-xs">
          <Archive size={17} />
          سجل دائم لكل الحالات المكتملة — البحث والتصدير
        </p>
        <h1 className="mt-2 text-2xl font-black">أرشيف الصيانة</h1>
        <p className="mt-1 text-sm text-indigo-100">
          الحالات المغلقة مع التشخيص والكلف والمدة — {rows.length} حالة معروضة · إجمالي الكلف:{' '}
          <b>{money(totalCost)} د.ع</b>
        </p>
      </header>

      <div className="flex flex-wrap gap-3 rounded-2xl border bg-white p-4">
        <label className="relative min-w-64 flex-1">
          <Search className="absolute right-3 top-3 text-slate-400" size={17} />
          <input
            aria-label="بحث الأرشيف"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-xl border pr-10"
            placeholder="بحث برقم DB أو اسم الآلية أو السائق…"
          />
        </label>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
          <CalendarRange size={15} />
          من
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-11 rounded-xl border px-3"
          />
          إلى
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-11 rounded-xl border px-3"
          />
        </label>
        <button
          onClick={exportCsv}
          disabled={!rows.length}
          className="flex h-11 items-center gap-2 rounded-xl bg-indigo-700 px-5 text-xs font-black text-white disabled:opacity-40"
        >
          <Download size={16} />
          تصدير CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full min-w-[60rem] text-sm">
          <thead>
            <tr className="border-b bg-slate-900 text-right text-xs text-white">
              <th className="px-4 py-3 font-black">رقم DB</th>
              <th className="px-4 py-3 font-black">الآلية</th>
              <th className="px-4 py-3 font-black">السائق</th>
              <th className="px-4 py-3 font-black">العطل</th>
              <th className="px-4 py-3 font-black">التشخيص</th>
              <th className="px-4 py-3 font-black">عدد القطع</th>
              <th className="px-4 py-3 font-black">الكلفة الفعلية (د.ع)</th>
              <th className="px-4 py-3 font-black">المدة (أيام)</th>
              <th className="px-4 py-3 font-black">تاريخ الإكمال</th>
              <th className="px-4 py-3 font-black">النهاية</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.case_id} className="border-b last:border-0 odd:bg-slate-50/50">
                <td className="px-4 py-3">
                  <b className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] text-white">{r.db_number}</b>
                </td>
                <td className="px-4 py-3 font-bold">{r.vehicle_name}</td>
                <td className="px-4 py-3 text-slate-600">{r.driver_name}</td>
                <td className="px-4 py-3">{r.fault_type}</td>
                <td className="max-w-64 truncate px-4 py-3 text-xs text-slate-500" title={r.diagnosis ?? ''}>
                  {r.diagnosis ?? '—'}
                </td>
                <td className="px-4 py-3">{r.parts_count}</td>
                <td className="px-4 py-3 font-black text-indigo-800">{money(r.actual_cost)}</td>
                <td className="px-4 py-3 text-slate-600">{r.duration_days ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{dt(r.completed_at)}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-black text-emerald-700">
                    {finalLabels[r.final_status] ?? r.final_status}
                  </span>
                </td>
              </tr>
            ))}
            {!q.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                  <Archive className="mx-auto mb-2 text-slate-300" size={32} />
                  لا توجد حالات مكتملة ضمن هذا النطاق.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
