import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Activity,
  BellRing,
  CalendarDays,
  Check,
  ChevronDown,
  Download,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  TimerReset,
} from 'lucide-react'
import {
  useOpsAlerts,
  useOpsAttendance,
  useOpsGarageTrips,
  useOpsMaintenance,
  useOpsMovements,
  useOpsStationVisits,
  useOpsVehicleKpis,
} from '@features/vehicle-operations/hooks'
import { useOpsWorkflow, useSectorTonnage } from '@features/transfer-station'
import { buildExcelReport, type ReportColumn } from '@lib/export/excel-report'
import { MaintenanceTimelineDialog } from '@features/vehicle-operations/components/MaintenanceTimelineDialog'

export type OperationsTab =
  'alerts' | 'summary' | 'movements' | 'station' | 'weighings' | 'sectors' | 'garage' | 'maintenance' | 'attendance'
type Row = Record<string, unknown>
const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date())
const dateTime = (value: unknown) =>
  value
    ? new Intl.DateTimeFormat('ar-IQ', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Asia/Baghdad',
      }).format(new Date(String(value)))
    : '—'
const minutes = (value: unknown) => {
  const n = Number(value)
  return !Number.isFinite(n) ? '—' : n < 60 ? `${n} د` : `${Math.floor(n / 60)} س ${n % 60} د`
}
const labels: Record<string, string> = {
  alert_id: 'معرف التنبيه',
  action_link: 'جهة المعالجة',
  case_id: 'معرف حالة الصيانة',
  parent_sector: 'القاطع',
  inbound_count: 'شحنات واردة',
  inbound_tons: 'أطنان واردة',
  press_tons: 'أطنان المكبس',
  station_tons: 'أطنان المحطة',
  violation_count: 'مخالفات',
  trip_day: 'اليوم',
  weighed_at: 'وقت الوزن',
  weight_tons: 'الوزن (طن)',
  destination_label: 'الوجهة',
  kind_label: 'نوع الآلية',
  min_tons: 'الحد الأدنى (طن)',
  violation: 'مخالفة',
  deficit_tons: 'الفرق (طن)',
  weigh_wait_minutes: 'انتظار الوزن (د)',
  process_minutes: 'مدة العملية (د)',
  visit_id: 'معرف الزيارة',
  departure_id: 'معرف الرحلة',
  vehicle_name: 'الآلية',
  db_number: 'رقم DB',
  driver_name: 'السائق',
  shift: 'الشفت',
  sector_id: 'المنطقة',
  area_name: 'اسم المنطقة',
  manager_name: 'مسؤول القسم',
  started_at: 'بداية الرحلة',
  completed_at: 'نهاية الرحلة',
  total_minutes: 'المدة الكلية',
  movement_minutes: 'وقت الحركة',
  productive_minutes: 'وقت العمل المنتج',
  station_minutes: 'البقاء في المحطة',
  maintenance_minutes: 'وقت الصيانة',
  downtime_minutes: 'مدة العطل',
  other_minutes: 'توقف/انتظار آخر',
  station_visit_count: 'زيارات المحطة',
  breakdown_count: 'عدد الأعطال',
  maintenance_count: 'مرات الصيانة',
  origin_type: 'من',
  destination_type: 'إلى',
  departed_at: 'وقت المغادرة',
  arrived_at: 'وقت الوصول',
  duration_minutes: 'مدة الحركة',
  visit_number: 'رقم الزيارة',
  inbound_departed_at: 'التوجه للمحطة',
  dispatched_at: 'مغادرة المحطة',
  outbound_destination: 'الوجهة التالية',
  status: 'الحالة',
  transit_minutes: 'مدة الطريق',
  stay_minutes: 'مدة البقاء',
  fault_type: 'نوع العطل',
  priority: 'الأولوية',
  progress: 'نسبة الإنجاز',
  reported_at: 'وقت البلاغ',
  expected_completion_at: 'الموعد المتوقع',
  actual_cost: 'الكلفة الفعلية',
  estimated_cost: 'الكلفة التقديرية',
  assigned_technician: 'الفني',
  is_present: 'حاضر',
  worker_name: 'العامل',
  log_date: 'التاريخ',
  severity: 'الخطورة',
  title: 'التنبيه',
  details: 'التفاصيل',
  threshold_minutes: 'الحد المسموح',
  elapsed_minutes: 'المدة الحالية',
  alert_type: 'نوع التنبيه',
  timeline: 'التسلسل الزمني',
}
const tabs: Record<OperationsTab, string> = {
  alerts: 'التنبيهات الحية',
  summary: 'الملخص المركب',
  movements: 'حركة الآليات',
  station: 'زيارات المحطة',
  weighings: 'أوزان المحطة والوجهات',
  sectors: 'أطنان القواطع',
  garage: 'الكراج والورديات',
  maintenance: 'الأعطال والصيانة',
  attendance: 'حضور العمال',
}
const reportKeys: Record<OperationsTab, string[]> = {
  summary: [
    'vehicle_name',
    'db_number',
    'driver_name',
    'shift',
    'area_name',
    'manager_name',
    'started_at',
    'completed_at',
    'total_minutes',
    'movement_minutes',
    'productive_minutes',
    'station_minutes',
    'maintenance_minutes',
    'downtime_minutes',
    'other_minutes',
    'station_visit_count',
    'breakdown_count',
    'maintenance_count',
  ],
  alerts: [
    'severity',
    'title',
    'details',
    'db_number',
    'driver_name',
    'shift',
    'area_name',
    'manager_name',
    'started_at',
    'threshold_minutes',
    'elapsed_minutes',
    'action_link',
  ],
  movements: [
    'vehicle_name',
    'db_number',
    'driver_name',
    'shift',
    'area_name',
    'manager_name',
    'origin_type',
    'destination_type',
    'departed_at',
    'arrived_at',
    'duration_minutes',
    'status',
  ],
  sectors: [
    'parent_sector',
    'inbound_count',
    'inbound_tons',
    'press_tons',
    'station_tons',
    'violation_count',
  ],
  weighings: [
    'trip_day',
    'db_number',
    'vehicle_name',
    'driver_name',
    'shift',
    'area_name',
    'manager_name',
    'inbound_departed_at',
    'arrived_at',
    'weighed_at',
    'completed_at',
    'dispatched_at',
    'weight_tons',
    'destination_label',
    'kind_label',
    'min_tons',
    'violation',
    'deficit_tons',
    'transit_minutes',
    'weigh_wait_minutes',
    'process_minutes',
    'stay_minutes',
  ],
  station: [
    'vehicle_name',
    'db_number',
    'driver_name',
    'shift',
    'area_name',
    'visit_number',
    'inbound_departed_at',
    'arrived_at',
    'dispatched_at',
    'outbound_destination',
    'transit_minutes',
    'stay_minutes',
    'status',
  ],
  garage: [
    'vehicle_name',
    'db_number',
    'driver_name',
    'shift',
    'area_name',
    'manager_name',
    'departed_at',
    'arrived_at',
    'completed_at',
    'total_minutes',
    'status',
  ],
  maintenance: [
    'vehicle_name',
    'db_number',
    'fault_type',
    'priority',
    'status',
    'progress',
    'assigned_technician',
    'reported_at',
    'expected_completion_at',
    'maintenance_minutes',
    'estimated_cost',
    'actual_cost',
    'timeline',
  ],
  attendance: [
    'worker_name',
    'area_name',
    'shift',
    'log_date',
    'is_present',
    'started_at',
    'completed_at',
    'total_minutes',
  ],
}
const dateKeys = (key: string) =>
  key.endsWith('_at') || key === 'started_at' || key === 'completed_at'
