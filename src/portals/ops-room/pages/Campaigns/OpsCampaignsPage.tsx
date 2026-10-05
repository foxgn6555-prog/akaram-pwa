/** غرفة العمليات — متابعة الحملات (00164): «تقرير متابعة وتوثيق حملات التنظيف والخدمات».
 * البيانات تأتي من تذاكر مسؤولي الأقسام (شارع/حملة/حملة مدارس) مع تفاصيلها: الموقع، تاريخ التنفيذ، القاطع والقسم (تلقائي)،
 * المراقبون، العمال، الآليات (قلاب/تنكر/كابسة/شفل/كناسة)، الصور (يوجد/لا يوجد)، الملاحظات.
 * ثلاثة تبويبات (حملات · حملات مدارس · تنظيف شوارع) وفلاتر القاطع/القسم/الفترة، وتصدير Excel بشعار الشركة وطباعة بترويسة رسمية. */
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { FileSpreadsheet, Images, Printer, School, Sparkles, Waypoints } from 'lucide-react'
import { useOpsCampaigns } from '@features/media/hooks'
import { useSectors } from '@features/sector'
import {
  CAMPAIGN_FIELD_LABEL,
  CAMPAIGN_REPORT_SUBTITLE,
  CAMPAIGN_REPORT_TITLE,
  SECTOR_LABEL,
  VEHICLE_COL,
  VEHICLE_KINDS,
  baghdadDay,
  type MediaMode,
  type SectorParent,
} from '@features/media/constants'
import type { OpsCampaignRow } from '@sdk/media.sdk'
import { buildExcelReport, type ReportColumn } from '@lib/export/excel-report'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const MODES: Array<{ key: MediaMode; label: string; icon: typeof Sparkles }> = [
  { key: 'campaign', label: 'الحملات', icon: Sparkles },
  { key: 'school', label: 'حملات المدارس', icon: School },
  { key: 'street', label: 'تنظيف الشوارع', icon: Waypoints },
]
const firstOfMonth = () => `${baghdadDay().slice(0, 7)}-01`
const vehTotal = (r: OpsCampaignRow) => VEHICLE_KINDS.reduce((s, v) => s + (r[VEHICLE_COL[v.key]] ?? 0), 0)
const fmtDay = (d: string) => new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Baghdad' }).format(new Date(d))

