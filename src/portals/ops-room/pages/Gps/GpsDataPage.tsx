import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  Database,
  FileSpreadsheet,
  Gauge,
  Link2,
  ListFilter,
  Loader2,
  Map,
  MapPinned,
  Navigation,
  PlugZap,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Unlink,
  Wifi,
  X,
} from 'lucide-react'
import {
  useGpsAlertWorkflow,
  useGpsAllHistoryImport,
  useGpsAutoSync,
  useGpsBind,
  useGpsBatchHistoryAudit,
  useGpsCandidates,
  useGpsDashboard,
  useGpsDetail,
  useGpsDevices,
  useGpsGeofenceAssignment,
  useGpsGeofences,
  useGpsHistoryImport,
  useGpsHistoryWindows,
  useGpsLiveMap,
  useGpsMapGeofences,
  useGpsOpenAlerts,
  useGpsPlatformGeofence,
  useGpsOptions,
  useGpsRoute,
  useGpsRouteWindow,
  useGpsSchedulerHealth,
  useGpsSync,
  useGpsSyncRuns,
  useGpsTripEvents,
  useGpsTripDiagnostics,
  useGpsTripHistory,
  useGpsTripMetrics,
  useGpsTripInvestigations,
  useGpsTripInvestigationSave,
  useGpsTripWindowCoverageAudit,
  useGpsTripZoneEvents,
  useGpsTripShiftContext,
  useGpsAlertEscalations,
  useGpsUnbind,
  useGpsZoneEvents,
  useGpsZoneVehicleAssignment,
  useGpsZoneVehicles,
} from '@features/gps-lvn/hooks'
import { gpsLvn } from '@sdk/gps-lvn.sdk'
import type {
  GpsDevice,
  GpsFilters,
  GpsMapGeofence,
  GpsOperationalAlert,
  GpsRoutePoint,
  GpsTripHistory,
  GpsTripRouteDiagnostic,
  GpsTripRouteMetric,
  GpsTripWindowCoverageAudit,
  GpsZoneEvent,
} from '@sdk/gps-lvn.sdk'
import { exportGpsAlerts, exportGpsTrips } from '@features/gps-lvn/export'
import { useUiStore } from '@stores/ui.store'
const GpsRouteMap = lazy(() => import('./GpsRouteMap'))
const GpsLiveMap = lazy(() => import('./GpsLiveMap'))
const ZoneMapEditor = lazy(() => import('./ZoneMapEditor'))
const fmt = (v: string | null) =>
  v
    ? new Intl.DateTimeFormat('ar-IQ', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Asia/Baghdad',
      }).format(new Date(v))
    : 'غير متوفر'
const shortTime = (v: string | null) =>
  v
    ? new Intl.DateTimeFormat('ar-IQ', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Baghdad',
      }).format(new Date(v))
    : '—'
const baghdadDay = (offset = 0) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(
    new Date(Date.now() + offset * 86400000),
  )
const speed = (row: GpsDevice) =>
  `${new Intl.NumberFormat('ar-IQ', { maximumFractionDigits: 1 }).format(row.speed ?? 0)} ${row.speed_unit === 'mph' ? 'ميل/س' : 'كم/س'}`
type View = 'operations' | 'trips' | 'fleet' | 'zones' | 'integration'

