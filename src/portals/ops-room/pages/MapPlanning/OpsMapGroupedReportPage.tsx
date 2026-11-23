/**
 * التقرير المعتمد — «الازقة المزارة لاليات شركة جزيرة الاكرام»
 *
 * يحاكي ورقة الشركة الورقية (2026-11-19) لكن ببيانات GPS حقيقية:
 *   رقم الآلية · اسم السائق · المركز البلدي · رقم المحلة · الأزقة · الملاحظات
 * وصفّ واحد لكل (آلية × محلة)، والأزقة أرقام مفصولة بفاصلة.
 *
 * الفرق الجوهري عن الصفحة الورقية: كل رقم هنا **قابل للتتبع** إلى زيارة
 * مسجَّلة، والشوارع تبقى بلا محلة كما هي في الخريطة — لا تخمين ولا اشتقاق.
 *
 * الفلاتر كلها على الخادم (RPC) لا على العميل: جدول بـ٨ أزون × ٣٠ يوماً
 * لا يُحمَّل كاملاً ليُفلتر في المتصفح.
 */
import { useMemo, useState } from 'react'
import { Download, FileSpreadsheet, Filter, Info, Printer, X } from 'lucide-react'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { buildExcelReport, saveWorkbook } from '@lib/export/excel-report'
import {
  GROUPED_HEADER,
  groupedReportColumns,
  groupedTitle,
  groupedTotalRow,
  notesOf,
  sourceBadge,
  toGroupedRows,
  type GroupedContext,
} from '@features/map-planning/grouped-export'
import {
  useMapZones,
  useVehicleVisitsGrouped,
  useVehiclesDay,
  type GroupedFilters,
} from '@features/map-planning/hooks/useMapPlanning'
import {
  MAHALLA_SOURCE_HINT_AR,
  SHIFT_LABEL_AR,
  type GroupedVisitRow,
} from '@sdk/map-planning.sdk'

const todayBaghdad = () => new Date(Date.now() + 3 * 60 * 60_000).toISOString().slice(0, 10)
const daysAgoBaghdad = (n: number) =>
  new Date(Date.now() + 3 * 60 * 60_000 - n * 86_400_000).toISOString().slice(0, 10)

const shiftLabel = (s: string | null | undefined) =>
  s ? (SHIFT_LABEL_AR[s] ?? s) : '—'

const hhmm = (v: string | null | undefined) =>
  v ? new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Baghdad',
  }).format(new Date(v)) : '—'