export default function OpsCampaignsPage() {
  const [mode, setMode] = useState<MediaMode>('campaign')
  const [parent, setParent] = useState<'' | SectorParent>('')
  const [sectorId, setSectorId] = useState<number | ''>('')
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(baghdadDay())
  const sectors = useSectors()
  const q = useOpsCampaigns({ mode, sectorParent: parent || null, sectorId: sectorId === '' ? null : sectorId, from: from || null, to: to || null })
  const rows = q.data ?? []
  const labels = CAMPAIGN_FIELD_LABEL[mode]
  const sectorOptions = useMemo(() => (sectors.data ?? []).filter((s) => !parent || s.parent_sector === parent), [sectors.data, parent])
  const totals = useMemo(
    () => ({
      supervisors: rows.reduce((s, r) => s + r.supervisors_count, 0),
      workers: rows.reduce((s, r) => s + r.workers_count, 0),
      photos: rows.reduce((s, r) => s + r.photo_count, 0),
      vehicles: Object.fromEntries(VEHICLE_KINDS.map((v) => [v.key, rows.reduce((s, r) => s + (r[VEHICLE_COL[v.key]] ?? 0), 0)])) as Record<string, number>,
    }),
    [rows],
  )
  const rangeLabel = `${from ? fmtDay(from) : '—'} → ${to ? fmtDay(to) : '—'}`
  const scopeLabel = [parent ? SECTOR_LABEL[parent] : 'كل القواطع', sectorId !== '' ? (sectors.data ?? []).find((s) => s.id === sectorId)?.name : 'كل الأقسام'].filter(Boolean).join(' · ')

  const exportExcel = async () => {
    const columns: ReportColumn[] = [
      { header: 'ت', key: 'seq', width: 5, align: 'center' },
      { header: labels.title, key: 'title', width: 26, wrap: true },
      { header: labels.location, key: 'location', width: 22, wrap: true },
      { header: labels.date, key: 'exec_date', width: 14, align: 'center' },
      { header: 'القاطع', key: 'parent', width: 14, align: 'center' },
      { header: 'القسم', key: 'department', width: 20, wrap: true },
      { header: 'نوع العمل', key: 'work_type', width: 18, wrap: true },
      { header: 'عدد المراقبين', key: 'supervisors', width: 10, align: 'center' },
      { header: 'عدد العمال', key: 'workers', width: 10, align: 'center' },
      ...VEHICLE_KINDS.map((v) => ({ header: v.label, key: v.key, width: 8, align: 'center' as const })),
      { header: 'مجموع الآليات', key: 'veh_total', width: 10, align: 'center' },
      { header: 'الصور', key: 'photos', width: 12, align: 'center' },
      { header: 'المرسل', key: 'by', width: 18 },
      { header: 'ملاحظات', key: 'notes', width: 30, wrap: true },
    ]
    await buildExcelReport({
      sheetName: CAMPAIGN_REPORT_SUBTITLE[mode],
      companySub: 'غرفة العمليات — متابعة الحملات',
      title: `${CAMPAIGN_REPORT_TITLE} — ${CAMPAIGN_REPORT_SUBTITLE[mode]}`,
      meta: `${scopeLabel} · الفترة ${from || '—'} → ${to || '—'} · ${rows.length} سجل · ${totals.workers} عامل · ${totals.photos} صورة`,
      columns,
      rows: rows.map((r, i) => ({
        seq: i + 1, title: r.title, location: r.location ?? '—', exec_date: r.exec_date, parent: r.sector_parent_name, department: r.department_names ?? '—', work_type: r.work_type ?? '—',
        supervisors: r.supervisors_count, workers: r.workers_count,
        ...Object.fromEntries(VEHICLE_KINDS.map((v) => [v.key, r[VEHICLE_COL[v.key]] ?? 0])),
        veh_total: vehTotal(r), photos: r.has_photos ? `يوجد (${r.photo_count})` : 'لا يوجد', by: r.submitted_by_name, notes: r.notes ?? '',
      })),
      totalRow: { seq: 'الإجمالي', supervisors: totals.supervisors, workers: totals.workers, ...totals.vehicles, veh_total: Object.values(totals.vehicles).reduce((a, b) => a + b, 0), photos: totals.photos },
      orientation: 'landscape',
      fileName: `campaigns-${mode}-${from || 'all'}-${to || 'all'}.xlsx`,
    })
  }

  return (
    <section dir="rtl" className="space-y-4 pb-4" data-testid="ops-campaigns">
      <style>{`@media print { @page { size: A4 landscape; margin: 0 } body * { visibility: hidden } #campaign-print, #campaign-print * { visibility: visible } #campaign-print { position: absolute; inset: 0; padding: 12mm; print-color-adjust: exact; -webkit-print-color-adjust: exact } }`}</style>
      <header className="rounded-3xl bg-gradient-to-l from-slate-950 via-emerald-950 to-emerald-800 p-6 text-white shadow-xl print:hidden">
        <p className="text-xs text-emerald-200">غرفة العمليات — متابعة الحملات</p>
        <h1 className="mt-1 text-xl font-black">{CAMPAIGN_REPORT_TITLE}</h1>
        <p className="mt-1 text-xs text-emerald-100">بيانات مسؤولي الأقسام (الموقع، التنفيذ، المراقبون، العمال، الآليات، الصور) مفلترة بالقاطع والقسم والفترة، مع تصدير Excel وطباعة بترويسة الشركة.</p>
      </header>

      <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 print:hidden">
        {MODES.map((m) => (
          <button key={m.key} type="button" data-testid={`camp-tab-${m.key}`} onClick={() => setMode(m.key)} className={clsx('flex h-10 items-center justify-center gap-1 rounded-lg text-xs font-black', mode === m.key ? 'bg-white shadow' : 'text-slate-600')}>
            <m.icon size={14} /> {m.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-4 print:hidden">
        <label className="text-[11px] font-bold text-slate-600">القاطع
          <select data-testid="camp-parent" value={parent} onChange={(e) => { setParent(e.target.value as '' | SectorParent); setSectorId('') }} className="mt-1 block h-10 rounded-xl border bg-white px-3 text-sm">
            <option value="">كل القواطع</option>
            <option value="karrada">{SECTOR_LABEL.karrada}</option>
            <option value="zaafaraniya">{SECTOR_LABEL.zaafaraniya}</option>
          </select>
        </label>
        <label className="text-[11px] font-bold text-slate-600">القسم
          <select data-testid="camp-sector" value={sectorId} onChange={(e) => setSectorId(e.target.value === '' ? '' : Number(e.target.value))} className="mt-1 block h-10 rounded-xl border bg-white px-3 text-sm">
            <option value="">كل الأقسام</option>
            {sectorOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-bold text-slate-600">من
          <input data-testid="camp-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block h-10 rounded-xl border px-3 text-sm" />
        </label>
        <label className="text-[11px] font-bold text-slate-600">إلى
          <input data-testid="camp-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block h-10 rounded-xl border px-3 text-sm" />
        </label>
        <div className="mr-auto flex gap-2">
          <button type="button" data-testid="camp-export" disabled={!rows.length} onClick={() => void exportExcel()} className="flex h-10 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-black text-white disabled:opacity-40">
            <FileSpreadsheet size={14} /> تصدير Excel
          </button>
          <button type="button" data-testid="camp-print" disabled={!rows.length} onClick={() => window.print()} className="flex h-10 items-center gap-2 rounded-xl border px-4 text-xs font-black text-slate-700 disabled:opacity-40">
            <Printer size={14} /> طباعة
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4 print:hidden" data-testid="camp-kpis">
        <Kpi label={`${CAMPAIGN_REPORT_SUBTITLE[mode]} في الفترة`} value={rows.length} />
        <Kpi label="العمال" value={totals.workers} />
        <Kpi label="الآليات" value={Object.values(totals.vehicles).reduce((a, b) => a + b, 0)} />
        <Kpi label="الصور" value={totals.photos} />
      </div>

      <div id="campaign-print" className="rounded-2xl border bg-white p-4 shadow-sm">
        {/* ترويسة رسمية (تظهر في الطباعة أيضاً) */}
        <div className="mb-3 flex items-center gap-3 border-b-4 border-[#005F8D] pb-3">
          <img src="/icons/logo.png" alt="شعار الشركة" className="size-14 object-contain" />
          <div className="flex-1">
            <p className="text-[11px] font-bold text-slate-500">شركة جزيرة الأكارم — غرفة العمليات</p>
            <h2 className="text-base font-black text-[#0B4261]">{CAMPAIGN_REPORT_TITLE}</h2>
            <p className="text-xs font-bold text-emerald-800" data-testid="camp-subtitle">{CAMPAIGN_REPORT_SUBTITLE[mode]} · {scopeLabel} · {rangeLabel}</p>
          </div>
          <div className="text-left text-[10px] text-slate-500">
            <div>{rows.length} سجل</div>
            <div>طُبع {fmtDay(baghdadDay())}</div>
          </div>
        </div>
        {q.isLoading ? <LoadingSpinner /> : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500" data-testid="camp-empty">لا سجلات {CAMPAIGN_REPORT_SUBTITLE[mode]} ضمن هذه الفلاتر.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-[11px]" data-testid="camp-table">
              <thead>
                <tr className="bg-[#005F8D] text-white">
                  {['ت', labels.title, labels.location, labels.date, 'القاطع', 'القسم', 'نوع العمل', 'المراقبون', 'العمال', ...VEHICLE_KINDS.map((v) => v.label), 'الصور', 'ملاحظات'].map((h) => (
                    <th key={h} className="whitespace-nowrap border border-slate-300 px-2 py-2 font-black">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} data-testid={`camp-row-${r.id}`} className={i % 2 ? 'bg-[#F1F7FB]' : 'bg-white'}>
                    <td className="border border-slate-200 px-2 py-1.5 text-center">{i + 1}</td>
                    <td className="border border-slate-200 px-2 py-1.5 font-bold">{r.title}{r.merged_count > 1 ? <span className="mr-1 text-[10px] text-amber-700">(مدموجة {r.merged_count})</span> : null}</td>
                    <td className="border border-slate-200 px-2 py-1.5">{r.location ?? '—'}</td>
                    <td className="border border-slate-200 px-2 py-1.5 text-center">{r.exec_date}</td>
                    <td className="border border-slate-200 px-2 py-1.5 text-center">{r.sector_parent_name}</td>
                    <td className="border border-slate-200 px-2 py-1.5">{r.department_names ?? '—'}</td>
                    <td className="border border-slate-200 px-2 py-1.5">{r.work_type ?? '—'}</td>
                    <td className="border border-slate-200 px-2 py-1.5 text-center">{r.supervisors_count}</td>
                    <td className="border border-slate-200 px-2 py-1.5 text-center">{r.workers_count}</td>
                    {VEHICLE_KINDS.map((v) => <td key={v.key} className="border border-slate-200 px-2 py-1.5 text-center">{r[VEHICLE_COL[v.key]] || '—'}</td>)}
                    <td className={clsx('border border-slate-200 px-2 py-1.5 text-center font-bold', r.has_photos ? 'text-emerald-700' : 'text-rose-700')}>
                      {r.has_photos ? <><Images size={11} className="inline" /> يوجد ({r.photo_count})</> : 'لا يوجد'}
                    </td>
                    <td className="border border-slate-200 px-2 py-1.5">{r.notes ?? ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#E2E8F0] font-black">
                  <td colSpan={7} className="border border-slate-300 px-2 py-2">الإجمالي ({rows.length})</td>
                  <td className="border border-slate-300 px-2 py-2 text-center">{totals.supervisors}</td>
                  <td className="border border-slate-300 px-2 py-2 text-center">{totals.workers}</td>
                  {VEHICLE_KINDS.map((v) => <td key={v.key} className="border border-slate-300 px-2 py-2 text-center">{totals.vehicles[v.key]}</td>)}
                  <td className="border border-slate-300 px-2 py-2 text-center">{totals.photos}</td>
                  <td className="border border-slate-300" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-white p-3">
      <div className="text-lg font-black text-slate-900">{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  )
}
