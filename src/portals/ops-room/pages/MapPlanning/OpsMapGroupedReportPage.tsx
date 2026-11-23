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
import { buildExcelReport, saveWorkbook, type ReportColumn } from '@lib/export/excel-report'
import {
  EXPORT_KINDS,
  ALLEYS_ONLY_COLUMNS,
  STREETS_ONLY_COLUMNS,
  alleysOnlyRows,
  buildSummarySheet,
  exportKind,
  extraSheetsFor,
  streetsOnlyRows,
  type ExportKindId,
} from '@features/map-planning/export-kinds'
import {
  GROUPED_HEADER,
  baghdadTime,
  dayText,
  groupedDwellText,
  groupedReportColumns,
  groupedTitle,
  groupedTotalRow,
  notesOf,
  sourceBadge,
  toGroupedRows,
  type GroupedContext,
} from '@features/map-planning/grouped-export'
import {
  useGroupedDrivers,
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
    const streets = rows.reduce((a, r) => a + r.streets_count, 0)
    const conf = rows.reduce((a, r) => a + r.confirmed_count, 0)
    const streetsOnly = rows.filter((r) => r.street_mahalla_source === 'street').length
    const unknown = rows.filter((r) => r.street_mahalla_source === 'unknown').length
    const uncertain = rows.reduce((a, r) => a + r.uncertain_count, 0)
    const totalDwell = rows.reduce((a, r) => a + r.total_dwell_seconds, 0)
    const dwellMinutes = Math.round(totalDwell / 60)
    return { visits, alleys, streets, conf, uncertain, streetsOnly, unknown, dwellMinutes, rows: rows.length }
  }, [rows])

  const activeFilterCount =
    (filters.vehicleId ? 1 : 0) + (filters.shift ? 1 : 0) +
    (filters.status ? 1 : 0) + (filters.mahalla ? 1 : 0) +
    (filters.respectVehicleZone === false ? 1 : 0) +
    (filters.driverId ? 1 : 0) + (filters.kind ? 1 : 0) +
    (filters.confirmedOnly ? 1 : 0)

  const setF = (patch: Partial<GroupedFilters>) =>
    setFilters((f) => ({ ...f, ...patch }))

  const drivers = useGroupedDrivers(activeZoneId, from, to)
  const exportCtx = useMemo(
    () => ({ zoneName: zoneName ?? '—', day: ctx.day, filterCount: activeFilterCount }),
    [zoneName, ctx.day, activeFilterCount],
  )

  /**
   * تصدير Excel — نوع واحد مختار من ثمانية.
   *
   * القاعدة: كل نوع يُبنى من **نفس الصفوف** المعروضة. لا استعلام ثانٍ ولا
   * حساب موازٍ في التصدير — وإلا اختلف الملف عمّا على الشاشة، وهو أسوأ عيب
   * في تقرير رسمي. والأنواع ذات الأعمدة الثابتة (الأزقة/الشوارع/غير المؤكد)
   * تأخذ تعريف أعمدتها من `export-kinds.ts` لا من هنا.
   */
  const exportExcel = async (kindId: ExportKindId = 'sheet') => {
    if (rows.length === 0 || busy) return
    setBusy(true)
    try {
      const kind = exportKind(kindId)
      const { extraSheets, charts } = extraSheetsFor(kindId, rows, exportCtx)

      // الأعمدة والصفوف بحسب النوع
      let columns: ReportColumn[]
      let data: Record<string, unknown>[]
      let totalRow: Record<string, unknown> | undefined
      if (kindId === 'alley') {
        columns = ALLEYS_ONLY_COLUMNS
        data = alleysOnlyRows(rows)
      } else if (kindId === 'street') {
        columns = STREETS_ONLY_COLUMNS
        data = streetsOnlyRows(rows)
      } else if (kindId === 'driver' || kindId === 'vehicle' || kindId === 'mahalla') {
        // الورقة الرئيسية = الملخّص نفسه، فلا نكرّره في extraSheets
        const sum = buildSummarySheet(kindId, rows, exportCtx)
        columns = sum.columns
        data = sum.rows
        totalRow = sum.totalRow
      } else {
        columns = groupedReportColumns(
          kindId === 'full' || showAllCols
            ? undefined
            : ['seq', 'db_number', 'plate_number', 'driver_name', 'zone_name',
               'mahalla_number', 'mahalla_source', 'alleys', 'notes', 'visits', 'dwell', 'shift'],
        )
        data = toGroupedRows(rows, ctx)
        totalRow = groupedTotalRow(rows) as Record<string, unknown> | undefined
      }

      const meta = `${rows.length} صفّاً · ${totals.visits} زيارة · ${totals.alleys} زقاقاً`
        + (activeFilterCount > 0 ? ` · ${activeFilterCount} فلتر مطبَّق` : '')
        + (filters.confirmedOnly ? ' · المؤكد فقط' : '')

      const wb = await buildExcelReport({
        sheetName: kind.label.slice(0, 28),
        company: GROUPED_HEADER.company,
        companySub: GROUPED_HEADER.companySub,
        title: `${kind.label} — ${groupedTitle(ctx.day, zoneName).replace(/^تقرير\s*/, '')}`,
        meta,
        columns,
        rows: data,
        ...(totalRow ? { totalRow } : {}),
        fileName: `${kind.label}-${zoneName ?? 'زون'}-${from}${to !== from ? '_' + to : ''}.xlsx`,
        orientation: 'landscape',
        // لو النوع ملخّص: الورقة الإضافية مكرّرة ⇒ لا نلحقها
        ...(kindId === 'driver' || kindId === 'vehicle' || kindId === 'mahalla'
          ? { charts: kindId === 'vehicle' ? charts : [] }
          : { extraSheets, charts }),
        deferSave: true,
      })
      await saveWorkbook(wb, `${kind.label}-${zoneName ?? 'زون'}-${from}.xlsx`)
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
            <button type="button" onClick={() => void exportExcel('sheet')} disabled={busy || rows.length === 0}
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

          {/* السائق */}
          <label className="block">
            <span className="mb-1 block text-[10px] font-black text-slate-500">السائق</span>
            <select value={filters.driverId ?? ''}
              onChange={(e) => setF({ driverId: e.target.value || null })}
              className="w-full rounded-xl border border-slate-200 px-2 py-2 text-xs font-bold">
              <option value="">
                كل السائقين ({(drivers.data ?? []).length})
              </option>
              {(drivers.data ?? []).map((d) => (
                <option key={d.driver_id} value={d.driver_id}>
                  {d.driver_name}{d.vehicles_count > 1 ? ` · ${d.vehicles_count} آليات` : ''}
                </option>
              ))}
            </select>
          </label>

          {/* نوع المكان */}
          <label className="block">
            <span className="mb-1 block text-[10px] font-black text-slate-500">نوع المكان</span>
            <select value={filters.kind ?? ''}
              onChange={(e) => setF({ kind: (e.target.value || null) as 'alley' | 'street' | null })}
              className="w-full rounded-xl border border-slate-200 px-2 py-2 text-xs font-bold">
              <option value="">الأزقة والشوارع</option>
              <option value="alley">الأزقة فقط</option>
              <option value="street">الشوارع فقط</option>
            </select>
          </label>
        </div>

        {/* زون الآلية + استبعاد غير المؤكد — طلب المستخدم الحرفي */}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-3">
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
              ? 'الآليات المربوطة بهذا الزون فقط — لا بيانات آلية خارج زونها.'
              : 'كل آلية دخلت الزون ولو كانت مربوطة بزون آخر (المشهد القديم).'}
          </span>

          <span className="h-5 w-px bg-slate-200" />

          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox"
              checked={filters.confirmedOnly === true}
              onChange={(e) => setF({ confirmedOnly: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300" />
            <span className="text-[11px] font-black text-slate-700">
              استبعاد الزيارات غير المؤكدة
            </span>
          </label>
          <span className="text-[10px] font-bold text-slate-500">
            {filters.confirmedOnly
              ? 'الزيارات غير المؤكدة مستبعدة — كل رقم في الورقة مؤكد.'
              : `تُعرض كل الزيارات${totals.uncertain > 0 ? `؛ منها ${totals.uncertain} غير مؤكدة موزّعة على الصفوف` : '، وكلها مؤكدة'}.`}
          </span>
        </div>
      </section>

      {/* ── أنواع التصدير الثمانية — «خيارات تصدير كثيرة» ── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-3 print:hidden">
        <p className="mb-2 flex items-center gap-1 text-[11px] font-black text-slate-600">
          <FileSpreadsheet size={13} /> أنواع التصدير
          <span className="text-[9px] font-bold text-slate-400">— كلها من نفس الصفوف المعروضة</span>
        </p>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
          {EXPORT_KINDS.map((k) => {
            const n = k.count(rows)
            const disabled = busy || n === 0
            return (
              <button key={k.id} type="button" onClick={() => void exportExcel(k.id)}
                disabled={disabled} title={k.hint}
                className="group flex flex-col items-start rounded-xl border border-slate-200 px-2.5 py-2 text-right transition hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40">
                <span className="text-[11px] font-black text-slate-800 group-hover:text-indigo-800">
                  {k.label}
                </span>
                <span className="mt-0.5 line-clamp-2 text-[9px] font-bold leading-snug text-slate-500">
                  {k.hint}
                </span>
                <span className={`mt-1 rounded px-1.5 py-0.5 text-[8px] font-black ${
                  n > 0 ? 'bg-slate-100 text-slate-600' : 'bg-rose-50 text-rose-600'
                }`}>
                  {n > 0 ? `${n} صفّ` : 'لا بيانات'}
                </span>
              </button>
            )
          })}
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
            <table className={`w-full text-right text-[11px] ${showAllCols ? 'min-w-[2100px]' : 'min-w-[900px]'}`}>
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
                  {showAllCols && (<>
                    <th className="p-2 font-black">التاريخ</th>
                    <th className="p-2 font-black">نوع الآلية</th>
                    <th className="p-2 font-black">رمز المحلة</th>
                    <th className="p-2 font-black">اسم المحلة</th>
                    <th className="p-2 font-black">عدد الأزقة</th>
                    <th className="p-2 font-black">عدد الشوارع</th>
                    <th className="p-2 font-black">مؤكدة</th>
                    <th className="p-2 font-black">غير مؤكدة</th>
                    <th className="p-2 font-black">أول دخول</th>
                    <th className="p-2 font-black">آخر خروج</th>
                    <th className="p-2 font-black">متوسط المكوث</th>
                    <th className="p-2 font-black">أقصى عمق</th>
                  </>)}
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
                      {showAllCols && (<>
                        <td className="p-2 text-center text-[10px] font-bold text-slate-600">{dayText(r.placeday) ?? '—'}</td>
                        <td className="p-2 text-center text-[10px] font-bold text-slate-600">{r.vehicle_name ?? '—'}</td>
                        <td className="p-2 text-center text-[10px] font-bold text-slate-500">{r.mahalla_code ?? '—'}</td>
                        <td className="p-2 text-center text-[10px] font-bold text-slate-600">{r.mahalla_name ?? '—'}</td>
                        <td className="p-2 text-center font-black text-slate-800">{r.alleys_count}</td>
                        <td className="p-2 text-center font-black text-slate-800">{r.streets_count}</td>
                        <td className="p-2 text-center font-bold text-emerald-700">{r.confirmed_count}</td>
                        <td className={`p-2 text-center font-bold ${r.uncertain_count > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                          {r.uncertain_count}
                        </td>
                        <td className="p-2 text-center text-[10px] font-bold text-slate-600">{baghdadTime(r.first_entered_at) ?? '—'}</td>
                        <td className="p-2 text-center text-[10px] font-bold text-slate-600">{baghdadTime(r.last_exited_at) ?? '—'}</td>
                        <td className="p-2 text-center text-[10px] font-bold text-slate-600">{groupedDwellText(r.avg_dwell_seconds) ?? '—'}</td>
                        <td className="p-2 text-center text-[10px] font-bold text-slate-600">{r.max_depth_m ?? '—'}</td>
                      </>)}
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
                  {showAllCols && (<>
                    <td className="p-2 text-center text-[10px] font-black text-slate-600">—</td>
                    <td className="p-2 text-center text-[10px] font-black text-slate-600">—</td>
                    <td className="p-2 text-center text-[10px] font-black text-slate-600">—</td>
                    <td className="p-2 text-center text-[10px] font-black text-slate-600">—</td>
                    <td className="p-2 text-center font-black text-slate-900">{totals.alleys}</td>
                    <td className="p-2 text-center font-black text-slate-900">{totals.streets}</td>
                    <td className="p-2 text-center font-black text-emerald-700">{totals.conf}</td>
                    <td className="p-2 text-center font-black text-amber-600">{totals.uncertain}</td>
                    <td className="p-2 text-center text-[10px] font-black text-slate-600">—</td>
                    <td className="p-2 text-center text-[10px] font-black text-slate-600">—</td>
                    <td className="p-2 text-center text-[10px] font-black text-slate-600">—</td>
                    <td className="p-2 text-center text-[10px] font-black text-slate-600">—</td>
                  </>)}
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