const minuteKeys = (key: string) => key.endsWith('_minutes')
const values: Record<string, string> = {
  morning: 'صباحي',
  evening: 'مسائي',
  night: 'ليلي',
  critical: 'حرج',
  warning: 'تحذير',
  garage: 'الكراج المركزي',
  site: 'موقع العمل',
  station: 'محطة التحويل',
  maintenance: 'الصيانة',
  open: 'مفتوحة',
  in_transit: 'في الطريق',
  arrived: 'تم الوصول',
  completed: 'مكتملة',
  returned: 'عادت إلى الكراج',
  work_site: 'موقع العمل',
  back_to_site: 'العودة إلى موقع العمل',
  back_to_garage: 'العودة إلى الكراج',
  garage_arrival_delay: 'تأخر الوصول من الكراج',
  open_leg_stale: 'رحلة مفتوحة دون تحديث',
  maintenance_overdue: 'تجاوز موعد الصيانة',
  dispatched: 'غادرت المحطة',
  pending: 'بانتظار الإجراء',
  at_site: 'في موقع العمل',
  at_station: 'في محطة التحويل',
  at_maintenance: 'في الصيانة',
  active: 'نشطة',
  closed: 'مغلقة',
}
const links: Record<string, string> = {
  '/manager/vehicle-trips': 'مسؤول القسم — رحلات الآليات',
  '/ops-room/operations-data': 'غرفة العمليات — التقارير التشغيلية',
  '/central-garage/drivers-dispatch': 'الكراج المركزي — الانطلاق والعودة',
  '/maintenance/vehicle-cases': 'الصيانة — حالات الآليات',
  '/transfer-station/vehicle-movements': 'محطة التحويل — حركة الآليات',
}
function readableValue(key: string, value: unknown) {
  if (key === 'timeline') return 'متاح داخل المنصة'
  if (value === null || value === undefined || value === '') return '—'
  if (dateKeys(key)) return dateTime(value)
  if (minuteKeys(key)) return minutes(value)
  if (key === 'action_link') return links[String(value)] ?? 'صفحة المعالجة المختصة'
  if (key === 'sector_id') return `المنطقة رقم ${String(value)}`
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا'
  return values[String(value)] ?? String(value)
}

