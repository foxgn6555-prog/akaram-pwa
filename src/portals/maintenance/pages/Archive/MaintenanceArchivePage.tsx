import { Fragment, useState } from 'react'
import { Archive, CalendarRange, Download, History, Search } from 'lucide-react'
import { MaintenanceCaseHistoryDialog } from '@features/vehicle-operations/components/MaintenanceCaseHistoryDialog'
import type { MaintenanceArchiveEntry } from '@sdk/vehicle-operations.sdk'
import { useMaintenanceArchive } from '@features/vehicle-operations/hooks'
import { money } from '@features/vehicle-operations/purchase-schemas'
import { archiveSummary, exportMaintenanceArchive, finalLabels, priorityLabels } from '@features/vehicle-operations/export-archive'

const dt = (x: string | null | undefined) =>
  x ? new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Baghdad' }).format(new Date(x)) : '—'

const minutes = (m: number | null | undefined) =>
  m === null || m === undefined ? '—' : m < 60 ? `${m} د` : `${Math.floor(m / 60)} س ${m % 60} د`

export default function MaintenanceArchivePage() {
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [history, setHistory] = useState<MaintenanceArchiveEntry | null>(null)
  const [exporting, setExporting] = useState(false)
  const q = useMaintenanceArchive(search, from, to)
  const rows = q.data ?? []
  const summary = archiveSummary(rows)

  const exportExcel = async () => {
    setExporting(true)
    try {
      await exportMaintenanceArchive(rows, { search, from, to })
    } finally {
      setExporting(false)
    }
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
          الحالات المغلقة مع الفنيين والقطع والأوقات والكلف — {rows.length} حالة معروضة
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4" data-testid="archive-summary">
          <Stat label="إجمالي الكلفة الفعلية" value={`${money(summary.totalCost)} د.ع`} />
          <Stat label="كلفة القطع / الخدمة" value={`${money(summary.partsCost)} / ${money(summary.serviceCost)}`} />
          <Stat label="متوسط وقت الصيانة" value={minutes(summary.avgMaintenanceMinutes)} />
          <Stat label="عادت للعمل / أُغلقت بالكراج" value={`${summary.returnedToWork} / ${summary.closedAtGarage}`} />
        </div>
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
          data-testid="archive-export-excel"
          onClick={() => void exportExcel()}
          disabled={!rows.length || exporting}
          className="flex h-11 items-center gap-2 rounded-xl bg-indigo-700 px-5 text-xs font-black text-white disabled:opacity-40"
        >
          <Download size={16} />
          {exporting ? 'جارٍ التصدير…' : 'تصدير Excel (سجل + ملخص + تفاصيل)'}
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-white">
        <table className="w-full min-w-[80rem] text-sm">
          <thead>
            <tr className="border-b bg-slate-900 text-right text-xs text-white">
              {['رقم DB', 'الآلية', 'السائق', 'المنطقة', 'العطل', 'الأولوية', 'الفنيون', 'القطع', 'البلاغ', 'وصول الصيانة', 'انتظار', 'وقت الصيانة', 'إغلاق الحالة', 'قطع', 'خدمة', 'الكلفة الفعلية', 'النهاية', ''].map((h, i) => (
                <th key={i} className="whitespace-nowrap px-3 py-3 font-black">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.case_id}>
                <tr className="border-b odd:bg-slate-50/50" data-testid={`archive-row-${r.case_id}`}>
                  <td className="px-3 py-3">
                    <b className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] text-white">{r.db_number}</b>
                  </td>
                  <td className="px-3 py-3 font-bold">{r.vehicle_name}</td>
                  <td className="px-3 py-3 text-slate-600">{r.driver_name}</td>
                  <td className="px-3 py-3 text-slate-600">{r.area_name}</td>
                  <td className="max-w-40 truncate px-3 py-3" title={r.fault_type}>{r.fault_type}</td>
                  <td className="px-3 py-3 text-xs">{priorityLabels[r.priority] ?? r.priority}</td>
                  <td className="max-w-48 truncate px-3 py-3 text-xs" title={r.technicians ?? ''}>{r.technicians ?? '—'}</td>
                  <td className="max-w-48 truncate px-3 py-3 text-xs" title={r.parts_summary ?? ''}>{r.parts_summary ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">{dt(r.reported_at)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">{dt(r.arrived_at)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs">{minutes(r.wait_minutes)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs font-bold">{minutes(r.maintenance_minutes)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">{dt(r.completed_at)}</td>
                  <td className="px-3 py-3 text-xs">{money(Number(r.parts_actual_cost ?? 0))}</td>
                  <td className="px-3 py-3 text-xs">{money(Number(r.service_cost ?? 0))}</td>
                  <td className="px-3 py-3 font-black text-indigo-800">{money(Number(r.actual_cost ?? 0))}</td>
                  <td className="px-3 py-3">
                    <span className="whitespace-nowrap rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-black text-emerald-700">
                      {finalLabels[r.final_status] ?? r.final_status}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <button
                      data-testid={`archive-history-${r.case_id}`}
                      onClick={() => setHistory(r)}
                      className="ml-1 inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-bold text-white"
                    >
                      <History size={12} />
                      السجل والمرفقات
                    </button>
                    <button
                      data-testid={`archive-expand-${r.case_id}`}
                      onClick={() => setExpanded(expanded === r.case_id ? null : r.case_id)}
                      className="whitespace-nowrap rounded-lg border px-2 py-1 text-[11px] font-bold"
                    >
                      {expanded === r.case_id ? 'إخفاء' : 'التفاصيل'}
                    </button>
                  </td>
                </tr>
                {expanded === r.case_id && (
                  <tr className="border-b bg-indigo-50/40">
                    <td colSpan={18} className="px-4 py-3">
                      <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
                        <dt className="text-slate-500">التشخيص</dt><dd className="font-bold">{r.diagnosis ?? '—'}</dd>
                        <dt className="text-slate-500">الأعمال المنفذة</dt><dd className="font-bold">{r.work_notes ?? '—'}</dd>
                        <dt className="text-slate-500">سبب التأخير</dt><dd className="font-bold">{r.delay_reason ?? '—'}</dd>
                        <dt className="text-slate-500">إعلان / اعتماد الجاهزية</dt><dd className="font-bold">{dt(r.ready_at)} / {dt(r.readiness_approved_at)}</dd>
                        <dt className="text-slate-500">مغادرة الصيانة</dt><dd className="font-bold">{dt(r.departed_maintenance_at)}</dd>
                        <dt className="text-slate-500">مسؤول القسم / الشفت</dt><dd className="font-bold">{r.manager_name ?? '—'} / {r.shift}</dd>
                        <dt className="text-slate-500">الكلفة التقديرية</dt><dd className="font-bold">{money(Number(r.estimated_cost ?? 0))} د.ع</dd>
                        <dt className="text-slate-500">المدة الكلية (أيام)</dt><dd className="font-bold">{r.duration_days ?? '—'}</dd>
                        <dt className="text-slate-500">تصحيح غرفة العمليات</dt><dd className="font-bold">{r.corrected_at ? `${dt(r.corrected_at)} — ${r.correction_reason ?? ''}` : 'لا يوجد'}</dd>
                      </dl>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!q.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={18} className="px-4 py-12 text-center text-slate-500">
                  <Archive className="mx-auto mb-2 text-slate-300" size={32} />
                  لا توجد حالات مكتملة ضمن هذا النطاق.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {history && <MaintenanceCaseHistoryDialog item={history} close={() => setHistory(null)} allowUpload={false} />}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/10 p-3">
      <span className="block text-[10px] text-indigo-100">{label}</span>
      <b className="text-sm">{value}</b>
    </div>
  )
}