export default function GpsDataPage() {
  const [view, setView] = useState<View>('operations')
  const [filters, setFilters] = useState<GpsFilters>({ page: 1, pageSize: 30 })
  const [tripFrom, setTripFrom] = useState(baghdadDay(-7))
  const [tripTo, setTripTo] = useState(baghdadDay())
  const [selected, setSelected] = useState('')
  const [binding, setBinding] = useState<GpsDevice | null>(null)
  const [candidateSearch, setCandidateSearch] = useState('')
  const [routeDevice, setRouteDevice] = useState<GpsDevice | null>(null)
  const [selectedTrip, setSelectedTrip] = useState<GpsTripHistory | null>(null)
  const [zoneDevice, setZoneDevice] = useState<GpsDevice | null>(null)
  const [resolveAlert, setResolveAlert] = useState<GpsOperationalAlert | null>(null)
  const [alertSeverity, setAlertSeverity] = useState('')
  const [alertRepetition, setAlertRepetition] = useState('')
  const [alertAge, setAlertAge] = useState('')
  const [alertExportPending, setAlertExportPending] = useState(false)
  const addToast = useUiStore((state) => state.addToast)
  const zoneRangeFrom = new Date(`${tripFrom}T00:00:00+03:00`).toISOString()
  const zoneRangeTo = new Date(
    new Date(`${tripTo}T00:00:00+03:00`).getTime() + 86_400_000,
  ).toISOString()
  const dashboard = useGpsDashboard()
  const devices = useGpsDevices(filters)
  const options = useGpsOptions()
  const runs = useGpsSyncRuns()
  const liveMap = useGpsLiveMap()
  const mapZones = useGpsMapGeofences()
  const alerts = useGpsOpenAlerts()
  const zoneEvents = useGpsZoneEvents(zoneRangeFrom, zoneRangeTo)
  const schedulerHealth = useGpsSchedulerHealth()
  const tripHistory = useGpsTripHistory(tripFrom, tripTo)
  const tripMetricIds = (tripHistory.data ?? []).slice(0, 200).map((trip) => trip.departure_id)
  const tripMetrics = useGpsTripMetrics(tripMetricIds)
  const tripDiagnostics = useGpsTripDiagnostics(tripMetricIds)
  const sync = useGpsSync()
  const alertWorkflow = useGpsAlertWorkflow()
  const platformZone = useGpsPlatformGeofence()
  const historyImport = useGpsHistoryImport()
  const batchHistoryAudit = useGpsBatchHistoryAudit()
  const bind = useGpsBind()
  const unbind = useGpsUnbind()
  const detail = useGpsDetail(selected)
  const candidates = useGpsCandidates(candidateSearch, Boolean(binding))
  const geofences = useGpsGeofences(zoneDevice?.garage_vehicle_id ?? '', Boolean(zoneDevice))
  const zoneAssignment = useGpsGeofenceAssignment()
  useGpsAutoSync(Boolean(dashboard.data?.last_full_sync_at))

  const rows = devices.data ?? [],
    d = dashboard.data
  const trips = useMemo(() => tripHistory.data ?? [], [tripHistory.data])
  const activeTrips = trips.filter((trip) => !trip.returned_at)
  const tripMetricMap = new globalThis.Map(
    (tripMetrics.data ?? []).map((metric) => [metric.departure_id, metric]),
  )
  const tripDiagnosticMap = new globalThis.Map(
    (tripDiagnostics.data ?? []).map((diagnostic) => [diagnostic.departure_id, diagnostic]),
  )
  const filteredAlerts = (alerts.data ?? []).filter((alert) => {
    const ageMinutes = (Date.now() - new Date(alert.opened_at).getTime()) / 60_000
    return (
      (!alertSeverity || alert.severity === alertSeverity) &&
      (!alertRepetition || (alert.occurrence_count ?? 1) >= Number(alertRepetition)) &&
      (!alertAge || ageMinutes >= Number(alertAge))
    )
  })
  const total = Number(rows[0]?.total_count ?? 0)
  const pages = Math.max(1, Math.ceil(total / (filters.pageSize ?? 30)))
  const integrity = useMemo(
    () => ({
      covered: trips.filter((x) => x.gps_coverage === 'covered').length,
      partial: trips.filter((x) => x.gps_coverage === 'partial').length,
      missing: trips.filter((x) => x.gps_coverage === 'no_data' || x.gps_coverage === 'unbound')
        .length,
      average: trips.length
        ? Math.round(trips.reduce((n, x) => n + Number(x.coverage_percent ?? 0), 0) / trips.length)
        : 0,
    }),
    [trips],
  )
  const set = <K extends keyof GpsFilters>(key: K, value: GpsFilters[K]) =>
    setFilters((old) => ({ ...old, [key]: value, page: 1 }))
  const activeCount = [
    'search',
    'online',
    'operational',
    'binding',
    'freshness',
    'owner',
    'model',
    'trip',
    'zone',
  ].filter((k) => Boolean(filters[k as keyof GpsFilters])).length
  const nav: Array<{ id: View; label: string; hint: string; icon: typeof Map }> = [
    { id: 'operations', label: 'المشهد التشغيلي', hint: 'الآن', icon: Map },
    { id: 'trips', label: 'الانطلاقيات', hint: 'المسار والتغطية', icon: Route },
    { id: 'fleet', label: 'أجهزة الأسطول', hint: 'الربط والحالة', icon: Database },
    { id: 'zones', label: 'الزونات', hint: 'المناطق والحركة', icon: MapPinned },
    { id: 'integration', label: 'سلامة التكامل', hint: 'LVN والمزامنة', icon: ShieldCheck },
  ]

  return (
    <section dir="rtl" className="space-y-5 pb-10" data-testid="gps-data-page">
      <header className="relative overflow-hidden rounded-[2rem] bg-[#071827] text-white shadow-[0_24px_70px_-30px_rgba(2,132,199,.7)]">
        <div className="absolute -left-24 -top-28 size-80 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="absolute bottom-0 right-1/3 h-px w-1/2 bg-gradient-to-l from-transparent via-cyan-300/70 to-transparent" />
        <div className="relative p-5 md:p-7">
          <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
            <div className="flex items-start gap-4">
              <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-cyan-300/30 bg-cyan-400/10">
                <Navigation className="text-cyan-300" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-black tracking-[.22em] text-cyan-300">
                    GPS COMMAND CENTER
                  </span>
                  <span className="rounded-full bg-emerald-400/15 px-2 py-1 text-[10px] font-bold text-emerald-300">
                    <CircleDot className="ml-1 inline size-3 animate-pulse" />
                    مباشر
                  </span>
                </div>
                <h1 className="mt-2 text-2xl font-black md:text-3xl">
                  قيادة الانطلاقيات والمسارات
                </h1>
                <p className="mt-1 max-w-2xl text-xs leading-6 text-slate-300">
                  صورة تشغيلية واحدة من لحظة مغادرة الكراج حتى العودة، مع سلامة GPS والانقطاعات
                  والزونات.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                aria-label="الخريطة الحية"
                onClick={() => setView('operations')}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-black hover:bg-white/10"
              >
                <MapPinned className="ml-2 inline size-4 text-cyan-300" />
                الخريطة الحية
              </button>
              <button
                aria-label={`التنبيهات (${alerts.data?.length ?? 0})`}
                onClick={() => setView('operations')}
                className="rounded-xl border border-rose-300/20 bg-rose-400/10 px-4 py-2.5 text-xs font-black text-rose-200"
              >
                <AlertTriangle className="ml-2 inline size-4" />
                التنبيهات ({alerts.data?.length ?? 0})
              </button>
              <button
                onClick={() => sync.mutate(d?.last_full_sync_at ? 'incremental' : 'full')}
                disabled={sync.isPending}
                className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-black text-slate-950 disabled:opacity-50"
              >
                {sync.isPending ? (
                  <Loader2 className="ml-2 inline size-4 animate-spin" />
                ) : (
                  <RefreshCw className="ml-2 inline size-4" />
                )}
                تحديث البيانات
              </button>
            </div>
          </div>
          <div className="mt-5 grid gap-2 border-t border-white/10 pt-4 text-[10px] text-slate-400 sm:grid-cols-3">
            <span>
              <span className="ml-2 inline-block size-1.5 rounded-full bg-emerald-400" />
              آخر نجاح {fmt(d?.last_success_at ?? null)}
            </span>
            <span>مزامنة تلقائية كل 30 ثانية</span>
            <span className="sm:text-left">LVN API {d?.api_version ?? '—'}</span>
          </div>
        </div>
      </header>

      <nav
        className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm md:grid-cols-3 xl:grid-cols-5"
        aria-label="أقسام GPS"
      >
        {nav.map(({ id, label, hint, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`flex items-center gap-3 rounded-xl px-3 py-3 text-right transition ${view === id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <span
              className={`grid size-9 place-items-center rounded-xl ${view === id ? 'bg-cyan-400/15 text-cyan-300' : 'bg-slate-100 text-slate-500'}`}
            >
              <Icon size={18} />
            </span>
            <span>
              <b className="block text-xs">{label}</b>
              <small className={`text-[10px] ${view === id ? 'text-slate-400' : 'text-slate-400'}`}>
                {hint}
              </small>
            </span>
          </button>
        ))}
      </nav>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Metric
          label="انطلاقيات نشطة"
          value={activeTrips.length}
          icon={Navigation}
          tone="cyan"
          note="على الطريق أو الموقع"
        />
        <Metric
          label="آليات متحركة"
          value={d?.moving ?? 0}
          icon={Activity}
          tone="emerald"
          note="حسب آخر قراءة"
        />
        <Metric
          label="GPS متصل"
          value={d?.online ?? 0}
          icon={Wifi}
          tone="blue"
          note={`من ${d?.total ?? 0} جهاز`}
        />
        <Metric
          label="تغطية المسارات"
          value={`${integrity.average}٪`}
          icon={Gauge}
          tone="violet"
          note={`${integrity.covered} مكتملة`}
        />
        <Metric
          label="قراءات متأخرة"
          value={d?.stale ?? 0}
          icon={Clock3}
          tone="amber"
          note="أكثر من 30 دقيقة"
        />
        <Metric
          label="تنبيهات مفتوحة"
          value={alerts.data?.length ?? 0}
          icon={AlertTriangle}
          tone="rose"
          note="تحتاج متابعة"
        />
      </div>

      {view === 'operations' && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_390px]">
          <article className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
            <SectionHead
              icon={MapPinned}
              title="الخريطة التشغيلية"
              subtitle="مواقع الأسطول والزونات والانطلاقيات النشطة لحظياً"
              badge={`${liveMap.data?.length ?? 0} موقع`}
            />
            <div className="p-3 pt-0">
              <Suspense
                fallback={<div className="h-[540px] animate-pulse rounded-2xl bg-slate-100" />}
              >
                <GpsLiveMap rows={liveMap.data ?? []} zones={mapZones.data ?? []} />
              </Suspense>
            </div>
          </article>
          <aside className="space-y-4">
            <article className="rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
              <SectionHead
                icon={Route}
                title="الانطلاقيات الآن"
                subtitle="التسلسل التشغيلي المباشر"
                badge={String(activeTrips.length)}
              />
              <div className="max-h-[420px] space-y-2 overflow-auto px-4 pb-4">
                {activeTrips.map((trip) => (
                  <TripMini
                    key={trip.departure_id}
                    trip={trip}
                    metric={tripMetricMap.get(trip.departure_id)}
                    onOpen={() => setSelectedTrip(trip)}
                  />
                ))}
                {!activeTrips.length && <EmptyCompact text="لا توجد انطلاقية مفتوحة ضمن المدة." />}
              </div>
            </article>
            <article className="rounded-[1.75rem] border border-rose-100 bg-white shadow-sm">
              <SectionHead
                icon={AlertTriangle}
                title="مراقبة الاستثناءات"
                subtitle="الأولوية للأثر الميداني"
                badge={`${filteredAlerts.length} / ${alerts.data?.length ?? 0}`}
              />
              <div className="px-4 pb-2">
                <button
                  disabled={!filteredAlerts.length || alertExportPending}
                  onClick={() => {
                    const rows = filteredAlerts.slice(0, 200)
                    setAlertExportPending(true)
                    void gpsLvn
                      .alertEscalationsBulk(rows.map((alert) => alert.id))
                      .then((history) => exportGpsAlerts(rows, history))
                      .then(() =>
                        addToast({
                          type: 'success',
                          message: `تم إنشاء Excel عربي لـ ${rows.length} تنبيه مع سجل التصعيد`,
                        }),
                      )
                      .catch(() =>
                        addToast({
                          type: 'error',
                          message: 'تعذر إنشاء تقرير التنبيهات. تحقق من الاتصال ثم أعد المحاولة.',
                        }),
                      )
                      .finally(() => setAlertExportPending(false))
                  }}
                  className="w-full rounded-xl bg-emerald-50 py-2 text-[10px] font-black text-emerald-800 disabled:opacity-40"
                >
                  {alertExportPending ? (
                    <Loader2 className="ml-1 inline size-3 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="ml-1 inline size-3" />
                  )}
                  {alertExportPending ? 'جارٍ تجهيز Excel…' : 'تصدير التنبيهات والتصعيد'}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1 px-4 pb-3">
                <select
                  aria-label="فلتر أولوية التنبيه"
                  value={alertSeverity}
                  onChange={(e) => setAlertSeverity(e.target.value)}
                  className="h-9 rounded-lg border px-1 text-[9px]"
                >
                  <option value="">كل الأولويات</option>
                  <option value="critical">حرجة</option>
                  <option value="warning">تحذير</option>
                  <option value="info">معلومات</option>
                </select>
                <select
                  aria-label="فلتر تكرار التنبيه"
                  value={alertRepetition}
                  onChange={(e) => setAlertRepetition(e.target.value)}
                  className="h-9 rounded-lg border px-1 text-[9px]"
                >
                  <option value="">كل التكرارات</option>
                  <option value="2">متكرر مرتين+</option>
                  <option value="5">متكرر 5+</option>
                  <option value="10">متكرر 10+</option>
                </select>
                <select
                  aria-label="فلتر عمر التنبيه"
                  value={alertAge}
                  onChange={(e) => setAlertAge(e.target.value)}
                  className="h-9 rounded-lg border px-1 text-[9px]"
                >
                  <option value="">كل الأعمار</option>
                  <option value="15">أقدم من 15د</option>
                  <option value="60">أقدم من ساعة</option>
                  <option value="180">أقدم من 3س</option>
                </select>
              </div>
              <div className="max-h-72 space-y-2 overflow-auto px-4 pb-4">
                {filteredAlerts.slice(0, 20).map((a) => (
                  <div
                    key={a.id}
                    className={`rounded-2xl border p-3 ${a.severity === 'critical' ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}
                  >
                    <div className="flex justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <b className="text-xs">{a.title}</b>
                        {(a.occurrence_count ?? 1) > 1 && (
                          <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[9px] font-black text-white">
                            تكرر {a.occurrence_count}×
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 text-[10px] text-slate-500">
                        {shortTime(a.last_detected_at ?? a.opened_at)}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-600">
                      {a.vehicle_name ?? a.device_name}
                      {a.db_number ? ` · DB ${a.db_number}` : ''}
                    </p>
                    <div className="mt-2 flex gap-2">
                      {!a.acknowledged_at ? (
                        <button
                          onClick={() =>
                            alertWorkflow.mutate({ type: 'acknowledge', alertId: a.id })
                          }
                          className="rounded-lg bg-white px-2 py-1 text-[10px] font-black shadow-sm"
                        >
                          إقرار المتابعة
                        </button>
                      ) : (
                        <span className="rounded-lg bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-800">
                          تم الإقرار
                        </span>
                      )}
                      <button
                        onClick={() => setResolveAlert(a)}
                        className="rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-black text-white"
                      >
                        تسجيل المعالجة
                      </button>
                    </div>
                  </div>
                ))}
                {!filteredAlerts.length && (
                  <EmptyCompact
                    text={
                      alerts.data?.length
                        ? 'لا توجد تنبيهات تطابق الفلاتر.'
                        : 'الوضع مستقر، لا توجد تنبيهات مفتوحة.'
                    }
                    good={!alerts.data?.length}
                  />
                )}
              </div>
            </article>
          </aside>
        </div>
      )}

      {view === 'trips' && (
        <TripsWorkspace
          trips={trips}
          metrics={tripMetricMap}
          diagnostics={tripDiagnosticMap}
          loading={tripHistory.isLoading}
          from={tripFrom}
          to={tripTo}
          setFrom={setTripFrom}
          setTo={setTripTo}
          importing={historyImport.isPending}
          batchAudit={batchHistoryAudit}
          onImport={(id) => historyImport.mutate({ departureId: id })}
          onOpen={setSelectedTrip}
          onExport={(selectedTrips) => {
            if (!selectedTrips.length) return
            const ids = selectedTrips.slice(0, 200).map((trip) => trip.departure_id)
            void Promise.all([
              gpsLvn.tripShiftContexts(ids),
              gpsLvn.tripRouteMetrics(ids),
              gpsLvn.tripRouteEvents(ids),
              gpsLvn.tripRouteDiagnostics(ids),
            ]).then(([shiftContexts, routeMetrics, routeEvents, routeDiagnostics]) =>
              exportGpsTrips(
                selectedTrips,
                zoneEvents.data ?? [],
                shiftContexts,
                routeMetrics,
                routeEvents,
                routeDiagnostics,
              ),
            )
          }}
        />
      )}

      {view === 'fleet' && (
        <FleetWorkspace
          rows={rows}
          loading={devices.isLoading}
          fetching={devices.isFetching}
          filters={filters}
          options={options.data}
          activeCount={activeCount}
          total={total}
          pages={pages}
          setFilter={set}
          reset={() => setFilters({ page: 1, pageSize: 30 })}
          setFilters={setFilters}
          onDetail={setSelected}
          onRoute={setRouteDevice}
          onZone={setZoneDevice}
          onBind={(row) => {
            setBinding(row)
            setCandidateSearch('')
          }}
        />
      )}

      {view === 'zones' && (
        <ZonesWorkspace
          zones={mapZones.data ?? []}
          events={zoneEvents.data ?? []}
          from={tripFrom}
          to={tripTo}
          setFrom={setTripFrom}
          setTo={setTripTo}
          pending={platformZone.isPending}
          onSave={(zone) => platformZone.mutate({ type: 'save', ...zone })}
          onArchive={(id) => platformZone.mutate({ type: 'archive', id })}
        />
      )}

      {view === 'integration' && (
        <IntegrationWorkspace
          dashboard={d}
          runs={runs.data ?? []}
          health={schedulerHealth.data}
          syncing={sync.isPending}
          onTest={() => sync.mutate('test')}
          onSync={() => sync.mutate(d?.last_full_sync_at ? 'incremental' : 'full')}
        />
      )}

      {zoneDevice?.garage_vehicle_id && (
        <ZoneModal
          device={zoneDevice}
          zones={geofences.data ?? []}
          pending={zoneAssignment.isPending}
          onToggle={(id, assigned) =>
            zoneAssignment.mutate({
              vehicleId: zoneDevice.garage_vehicle_id!,
              geofenceId: id,
              assigned,
            })
          }
          onClose={() => setZoneDevice(null)}
        />
      )}
      {routeDevice && <RouteModal device={routeDevice} onClose={() => setRouteDevice(null)} />}
      {selectedTrip && (
        <TripRouteModal
          trip={selectedTrip}
          diagnostic={tripDiagnosticMap.get(selectedTrip.departure_id)}
          zones={mapZones.data ?? []}
          onClose={() => setSelectedTrip(null)}
        />
      )}
      {resolveAlert && (
        <ResolveAlertModal
          alert={resolveAlert}
          pending={alertWorkflow.isPending}
          onClose={() => setResolveAlert(null)}
          onResolve={(note) =>
            alertWorkflow.mutate(
              { type: 'resolve', alertId: resolveAlert.id, note },
              { onSuccess: () => setResolveAlert(null) },
            )
          }
        />
      )}
      {selected && (
        <DetailModal
          loading={detail.isLoading}
          data={detail.data}
          onClose={() => setSelected('')}
        />
      )}
      {binding && (
        <BindingModal
          device={binding}
          search={candidateSearch}
          setSearch={setCandidateSearch}
          candidates={candidates.data ?? []}
          pending={bind.isPending || unbind.isPending}
          onBind={(vehicleId) =>
            bind.mutate({ deviceId: binding.id, vehicleId }, { onSuccess: () => setBinding(null) })
          }
          onUnbind={() => unbind.mutate(binding.id, { onSuccess: () => setBinding(null) })}
          onClose={() => setBinding(null)}
        />
      )}
    </section>
  )
}

const tones = {
  cyan: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  blue: 'border-blue-200 bg-blue-50 text-blue-700',
  violet: 'border-violet-200 bg-violet-50 text-violet-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  rose: 'border-rose-200 bg-rose-50 text-rose-700',
}
function Metric({
  label,
  value,
  icon: Icon,
  tone,
  note,
}: {
  label: string
  value: string | number
  icon: typeof Map
  tone: keyof typeof tones
  note: string
}) {
  return (
    <article className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold text-slate-500">{label}</p>
          <b className="mt-1 block text-2xl text-slate-950">{value}</b>
        </div>
        <span className={`grid size-9 place-items-center rounded-xl border ${tones[tone]}`}>
          <Icon size={17} />
        </span>
      </div>
      <p className="mt-3 border-t border-slate-100 pt-2 text-[10px] text-slate-400">{note}</p>
    </article>
  )
}
function SectionHead({
  icon: Icon,
  title,
  subtitle,
  badge,
}: {
  icon: typeof Map
  title: string
  subtitle: string
  badge?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-xl bg-slate-900 text-cyan-300">
          <Icon size={17} />
        </span>
        <div>
          <h2 className="text-sm font-black">{title}</h2>
          <p className="text-[10px] text-slate-500">{subtitle}</p>
        </div>
      </div>
      {badge && (
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">
          {badge}
        </span>
      )}
    </div>
  )
}
function EmptyCompact({ text, good = false }: { text: string; good?: boolean }) {
  return (
    <div
      className={`rounded-2xl border border-dashed p-5 text-center text-xs ${good ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-400'}`}
    >
      {good && <CheckCircle2 className="mx-auto mb-2 size-5" />}
      {text}
    </div>
  )
}
function CoverageBadge({ trip }: { trip: GpsTripHistory }) {
  const c = trip.gps_coverage
  return (
    <span
      className={`rounded-full px-2 py-1 text-[10px] font-black ${c === 'covered' ? 'bg-emerald-100 text-emerald-800' : c === 'partial' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}
    >
      {c === 'covered'
        ? 'مكتملة'
        : c === 'partial'
          ? 'جزئية'
          : c === 'unbound'
            ? 'غير مربوط'
            : 'بلا GPS'}
    </span>
  )
}
function TripMini({
  trip,
  metric,
  onOpen,
}: {
  trip: GpsTripHistory
  metric?: GpsTripRouteMetric
  onOpen: () => void
}) {
  return (
    <button
      onClick={onOpen}
      className="w-full rounded-2xl border border-slate-200 p-3 text-right transition hover:border-cyan-300 hover:bg-cyan-50/40"
    >
      <div className="flex items-start justify-between">
        <div>
          <b className="text-xs">{trip.vehicle_name}</b>
          <p className="text-[10px] text-slate-500">
            DB {trip.db_number} · {trip.driver_name}
          </p>
        </div>
        <CoverageBadge trip={trip} />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-full bg-slate-900 text-cyan-300">
          <Navigation size={13} />
        </span>
        <div className="h-0.5 flex-1 bg-gradient-to-l from-cyan-400 via-emerald-400 to-slate-200" />
        <span className="grid size-7 place-items-center rounded-full bg-emerald-100 text-emerald-700">
          <MapPinned size={13} />
        </span>
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-500">
        <span>{shortTime(trip.departed_at)}</span>
        <span>
          {trip.gps_points} نقطة · {Number(trip.coverage_percent ?? 0)}٪
        </span>
      </div>
      {metric && (
        <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[9px]">
          <span className="rounded-lg bg-emerald-50 p-1 text-emerald-800">
            حركة {durationLabel(metric.moving_seconds)}
          </span>
          <span className="rounded-lg bg-blue-50 p-1 text-blue-800">
            توقف {durationLabel(metric.stopped_seconds)}
          </span>
          <span className="rounded-lg bg-amber-50 p-1 text-amber-800">
            {metric.stop_count} محطة
          </span>
        </div>
      )}
    </button>
  )
}

const diagnosticLabels: Record<GpsTripRouteDiagnostic['diagnosis_code'], string> = {
  unbound: 'الجهاز غير مربوط',
  import_failed: 'فشل الاستيراد من LVN',
  no_data: 'لا توجد قراءات',
  provider_payload_rejected: 'بيانات مرفوضة من المصدر',
  storage_deficit: 'نقص بين الصالح والمخزن',
  late_first_fix: 'تأخر أول تثبيت GPS',
  early_last_fix: 'انتهت القراءات مبكراً',
  internal_gaps: 'فجوات داخل المسار',
  windows_not_fully_imported: 'نوافذ لم تُستورد',
  healthy: 'المسار سليم',
}
const windowAuditLabels: Record<GpsTripWindowCoverageAudit['diagnosis_code'], string> = {
  unbound: 'الجهاز غير مربوط',
  not_audited: 'لم تُطلب من LVN بعد',
  import_failed: 'فشل الاستيراد',
  provider_payload_rejected: 'رفض في بيانات المصدر',
  storage_deficit: 'فقد قبل التخزين',
  render_limit: 'تجاوز حد الرسم',
  no_data: 'لا توجد نقاط',
  late_first_fix: 'بداية المسار ناقصة',
  early_last_fix: 'نهاية المسار ناقصة',
  internal_gaps: 'انقطاعات داخلية',
  window_incomplete: 'الاستيراد غير مكتمل',
  healthy: 'السلسلة مكتملة',
}
function DiagnosticBadge({ value }: { value?: GpsTripRouteDiagnostic }) {
  if (!value) return <span className="text-[10px] text-slate-400">جارٍ التشخيص…</span>
  const healthy = value.diagnosis_code === 'healthy'
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black ${healthy ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}
    >
      {diagnosticLabels[value.diagnosis_code]}
    </span>
  )
}

function TripsWorkspace({
  trips,
  metrics,
  diagnostics,
  loading,
  from,
  to,
  setFrom,
  setTo,
  importing,
  batchAudit,
  onImport,
  onOpen,
  onExport,
}: {
  trips: GpsTripHistory[]
  metrics: Map<string, GpsTripRouteMetric>
  diagnostics: Map<string, GpsTripRouteDiagnostic>
  loading: boolean
  from: string
  to: string
  setFrom: (x: string) => void
  setTo: (x: string) => void
  importing: boolean
  batchAudit: ReturnType<typeof useGpsBatchHistoryAudit>
  onImport: (id: string) => void
  onOpen: (x: GpsTripHistory) => void
  onExport: (rows: GpsTripHistory[]) => void
}) {
  const [search, setSearch] = useState('')
  const [quality, setQuality] = useState('')
  const [compareIds, setCompareIds] = useState<string[]>([])
  const filteredTrips = useMemo(
    () =>
      trips.filter((trip) => {
        const diagnostic = diagnostics.get(trip.departure_id)?.diagnosis_code ?? ''
        return (
          (!search.trim() ||
            `${trip.vehicle_name} ${trip.db_number} ${trip.driver_name}`
              .toLowerCase()
              .includes(search.trim().toLowerCase())) &&
          (!quality ||
            (quality === 'healthy'
              ? diagnostic === 'healthy'
              : quality === 'issue'
                ? Boolean(diagnostic && diagnostic !== 'healthy')
                : trip.gps_coverage === quality))
        )
      }),
    [diagnostics, quality, search, trips],
  )
  const filteredIds = new Set(filteredTrips.map((trip) => trip.departure_id))
  const filteredMetrics = new globalThis.Map([...metrics].filter(([id]) => filteredIds.has(id)))
  const filteredDiagnostics = new globalThis.Map(
    [...diagnostics].filter(([id]) => filteredIds.has(id)),
  )
  const toggleComparison = (id: string) =>
    setCompareIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : current.length < 2
          ? [...current, id]
          : [current[1]!, id],
    )
  const comparison = compareIds
    .map((id) => trips.find((trip) => trip.departure_id === id))
    .filter((trip): trip is GpsTripHistory => Boolean(trip))
  const filteredIntegrity = {
    covered: filteredTrips.filter((trip) => trip.gps_coverage === 'covered').length,
    partial: filteredTrips.filter((trip) => trip.gps_coverage === 'partial').length,
    missing: filteredTrips.filter((trip) => ['no_data', 'unbound'].includes(trip.gps_coverage))
      .length,
    average: filteredTrips.length
      ? Math.round(
          filteredTrips.reduce((sum, trip) => sum + Number(trip.coverage_percent ?? 0), 0) /
            filteredTrips.length,
        )
      : 0,
  }
  return (
    <div className="space-y-4">
      <article className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <span className="text-[10px] font-black tracking-widest text-cyan-700">
              TRIP INTELLIGENCE
            </span>
            <h2 className="mt-1 text-xl font-black">سجل الانطلاقيات ومساراتها</h2>
            <p className="mt-1 text-xs text-slate-500">
              الانطلاقية هي الوحدة الأساسية؛ التغطية محسوبة من المغادرة حتى العودة الفعلية.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <DateInput label="من" value={from} onChange={setFrom} />
            <DateInput label="إلى" value={to} onChange={setTo} />
            <label className="text-[10px] font-black text-slate-500">
              بحث الانطلاقية
              <input
                aria-label="بحث الانطلاقيات"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="الآلية، DB، السائق"
                className="mt-1 block h-10 w-44 rounded-xl border px-3 text-xs"
              />
            </label>
            <label className="text-[10px] font-black text-slate-500">
              جودة المسار
              <select
                aria-label="جودة مسار الانطلاقية"
                value={quality}
                onChange={(event) => setQuality(event.target.value)}
                className="mt-1 block h-10 rounded-xl border px-3 text-xs"
              >
                <option value="">الكل</option>
                <option value="healthy">سليم تشخيصياً</option>
                <option value="issue">يحتاج تحقيقاً</option>
                <option value="covered">تغطية مكتملة</option>
                <option value="partial">تغطية جزئية</option>
                <option value="no_data">بلا بيانات</option>
                <option value="unbound">جهاز غير مربوط</option>
              </select>
            </label>
            <button
              onClick={() => onExport(filteredTrips)}
              disabled={!filteredTrips.length}
              className="h-10 rounded-xl bg-emerald-100 px-4 text-xs font-black text-emerald-900 disabled:opacity-40"
            >
              <FileSpreadsheet className="ml-2 inline size-4" />
              تصدير Excel
            </button>
            <button
              onClick={() => batchAudit.mutate(filteredTrips.map((trip) => trip.departure_id))}
              disabled={!filteredTrips.length || batchAudit.isPending}
              className="h-10 rounded-xl bg-cyan-600 px-4 text-xs font-black text-white disabled:opacity-40"
            >
              {batchAudit.isPending
                ? `تدقيق ${batchAudit.progress.currentTrip}/${batchAudit.progress.totalTrips} · نافذة ${batchAudit.progress.currentWindow}/${batchAudit.progress.totalWindows}`
                : `تدقيق جماعي (${Math.min(filteredTrips.length, 20)})`}
            </button>
          </div>
        </div>
      </article>
      {batchAudit.results.length > 0 && (
        <section
          className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4"
          aria-label="نتائج التدقيق الجماعي"
        >
          <div className="flex items-center justify-between">
            <b className="text-xs">نتائج تدقيق الانطلاقيات</b>
            <span className="text-[10px] font-black text-cyan-800">
              {batchAudit.results.filter((result) => result.status === 'success').length}/
              {batchAudit.results.length} ناجحة
            </span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {batchAudit.results.map((result) => {
              const trip = trips.find((item) => item.departure_id === result.departureId)
              return (
                <div
                  key={result.departureId}
                  className={`rounded-xl border bg-white p-3 text-[10px] ${result.status === 'success' ? 'border-emerald-200' : 'border-rose-200'}`}
                >
                  <b className="block">
                    {trip ? `${trip.vehicle_name} · DB ${trip.db_number}` : result.departureId}
                  </b>
                  <span
                    className={result.status === 'success' ? 'text-emerald-700' : 'text-rose-700'}
                  >
                    {result.status === 'success'
                      ? `${result.audited} نافذة دُققت من ${result.windows}`
                      : (result.error ?? 'تعذر التدقيق')}
                  </span>
                </div>
              )
            })}
          </div>
          {filteredTrips.length > 20 && (
            <p className="mt-2 text-[9px] text-cyan-900">
              حمايةً من الضغط، تعالج كل دفعة أول 20 انطلاقية مطابقة.
            </p>
          )}
        </section>
      )}
      {comparison.length > 0 && (
        <section
          className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4"
          aria-label="مقارنة الانطلاقيات"
        >
          <div className="flex items-center justify-between">
            <div>
              <b className="text-sm">مقارنة انطلاقيتين</b>
              <p className="text-[10px] text-indigo-700">
                اختر انطلاقيتين من الجدول؛ الاختيار الثالث يستبدل الأقدم.
              </p>
            </div>
            <button
              onClick={() => setCompareIds([])}
              className="text-[10px] font-black text-indigo-800"
            >
              مسح المقارنة
            </button>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {comparison.map((trip) => {
              const metric = metrics.get(trip.departure_id)
              return (
                <article key={trip.departure_id} className="rounded-xl border bg-white p-4">
                  <div className="flex justify-between">
                    <b>
                      {trip.vehicle_name} · DB {trip.db_number}
                    </b>
                    <CoverageRing value={Number(trip.coverage_percent)} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Data label="المدة" value={durationLabel(trip.total_seconds)} />
                    <Data label="الحركة" value={durationLabel(metric?.moving_seconds ?? 0)} />
                    <Data label="التوقف" value={durationLabel(metric?.stopped_seconds ?? 0)} />
                    <Data label="النقاط" value={String(trip.gps_points)} />
                    <Data label="الفجوات" value={String(trip.gap_count)} />
                    <Data label="السائق" value={trip.driver_name} />
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <IntegrityCard label="متوسط التغطية" value={`${filteredIntegrity.average}٪`} color="cyan" />
        <IntegrityCard label="مسارات مكتملة" value={filteredIntegrity.covered} color="emerald" />
        <IntegrityCard label="تغطية جزئية" value={filteredIntegrity.partial} color="amber" />
        <IntegrityCard label="بلا مسار موثوق" value={filteredIntegrity.missing} color="rose" />
      </div>
      <GpsQualityCharts
        trips={filteredTrips}
        metrics={filteredMetrics}
        diagnostics={filteredDiagnostics}
      />
      <article className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="grid h-64 place-items-center">
            <Loader2 className="animate-spin text-cyan-700" />
          </div>
        ) : filteredTrips.length ? (
          <>
            <div className="hidden overflow-auto lg:block">
              <table className="w-full min-w-[1120px] text-xs">
                <thead className="bg-slate-950 text-white">
                  <tr>
                    {[
                      'الانطلاقية',
                      'المدة',
                      'الحركة والتوقف',
                      'نافذة GPS',
                      'التغطية',
                      'الانقطاعات',
                      'تشخيص النقص',
                      'مطابقة المصدر',
                      'الإجراء',
                    ].map((x) => (
                      <th key={x} className="p-4 text-right">
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredTrips.map((trip) => (
                    <tr key={trip.departure_id} className="border-t hover:bg-slate-50">
                      <td className="p-4">
                        <b>{trip.vehicle_name}</b>
                        <small className="block text-slate-500">
                          DB {trip.db_number} · {trip.driver_name}
                        </small>
                      </td>
                      <td className="p-4">
                        {durationLabel(trip.total_seconds)}
                        <small className="block text-slate-400">
                          {fmt(trip.departed_at)} ←{' '}
                          {trip.returned_at ? fmt(trip.returned_at) : 'مستمرة'}
                        </small>
                      </td>
                      <td className="p-4">
                        {metrics.get(trip.departure_id) ? (
                          <>
                            <b className="text-emerald-700">
                              حركة {durationLabel(metrics.get(trip.departure_id)!.moving_seconds)}
                            </b>
                            <small className="block text-slate-400">
                              توقف {durationLabel(metrics.get(trip.departure_id)!.stopped_seconds)}{' '}
                              · {metrics.get(trip.departure_id)!.stop_count} محطة
                            </small>
                          </>
                        ) : (
                          <span className="text-slate-400">جارٍ التحليل…</span>
                        )}
                      </td>
                      <td className="p-4">
                        <b>{trip.gps_points.toLocaleString('ar-IQ')} نقطة</b>
                        <small className="block text-slate-400">
                          {shortTime(trip.first_fix)} — {shortTime(trip.last_fix)}
                        </small>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <CoverageRing value={Number(trip.coverage_percent ?? 0)} />
                          <CoverageBadge trip={trip} />
                        </div>
                      </td>
                      <td className="p-4">
                        <b className={trip.gap_count ? 'text-rose-700' : 'text-emerald-700'}>
                          {trip.gap_count} فجوة
                        </b>
                        <small className="block text-slate-400">
                          الأكبر {durationLabel(trip.largest_gap_seconds)}
                        </small>
                      </td>
                      <td className="p-4">
                        <DiagnosticBadge value={diagnostics.get(trip.departure_id)} />
                      </td>
                      <td className="p-4">
                        <b>
                          LVN {trip.source_points ?? '—'} / مخزن {trip.stored_points ?? '—'}
                        </b>
                        <small className="block text-slate-400">
                          {trip.imported_at ? fmt(trip.imported_at) : 'لم يُدقق بعد'}
                        </small>
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => onOpen(trip)}
                            disabled={!trip.device_id}
                            className="rounded-xl bg-slate-900 px-3 py-2 font-black text-white disabled:opacity-30"
                          >
                            فتح المسار
                          </button>
                          <button
                            onClick={() => toggleComparison(trip.departure_id)}
                            className={`rounded-xl px-3 py-2 font-black ${compareIds.includes(trip.departure_id) ? 'bg-indigo-700 text-white' : 'bg-indigo-100 text-indigo-900'}`}
                          >
                            {compareIds.includes(trip.departure_id) ? 'محدد للمقارنة' : 'قارن'}
                          </button>
                          <button
                            onClick={() => onImport(trip.departure_id)}
                            disabled={!trip.device_id || importing}
                            className="rounded-xl bg-cyan-100 px-3 py-2 font-black text-cyan-900 disabled:opacity-40"
                          >
                            تدقيق LVN
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 p-3 lg:hidden">
              {filteredTrips.map((trip) => (
                <article key={trip.departure_id} className="rounded-2xl border p-4">
                  <div className="flex justify-between">
                    <div>
                      <b>{trip.vehicle_name}</b>
                      <small className="block text-slate-500">
                        DB {trip.db_number} · {trip.driver_name}
                      </small>
                    </div>
                    <CoverageRing value={Number(trip.coverage_percent ?? 0)} />
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <Data label="النقاط" value={String(trip.gps_points)} />
                    <Data label="الفجوات" value={String(trip.gap_count)} />
                    <Data label="المدة" value={durationLabel(trip.total_seconds)} />
                    <Data
                      label="الحركة"
                      value={durationLabel(metrics.get(trip.departure_id)?.moving_seconds ?? 0)}
                    />
                    <Data
                      label="التوقف"
                      value={durationLabel(metrics.get(trip.departure_id)?.stopped_seconds ?? 0)}
                    />
                    <Data
                      label="المحطات"
                      value={String(metrics.get(trip.departure_id)?.stop_count ?? 0)}
                    />
                  </div>
                  <div className="mt-3">
                    <DiagnosticBadge value={diagnostics.get(trip.departure_id)} />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => onOpen(trip)}
                      className="flex-1 rounded-xl bg-slate-900 py-2 text-xs font-black text-white"
                    >
                      فتح المسار
                    </button>
                    <button
                      onClick={() => toggleComparison(trip.departure_id)}
                      className={`flex-1 rounded-xl py-2 text-xs font-black ${compareIds.includes(trip.departure_id) ? 'bg-indigo-700 text-white' : 'bg-indigo-100 text-indigo-900'}`}
                    >
                      قارن
                    </button>
                    <button
                      onClick={() => onImport(trip.departure_id)}
                      className="flex-1 rounded-xl bg-cyan-100 py-2 text-xs font-black text-cyan-900"
                    >
                      تدقيق LVN
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="p-16">
            <EmptyCompact
              text={
                trips.length
                  ? 'لا توجد انطلاقيات تطابق فلاتر التحقيق.'
                  : 'لا توجد انطلاقيات ضمن المدة المختارة.'
              }
            />
          </div>
        )}
      </article>
    </div>
  )
}
function GpsQualityCharts({
  trips,
  metrics,
  diagnostics,
}: {
  trips: GpsTripHistory[]
  metrics: Map<string, GpsTripRouteMetric>
  diagnostics: Map<string, GpsTripRouteDiagnostic>
}) {
  const values = [...metrics.values()],
    moving = values.reduce((sum, row) => sum + row.moving_seconds, 0),
    stopped = values.reduce((sum, row) => sum + row.stopped_seconds, 0),
    productive = moving + stopped ? Math.round((moving * 100) / (moving + stopped)) : 0,
    groups = [
      {
        label: 'مسار سليم',
        value: [...diagnostics.values()].filter((row) => row.diagnosis_code === 'healthy').length,
        color: 'bg-emerald-500',
      },
      {
        label: 'فجوات داخلية',
        value: [...diagnostics.values()].filter((row) => row.diagnosis_code === 'internal_gaps')
          .length,
        color: 'bg-amber-500',
      },
      {
        label: 'نقص بداية/نهاية',
        value: [...diagnostics.values()].filter((row) =>
          ['late_first_fix', 'early_last_fix', 'windows_not_fully_imported'].includes(
            row.diagnosis_code,
          ),
        ).length,
        color: 'bg-orange-500',
      },
      {
        label: 'مصدر/تخزين',
        value: [...diagnostics.values()].filter((row) =>
          ['provider_payload_rejected', 'storage_deficit', 'import_failed', 'no_data'].includes(
            row.diagnosis_code,
          ),
        ).length,
        color: 'bg-rose-500',
      },
    ],
    max = Math.max(1, ...groups.map((group) => group.value))
  return (
    <article className="grid gap-5 rounded-[1.75rem] border bg-white p-5 shadow-sm lg:grid-cols-2">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black">توزيع جودة المسارات</h3>
            <p className="text-[10px] text-slate-500">تشخيص خادمي لـ {trips.length} انطلاقية</p>
          </div>
          <BarChart3 className="text-cyan-700" size={20} />
        </div>
        <div className="mt-4 flex h-36 items-end gap-3 border-b border-slate-200 pb-2">
          {groups.map((group) => (
            <div key={group.label} className="flex flex-1 flex-col items-center justify-end gap-1">
              <b className="text-xs">{group.value}</b>
              <div
                className={`w-full max-w-14 rounded-t-lg ${group.color}`}
                style={{ height: `${Math.max(group.value ? 12 : 3, (group.value / max) * 90)}px` }}
              />
              <small className="text-center text-[8px] text-slate-500">{group.label}</small>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-black">الحركة المنتجة مقابل التوقف</h3>
        <p className="text-[10px] text-slate-500">من تحليل الخادم لجميع الانطلاقيات الظاهرة</p>
        <div className="mt-8 overflow-hidden rounded-full bg-blue-100">
          <div
            className="h-8 bg-gradient-to-l from-emerald-500 to-cyan-500"
            style={{ width: `${productive}%` }}
          />
        </div>
        <div className="mt-3 flex justify-between text-xs font-black">
          <span className="text-emerald-700">حركة {durationLabel(moving)}</span>
          <span className="text-blue-700">توقف {durationLabel(stopped)}</span>
        </div>
        <p className="mt-4 rounded-xl bg-slate-50 p-3 text-center text-xs font-black">
          نسبة الحركة المنتجة {productive}٪
        </p>
      </div>
    </article>
  )
}

function IntegrityCard({
  label,
  value,
  color,
}: {
  label: string
  value: string | number
  color: keyof typeof tones
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <span
        className={`mb-3 block h-1 w-10 rounded-full ${color === 'emerald' ? 'bg-emerald-400' : color === 'amber' ? 'bg-amber-400' : color === 'rose' ? 'bg-rose-400' : 'bg-cyan-400'}`}
      />
      <b className="text-2xl">{value}</b>
      <p className="text-[10px] font-bold text-slate-500">{label}</p>
    </div>
  )
}
function CoverageRing({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(100, value))
  return (
    <div
      className="grid size-11 place-items-center rounded-full"
      style={{ background: `conic-gradient(#06b6d4 ${safe}%, #e2e8f0 0)` }}
    >
      <span className="grid size-8 place-items-center rounded-full bg-white text-[9px] font-black">
        {safe}٪
      </span>
    </div>
  )
}
function DateInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (x: string) => void
}) {
  return (
    <label className="text-[10px] font-black text-slate-500">
      {label}
      <input
        aria-label={`${label} سجل GPS`}
        type="date"
        value={value}
        max={baghdadDay()}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-900"
      />
    </label>
  )
}

function FleetWorkspace({
  rows,
  loading,
  fetching,
  filters,
  options,
  activeCount,
  total,
  pages,
  setFilter,
  reset,
  setFilters,
  onDetail,
  onRoute,
  onZone,
  onBind,
}: {
  rows: GpsDevice[]
  loading: boolean
  fetching: boolean
  filters: GpsFilters
  options?: { owners: string[]; models: string[] }
  activeCount: number
  total: number
  pages: number
  setFilter: <K extends keyof GpsFilters>(k: K, v: GpsFilters[K]) => void
  reset: () => void
  setFilters: React.Dispatch<React.SetStateAction<GpsFilters>>
  onDetail: (x: string) => void
  onRoute: (x: GpsDevice) => void
  onZone: (x: GpsDevice) => void
  onBind: (x: GpsDevice) => void
}) {
  return (
    <div className="space-y-4">
      <article className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-black">
              <ListFilter className="text-cyan-700" size={18} />
              تصفية أسطول GPS
            </h2>
            <p className="text-[10px] text-slate-500">
              {fetching ? 'جارٍ تحديث النتائج…' : `${total} جهاز مطابق`}
            </p>
          </div>
          {activeCount > 0 && (
            <button onClick={reset} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold">
              مسح الفلاتر ({activeCount})
            </button>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="relative text-xs font-bold text-slate-600 xl:col-span-2">
            بحث شامل
            <Search className="absolute bottom-3 right-3 size-4 text-slate-400" />
            <input
              aria-label="بحث أجهزة GPS"
              value={filters.search ?? ''}
              onChange={(e) => setFilter('search', e.target.value)}
              placeholder="الآلية، DB، اللوحة، السائق، IMEI…"
              className="mt-1 h-11 w-full rounded-xl border pr-9"
            />
          </label>
          <Filter
            label="الحالة التشغيلية"
            value={filters.operational ?? ''}
            onChange={(v) =>
              setFilter('operational', (v || undefined) as GpsFilters['operational'])
            }
            options={[
              ['moving', 'متحركة'],
              ['idle', 'محرك يعمل'],
              ['parked', 'متوقفة'],
              ['unknown', 'غير معروفة'],
            ]}
          />
          <Filter
            label="حالة الانطلاقة"
            value={filters.trip ?? ''}
            onChange={(v) => setFilter('trip', (v || undefined) as GpsFilters['trip'])}
            options={[
              ['active', 'في انطلاقة حالية'],
              ['inactive', 'خارج الانطلاقة'],
            ]}
          />
          <Filter
            label="المدار / الزون"
            value={filters.zone ?? ''}
            onChange={(v) => setFilter('zone', (v || undefined) as GpsFilters['zone'])}
            options={[
              ['inside', 'داخل الزون'],
              ['outside', 'خارج الزون'],
              ['unassigned', 'غير مخصص'],
            ]}
          />
          <Filter
            label="الاتصال"
            value={filters.online ?? ''}
            onChange={(v) => setFilter('online', (v || undefined) as GpsFilters['online'])}
            options={[
              ['online', 'متصل'],
              ['offline', 'غير متصل'],
              ['unknown', 'غير معروف'],
            ]}
          />
          <Filter
            label="الربط بالآلية"
            value={filters.binding ?? ''}
            onChange={(v) => setFilter('binding', (v || undefined) as GpsFilters['binding'])}
            options={[
              ['bound', 'مربوط'],
              ['unbound', 'غير مربوط'],
            ]}
          />
          <Filter
            label="حداثة البيانات"
            value={filters.freshness ?? ''}
            onChange={(v) => setFilter('freshness', (v || undefined) as GpsFilters['freshness'])}
            options={[
              ['fresh', 'محدث'],
              ['stale', 'متأخر'],
            ]}
          />
          <Filter
            label="مالك الجهاز"
            value={filters.owner ?? ''}
            onChange={(v) => setFilter('owner', v || undefined)}
            options={(options?.owners ?? []).map((v) => [v, v])}
          />
          <Filter
            label="موديل الجهاز"
            value={filters.model ?? ''}
            onChange={(v) => setFilter('model', v || undefined)}
            options={(options?.models ?? []).map((v) => [v, v])}
          />
        </div>
      </article>
      {loading ? (
        <div className="grid h-64 place-items-center rounded-3xl border bg-white">
          <Loader2 className="animate-spin" />
        </div>
      ) : rows.length ? (
        <>
          <div className="hidden overflow-auto rounded-[1.75rem] border bg-white shadow-sm md:block">
            <table className="w-full min-w-[1150px] text-xs">
              <thead className="bg-slate-950 text-white">
                <tr>
                  {[
                    'الحالة',
                    'الجهاز والآلية',
                    'السائق',
                    'السرعة',
                    'آخر قراءة',
                    'الموقع والزون',
                    'الإجراءات',
                  ].map((x) => (
                    <th key={x} className="p-4 text-right">
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t hover:bg-slate-50">
                    <td className="p-4">
                      <OperationalStatus value={row.operational_status} />
                      <small className="mt-1 block text-slate-400">
                        {row.online_status === 'online' ? 'متصل' : 'غير متصل'}
                      </small>
                    </td>
                    <td className="p-4">
                      <b>{row.garage_vehicle_name ?? row.device_name}</b>
                      <small className="block text-slate-500">
                        {row.garage_db_number
                          ? `DB ${row.garage_db_number}`
                          : `LVN ${row.external_id}`}
                        {row.plate_number ? ` · ${row.plate_number}` : ''}
                      </small>
                    </td>
                    <td className="p-4">
                      {row.departure_driver ?? row.driver_name ?? 'غير محدد'}
                      <small className="block text-cyan-700">{tripStage(row.trip_stage)}</small>
                    </td>
                    <td className="p-4 font-black">{speed(row)}</td>
                    <td className="p-4">{fmt(row.fix_time)}</td>
                    <td className="max-w-72 p-4">
                      {row.address ?? 'غير متوفر'}
                      <small
                        className={`block font-bold ${row.assigned_zone_count && !row.inside_assigned_zone ? 'text-rose-700' : 'text-emerald-700'}`}
                      >
                        {row.assigned_zone_count === 0
                          ? 'زون غير مخصص'
                          : row.inside_assigned_zone
                            ? 'داخل الزون'
                            : 'خارج الزون'}
                      </small>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-1">
                        <Action label="التفاصيل" onClick={() => onDetail(row.id)} />
                        <Action label="المسار" onClick={() => onRoute(row)} />
                        <Action
                          label="الزون"
                          onClick={() => onZone(row)}
                          disabled={!row.garage_vehicle_id}
                        />
                        <Action
                          label={row.garage_vehicle_id ? 'تغيير الربط' : 'ربط'}
                          onClick={() => onBind(row)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 md:hidden">
            {rows.map((row) => (
              <article key={row.id} className="rounded-2xl border bg-white p-4">
                <div className="flex justify-between">
                  <div>
                    <b>{row.garage_vehicle_name ?? row.device_name}</b>
                    <small className="block text-slate-500">
                      {row.garage_db_number
                        ? `DB ${row.garage_db_number}`
                        : `LVN ${row.external_id}`}
                    </small>
                  </div>
                  <OperationalStatus value={row.operational_status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Data label="السرعة" value={speed(row)} />
                  <Data label="السائق" value={row.driver_name ?? '—'} />
                  <Data label="آخر قراءة" value={fmt(row.fix_time)} />
                  <Data label="الانطلاقية" value={tripStage(row.trip_stage)} />
                </div>
                <div className="mt-3 flex gap-2">
                  <Action label="التفاصيل" onClick={() => onDetail(row.id)} />
                  <Action label="المسار" onClick={() => onRoute(row)} />
                  <Action label="ربط" onClick={() => onBind(row)} />
                </div>
              </article>
            ))}
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              aria-label="الصفحة السابقة"
              disabled={(filters.page ?? 1) <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
              className="rounded-xl border bg-white p-3 disabled:opacity-30"
            >
              <ChevronRight size={17} />
            </button>
            <span className="text-xs font-bold">
              صفحة {filters.page ?? 1} من {pages}
            </span>
            <button
              aria-label="الصفحة التالية"
              disabled={(filters.page ?? 1) >= pages}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
              className="rounded-xl border bg-white p-3 disabled:opacity-30"
            >
              <ChevronLeft size={17} />
            </button>
          </div>
        </>
      ) : (
        <div className="rounded-3xl border border-dashed bg-white p-16 text-center">
          <Search className="mx-auto text-slate-300" />
          <b className="mt-3 block">لا توجد أجهزة تطابق الفلاتر</b>
        </div>
      )}
    </div>
  )
}
function Action({
  label,
  onClick,
  disabled = false,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg bg-slate-100 px-2.5 py-2 text-[10px] font-black text-slate-700 hover:bg-cyan-100 disabled:opacity-30"
    >
      {label}
    </button>
  )
}

function ZoneVehicleDialog({ zone, onClose }: { zone: GpsMapGeofence; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [initialized, setInitialized] = useState(false)
  const candidates = useGpsZoneVehicles(zone.id, search)
  const save = useGpsZoneVehicleAssignment()
  useEffect(() => {
    if (!initialized && candidates.data) {
      setSelected(
        new Set(candidates.data.filter((row) => row.is_assigned).map((row) => row.vehicle_id)),
      )
      setInitialized(true)
    }
  }, [candidates.data, initialized])
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  return (
    <div
      className="fixed inset-0 z-[1200] grid place-items-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b p-5">
          <div>
            <span className="text-[10px] font-black text-cyan-700">BULK ASSIGNMENT</span>
            <h2 className="font-black">آليات زون {zone.name}</h2>
          </div>
          <button aria-label="إغلاق إسناد الآليات" onClick={onClose}>
            <X />
          </button>
        </header>
        <div className="p-4">
          <div className="flex items-center gap-2 rounded-xl border px-3">
            <Search size={16} />
            <input
              aria-label="بحث آليات الزون"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالاسم أو رقم DB أو اللوحة"
              className="h-11 flex-1 outline-none"
            />
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            اختر حتى 200 آلية. الحفظ يستبدل الإسنادات السابقة للزون ذرياً.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4">
          {candidates.isLoading ? (
            <div className="grid place-items-center p-12">
              <Loader2 className="animate-spin" />
            </div>
          ) : (
            candidates.data?.map((row) => (
              <label
                key={row.vehicle_id}
                className="mb-2 flex cursor-pointer items-center gap-3 rounded-xl border p-3 hover:bg-cyan-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(row.vehicle_id)}
                  onChange={() => toggle(row.vehicle_id)}
                  disabled={!selected.has(row.vehicle_id) && selected.size >= 200}
                />
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-xs">{row.vehicle_name}</b>
                  <small className="text-slate-500">
                    DB {row.db_number} · {row.vehicle_category}
                    {row.plate_number ? ` · ${row.plate_number}` : ''}
                  </small>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[9px] font-bold ${row.device_id ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}
                >
                  {row.device_id ? 'GPS مرتبط' : 'بلا GPS'}
                </span>
              </label>
            ))
          )}
        </div>
        <footer className="flex items-center justify-between border-t p-4">
          <b className="text-xs">المحدد: {selected.size}</b>
          <button
            disabled={save.isPending || !initialized}
            onClick={() =>
              save.mutate({ zoneId: zone.id, vehicleIds: [...selected] }, { onSuccess: onClose })
            }
            className="rounded-xl bg-slate-950 px-6 py-3 text-xs font-black text-white disabled:opacity-40"
          >
            {save.isPending ? 'جارٍ الحفظ…' : 'حفظ الإسناد'}
          </button>
        </footer>
      </div>
    </div>
  )
}

function ZonesWorkspace({
  zones,
  events,
  from,
  to,
  setFrom,
  setTo,
  pending,
  onSave,
  onArchive,
}: {
  zones: GpsMapGeofence[]
  events: GpsZoneEvent[]
  from: string
  to: string
  setFrom: (value: string) => void
  setTo: (value: string) => void
  pending: boolean
  onSave: (zone: {
    id: string | null
    name: string
    polygon: GpsMapGeofence['polygon']
    color: string
  }) => void
  onArchive: (id: string) => void
}) {
  const [editing, setEditing] = useState<{
    id: string | null
    name: string
    color: string
    coordinates: string
  } | null>(null)
  const [error, setError] = useState('')
  const [assigning, setAssigning] = useState<GpsMapGeofence | null>(null)
  const [eventZone, setEventZone] = useState('')
  const [eventVehicle, setEventVehicle] = useState('')
  const [eventType, setEventType] = useState('')
  const filteredEvents = useMemo(
    () =>
      events.filter(
        (event) =>
          (!eventZone || event.geofence_id === eventZone) &&
          (!eventVehicle || event.garage_vehicle_id === eventVehicle) &&
          (!eventType || event.event_type === eventType),
      ),
    [eventType, eventVehicle, eventZone, events],
  )
  const eventVehicles = useMemo(
    () => [
      ...new globalThis.Map(
        events
          .filter((event) => event.garage_vehicle_id)
          .map((event) => [event.garage_vehicle_id, event.vehicle_name ?? event.device_name]),
      ).entries(),
    ],
    [events],
  )
  const submit = () => {
    if (!editing) return
    const polygon = editing.coordinates.split('\n').map((line) => {
      const parts = line.split(',')
      return {
        lat: Number(parts[0]?.trim() ?? Number.NaN),
        lng: Number(parts[1]?.trim() ?? Number.NaN),
      }
    })
    if (
      editing.name.trim().length < 2 ||
      polygon.length < 3 ||
      polygon.some((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lng))
    ) {
      setError('اكتب اسماً وثلاث نقاط صحيحة على الأقل، كل نقطة بصيغة: خط العرض, خط الطول')
      return
    }
    setError('')
    onSave({ id: editing.id, name: editing.name, polygon, color: editing.color })
    setEditing(null)
  }
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-4">
        <article className="rounded-[1.75rem] border bg-white shadow-sm">
          <SectionHead
            icon={MapPinned}
            title="مناطق التشغيل"
            subtitle="زونات LVN ومناطق المنصة في سجل موحد"
            badge={String(zones.length)}
          />
          <div className="grid gap-3 p-4 pt-0 md:grid-cols-2">
            {zones.map((zone) => (
              <article key={zone.id} className="rounded-2xl border p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="size-4 rounded-md" style={{ backgroundColor: zone.color }} />
                    <div>
                      <b className="text-sm">{zone.name}</b>
                      <small className="block text-slate-500">
                        {zone.source === 'lvn' ? 'مستوردة من LVN' : 'منطقة المنصة'} ·{' '}
                        {zone.polygon.length} نقطة
                      </small>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-[9px] font-black ${zone.source === 'lvn' ? 'bg-blue-100 text-blue-800' : 'bg-violet-100 text-violet-800'}`}
                  >
                    {zone.source === 'lvn' ? 'LVN' : 'محلية'}
                  </span>
                </div>
                {zone.source === 'platform' && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => setAssigning(zone)}
                      className="rounded-lg bg-cyan-50 px-3 py-2 text-[10px] font-black text-cyan-800"
                    >
                      إسناد الآليات
                    </button>
                    <button
                      onClick={() =>
                        setEditing({
                          id: zone.id,
                          name: zone.name,
                          color: zone.color,
                          coordinates: zone.polygon
                            .map((p) =>
                              Array.isArray(p) ? `${p[0]}, ${p[1]}` : `${p.lat}, ${p.lng}`,
                            )
                            .join('\n'),
                        })
                      }
                      className="rounded-lg bg-slate-100 px-3 py-2 text-[10px] font-black"
                    >
                      تعديل الحدود
                    </button>
                    <button
                      onClick={() => onArchive(zone.id)}
                      disabled={pending}
                      className="rounded-lg bg-rose-50 px-3 py-2 text-[10px] font-black text-rose-700"
                    >
                      أرشفة
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
          <div className="p-4 pt-0">
            <button
              onClick={() => setEditing({ id: null, name: '', color: '#06b6d4', coordinates: '' })}
              className="w-full rounded-2xl border border-dashed border-cyan-300 bg-cyan-50 p-4 text-xs font-black text-cyan-900"
            >
              + إنشاء زون تشغيلي جديد
            </button>
          </div>
        </article>
        <article className="rounded-[1.75rem] border bg-white shadow-sm">
          <SectionHead
            icon={Navigation}
            title="سجل عبور الزونات"
            subtitle="الدخول والخروج المسجل من قراءات GPS"
            badge={String(filteredEvents.length)}
          />
          <div className="grid gap-2 px-4 pb-3 sm:grid-cols-2 xl:grid-cols-3">
            <input
              aria-label="بداية سجل الزونات"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="h-10 rounded-xl border px-3 text-xs"
            />
            <input
              aria-label="نهاية سجل الزونات"
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="h-10 rounded-xl border px-3 text-xs"
            />
            <select
              aria-label="نوع حدث الزون"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="h-10 rounded-xl border px-3 text-xs"
            >
              <option value="">دخول وخروج</option>
              <option value="enter">دخول</option>
              <option value="exit">خروج</option>
            </select>
            <select
              aria-label="فلتر الزون"
              value={eventZone}
              onChange={(e) => setEventZone(e.target.value)}
              className="h-10 rounded-xl border px-3 text-xs"
            >
              <option value="">كل الزونات</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </select>
            <select
              aria-label="فلتر آلية الزون"
              value={eventVehicle}
              onChange={(e) => setEventVehicle(e.target.value)}
              className="h-10 rounded-xl border px-3 text-xs"
            >
              <option value="">كل الآليات</option>
              {eventVehicles.map(([id, name]) => (
                <option key={id} value={id ?? ''}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="max-h-[420px] overflow-auto px-4 pb-4">
            {filteredEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between gap-4 border-b py-3 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`grid size-9 place-items-center rounded-full ${event.event_type === 'enter' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}
                  >
                    <Navigation size={15} />
                  </span>
                  <div>
                    <b className="text-xs">
                      {event.event_type === 'enter' ? 'دخول إلى' : 'خروج من'} {event.geofence_name}
                    </b>
                    <p className="text-[10px] text-slate-500">
                      {event.vehicle_name ?? event.device_name}
                      {event.db_number ? ` · DB ${event.db_number}` : ''}
                    </p>
                  </div>
                </div>
                <div className="text-left">
                  <b className="block text-[10px]">{fmt(event.occurred_at)}</b>
                  <small className={event.departure_id ? 'text-cyan-700' : 'text-slate-400'}>
                    {event.departure_id ? 'ضمن انطلاقية' : 'خارج انطلاقية'}
                  </small>
                </div>
              </div>
            ))}
            {!filteredEvents.length && (
              <EmptyCompact text="لا توجد انتقالات زون تطابق الفلاتر ضمن المدة." />
            )}
          </div>
        </article>
      </div>
      <aside>
        {editing ? (
          <div className="sticky top-4 rounded-[1.75rem] border bg-white p-5 shadow-lg">
            <div className="flex justify-between">
              <div>
                <span className="text-[10px] font-black tracking-widest text-cyan-700">
                  ZONE EDITOR
                </span>
                <h2 className="text-lg font-black">{editing.id ? 'تعديل الزون' : 'زون جديد'}</h2>
              </div>
              <button aria-label="إغلاق محرر الزون" onClick={() => setEditing(null)}>
                <X />
              </button>
            </div>
            <label className="mt-5 block text-xs font-bold">
              اسم الزون
              <input
                aria-label="اسم الزون"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="mt-1 h-11 w-full rounded-xl border px-3"
              />
            </label>
            <label className="mt-3 block text-xs font-bold">
              اللون
              <input
                aria-label="لون الزون"
                type="color"
                value={editing.color}
                onChange={(e) => setEditing({ ...editing, color: e.target.value })}
                className="mt-1 h-11 w-full rounded-xl border p-1"
              />
            </label>
            <div className="mt-4">
              <Suspense
                fallback={<div className="h-[360px] animate-pulse rounded-2xl bg-slate-100" />}
              >
                <ZoneMapEditor
                  color={editing.color}
                  points={editing.coordinates
                    .split('\n')
                    .map((line) => {
                      const parts = line.split(',')
                      return { lat: Number(parts[0]), lng: Number(parts[1]) }
                    })
                    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))}
                  onChange={(points) =>
                    setEditing({
                      ...editing,
                      coordinates: points.map((point) => `${point.lat}, ${point.lng}`).join('\n'),
                    })
                  }
                />
              </Suspense>
            </div>
            <label className="mt-3 block text-xs font-bold">
              إحداثيات الحدود (تعديل يدوي اختياري)
              <textarea
                aria-label="إحداثيات الزون"
                value={editing.coordinates}
                onChange={(e) => setEditing({ ...editing, coordinates: e.target.value })}
                rows={10}
                dir="ltr"
                placeholder={'33.3152, 44.3661\n33.3200, 44.3800\n33.3050, 44.3750'}
                className="mt-1 w-full rounded-xl border p-3 font-mono text-xs"
              />
            </label>
            <p className="mt-2 text-[10px] leading-5 text-slate-500">
              كل سطر يمثل نقطة واحدة. تُغلق المنصة المضلع تلقائياً بين آخر نقطة وأول نقطة.
            </p>
            {error && (
              <p className="mt-2 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">
                {error}
              </p>
            )}
            <button
              onClick={submit}
              disabled={pending}
              className="mt-4 w-full rounded-xl bg-slate-950 py-3 text-xs font-black text-white disabled:opacity-40"
            >
              {pending ? 'جارٍ الحفظ…' : 'حفظ الزون'}
            </button>
          </div>
        ) : (
          <div className="rounded-[1.75rem] border border-dashed bg-slate-50 p-8 text-center text-xs text-slate-500">
            <MapPinned className="mx-auto mb-3 text-slate-300" />
            اختر منطقة محلية لتعديلها أو أنشئ زوناً جديداً.
          </div>
        )}
      </aside>
      {assigning && <ZoneVehicleDialog zone={assigning} onClose={() => setAssigning(null)} />}
    </div>
  )
}

function ResolveAlertModal({
  alert,
  pending,
  onClose,
  onResolve,
}: {
  alert: GpsOperationalAlert
  pending: boolean
  onClose: () => void
  onResolve: (note: string) => void
}) {
  const [note, setNote] = useState('')
  const escalations = useGpsAlertEscalations(alert.id)
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/70 p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex justify-between">
          <div>
            <span className="text-[10px] font-black text-rose-600">ALERT RESOLUTION</span>
            <h2 className="text-lg font-black">تسجيل معالجة التنبيه</h2>
          </div>
          <button aria-label="إغلاق معالجة التنبيه" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="mt-4 rounded-2xl bg-rose-50 p-4">
          <b className="text-sm">{alert.title}</b>
          <p className="text-xs text-slate-600">
            {alert.vehicle_name ?? alert.device_name}
            {alert.db_number ? ` · DB ${alert.db_number}` : ''}
          </p>
        </div>
        <div className="mt-3 rounded-2xl border p-3">
          <div className="flex justify-between">
            <b className="text-xs">سجل التصعيد والتفاعل</b>
            <span className="text-[10px] text-slate-500">
              {escalations.data?.length ?? 0} إرسال
            </span>
          </div>
          <div className="mt-2 max-h-28 space-y-1 overflow-auto">
            {escalations.data?.map((item) => (
              <div
                key={item.notification_id}
                className="flex items-center justify-between rounded-lg bg-slate-50 p-2 text-[9px]"
              >
                <span>
                  المستوى {item.level} · {fmt(item.created_at)}
                </span>
                <b className={item.is_read ? 'text-emerald-700' : 'text-amber-700'}>
                  {item.is_read ? `قُرئ ${fmt(item.read_at)}` : 'لم يُقرأ'}
                </b>
              </div>
            ))}
            {!escalations.isLoading && !escalations.data?.length && (
              <p className="text-[9px] text-slate-400">لم يُرسل تصعيد لهذا التنبيه.</p>
            )}
          </div>
        </div>
        <label className="mt-4 block text-xs font-bold">
          وصف الإجراء المتخذ
          <textarea
            aria-label="إجراء معالجة التنبيه"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="مثال: تم الاتصال بالسائق والتحقق من الجهاز…"
            className="mt-1 w-full rounded-xl border p-3"
          />
        </label>
        <button
          onClick={() => onResolve(note)}
          disabled={pending || note.trim().length < 3}
          className="mt-4 w-full rounded-xl bg-slate-950 py-3 text-xs font-black text-white disabled:opacity-40"
        >
          {pending ? 'جارٍ الإغلاق…' : 'اعتماد المعالجة وإغلاق التنبيه'}
        </button>
      </div>
    </div>
  )
}

function IntegrationWorkspace({
  dashboard,
  runs,
  health,
  syncing,
  onTest,
  onSync,
}: {
  dashboard: ReturnType<typeof useGpsDashboard>['data']
  runs: ReturnType<typeof useGpsSyncRuns>['data']
  health: ReturnType<typeof useGpsSchedulerHealth>['data']
  syncing: boolean
  onTest: () => void
  onSync: () => void
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <aside className="space-y-4">
        <article className="rounded-[1.75rem] bg-slate-950 p-5 text-white">
          <Sparkles className="text-cyan-300" />
          <h2 className="mt-4 text-xl font-black">سلامة خط البيانات</h2>
          <p className="mt-2 text-xs leading-6 text-slate-400">
            LVN ← الموصل الآمن ← Supabase ← غرفة العمليات
          </p>
          <div className="mt-5 space-y-2">
            <PipelineStep label="خدمة LVN" ok={!dashboard?.last_error_code} />
            <PipelineStep label="المزامنة الخادمية" ok={Boolean(dashboard?.last_success_at)} />
            <PipelineStep label="قاعدة المسارات" ok={Boolean(dashboard?.last_full_sync_at)} />
          </div>
        </article>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onTest}
            disabled={syncing}
            className="rounded-2xl border bg-white p-4 text-xs font-black"
          >
            <PlugZap className="mx-auto mb-2 text-cyan-700" />
            اختبار الاتصال
          </button>
          <button
            onClick={onSync}
            disabled={syncing}
            className="rounded-2xl bg-cyan-400 p-4 text-xs font-black text-slate-950"
          >
            <RefreshCw className={`mx-auto mb-2 ${syncing ? 'animate-spin' : ''}`} />
            مزامنة الآن
          </button>
        </div>
        <article className="rounded-[1.75rem] border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black">تشخيص المجدول الخادمي</h3>
            <span
              className={`size-3 rounded-full ${health?.gps_schedule_healthy && health?.push_schedule_healthy ? 'bg-emerald-500' : 'bg-amber-500'}`}
            />
          </div>
          <div className="mt-3 space-y-2 text-xs">
            <PipelineStep
              label="تحديث GPS كل 1–3 دقائق"
              ok={Boolean(health?.gps_schedule_healthy)}
            />
            <PipelineStep label="موزع Push بلا تراكم" ok={Boolean(health?.push_schedule_healthy)} />
            <div className="grid grid-cols-2 gap-2">
              <SmallMetric label="Push مستحق" value={health?.push_overdue ?? 0} />
              <SmallMetric label="عالق بالمعالجة" value={health?.push_processing_stuck ?? 0} />
              <SmallMetric label="فشل 24 ساعة" value={health?.push_failed_24h ?? 0} />
              <SmallMetric label="أجهزة Push" value={health?.active_push_subscriptions ?? 0} />
            </div>
          </div>
          <p className="mt-3 text-[9px] leading-4 text-slate-500">
            آخر تحديث تلقائي: {fmt(health?.last_incremental_at ?? null)}. الحالة الصفراء تعني أن
            إعداد Cron الخارجي يحتاج مراجعة، ولا تعرض أي مفاتيح سرية.
          </p>
        </article>
      </aside>
      <article className="overflow-hidden rounded-[1.75rem] border bg-white">
        <SectionHead
          icon={BarChart3}
          title="سجل المزامنة"
          subtitle="الصفحات والعناصر والأخطاء الآمنة"
          badge={String(runs?.length ?? 0)}
        />
        <div className="overflow-auto">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="bg-slate-100">
              <tr>
                {[
                  'العملية',
                  'الحالة',
                  'البداية',
                  'المدة',
                  'الصفحات',
                  'المستلم',
                  'الجديد / المحدث',
                  'الخطأ',
                ].map((x) => (
                  <th key={x} className="p-3 text-right">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(runs ?? []).map((run) => (
                <tr key={run.id} className="border-t">
                  <td className="p-3 font-bold">
                    {run.sync_type === 'full'
                      ? 'مزامنة كاملة'
                      : run.sync_type === 'incremental'
                        ? 'تحديث جزئي'
                        : 'اختبار اتصال'}
                  </td>
                  <td className="p-3">
                    <Status ok={run.status === 'success'}>
                      {run.status === 'success'
                        ? 'ناجحة'
                        : run.status === 'running'
                          ? 'قيد التنفيذ'
                          : 'فشلت'}
                    </Status>
                  </td>
                  <td className="p-3">{fmt(run.started_at)}</td>
                  <td className="p-3">
                    {run.finished_at
                      ? durationLabel(
                          (new Date(run.finished_at).getTime() -
                            new Date(run.started_at).getTime()) /
                            1000,
                        )
                      : '—'}
                  </td>
                  <td className="p-3">{run.pages_count}</td>
                  <td className="p-3">{run.received_count}</td>
                  <td className="p-3">
                    {run.inserted_count} / {run.updated_count}
                  </td>
                  <td className="p-3 text-rose-700">{run.error_code ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  )
}
function SmallMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2">
      <small className="block text-[9px] text-slate-500">{label}</small>
      <b>{value}</b>
    </div>
  )
}
function PipelineMetric({
  label,
  value,
  percent,
  tone,
}: {
  label: string
  value: number
  percent: number
  tone: 'cyan' | 'violet' | 'emerald' | 'blue' | 'rose'
}) {
  const colors = {
      cyan: 'bg-cyan-500',
      violet: 'bg-violet-500',
      emerald: 'bg-emerald-500',
      blue: 'bg-blue-500',
      rose: 'bg-rose-500',
    },
    safe = Math.max(0, Math.min(100, Number(percent || 0)))
  return (
    <div className="rounded-xl border bg-white p-3">
      <small className="text-[9px] font-bold text-slate-500">{label}</small>
      <div className="mt-1 flex items-end justify-between">
        <b className="text-xl">{value.toLocaleString('ar-IQ')}</b>
        <span className="text-[10px] font-black text-slate-500">{safe}٪</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${colors[tone]}`} style={{ width: `${safe}%` }} />
      </div>
    </div>
  )
}
function PipelineStep({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/5 p-3 text-xs">
      <span>{label}</span>
      <span className={ok ? 'text-emerald-300' : 'text-rose-300'}>
        {ok ? '● سليم' : '● يحتاج متابعة'}
      </span>
    </div>
  )
}
function durationLabel(seconds: number) {
  const s = Math.max(0, Number(seconds || 0)),
    h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60)
  return h ? `${h}س ${m}د` : `${m}د`
}

function TripRouteModal({
  trip,
  diagnostic,
  zones,
  onClose,
}: {
  trip: GpsTripHistory
  diagnostic?: GpsTripRouteDiagnostic
  zones: GpsMapGeofence[]
  onClose: () => void
}) {
  const [routeWindowIndex, setRouteWindowIndex] = useState(0)
  const [eventPage, setEventPage] = useState(1)
  const [eventType, setEventType] = useState<'' | 'stop' | 'gap'>('')
  const [focusedEventAt, setFocusedEventAt] = useState<string | null>(null)
  const [exportPending, setExportPending] = useState(false)
  const [investigationTarget, setInvestigationTarget] = useState<{
    id?: string
    type: 'route' | 'stop' | 'gap' | 'zone_enter' | 'zone_exit'
    at: string
    title: string
  } | null>(null)
  const [investigationNote, setInvestigationNote] = useState('')
  const [investigationStatus, setInvestigationStatus] = useState<'open' | 'in_review' | 'resolved'>(
    'open',
  )
  const addToast = useUiStore((state) => state.addToast)
  const actualEnd = new Date(trip.returned_at ?? Date.now()),
    startMs = new Date(trip.departed_at).getTime(),
    endMs = actualEnd.getTime(),
    windowMs = 72 * 3_600_000,
    windowCount = Math.max(1, Math.ceil((endMs - startMs) / windowMs)),
    safeWindowIndex = Math.min(routeWindowIndex, windowCount - 1),
    windowFrom = new Date(startMs + safeWindowIndex * windowMs).toISOString(),
    windowTo = new Date(Math.min(endMs, startMs + (safeWindowIndex + 1) * windowMs)).toISOString(),
    route = useGpsRouteWindow(trip.device_id ?? '', windowFrom, windowTo, Boolean(trip.device_id)),
    shifts = useGpsTripShiftContext(trip.departure_id),
    tripZoneEvents = useGpsTripZoneEvents(trip.departure_id),
    investigations = useGpsTripInvestigations(trip.departure_id),
    investigationSave = useGpsTripInvestigationSave(),
    serverMetrics = useGpsTripMetrics([trip.departure_id]),
    serverEvents = useGpsTripEvents(trip.departure_id, eventType, eventPage),
    historyWindows = useGpsHistoryWindows(trip.departure_id),
    windowAudit = useGpsTripWindowCoverageAudit(trip.departure_id),
    historyImport = useGpsHistoryImport(),
    allHistoryImport = useGpsAllHistoryImport()
  const points = useMemo(() => route.data ?? [], [route.data])
  const analytics = useMemo(() => analyzeRoute(points), [points])
  const serverMetric = serverMetrics.data?.[0]
  const eventTotal = Number(serverEvents.data?.[0]?.total_count ?? 0)
  const eventPages = Math.max(1, Math.ceil(eventTotal / 20))
  const currentHistoryWindow = historyWindows.data?.find(
    (window) => window.window_index === safeWindowIndex,
  )
  const pendingHistoryWindows = (historyWindows.data ?? [])
    .filter((window) => window.status !== 'success')
    .map((window) => window.window_index)
  const currentAudit = windowAudit.data?.find((window) => window.window_index === safeWindowIndex)
  const currentZoneEvents = (tripZoneEvents.data ?? []).filter((event) => {
    const at = new Date(event.occurred_at).getTime()
    return at >= new Date(windowFrom).getTime() && at <= new Date(windowTo).getTime()
  })
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])
  return createPortal(
    <div
      className="fixed inset-0 z-[2000] isolate overflow-hidden bg-slate-950/85 p-0 backdrop-blur-md md:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`مسار انطلاقية ${trip.vehicle_name}`}
    >
      <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col overflow-hidden bg-[#f8fafc] shadow-2xl md:h-[calc(100dvh-2rem)] md:rounded-[2rem]">
        <div className="flex shrink-0 flex-col gap-3 border-b border-white/10 bg-slate-950 px-4 py-3 text-white xl:flex-row xl:items-center xl:justify-between md:px-6 md:py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-cyan-400/15 text-cyan-300">
              <Route />
            </span>
            <div>
              <span className="text-[9px] font-black tracking-widest text-cyan-300">
                TRIP ROUTE
              </span>
              <h2 className="text-lg font-black">
                {trip.vehicle_name} · DB {trip.db_number}
              </h2>
              <p className="text-[10px] text-slate-400">
                {trip.driver_name} · {fmt(trip.departed_at)} —{' '}
                {trip.returned_at ? fmt(trip.returned_at) : 'مستمرة الآن'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={exportPending}
              onClick={() => {
                setExportPending(true)
                void Promise.all([
                  gpsLvn.tripShiftContexts([trip.departure_id]),
                  gpsLvn.tripRouteMetrics([trip.departure_id]),
                  gpsLvn.tripRouteEvents([trip.departure_id]),
                  gpsLvn.tripRouteDiagnostics([trip.departure_id]),
                  gpsLvn.tripWindowCoverageAudit(trip.departure_id),
                  gpsLvn.tripZoneEvents(trip.departure_id),
                  gpsLvn.tripInvestigations(trip.departure_id),
                ])
                  .then(
                    ([
                      shiftRows,
                      metricRows,
                      eventRows,
                      diagnosticRows,
                      auditRows,
                      tripZoneRows,
                      investigationRows,
                    ]) =>
                      exportGpsTrips(
                        [trip],
                        [],
                        shiftRows ?? [],
                        metricRows ?? [],
                        eventRows ?? [],
                        diagnosticRows ?? [],
                        auditRows ?? [],
                        tripZoneRows ?? [],
                        investigationRows ?? [],
                      ),
                  )
                  .then(() =>
                    addToast({
                      type: 'success',
                      message: 'تم إنشاء ملف تحقيق الانطلاقية مع تدقيق جميع النوافذ',
                    }),
                  )
                  .catch(() =>
                    addToast({
                      type: 'error',
                      message: 'تعذر إنشاء ملف التحقيق. أعد المحاولة بعد التحقق من الاتصال.',
                    }),
                  )
                  .finally(() => setExportPending(false))
              }}
              className="rounded-xl bg-white/10 px-4 py-2 text-xs font-black disabled:opacity-40"
            >
              <FileSpreadsheet className="ml-1 inline size-4" />
              {exportPending ? 'جارٍ التصدير…' : 'ملف تحقيق Excel'}
            </button>
            <button
              onClick={() =>
                allHistoryImport.mutate({
                  departureId: trip.departure_id,
                  indexes: pendingHistoryWindows,
                })
              }
              disabled={
                !trip.device_id ||
                historyWindows.isLoading ||
                allHistoryImport.isPending ||
                !pendingHistoryWindows.length
              }
              className="rounded-xl bg-emerald-300 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-40"
            >
              {allHistoryImport.isPending
                ? `تدقيق ${allHistoryImport.progress.current}/${allHistoryImport.progress.total}`
                : pendingHistoryWindows.length
                  ? `تدقيق كل النوافذ الناقصة (${pendingHistoryWindows.length})`
                  : 'جميع النوافذ مدققة'}
            </button>
            <button
              onClick={() =>
                historyImport.mutate({
                  departureId: trip.departure_id,
                  windowIndex: safeWindowIndex,
                })
              }
              disabled={!trip.device_id || historyImport.isPending || allHistoryImport.isPending}
              className="rounded-xl bg-cyan-300 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-40"
            >
              {historyImport.isPending
                ? 'جارٍ التدقيق…'
                : currentHistoryWindow?.status === 'success'
                  ? `إعادة تدقيق النافذة ${safeWindowIndex + 1}`
                  : `تدقيق نافذة ${safeWindowIndex + 1} من LVN`}
            </button>
            <button
              aria-label="إغلاق مسار الانطلاقية"
              onClick={onClose}
              className="rounded-xl bg-white/10 p-2"
            >
              <X />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto overflow-x-hidden p-3 md:p-5">
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 2xl:grid-cols-8">
            <Data label="التغطية" value={`${Number(trip.coverage_percent ?? 0)}٪`} />
            <Data label="النقاط" value={String(points.length)} />
            <Data label="المسافة التقريبية" value={`${analytics.distance.toFixed(1)} كم`} />
            <Data label="أعلى سرعة" value={`${analytics.maxSpeed.toFixed(0)} كم/س`} />
            <Data
              label="الحركة الكلية"
              value={durationLabel(serverMetric?.moving_seconds ?? analytics.moving)}
            />
            <Data
              label="التوقف الكلي"
              value={durationLabel(serverMetric?.stopped_seconds ?? analytics.stopped)}
            />
            <Data label="الفجوات" value={String(analytics.gaps)} />
            <Data label="أكبر انقطاع" value={durationLabel(analytics.largestGap)} />
          </div>
          {windowCount > 1 && (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 shrink-0" size={18} />
                  <div>
                    <b className="block text-xs">مسار طويل مقسم إلى {windowCount} نوافذ آمنة</b>
                    <p className="mt-1 text-[10px] leading-5">
                      النافذة {safeWindowIndex + 1}: {fmt(windowFrom)} — {fmt(windowTo)}. يمكنك
                      التنقل بين جميع أجزاء الانطلاقية دون إسقاط الأيام اللاحقة.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    aria-label="نافذة المسار السابقة"
                    disabled={safeWindowIndex === 0}
                    onClick={() => setRouteWindowIndex((value) => Math.max(0, value - 1))}
                    className="rounded-xl border border-amber-300 bg-white p-2 disabled:opacity-30"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <b className="min-w-16 text-center text-xs">
                    {safeWindowIndex + 1} / {windowCount}
                  </b>
                  <button
                    aria-label="نافذة المسار التالية"
                    disabled={safeWindowIndex >= windowCount - 1}
                    onClick={() =>
                      setRouteWindowIndex((value) => Math.min(windowCount - 1, value + 1))
                    }
                    className="rounded-xl border border-amber-300 bg-white p-2 disabled:opacity-30"
                  >
                    <ChevronLeft size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}
          {historyWindows.data && historyWindows.data.length > 0 && (
            <div className="mb-4 rounded-2xl border bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <b className="block text-xs">تقدم تدقيق نوافذ LVN</b>
                  <small className="text-[10px] text-slate-500">
                    النافذة الناجحة لا يعاد طلبها في التدقيق الجماعي.
                  </small>
                </div>
                <span className="text-[10px] font-black text-emerald-700">
                  {historyWindows.data.filter((window) => window.status === 'success').length}/
                  {historyWindows.data.length} مكتملة
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {historyWindows.data.map((window) => (
                  <button
                    key={window.window_index}
                    onClick={() => setRouteWindowIndex(window.window_index)}
                    className={`rounded-xl border p-3 text-right ${safeWindowIndex === window.window_index ? 'ring-2 ring-cyan-500' : ''} ${window.status === 'success' ? 'border-emerald-200 bg-emerald-50' : window.status === 'failed' ? 'border-rose-200 bg-rose-50' : window.status === 'partial' ? 'border-amber-200 bg-amber-50' : 'bg-slate-50'}`}
                  >
                    <b className="block text-[10px]">النافذة {window.window_index + 1}</b>
                    <small className="text-[9px] text-slate-500">
                      {window.status === 'success'
                        ? 'مكتملة'
                        : window.status === 'failed'
                          ? 'فشلت'
                          : window.status === 'partial'
                            ? 'جزئية'
                            : window.status === 'running'
                              ? 'قيد التنفيذ'
                              : 'لم تُدقق'}{' '}
                      · {window.chunks_completed ?? 0}/{window.chunks_requested ?? 0}
                    </small>
                  </button>
                ))}
              </div>
            </div>
          )}
          {currentAudit && (
            <section
              className="mb-4 overflow-hidden rounded-2xl border border-cyan-200 bg-white shadow-sm"
              aria-label="سلسلة اكتمال نافذة المسار"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-l from-slate-950 to-cyan-950 p-4 text-white">
                <div>
                  <b className="text-sm">سلسلة اكتمال النافذة {currentAudit.window_index + 1}</b>
                  <p className="mt-1 text-[10px] text-cyan-100">
                    قياس مستقل من استجابة LVN حتى النقاط القابلة للرسم، وليس تقديراً من شكل الخط.
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[10px] font-black ${currentAudit.diagnosis_code === 'healthy' ? 'bg-emerald-300 text-emerald-950' : 'bg-amber-300 text-amber-950'}`}
                >
                  {windowAuditLabels[currentAudit.diagnosis_code]}
                </span>
              </div>
              <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">
                <PipelineMetric
                  label="1 · مستلم من LVN"
                  value={currentAudit.source_points ?? 0}
                  percent={100}
                  tone="cyan"
                />
                <PipelineMetric
                  label="2 · صالح بعد التنقية"
                  value={currentAudit.valid_points ?? 0}
                  percent={Number(currentAudit.source_acceptance_percent)}
                  tone="violet"
                />
                <PipelineMetric
                  label="3 · موجود فعلياً بالمخزن"
                  value={currentAudit.actual_stored_points}
                  percent={Number(currentAudit.storage_match_percent)}
                  tone="emerald"
                />
                <PipelineMetric
                  label="4 · قابل للرسم بالصفحات"
                  value={currentAudit.renderable_points}
                  percent={
                    currentAudit.render_complete
                      ? 100
                      : Math.round(
                          (100 * currentAudit.renderable_points) /
                            Math.max(1, currentAudit.actual_stored_points),
                        )
                  }
                  tone={currentAudit.render_complete ? 'blue' : 'rose'}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 border-t bg-slate-50 p-4 md:grid-cols-4">
                <Data label="تغطية الزمن" value={`${Number(currentAudit.coverage_percent)}٪`} />
                <Data
                  label="فجوة البداية"
                  value={durationLabel(currentAudit.leading_gap_seconds)}
                />
                <Data
                  label="فجوة النهاية"
                  value={durationLabel(currentAudit.trailing_gap_seconds)}
                />
                <Data
                  label="فجوات داخلية"
                  value={`${currentAudit.internal_gap_count} · الأكبر ${durationLabel(currentAudit.largest_gap_seconds)}`}
                />
              </div>
              {(currentAudit.error_code || currentAudit.rejected_points) && (
                <p className="border-t border-rose-100 bg-rose-50 p-3 text-[10px] font-bold text-rose-800">
                  {currentAudit.rejected_points
                    ? `${currentAudit.rejected_points} نقطة رفضت قبل التخزين. `
                    : ''}
                  {currentAudit.error_code ? `رمز الفشل الآمن: ${currentAudit.error_code}` : ''}
                </p>
              )}
            </section>
          )}
          {serverMetric && (
            <div
              className={`mb-4 rounded-2xl border p-3 text-xs ${windowCount === 1 && (Math.abs(serverMetric.moving_seconds - analytics.moving) > 60 || Math.abs(serverMetric.stopped_seconds - analytics.stopped) > 60) ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}
            >
              <b>
                {windowCount === 1
                  ? 'مطابقة تحليل الخادم والخريطة'
                  : 'تحليل الخادم يغطي الانطلاقية كاملة'}
              </b>
              <p className="mt-1 text-[10px]">
                الخادم: حركة {durationLabel(serverMetric.moving_seconds)}، توقف{' '}
                {durationLabel(serverMetric.stopped_seconds)}، {serverMetric.stop_count} محطة.{' '}
                {windowCount === 1
                  ? `الخريطة: حركة ${durationLabel(analytics.moving)}، توقف ${durationLabel(analytics.stopped)}.`
                  : 'تحليل الخريطة أدناه خاص بالنافذة الحالية فقط.'}
              </p>
            </div>
          )}
          {diagnostic && (
            <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-black">تشخيص اكتمال المسار من المصدر إلى الرسم</h3>
                  <p className="text-[10px] text-slate-500">
                    نافذة الانطلاقية، تثبيت GPS، استيراد LVN، قبول النقاط والتخزين.
                  </p>
                </div>
                <DiagnosticBadge value={diagnostic} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
                <Data label="نوافذ 72 ساعة" value={String(diagnostic.expected_72h_windows)} />
                <Data label="تأخر البداية" value={durationLabel(diagnostic.leading_gap_seconds)} />
                <Data label="نقص النهاية" value={durationLabel(diagnostic.trailing_gap_seconds)} />
                <Data
                  label="نوافذ 12 ساعة"
                  value={`${diagnostic.chunks_completed ?? 0}/${diagnostic.chunks_requested ?? 0}`}
                />
                <Data label="من LVN" value={String(diagnostic.source_points ?? 0)} />
                <Data
                  label="صالح / مخزن"
                  value={`${diagnostic.valid_points ?? 0} / ${diagnostic.stored_points ?? 0}`}
                />
                <Data label="مرفوض" value={String(diagnostic.rejected_points ?? 0)} />
              </div>
              {diagnostic.error_code && (
                <p className="mt-2 rounded-xl bg-rose-50 p-2 text-[10px] font-bold text-rose-700">
                  رمز فشل آمن: {diagnostic.error_code}
                </p>
              )}
            </div>
          )}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
            <div className="rounded-2xl bg-white p-2 shadow-sm">
              {route.isLoading ? (
                <div className="grid h-[500px] place-items-center">
                  <Loader2 className="animate-spin" />
                </div>
              ) : (
                <Suspense fallback={<div className="h-[500px] animate-pulse bg-slate-100" />}>
                  <GpsRouteMap
                    points={points}
                    focusAt={focusedEventAt}
                    zones={zones}
                    shifts={shifts.data ?? []}
                    zoneEvents={currentZoneEvents}
                    startLabel={
                      safeWindowIndex === 0
                        ? 'مغادرة الكراج'
                        : `بداية النافذة ${safeWindowIndex + 1}`
                    }
                    endLabel={
                      safeWindowIndex === windowCount - 1 && trip.returned_at
                        ? 'العودة الفعلية إلى الكراج'
                        : `نهاية النافذة ${safeWindowIndex + 1}`
                    }
                  />
                </Suspense>
              )}
            </div>
            <aside className="space-y-3">
              <div className="rounded-2xl border bg-white p-4">
                <h3 className="text-sm font-black">التسلسل الزمني</h3>
                <Timeline label="مغادرة الكراج" time={trip.departed_at} state="done" />
                <Timeline
                  label="أول قراءة GPS"
                  time={trip.first_fix}
                  state={trip.first_fix ? 'done' : 'issue'}
                />
                <Timeline
                  label="آخر قراءة GPS"
                  time={trip.last_fix}
                  state={trip.gps_coverage === 'covered' ? 'done' : 'issue'}
                />
                <Timeline
                  label={trip.returned_at ? 'العودة الفعلية' : 'الانطلاقية مستمرة'}
                  time={trip.returned_at}
                  state={trip.returned_at ? 'done' : 'live'}
                />
              </div>
              <div className="rounded-2xl border bg-white p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black">الشفتات المتداخلة</h3>
                  <span className="rounded-full bg-indigo-100 px-2 py-1 text-[9px] font-black text-indigo-800">
                    {shifts.data?.length ?? 0}
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-slate-500">
                  السائقون والإسنادات التي تداخلت زمنياً مع الانطلاقية.
                </p>
                <div className="mt-3 space-y-2">
                  {shifts.isLoading ? (
                    <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
                  ) : (
                    shifts.data?.map((shift) => (
                      <div key={shift.assignment_id} className="rounded-xl border bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <b className="text-xs">{shift.driver_name}</b>
                          {shift.is_departure_driver && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[8px] font-black text-emerald-800">
                              سائق الانطلاق
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[9px] text-slate-500">
                          {shift.shift === 'morning'
                            ? 'صباحي'
                            : shift.shift === 'evening'
                              ? 'مسائي'
                              : 'ليلي'}{' '}
                          · {shift.area_name} · تداخل {durationLabel(shift.overlap_seconds)}
                        </p>
                        <p className="mt-1 text-[9px] text-slate-400">
                          {fmt(shift.overlap_from)} — {fmt(shift.overlap_to)}
                        </p>
                      </div>
                    ))
                  )}
                  {!shifts.isLoading && !shifts.data?.length && (
                    <p className="rounded-xl border border-dashed p-3 text-center text-[10px] text-slate-500">
                      لا توجد إسنادات شفت تاريخية متداخلة.
                    </p>
                  )}
                </div>
              </div>
              <div className="rounded-2xl border bg-white p-4">
                <h3 className="text-sm font-black">سلامة المصدر</h3>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs">نقاط LVN</span>
                  <b>{trip.source_points ?? '—'}</b>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs">المخزن</span>
                  <b>{trip.stored_points ?? '—'}</b>
                </div>
                <div className="mt-3">
                  <CoverageBadge trip={trip} />
                </div>
              </div>
            </aside>
          </div>
          <section className="mt-4 rounded-2xl border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black">سجل محطات الانطلاقية الكامل</h3>
                <p className="text-[10px] text-slate-500">
                  محطات الخادم عبر جميع نوافذ المسار، بترقيم مستقل.
                </p>
              </div>
              <select
                aria-label="نوع محطة المسار"
                value={eventType}
                onChange={(e) => {
                  setEventType(e.target.value as '' | 'stop' | 'gap')
                  setEventPage(1)
                }}
                className="h-9 rounded-xl border px-3 text-xs"
              >
                <option value="">كل المحطات</option>
                <option value="stop">التوقفات</option>
                <option value="gap">الانقطاعات</option>
              </select>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {serverEvents.isLoading ? (
                <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
              ) : (
                serverEvents.data?.map((event, index) => (
                  <article
                    key={`${event.event_type}-${event.event_start}-${index}`}
                    className="rounded-xl border bg-slate-50 p-3 text-right transition hover:border-cyan-400 hover:shadow"
                  >
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9px] font-black ${event.event_type === 'stop' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`}
                    >
                      {event.event_type === 'stop' ? 'توقف' : 'انقطاع'}
                    </span>
                    <b className="mt-2 block text-xs">{durationLabel(event.duration_seconds)}</b>
                    <p className="text-[9px] text-slate-500">
                      {fmt(event.event_start)} — {fmt(event.event_end)}
                    </p>
                    <p className="mt-1 truncate text-[9px] text-slate-400">
                      {event.address ?? 'العنوان غير متوفر'}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => {
                          const targetWindow = Math.max(
                            0,
                            Math.min(
                              windowCount - 1,
                              Math.floor(
                                (new Date(event.event_start).getTime() - startMs) / windowMs,
                              ),
                            ),
                          )
                          setRouteWindowIndex(targetWindow)
                          setFocusedEventAt(event.event_start)
                        }}
                        className="rounded-lg bg-cyan-100 px-2 py-1 text-[9px] font-black text-cyan-800"
                      >
                        عرض على الخريطة
                      </button>
                      <button
                        onClick={() => {
                          setInvestigationTarget({
                            type: event.event_type,
                            at: event.event_start,
                            title:
                              event.event_type === 'stop'
                                ? 'تحقيق توقف تشغيلي'
                                : 'تحقيق انقطاع GPS',
                          })
                          setInvestigationNote('')
                          setInvestigationStatus('open')
                        }}
                        className="rounded-lg bg-violet-100 px-2 py-1 text-[9px] font-black text-violet-800"
                      >
                        إضافة تحقيق
                      </button>
                    </div>
                  </article>
                ))
              )}
              {!serverEvents.isLoading && !serverEvents.data?.length && (
                <p className="text-xs text-slate-500">لا توجد محطات تطابق النوع المحدد.</p>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <small className="text-[10px] text-slate-500">{eventTotal} محطة</small>
              <div className="flex items-center gap-2">
                <button
                  aria-label="صفحة محطات سابقة"
                  disabled={eventPage === 1}
                  onClick={() => setEventPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border p-2 disabled:opacity-30"
                >
                  <ChevronRight size={14} />
                </button>
                <b className="text-xs">
                  {eventPage} / {eventPages}
                </b>
                <button
                  aria-label="صفحة محطات تالية"
                  disabled={eventPage >= eventPages}
                  onClick={() => setEventPage((p) => Math.min(eventPages, p + 1))}
                  className="rounded-lg border p-2 disabled:opacity-30"
                >
                  <ChevronLeft size={14} />
                </button>
              </div>
            </div>
          </section>
          <section className="mt-4 grid gap-4 xl:grid-cols-2">
            <article className="rounded-2xl border bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black">عبور الزونات ضمن النافذة</h3>
                  <p className="text-[10px] text-slate-500">
                    أحداث خادمية مرتبطة بمعرف الانطلاقية.
                  </p>
                </div>
                <span className="rounded-full bg-violet-100 px-2 py-1 text-[9px] font-black text-violet-800">
                  {currentZoneEvents.length}
                </span>
              </div>
              <div className="mt-3 max-h-52 space-y-2 overflow-auto">
                {currentZoneEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between rounded-xl border bg-slate-50 p-3"
                  >
                    <div>
                      <b className="text-xs">
                        {event.event_type === 'enter' ? 'دخول' : 'خروج'} · {event.geofence_name}
                      </b>
                      <p className="text-[9px] text-slate-500">{fmt(event.occurred_at)}</p>
                    </div>
                    <button
                      onClick={() => {
                        setInvestigationTarget({
                          type: event.event_type === 'enter' ? 'zone_enter' : 'zone_exit',
                          at: event.occurred_at,
                          title: `تحقيق ${event.event_type === 'enter' ? 'دخول' : 'خروج'} الزون`,
                        })
                        setInvestigationNote('')
                        setInvestigationStatus('open')
                      }}
                      className="rounded-lg bg-violet-100 px-3 py-2 text-[9px] font-black text-violet-800"
                    >
                      إضافة تحقيق
                    </button>
                  </div>
                ))}
                {!currentZoneEvents.length && (
                  <p className="rounded-xl border border-dashed p-4 text-center text-[10px] text-slate-400">
                    لا توجد أحداث زون مسجلة في هذه النافذة.
                  </p>
                )}
              </div>
            </article>
            <article className="rounded-2xl border bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black">سجل تحقيق المسار</h3>
                  <p className="text-[10px] text-slate-500">ملاحظات مدققة مع حالة معالجة مستقلة.</p>
                </div>
                <button
                  onClick={() => {
                    setInvestigationTarget({
                      type: 'route',
                      at: windowFrom,
                      title: 'ملاحظة عامة على المسار',
                    })
                    setInvestigationNote('')
                    setInvestigationStatus('open')
                  }}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-[9px] font-black text-white"
                >
                  ملاحظة عامة
                </button>
              </div>
              <div className="mt-3 max-h-52 space-y-2 overflow-auto">
                {investigations.data?.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setInvestigationTarget({
                        id: item.id,
                        type: item.event_type,
                        at: item.event_at,
                        title: 'تحديث ملاحظة التحقيق',
                      })
                      setInvestigationNote(item.note)
                      setInvestigationStatus(item.status)
                    }}
                    className="w-full rounded-xl border bg-slate-50 p-3 text-right"
                  >
                    <div className="flex justify-between gap-2">
                      <b className="text-[10px]">
                        {item.actor_name} · {fmt(item.event_at)}
                      </b>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[8px] font-black ${item.status === 'resolved' ? 'bg-emerald-100 text-emerald-800' : item.status === 'in_review' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}
                      >
                        {item.status === 'resolved'
                          ? 'تمت المعالجة'
                          : item.status === 'in_review'
                            ? 'قيد المراجعة'
                            : 'مفتوح'}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-600">{item.note}</p>
                  </button>
                ))}
                {!investigations.isLoading && !investigations.data?.length && (
                  <p className="rounded-xl border border-dashed p-4 text-center text-[10px] text-slate-400">
                    لم تسجل ملاحظات تحقيق بعد.
                  </p>
                )}
              </div>
            </article>
          </section>
          {investigationTarget && (
            <section
              className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4"
              aria-label="محرر تحقيق GPS"
            >
              <div className="flex justify-between">
                <div>
                  <b className="text-sm">{investigationTarget.title}</b>
                  <p className="text-[10px] text-violet-700">
                    {fmt(investigationTarget.at)} · تحفظ العملية في سجل التدقيق.
                  </p>
                </div>
                <button
                  aria-label="إغلاق محرر التحقيق"
                  onClick={() => setInvestigationTarget(null)}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_180px_auto]">
                <textarea
                  aria-label="ملاحظة تحقيق GPS"
                  value={investigationNote}
                  onChange={(event) => setInvestigationNote(event.target.value)}
                  rows={3}
                  placeholder="اكتب نتيجة التحقق أو الإجراء المطلوب…"
                  className="rounded-xl border bg-white p-3 text-xs"
                />
                <select
                  aria-label="حالة تحقيق GPS"
                  value={investigationStatus}
                  onChange={(event) =>
                    setInvestigationStatus(event.target.value as typeof investigationStatus)
                  }
                  className="rounded-xl border bg-white px-3 text-xs"
                >
                  <option value="open">مفتوح</option>
                  <option value="in_review">قيد المراجعة</option>
                  <option value="resolved">تمت المعالجة</option>
                </select>
                <button
                  disabled={investigationSave.isPending || investigationNote.trim().length < 3}
                  onClick={() =>
                    investigationSave.mutate(
                      {
                        id: investigationTarget.id,
                        departureId: trip.departure_id,
                        eventType: investigationTarget.type,
                        eventAt: investigationTarget.at,
                        note: investigationNote,
                        status: investigationStatus,
                      },
                      { onSuccess: () => setInvestigationTarget(null) },
                    )
                  }
                  className="rounded-xl bg-violet-700 px-5 py-3 text-xs font-black text-white disabled:opacity-40"
                >
                  {investigationSave.isPending
                    ? 'جارٍ الحفظ…'
                    : investigationTarget.id
                      ? 'تحديث المعالجة'
                      : 'حفظ التحقيق'}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
function Timeline({
  label,
  time,
  state,
}: {
  label: string
  time: string | null
  state: 'done' | 'issue' | 'live'
}) {
  return (
    <div className="relative mr-3 border-r border-slate-200 py-3 pr-5 last:border-transparent">
      <span
        className={`absolute -right-1.5 top-4 size-3 rounded-full border-2 border-white ${state === 'done' ? 'bg-emerald-500' : state === 'issue' ? 'bg-rose-500' : 'animate-pulse bg-cyan-500'}`}
      />
      <b className="block text-xs">{label}</b>
      <small className="text-[10px] text-slate-500">{fmt(time)}</small>
    </div>
  )
}
function analyzeRoute(points: GpsRoutePoint[]) {
  let distance = 0,
    moving = 0,
    stopped = 0,
    gaps = 0,
    largestGap = 0,
    maxSpeed = 0
  points.forEach((b, index) => {
    maxSpeed = Math.max(maxSpeed, b.speed ?? 0)
    const a = points[index - 1]
    if (!a) return
    const gap = (new Date(b.fix_time).getTime() - new Date(a.fix_time).getTime()) / 1000
    if (gap > 600) {
      gaps++
      largestGap = Math.max(largestGap, gap)
      return
    }
    const capped = Math.min(gap, 300)
    if ((a.speed ?? 0) > 0) moving += capped
    else stopped += capped
    const r = 6371,
      dLat = ((b.latitude - a.latitude) * Math.PI) / 180,
      dLng = ((b.longitude - a.longitude) * Math.PI) / 180,
      x =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((a.latitude * Math.PI) / 180) *
          Math.cos((b.latitude * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2
    const km = 2 * r * Math.asin(Math.sqrt(x))
    if (km < 10 && km / (Math.max(gap, 1) / 3600) < 180) distance += km
  })
  return { distance, moving, stopped, gaps, largestGap, maxSpeed }
}

function operationalLabel(value: GpsDevice['operational_status']) {
  return value === 'moving'
    ? 'متحركة'
    : value === 'idle'
      ? 'متوقفة والمحرك يعمل'
      : value === 'parked'
        ? 'متوقفة والمحرك مطفأ'
        : 'حالة المحرك غير معروفة'
}
function tripStage(value: GpsDevice['trip_stage']) {
  return value === 'to_work'
    ? 'في الطريق إلى العمل'
    : value === 'at_work'
      ? 'في موقع العمل'
      : value === 'returning_to_garage'
        ? 'عائدة إلى الكراج'
        : 'لا توجد انطلاقة'
}
function OperationalStatus({ value }: { value: GpsDevice['operational_status'] }) {
  const tone =
    value === 'moving'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
      : value === 'idle'
        ? 'bg-blue-100 text-blue-800 border-blue-300'
        : value === 'parked'
          ? 'bg-amber-100 text-amber-900 border-amber-300'
          : 'bg-slate-100 text-slate-700 border-slate-300'
  return (
    <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-black ${tone}`}>
      {operationalLabel(value)}
    </span>
  )
}
function ZoneModal({
  device,
  zones,
  pending,
  onToggle,
  onClose,
}: {
  device: GpsDevice
  zones: Array<{
    id: string
    name: string
    source: 'lvn' | 'platform'
    color: string
    is_assigned: boolean
  }>
  pending: boolean
  onToggle: (id: string, assigned: boolean) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
      <div className="w-full max-w-2xl rounded-3xl bg-white p-6">
        <div className="flex justify-between">
          <div>
            <h2 className="text-xl font-black">تخصيص المدار / الزون</h2>
            <p className="text-xs text-slate-500">
              {device.garage_vehicle_name} · DB {device.garage_db_number}
            </p>
          </div>
          <button aria-label="إغلاق الزون" onClick={onClose}>
            <X />
          </button>
        </div>
        <p className="mt-4 rounded-xl bg-blue-50 p-3 text-xs text-blue-800">
          تُستورد مناطق LVN عند المزامنة الكاملة. اختر منطقة أو أكثر مسموحة لهذه الآلية، وسيظهر
          فوراً إن كانت داخلها أو خارجها.
        </p>
        <div className="mt-4 max-h-80 space-y-2 overflow-auto">
          {zones.map((zone) => (
            <label
              key={zone.id}
              className="flex cursor-pointer items-center justify-between rounded-2xl border p-4"
            >
              <span>
                <b>{zone.name}</b>
                <small className="block text-slate-500">
                  {zone.source === 'lvn' ? 'منطقة مستوردة من LVN' : 'منطقة تشغيلية من المنصة'}
                </small>
              </span>
              <input
                type="checkbox"
                checked={zone.is_assigned}
                disabled={pending}
                onChange={() => onToggle(zone.id, zone.is_assigned)}
                className="size-5"
              />
            </label>
          ))}
          {!zones.length && (
            <p className="p-8 text-center text-sm text-slate-500">
              لا توجد مناطق مستوردة. نفّذ مزامنة كاملة أولاً.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
function RouteModal({ device, onClose }: { device: GpsDevice; onClose: () => void }) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date()),
    [day, setDay] = useState(today),
    route = useGpsRoute(device.id, day),
    historyImport = useGpsHistoryImport()
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-3">
      <div className="max-h-[94vh] w-full max-w-6xl overflow-auto rounded-3xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-black">
              <MapPinned className="text-emerald-700" />
              مسار الآلية
            </h2>
            <p className="text-xs text-slate-500">
              {device.garage_vehicle_name ?? device.device_name} ·{' '}
              {device.garage_db_number
                ? `DB ${device.garage_db_number}`
                : `LVN ${device.external_id}`}
            </p>
          </div>
          <div className="flex items-end gap-2">
            <label className="text-xs font-bold">
              اليوم
              <input
                aria-label="يوم مسار GPS"
                type="date"
                max={today}
                value={day}
                onChange={(e) => setDay(e.target.value)}
                className="mt-1 block h-10 rounded-xl border px-3"
              />
            </label>
            <button
              onClick={() => historyImport.mutate({ deviceId: device.id, day })}
              disabled={historyImport.isPending}
              className="h-10 rounded-xl bg-cyan-100 px-3 text-xs font-black text-cyan-900 disabled:opacity-50"
            >
              {historyImport.isPending ? 'جارٍ التدقيق…' : 'استيراد التاريخ من LVN'}
            </button>
            <button
              aria-label="إغلاق المسار"
              onClick={onClose}
              className="rounded-xl bg-slate-100 p-2"
            >
              <X />
            </button>
          </div>
        </div>
        <div className="mb-3 grid gap-2 sm:grid-cols-4">
          <Data label="نقاط GPS" value={String(route.data?.length ?? 0)} />
          <Data label="أول قراءة" value={fmt(route.data?.[0]?.fix_time ?? null)} />
          <Data label="آخر قراءة" value={fmt(route.data?.at(-1)?.fix_time ?? null)} />
          <Data
            label="حالة التغطية"
            value={
              route.isLoading
                ? 'جارٍ التحميل'
                : route.data?.length
                  ? 'توجد بيانات GPS'
                  : 'لا توجد بيانات'
            }
          />
        </div>
        {route.isLoading ? (
          <div className="grid h-72 place-items-center">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <Suspense fallback={<div className="h-72 animate-pulse rounded-2xl bg-slate-100" />}>
            <GpsRouteMap points={route.data ?? []} />
          </Suspense>
        )}
        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          <span className="text-emerald-700">● متحركة</span>
          <span className="text-blue-700">● متوقفة والمحرك يعمل</span>
          <span className="text-amber-700">● متوقفة والمحرك مطفأ</span>
          <span className="text-slate-600">● غير معروفة</span>
        </div>
      </div>
    </div>
  )
}
function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[][]
}) {
  return (
    <label className="text-xs font-bold text-slate-600">
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-11 w-full rounded-xl border px-3"
      >
        <option value="">الكل</option>
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  )
}
function Status({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}
    >
      {children}
    </span>
  )
}
function Data({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <small className="text-slate-500">{label}</small>
      <b className="mt-1 block">{value}</b>
    </div>
  )
}
function DetailModal({
  loading,
  data,
  onClose,
}: {
  loading: boolean
  data: ReturnType<typeof useGpsDetail>['data']
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex justify-between">
          <div>
            <h2 className="text-xl font-black">تفاصيل جهاز GPS</h2>
            <p className="text-xs text-slate-500">البيانات التعريفية والتشغيلية والحساسات</p>
          </div>
          <button aria-label="إغلاق" onClick={onClose}>
            <X />
          </button>
        </div>
        {loading || !data ? (
          <Loader2 className="mx-auto my-16 animate-spin" />
        ) : (
          <div className="mt-6 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Data label="اسم الجهاز" value={data.name} />
              <Data label="معرف LVN" value={data.external_id} />
              <Data label="IMEI" value={data.imei ?? '—'} />
              <Data label="الموديل" value={data.device_model ?? '—'} />
              <Data label="اللوحة" value={data.plate_number ?? '—'} />
              <Data label="VIN" value={data.vin ?? '—'} />
              <Data label="السائق" value={data.driver_name ?? '—'} />
              <Data label="المالك" value={data.object_owner ?? '—'} />
              <Data label="السرعة" value={`${data.speed ?? 0} ${data.speed_unit ?? ''}`} />
              <Data label="الحالة التشغيلية" value={operationalLabel(data.operational_status)} />
              <Data
                label="المحرك"
                value={
                  data.engine_status === 'on'
                    ? 'يعمل'
                    : data.engine_status === 'off'
                      ? 'مطفأ'
                      : 'غير معروف من الحساسات'
                }
              />
              <Data label="الانطلاقة الحالية" value={tripStage(data.trip_stage)} />
              <Data label="سائق الانطلاقة" value={data.departure_driver ?? '—'} />
              <Data label="الاتجاه" value={data.course == null ? '—' : `${data.course}°`} />
              <Data label="الطاقة" value={data.power ?? '—'} />
              <Data label="آخر تحديث" value={fmt(data.fix_time)} />
            </div>
            <div className="rounded-2xl bg-blue-50 p-4">
              <small className="text-blue-700">العنوان المسجل</small>
              <b className="mt-1 block">{data.address ?? 'غير متوفر'}</b>
            </div>
            <div>
              <h3 className="mb-2 font-black">المناطق التشغيلية المخصصة</h3>
              <div className="flex flex-wrap gap-2">
                {data.assigned_zones.length ? (
                  data.assigned_zones.map((zone) => (
                    <span
                      key={zone.id}
                      className={`rounded-full px-3 py-2 text-xs font-bold ${zone.inside ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}
                    >
                      {zone.name} · {zone.inside ? 'داخل الزون' : 'خارج الزون'}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-500">لم يُخصص زون لهذه الآلية بعد.</span>
                )}
              </div>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <List title="الحساسات" rows={data.sensors} />
              <List title="الخدمات" rows={data.services} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
function List({ title, rows }: { title: string; rows: Array<{ name?: string; value?: string }> }) {
  return (
    <div>
      <h3 className="mb-2 font-black">{title}</h3>
      <div className="space-y-2">
        {rows.length ? (
          rows.map((r, i) => (
            <div
              key={`${r.name}-${i}`}
              className="flex justify-between rounded-xl border p-3 text-xs"
            >
              <b>{r.name ?? 'بدون اسم'}</b>
              <span>{r.value ?? '—'}</span>
            </div>
          ))
        ) : (
          <p className="rounded-xl bg-slate-50 p-6 text-center text-xs text-slate-500">
            لا توجد بيانات.
          </p>
        )}
      </div>
    </div>
  )
}
function BindingModal({
  device,
  search,
  setSearch,
  candidates,
  pending,
  onBind,
  onUnbind,
  onClose,
}: {
  device: GpsDevice
  search: string
  setSearch: (v: string) => void
  candidates: Array<{
    id: string
    vehicle_name: string
    db_number: string
    plate_number: string
    current_device_id: string | null
  }>
  pending: boolean
  onBind: (id: string) => void
  onUnbind: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
      <div className="w-full max-w-xl rounded-3xl bg-white p-6">
        <div className="flex justify-between">
          <div>
            <h2 className="text-xl font-black">ربط الجهاز بآلية</h2>
            <p className="text-xs text-slate-500">
              {device.device_name} · {device.plate_number ?? device.external_id}
            </p>
          </div>
          <button aria-label="إغلاق" onClick={onClose}>
            <X />
          </button>
        </div>
        <input
          aria-label="بحث عن آلية للربط"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث برقم DB أو اللوحة أو اسم الآلية"
          className="mt-5 h-11 w-full rounded-xl border px-3"
        />
        <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
          {candidates.map((v) => (
            <button
              key={v.id}
              disabled={
                pending || Boolean(v.current_device_id && v.current_device_id !== device.id)
              }
              onClick={() => onBind(v.id)}
              className="flex w-full items-center justify-between rounded-2xl border p-4 text-right disabled:opacity-40"
            >
              <span>
                <b>{v.vehicle_name}</b>
                <small className="block text-slate-500">
                  DB {v.db_number} · {v.plate_number}
                </small>
              </span>
              {v.current_device_id ? (
                <span className="text-xs text-amber-700">مرتبطة</span>
              ) : (
                <Link2 className="text-blue-700" />
              )}
            </button>
          ))}
        </div>
        {device.garage_vehicle_id && (
          <button
            disabled={pending}
            onClick={onUnbind}
            className="mt-4 w-full rounded-xl bg-rose-50 py-3 text-sm font-black text-rose-700"
          >
            <Unlink className="ml-2 inline" size={17} />
            فك الارتباط الحالي
          </button>
        )}
      </div>
    </div>
  )
}