export default function OperationsDataPage() {
  const [from, setFrom] = useState(today()),
    [to, setTo] = useState(today()),
    [tab, setTab] = useState<OperationsTab>('summary'),
    [search, setSearch] = useState(''),
    [shift, setShift] = useState(''),
    [sector, setSector] = useState(''),
    [severity, setSeverity] = useState(''),
    [showColumns, setShowColumns] = useState(false),
    [columnChoice, setColumnChoice] = useState<Partial<Record<OperationsTab, string[]>>>({}),
    [timeline, setTimeline] = useState<{ caseId: string; title: string } | null>(null)
  const alertQuery = useOpsAlerts({
      shift: shift || undefined,
      sectorId: sector ? Number(sector) : undefined,
      severity: severity === 'warning' || severity === 'critical' ? severity : undefined,
    }),
    kpis = useOpsVehicleKpis(from, to, {
      search,
      shift: shift || undefined,
      sectorId: sector ? Number(sector) : undefined,
    }),
    movements = useOpsMovements(from, to),
    station = useOpsStationVisits(from, to),
    garage = useOpsGarageTrips(from, to),
    maintenance = useOpsMaintenance(from, to),
    attendance = useOpsAttendance(from, to)
  const weighings = useOpsWorkflow()
  const sectorsTonnage = useSectorTonnage(from, to)
  const allSources = useMemo<Record<OperationsTab, Row[]>>(
    () => ({
      alerts: (alertQuery.data ?? []) as unknown as Row[],
      summary: kpis.data ?? [],
      movements: (movements.data ?? []) as unknown as Row[],
      station: station.data ?? [],
      weighings: (weighings.data ?? []) as unknown as Row[],
      sectors: (sectorsTonnage.data ?? []).map((row) => ({
        ...row,
        parent_sector: row.parent_sector === 'karrada' ? 'الكرادة' : row.parent_sector === 'zaafaraniya' ? 'الزعفرانية' : row.parent_sector,
      })) as unknown as Row[],
      garage: garage.data ?? [],
      maintenance: maintenance.data ?? [],
      attendance: attendance.data ?? [],
    }),
    [
      alertQuery.data,
      kpis.data,
      movements.data,
      station.data,
      weighings.data,
      sectorsTonnage.data,
      garage.data,
      maintenance.data,
      attendance.data,
    ],
  )
  const source = allSources[tab]
  const rows = useMemo(
    () =>
      source.filter((row) => {
        const text = JSON.stringify(row).toLowerCase()
        return (
          (!search || text.includes(search.toLowerCase())) &&
          (!shift || row.shift === shift) &&
          (!sector || Number(row.sector_id) === Number(sector)) &&
          (!severity || tab !== 'alerts' || row.severity === severity)
        )
      }),
    [source, search, shift, sector, severity, tab],
  )
  const available = useMemo(() => reportKeys[tab].filter((key) => labels[key]), [tab])
  const selected = columnChoice[tab] ?? available
  const visible = available.filter((key) => selected.includes(key))
  const sectors = useMemo(
    () => [
      ...new Map(
        Object.values(allSources)
          .flat()
          .filter((r) => r.sector_id)
          .map((r) => [Number(r.sector_id), String(r.area_name ?? r.sector_id)]),
      ).entries(),
    ],
    [allSources],
  )
  const sum = (key: string) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0)
  const activeFilterCount = [search, shift, sector, tab === 'alerts' ? severity : ''].filter(
    Boolean,
  ).length
  const isLoading = [alertQuery, kpis, movements, station, garage, maintenance, attendance, sectorsTonnage].some(
    (query) => query.isLoading,
  )
  const setRange = (days: number) => {
    const end = new Date()
    const start = new Date(end.getTime() - (days - 1) * 86_400_000)
    setFrom(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(start))
    setTo(today())
  }
  const resetFilters = () => {
    setFrom(today())
    setTo(today())
    setSearch('')
    setShift('')
    setSector('')
    setSeverity('')
  }
  const toggleColumn = (key: string) =>
    setColumnChoice((old) => {
      const current = old[tab] ?? available
      return {
        ...old,
        [tab]: current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
      }
    })
  const exportExcel = async () => {
    const columns: ReportColumn[] = (visible.length ? visible : available).map((key) => ({
      header: labels[key] ?? key,
      key,
      width: minuteKeys(key) ? 16 : 22,
      wrap: true,
    }))
    await buildExcelReport({
      sheetName: tabs[tab].slice(0, 28),
      companySub: 'غرفة العمليات المركزية',
      title: tabs[tab],
      meta: `الفترة ${from} إلى ${to} · النتائج ${rows.length} · البحث ${search || 'الكل'} · الشفت ${shift || 'الكل'} · المنطقة ${sector || 'الكل'}`,
      fileName: `غرفة-العمليات-${tab}-${from}-${to}.xlsx`,
      orientation: 'landscape',
      columns,
      rows: rows.map((row) =>
        Object.fromEntries(
          (visible.length ? visible : available).map((key) => [key, readableValue(key, row[key])]),
        ),
      ),
    })
  }
  return (
    <section dir="rtl" className="space-y-5" data-testid="operations-data-page">
      <header className="relative isolate overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl shadow-slate-950/10 md:p-8">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(34,211,238,.22),transparent_28%),radial-gradient(circle_at_85%_90%,rgba(99,102,241,.28),transparent_32%)]" />
        <div className="absolute -left-16 -top-20 -z-10 size-64 rounded-full border border-white/10" />
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold text-cyan-300">
              <Sparkles size={16} /> غرفة العمليات · مركز القرار التشغيلي
            </p>
            <h1 className="mt-3 text-2xl font-black tracking-tight md:text-3xl">
              التقارير وذكاء العمليات
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-300">
              رؤية موحدة للرحلات والحركة والعمل المنتج والمحطة والكراج والصيانة، مع تقارير قابلة
              للتخصيص والتصدير.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 backdrop-blur">
              <b className="block text-xl">{Object.values(allSources).flat().length}</b>
              <span className="text-[10px] text-slate-300">سجل ضمن المصادر</span>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 backdrop-blur">
              <b className="block text-xl text-cyan-300">{isLoading ? '…' : 'محدّث'}</b>
              <span className="text-[10px] text-slate-300">حالة البيانات</span>
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-4 rounded-[2rem] border border-slate-200/80 bg-white p-5 shadow-lg shadow-slate-200/40 md:grid-cols-3 xl:grid-cols-6">
        <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-3 xl:col-span-6">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
              <SlidersHorizontal size={19} />
            </span>
            <div>
              <h2 className="font-black text-slate-900">نطاق التقرير والفلاتر</h2>
              <p className="mt-1 text-xs text-slate-500">خصص البيانات قبل العرض أو التصدير.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setRange(1)}
              className="rounded-xl border bg-slate-50 px-3 py-2 text-[10px] font-black"
            >
              اليوم
            </button>
            <button
              onClick={() => setRange(7)}
              className="rounded-xl border bg-slate-50 px-3 py-2 text-[10px] font-black"
            >
              آخر 7 أيام
            </button>
            <button
              onClick={() => setRange(30)}
              className="rounded-xl border bg-slate-50 px-3 py-2 text-[10px] font-black"
            >
              آخر 30 يوماً
            </button>
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 rounded-xl bg-rose-50 px-3 py-2 text-[10px] font-black text-rose-700"
            >
              <RotateCcw size={13} /> تصفير الفلاتر{' '}
              {activeFilterCount ? `(${activeFilterCount})` : ''}
            </button>
          </div>
        </div>
        <label className="text-xs">
          من
          <input
            aria-label="من"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 h-11 w-full rounded-xl border px-3"
          />
        </label>
        <label className="text-xs">
          إلى
          <input
            aria-label="إلى"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 h-11 w-full rounded-xl border px-3"
          />
        </label>
        <label className="relative text-xs">
          بحث شامل
          <Search className="absolute bottom-3 right-3 size-4 text-slate-400" />
          <input
            aria-label="بحث شامل"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mt-1 h-11 w-full rounded-xl border pr-9"
            placeholder="آلية، سائق، منطقة…"
          />
        </label>
        <label className="text-xs">
          الشفت
          <select
            aria-label="الشفت"
            value={shift}
            onChange={(e) => setShift(e.target.value)}
            className="mt-1 h-11 w-full rounded-xl border px-3"
          >
            <option value="">الكل</option>
            <option value="morning">صباحي</option>
            <option value="evening">مسائي</option>
            <option value="night">ليلي</option>
          </select>
        </label>
        <label className="text-xs">
          المنطقة
          <select
            aria-label="المنطقة"
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className="mt-1 h-11 w-full rounded-xl border px-3"
          >
            <option value="">الكل</option>
            {sectors.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {tab === 'alerts' && (
          <label className="text-xs">
            الخطورة
            <select
              aria-label="الخطورة"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border px-3"
            >
              <option value="">الكل</option>
              <option value="critical">حرج</option>
              <option value="warning">تحذير</option>
            </select>
          </label>
        )}
        <button
          data-testid="ops-export-excel"
          onClick={() => void exportExcel()}
          disabled={!rows.length || !visible.length}
          className="mt-5 flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 font-black text-white disabled:opacity-40"
        >
          <Download size={17} />
          تصدير Excel
        </button>
      </div>

      <nav
        aria-label="أنواع التقارير"
        className="flex gap-2 overflow-x-auto rounded-[1.5rem] border border-slate-200 bg-white p-2.5 shadow-sm"
      >
        {(Object.keys(tabs) as OperationsTab[]).map((value) => (
          <button
            data-testid={`ops-tab-${value}`}
            key={value}
            onClick={() => {
              setTab(value)
              setShowColumns(false)
            }}
            className={`group flex min-w-fit items-center gap-2 whitespace-nowrap rounded-2xl px-4 py-3 text-xs font-black transition ${tab === value ? 'bg-slate-950 text-white shadow-lg' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <span
              className={`size-2 rounded-full ${tab === value ? 'bg-cyan-400' : 'bg-slate-300 group-hover:bg-indigo-400'}`}
            />
            {tabs[value]}{' '}
            <span
              className={`rounded-lg px-2 py-1 text-[9px] ${tab === value ? 'bg-white/10' : 'bg-slate-100'}`}
            >
              {allSources[value].length}
            </span>
          </button>
        ))}
      </nav>

      {tab === 'alerts' ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="كل التنبيهات" value={rows.length} />
          <Stat
            label="تنبيهات حرجة"
            value={rows.filter((row) => row.severity === 'critical').length}
          />
          <Stat label="تحذيرات" value={rows.filter((row) => row.severity === 'warning').length} />
          <Stat label="رحلات متأثرة" value={new Set(rows.map((row) => row.departure_id)).size} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Stat label="الرحلات/النتائج" value={rows.length} />
          <Stat label="وقت العمل المنتج" value={minutes(sum('productive_minutes'))} />
          <Stat label="وقت الحركة" value={minutes(sum('movement_minutes'))} />
          <Stat label="وقت المحطة" value={minutes(sum('station_minutes') || sum('stay_minutes'))} />
          <Stat label="وقت الصيانة" value={minutes(sum('maintenance_minutes'))} />
          <Stat label="مدة الأعطال" value={minutes(sum('downtime_minutes'))} />
        </div>
      )}

      {tab === 'summary' && rows.length > 0 && (
        <OperationsPulse
          items={[
            { label: 'عمل منتج', value: sum('productive_minutes'), color: 'bg-emerald-500' },
            { label: 'حركة', value: sum('movement_minutes'), color: 'bg-cyan-500' },
            { label: 'محطة', value: sum('station_minutes'), color: 'bg-indigo-500' },
            { label: 'صيانة', value: sum('maintenance_minutes'), color: 'bg-violet-500' },
            { label: 'أعطال', value: sum('downtime_minutes'), color: 'bg-rose-500' },
          ]}
        />
      )}

      {tab === 'alerts' && (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((row) => (
            <article
              key={String(row.alert_id)}
              data-testid={`ops-alert-${String(row.alert_id)}`}
              className={`rounded-2xl border-r-4 bg-white p-4 shadow-sm ${row.severity === 'critical' ? 'border-r-red-600' : 'border-r-amber-500'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-3">
                  {row.severity === 'critical' ? (
                    <AlertTriangle className="text-red-600" />
                  ) : (
                    <BellRing className="text-amber-600" />
                  )}
                  <div>
                    <h3 className="font-black">{String(row.title)}</h3>
                    <p className="mt-1 text-xs text-slate-600">{String(row.details)}</p>
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[10px] font-black ${row.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}
                >
                  {row.severity === 'critical' ? 'حرج' : 'تحذير'}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
                <span>DB {String(row.db_number)}</span>
                <span>{String(row.area_name)}</span>
                <span>المدة: {minutes(row.elapsed_minutes)}</span>
                <span>الحد: {minutes(row.threshold_minutes)}</span>
              </div>
              <a
                href={String(row.action_link)}
                className="mt-3 inline-flex rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-bold text-white"
              >
                فتح جهة المعالجة
              </a>
            </article>
          ))}
        </div>
      )}

      <div className="rounded-2xl border bg-white">
        <button
          data-testid="ops-columns-toggle"
          onClick={() => setShowColumns((value) => !value)}
          className="flex w-full items-center justify-between p-4 text-sm font-black"
        >
          <span>
            تخصيص أعمدة العرض وملف Excel ({visible.length}/{available.length})
          </span>
          <ChevronDown className={`transition ${showColumns ? 'rotate-180' : ''}`} size={18} />
        </button>
        {showColumns && (
          <div className="flex flex-wrap gap-2 border-t p-4">
            {available.map((key) => (
              <button
                key={key}
                onClick={() => toggleColumn(key)}
                className={`flex items-center gap-1 rounded-lg border px-3 py-2 text-xs ${selected.includes(key) ? 'border-indigo-400 bg-indigo-50 text-indigo-800' : 'text-slate-400'}`}
              >
                {selected.includes(key) && <Check size={14} />} {labels[key] ?? key}
              </button>
            ))}
          </div>
        )}
      </div>

      {rows.length ? (
        <div key={tab} className="overflow-auto rounded-3xl border bg-white shadow-sm">
          <table className="w-full min-w-[1100px] text-xs">
            <thead className="sticky top-0 bg-slate-900 text-white">
              <tr>
                {visible.map((key) => (
                  <th key={key} className="whitespace-nowrap p-4 text-right font-black">
                    {labels[key] ?? key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={`${tab}-${String(row.departure_id ?? row.visit_id ?? row.alert_id ?? index)}`}
                  className="border-t transition hover:bg-indigo-50/50 even:bg-slate-50"
                >
                  {visible.map((key) => (
                    <td key={key} className="max-w-72 p-4 leading-6 text-slate-700">
                      {key === 'timeline' && row.case_id ? (
                        <button
                          onClick={() =>
                            setTimeline({
                              caseId: String(row.case_id),
                              title: `${String(row.vehicle_name)} · DB ${String(row.db_number)}`,
                            })
                          }
                          className="rounded-lg bg-violet-50 px-3 py-2 text-[11px] font-black text-violet-800"
                        >
                          فتح التسلسل
                        </button>
                      ) : (
                        formatValue(key, row[key])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          key={`${tab}-empty`}
          className="relative overflow-hidden rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm md:p-16"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,.06),transparent_45%)]" />
          <div className="relative mx-auto grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-indigo-100 to-cyan-100 text-indigo-700">
            <CalendarDays size={28} />
          </div>
          <b className="relative mt-5 block text-lg text-slate-800">لا توجد سجلات في هذا التقرير</b>
          <p className="relative mx-auto mt-2 max-w-md text-xs leading-6 text-slate-500">
            لم تُسجل عمليات مطابقة ضمن النطاق الحالي. جرّب آخر 7 أيام، أزل الفلاتر، أو انتقل إلى
            تقرير تشغيلي آخر.
          </p>
          <div className="relative mt-5 flex justify-center gap-2">
            <button
              onClick={() => setRange(7)}
              className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white"
            >
              عرض آخر 7 أيام
            </button>
            <button
              onClick={resetFilters}
              className="rounded-xl border bg-white px-4 py-2.5 text-xs font-black"
            >
              إزالة الفلاتر
            </button>
          </div>
        </div>
      )}
      {tab === 'summary' && (
        <p className="flex items-center gap-2 rounded-2xl bg-indigo-50 p-4 text-xs text-indigo-800">
          <TimerReset size={17} />
          وقت العمل المنتج محسوب من فترات وجود الآلية في موقع العمل بعد طرح الأعطال القصيرة، مع فصل
          الحركة والمحطة والصيانة.
        </p>
      )}
      {timeline && (
        <MaintenanceTimelineDialog
          caseId={timeline.caseId}
          title={timeline.title}
          onClose={() => setTimeline(null)}
        />
      )}
    </section>
  )
}
function formatValue(key: string, value: unknown) {
  return readableValue(key, value)
}
function OperationsPulse({
  items,
}: {
  items: Array<{ label: string; value: number; color: string }>
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0)
  return (
    <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black tracking-widest text-indigo-600">
            توزيع الزمن التشغيلي
          </p>
          <h2 className="mt-1 font-black text-slate-900">بصمة النشاط ضمن الفترة المحددة</h2>
        </div>
        <span className="rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-black text-slate-600">
          الإجمالي {minutes(total)}
        </span>
      </div>
      <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-slate-100">
        {items.map((item) => (
          <span
            key={item.label}
            title={`${item.label}: ${minutes(item.value)}`}
            className={`${item.color} min-w-0 transition-all`}
            style={{ width: total ? `${(item.value / total) * 100}%` : '0%' }}
          />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {items.map((item) => (
          <div key={item.label} className="rounded-xl bg-slate-50 p-3">
            <span className={`mb-2 block size-2.5 rounded-full ${item.color}`} />
            <small className="block text-[10px] font-bold text-slate-500">{item.label}</small>
            <b className="mt-1 block text-xs text-slate-800">{minutes(item.value)}</b>
          </div>
        ))}
      </div>
    </article>
  )
}
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-cyan-400 via-indigo-500 to-violet-500 opacity-70" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold text-slate-500">{label}</p>
          <b className="mt-2 block text-xl font-black text-slate-900">{value}</b>
        </div>
        <span className="grid size-9 place-items-center rounded-xl bg-indigo-50 text-indigo-700 transition group-hover:bg-indigo-700 group-hover:text-white">
          <Activity size={16} />
        </span>
      </div>
    </div>
  )
}