export default function MapGroupedReportPage() {
  const { data: zones = [] } = useMapZones()
  const [zoneId, setZoneId] = useState<string | null>(null)
  const activeZoneId = zoneId ?? zones[0]?.id ?? null
  const [from, setFrom] = useState(daysAgoBaghdad(1))
  const [to, setTo] = useState(todayBaghdad())
  const [filters, setFilters] = useState<GroupedFilters>({})
  const [showAllCols, setShowAllCols] = useState(false)
  const [busy, setBusy] = useState(false)

  const { data: rows = [], isLoading, isError, error } = useVehicleVisitsGrouped(
    activeZoneId, from, to, filters,
  )
  // الآليات التي عملت فعلاً — لا نعرض قائمة الأسطول كاملة ليختار منها ما لا بيانات له
  const { data: vehicles = [] } = useVehiclesDay(activeZoneId, to)

  const zoneName = useMemo(
    () => zones.find((z) => z.id === activeZoneId)?.name ?? null,
    [zones, activeZoneId],
  )

  const ctx: GroupedContext = useMemo(
    () => ({ zoneName: zoneName ?? '—', shiftLabel, day: from === to ? from : `${from} ← ${to}` }),
    [zoneName, from, to],
  )

  const totals = useMemo(() => {
    const visits = rows.reduce((a, r) => a + r.visits_count, 0)
    const alleys = rows.reduce((a, r) => a + r.alleys_count, 0)
    const conf = rows.reduce((a, r) => a + r.confirmed_count, 0)
    const streetsOnly = rows.filter((r) => r.street_mahalla_source === 'street').length
    const unknown = rows.filter((r) => r.street_mahalla_source === 'unknown').length
    const totalDwell = rows.reduce((a, r) => a + r.total_dwell_seconds, 0)
    const dwellMinutes = Math.round(totalDwell / 60)
    return { visits, alleys, conf, streetsOnly, unknown, dwellMinutes, rows: rows.length }
  }, [rows])

  const activeFilterCount =
    (filters.vehicleId ? 1 : 0) + (filters.shift ? 1 : 0) +
    (filters.status ? 1 : 0) + (filters.mahalla ? 1 : 0) +
    (filters.respectVehicleZone === false ? 1 : 0)

  const setF = (patch: Partial<GroupedFilters>) =>
    setFilters((f) => ({ ...f, ...patch }))

  /** تصدير Excel — نفس الدالة تبني ما يظهر على الشاشة حرفياً */
  const exportExcel = async () => {
    if (rows.length === 0 || busy) return
    setBusy(true)
    try {
      const wb = await buildExcelReport({
        sheetName: 'الازقة المزارة',
        company: GROUPED_HEADER.company,
        companySub: GROUPED_HEADER.companySub,
        title: groupedTitle(ctx.day, zoneName),
        meta: `${rows.length} صفّاً · ${totals.visits} زيارة · ${totals.alleys} زقاقاً`
          + (activeFilterCount > 0 ? ` · ${activeFilterCount} فلتر مطبَّق` : ''),
        columns: groupedReportColumns(
          showAllCols
            ? undefined
            : ['seq', 'db_number', 'plate_number', 'driver_name', 'zone_name',
               'mahalla_number', 'mahalla_source', 'alleys', 'notes', 'visits', 'dwell', 'shift'],
        ),
        rows: toGroupedRows(rows, ctx),
        totalRow: groupedTotalRow(rows),
        fileName: `الازقة-المزارة-${zoneName ?? 'زون'}-${from}${to !== from ? '_' + to : ''}.xlsx`,
        orientation: 'landscape',
        deferSave: true,
      })
      await saveWorkbook(wb, `الازقة-المزارة-${zoneName ?? 'زون'}-${from}.xlsx`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4" dir="rtl">
      <ExecPageHeader icon="map-pin"
        title="الأزقة المزارة (التقرير المعتمد)"
        subtitle={`${zoneName ?? '—'} · ${ctx.day} · ${totals.rows} صفّاً · ${totals.visits} زيارة · ${totals.alleys} زقاقاً`}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={exportExcel} disabled={busy || rows.length === 0}
              className="flex items-center gap-1 rounded-xl bg-white/15 px-3 py-2 text-xs font-black text-white ring-1 ring-white/25 disabled:opacity-50">
              <FileSpreadsheet size={14} />
              {busy ? 'يُجهّز…' : 'Excel'}
            </button>
            <button type="button" onClick={() => window.print()} disabled={rows.length === 0}
              className="flex items-center gap-1 rounded-xl bg-white/15 px-3 py-2 text-xs font-black text-white ring-1 ring-white/25 disabled:opacity-50">
              <Printer size={14} /> طباعة
            </button>
            <button type="button" onClick={() => setShowAllCols((v) => !v)} aria-pressed={showAllCols}
              className={`flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-black ring-1 ${
                showAllCols ? 'bg-white text-[#0b3d6b] ring-white' : 'bg-white/15 text-white ring-white/25'
              }`}>
              <Download size={14} /> {showAllCols ? 'أعمدة كاملة' : 'أعمدة الورقة'}
            </button>
          </div>
        }
        links={[
          { to: '/ops-room/map-planning/vehicle-visits', label: 'زيارات الآلية', icon: 'truck' },
          { to: '/ops-room/map-planning/visits', label: 'الزيارات', icon: 'list' },
        ]}
      />

      {/* ── الزون والمدى ── */}
      <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 print:hidden">
        {zones.map((z) => (
          <button key={z.id} type="button"
            onClick={() => { setZoneId(z.id); setFilters({}) }}
            aria-pressed={z.id === activeZoneId}
            className={`rounded-xl px-3 py-2 text-xs font-black ${
              z.id === activeZoneId ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-700'
            }`}>
            {z.name}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <label className="flex items-center gap-1 text-[10px] font-black text-slate-500">
          من
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
            className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs font-bold" />
        </label>
        <label className="flex items-center gap-1 text-[10px] font-black text-slate-500">
          إلى
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)}
            className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs font-bold" />
        </label>
        <span className="text-[10px] font-bold text-slate-400">يوم بغداد</span>
      </section>

      {/* ── الفلاتر ── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-3 print:hidden">
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1 text-[11px] font-black text-slate-600">
            <Filter size={13} /> الفلاتر
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[9px] text-indigo-700">
                {activeFilterCount} مطبَّق
              </span>
            )}
          </p>
          {activeFilterCount > 0 && (
            <button type="button" onClick={() => setFilters({})}
              className="flex items-center gap-1 text-[10px] font-black text-rose-600">
              <X size={11} /> مسح الكل
            </button>
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {/* الآلية */}
          <label className="block">
            <span className="mb-1 block text-[10px] font-black text-slate-500">الآلية</span>
            <select value={filters.vehicleId ?? ''}
              onChange={(e) => setF({ vehicleId: e.target.value || null })}
              className="w-full rounded-xl border border-slate-200 px-2 py-2 text-xs font-bold">
              <option value="">كل الآليات ({vehicles.length})</option>
              {vehicles.map((v) => (
                <option key={v.vehicle_id} value={v.vehicle_id}>
                  {v.db_number} · {v.driver_name ?? '—'}
                </option>
              ))}
            </select>
          </label>

          {/* الشفت */}
          <label className="block">
            <span className="mb-1 block text-[10px] font-black text-slate-500">الشفت</span>
            <select value={filters.shift ?? ''}
              onChange={(e) => setF({ shift: e.target.value || null })}
              className="w-full rounded-xl border border-slate-200 px-2 py-2 text-xs font-bold">
              <option value="">كل الشفتات</option>
              {Object.entries(SHIFT_LABEL_AR).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </label>

          {/* الحالة */}
          <label className="block">
            <span className="mb-1 block text-[10px] font-black text-slate-500">حالة الزيارة</span>
            <select value={filters.status ?? ''}
              onChange={(e) =>
                setF({ status: (e.target.value || null) as 'confirmed' | 'uncertain' | null })}
              className="w-full rounded-xl border border-slate-200 px-2 py-2 text-xs font-bold">
              <option value="">الكل</option>
              <option value="confirmed">مؤكد</option>
              <option value="uncertain">غير مؤكد</option>
            </select>
          </label>

          {/* المحلة */}
          <label className="block">
            <span className="mb-1 block text-[10px] font-black text-slate-500">المحلة</span>
            <input type="text" value={filters.mahalla ?? ''}
              onChange={(e) => setF({ mahalla: e.target.value.trim() || null })}
              placeholder="901 · 903 · 929…"
              className="w-full rounded-xl border border-slate-200 px-2 py-2 text-xs font-bold" />
          </label>
        </div>

        {/* زون الآلية — طلب المستخدم: «الأرخيته فقط» */}
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox"
              checked={filters.respectVehicleZone !== false}
              onChange={(e) => setF({ respectVehicleZone: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300" />
            <span className="text-[11px] font-black text-slate-700">
              حصر النتائج في زون الآلية
            </span>
          </label>
          <span className="text-[10px] font-bold text-slate-500">
            {filters.respectVehicleZone !== false
              ? 'تُعرض الآليات المربوطة بهذا الزون فقط — لا بيانات آلية خارج زونها.'
              : 'يُعرض كل آلية دخلت الزون ولو كانت مربوطة بزون آخر (المشهد القديم).'}
          </span>
        </div>
      </section>

      {/* ── صفوف الشوارع: لا محلة لها، ولا نخترع لها واحدة ── */}
      {(totals.streetsOnly > 0 || totals.unknown > 0) && (
        <section className="flex items-start gap-2 rounded-2xl border border-sky-200 bg-sky-50 p-3 print:hidden">
          <Info size={14} className="mt-0.5 shrink-0 text-sky-600" />
          <div className="text-[10px] font-bold leading-relaxed text-sky-900">
            <p>
              {totals.streetsOnly > 0 && (
                <><strong>{totals.streetsOnly}</strong> صفّاً هي <strong>شوارع بلا محلة</strong> —
                الشوارع لا تحمل رقم محلة في الخريطة، فتُعرض مستقلة ولا تُنسب إلى محلة تخميناً. </>
              )}
              {totals.unknown > 0 && (
                <><strong>{totals.unknown}</strong> صفّاً محلته <strong>غير معروفة</strong> —
                زقاق بلا محلة في القاعدة، يحتاج ربطاً.</>
              )}
            </p>
            <p className="mt-1 text-sky-700">{MAHALLA_SOURCE_HINT_AR.street}</p>
          </div>
        </section>
      )}

      {/* ── الجدول ── */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {/* ترويسة الطباعة — تظهر فقط عند الطباعة */}
        <div className="hidden border-b border-slate-300 p-4 text-center print:block">
          <p className="text-[11px] font-black text-slate-700">{GROUPED_HEADER.org}</p>
          <p className="mt-1 text-sm font-black text-[#0b3d6b]">{GROUPED_HEADER.company}</p>
          <p className="text-[10px] font-bold text-slate-500">{GROUPED_HEADER.companySub}</p>
          <p className="mt-2 text-xs font-black text-slate-800">{groupedTitle(ctx.day, zoneName)}</p>
        </div>

        {isLoading ? (
          <p className="p-6 text-center text-xs font-bold text-slate-500">يُحمّل…</p>
        ) : isError ? (
          <p className="p-6 text-center text-xs font-bold text-rose-600">
            تعذّر تحميل التقرير: {(error as Error)?.message ?? 'خطأ غير معروف'}
          </p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-center text-xs font-bold text-slate-500">
            لا زيارات في هذا المدى بهذه الفلاتر.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-right text-[11px]">
              <thead className="bg-[#0b3d6b] text-white">
                <tr>
                  <th className="p-2 font-black">ت</th>
                  <th className="p-2 font-black">رقم الآلية</th>
                  <th className="p-2 font-black">اللوحة</th>
                  <th className="p-2 font-black">اسم السائق</th>
                  <th className="p-2 font-black">المركز البلدي</th>
                  <th className="p-2 font-black">المحلة</th>
                  <th className="p-2 font-black">الازقة</th>
                  {showAllCols && <th className="p-2 font-black">أسماء الأزقة</th>}
                  <th className="p-2 font-black">الشوارع</th>
                  <th className="p-2 font-black">الملاحظات</th>
                  <th className="p-2 font-black">الزيارات</th>
                  <th className="p-2 font-black">المكوث</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: GroupedVisitRow, i: number) => {
                  const badge = sourceBadge(r)
                  return (
                    <tr key={`${r.vehicle_id}-${r.placeday}-${r.mahalla_code ?? 'none'}-${i}`}
                      className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="p-2 text-center font-bold text-slate-400">{i + 1}</td>
                      <td className="p-2 text-center font-black text-slate-900">{r.db_number ?? '—'}</td>
                      <td className="p-2 text-center font-bold text-slate-600">{r.plate_number ?? '—'}</td>
                      <td className="p-2 font-black text-slate-800">{r.driver_name ?? '—'}</td>
                      <td className="p-2 text-center font-bold text-slate-600">{r.zone_name ?? '—'}</td>
                      <td className="p-2 text-center font-black text-slate-900">
                        {r.mahalla_number ?? '—'}
                        {badge && (
                          <span className="ms-1 rounded bg-amber-100 px-1 py-0.5 text-[8px] font-black text-amber-800"
                            title={MAHALLA_SOURCE_HINT_AR[r.street_mahalla_source]}>
                            {badge}
                          </span>
                        )}
                      </td>
                      <td className="p-2 font-bold text-indigo-800">{r.alley_week_or_num ?? '—'}</td>
                      {showAllCols && (
                        <td className="p-2 text-[10px] text-slate-600">{r.alley_names ?? '—'}</td>
                      )}
                      <td className="p-2 text-[10px] text-slate-600">{r.street_names ?? '—'}</td>
                      <td className="p-2 text-[10px] text-slate-500">{notesOf(r) || '—'}</td>
                      <td className="p-2 text-center font-black text-slate-900">
                        {r.visits_count}
                        {r.uncertain_count > 0 && (
                          <span className="ms-1 text-[9px] font-bold text-amber-600"
                            title="منها غير مؤكدة">
                            ({r.uncertain_count}؟)
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-center text-[10px] font-bold text-slate-600">
                        {Math.round(r.total_dwell_seconds / 60)} د
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-slate-100">
                <tr>
                  <td className="p-2 text-center font-black" colSpan={10}>الإجمالي</td>
                  <td className="p-2 text-center font-black text-slate-900">{totals.visits}</td>
                  <td className="p-2 text-center text-[10px] font-black text-slate-600">
                    {totals.dwellMinutes > 0 ? `${totals.dwellMinutes} د` : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* تذييل الطباعة */}
        <div className="hidden items-center justify-between border-t border-slate-300 p-3 text-[9px] font-bold text-slate-500 print:flex">
          <span>طُبع في {hhmm(new Date().toISOString())} — يوم بغداد</span>
          <span>{GROUPED_HEADER.companySub}</span>
        </div>
      </section>
    </div>
  )
}
