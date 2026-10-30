import { lazy } from '@lib/router/lazy'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Activity,
  AlertTriangle,
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
  RefreshCw,
  Route,
  Search,
  Unlink,
  Wifi,
  X,
} from 'lucide-react'
import {
  useGpsAlertWorkflow,
  useGpsAutoSync,
  useGpsBind,
  useGpsCandidates,
  useGpsDashboard,
  useGpsDetail,
  useGpsDevices,
  useGpsGeofenceAssignment,
  useGpsGeofences,
  useGpsLiveMap,
  useGpsMapGeofences,
  useGpsZoneSector,
  useGpsRouteDeviationSettings,
  useSaveGpsRouteDeviationSettings,
  useGpsMapLandmark,
  useGpsMapLandmarks,
  useGpsOpenAlerts,
  useGpsPlatformGeofence,
  useGpsOptions,
  useGpsSync,
  useGpsTripHistory,
  useGpsTripMetrics,
  useGpsAlertEscalations,
  useGpsUnbind,
  useGpsZoneEvents,
  useGpsZoneVehicleAssignment,
  useGpsZoneVehicles,
} from '@features/gps-lvn/hooks'
import { useSectors } from '@features/sector'
import { gpsLvn } from '@sdk/gps-lvn.sdk'
import type {
  GpsDevice,
  GpsFilters,
  GpsLiveDevice,
  GpsMapGeofence,
  GpsMapLandmark,
  GpsOperationalAlert,
  GpsTripHistory,
  GpsTripRouteMetric,
  GpsZoneEvent,
} from '@sdk/gps-lvn.sdk'
import { exportGpsAlerts } from '@features/gps-lvn/export'
import { useSearchParams } from 'react-router'
import { useUiStore } from '@stores/ui.store'
import type { ZoneShape } from './ZoneMapEditor'
import { LandmarkGlyph, landmarkIconLabels } from './LandmarkIcon'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { parentSectorLabel } from '@sdk/sectors.sdk'
const TripRoutesWorkspace = lazy(() => import('./TripRoutesPage'))
const TripRouteMapWorkspace = lazy(() => import('./TripRouteMapPage'))
const GpsLiveMap = lazy(() => import('./GpsLiveMap'))
const ZoneMapEditor = lazy(() => import('./ZoneMapEditor'))
const LandmarkMapPicker = lazy(() => import('./LandmarkMapPicker'))
const fmt = (v: string | null) =>
  v
    ? new Intl.DateTimeFormat('ar-IQ-u-nu-latn', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Asia/Baghdad',
      }).format(new Date(v))
    : 'غير متوفر'
const shortTime = (v: string | null) =>
  v
    ? new Intl.DateTimeFormat('ar-IQ-u-nu-latn', {
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
  `${new Intl.NumberFormat('ar-IQ-u-nu-latn', { maximumFractionDigits: 1 }).format(row.speed ?? 0)} ${row.speed_unit === 'mph' ? 'ميل/س' : 'كم/س'}`
type View = 'operations' | 'trips' | 'fleet' | 'zones'
const VIEWS: View[] = ['operations', 'trips', 'fleet', 'zones']

export default function GpsDataPage() {
  // 00347: التبويب والانطلاقية المفتوحة في عنوان الصفحة (?view=trips&trip=…) حتى تعمل الروابط والتحديث والرجوع
  const [sp, setSp] = useSearchParams()
  const spView = sp.get('view')
  const view: View = VIEWS.includes(spView as View) ? (spView as View) : 'operations'
  const openTrip = sp.get('trip')
  const setView = (v: View) => setSp(v === 'operations' ? {} : { view: v })
  const openTripMap = (departureId: string) => setSp({ view: 'trips', trip: departureId })
  const [filters, setFilters] = useState<GpsFilters>({ page: 1, pageSize: 30 })
  const [tripFrom, setTripFrom] = useState(baghdadDay(-7))
  const [tripTo, setTripTo] = useState(baghdadDay())
  const [selected, setSelected] = useState('')
  const [binding, setBinding] = useState<GpsDevice | null>(null)
  const [candidateSearch, setCandidateSearch] = useState('')
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
  const liveMap = useGpsLiveMap()
  const mapZones = useGpsMapGeofences()
  const sectorsList = useSectors()
  const zoneSector = useGpsZoneSector()
  const routeSettings = useGpsRouteDeviationSettings()
  const saveRouteSettings = useSaveGpsRouteDeviationSettings()
  const mapLandmarks = useGpsMapLandmarks()
  const alerts = useGpsOpenAlerts()
  const zoneEvents = useGpsZoneEvents(zoneRangeFrom, zoneRangeTo)
  const tripHistory = useGpsTripHistory(tripFrom, tripTo)
  const tripMetricIds = (tripHistory.data ?? []).slice(0, 200).map((trip) => trip.departure_id)
  const tripMetrics = useGpsTripMetrics(tripMetricIds)
  const sync = useGpsSync()
  const alertWorkflow = useGpsAlertWorkflow()
  const platformZone = useGpsPlatformGeofence()
  const mapLandmark = useGpsMapLandmark()
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
    { id: 'trips', label: 'مسارات الانطلاقيات', hint: 'المسار الدقيق لكل انطلاقية', icon: Route },
    { id: 'fleet', label: 'أجهزة الأسطول', hint: 'الربط والحالة', icon: Database },
    { id: 'zones', label: 'الزونات', hint: 'المناطق والحركة', icon: MapPinned },
  ]

  return (
    <section dir="rtl" className="space-y-5 pb-10" data-testid="gps-data-page">
      <ExecPageHeader icon="map-pin" iconNode={<Navigation size={22} className="text-[#f3d06a]" />} title="قيادة الانطلاقيات والمسارات"
        subtitle={<><span className="font-bold text-[#f3d06a]">GPS COMMAND CENTER</span> <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300"><CircleDot className="ml-1 inline size-3 animate-pulse" />مباشر</span> · صورة تشغيلية واحدة من لحظة مغادرة الكراج حتى العودة، مع سلامة GPS والانقطاعات والزونات.</>}
        actions={<>
          <button aria-label="الخريطة الحية" onClick={() => setView('operations')} className="inline-flex h-9 items-center gap-1 rounded-xl bg-white/10 px-3 text-xs font-black text-white ring-1 ring-white/25 hover:bg-white/20"><MapPinned className="size-4 text-[#f3d06a]" />الخريطة الحية</button>
          <button aria-label={`التنبيهات (${alerts.data?.length ?? 0})`} onClick={() => setView('operations')} className="inline-flex h-9 items-center gap-1 rounded-xl bg-white/10 px-3 text-xs font-black text-white ring-1 ring-white/25 hover:bg-white/20 text-rose-200"><AlertTriangle className="size-4" />التنبيهات ({alerts.data?.length ?? 0})</button>
          <button onClick={() => sync.mutate(d?.last_full_sync_at ? 'incremental' : 'full')} disabled={sync.isPending} className="inline-flex h-9 items-center gap-1 rounded-xl bg-white px-3 text-xs font-black text-[#0b3d6b] shadow hover:bg-blue-50 disabled:opacity-50">{sync.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}تحديث البيانات</button>
        </>}
        stats={[{ label: 'آخر نجاح', value: <span className="text-sm">{fmt(d?.last_success_at ?? null)}</span>, tone: 'green' }, { label: 'المزامنة التلقائية', value: <span className="text-sm">الشاشة كل 5 ثوانٍ · المزوّد كل ثانية</span>, tone: 'plain' }, { label: 'LVN API', value: <span className="text-sm">{d?.api_version ?? '—'}</span>, tone: 'gold' }]} />

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
                <GpsLiveMap
                  rows={liveMap.data ?? []}
                  zones={mapZones.data ?? []}
                  landmarks={mapLandmarks.data ?? []}
                />
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
                    onOpen={() => openTripMap(trip.departure_id)}
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
                    {a.alert_type === 'route_deviation' && (
                      <p className="mt-1 rounded-lg bg-white/70 p-2 text-[10px] text-slate-700" data-testid={`route-deviation-${a.id}`}>
                        السائق <b>{String(a.details.driver_name ?? '—')}</b> · خرج من منطقة <b>{String(a.details.area_name ?? '—')}</b>
                        {a.details.in_support ? ' (مهمة دعم)' : ''} · مسؤولها <b>{String(a.details.manager_name ?? '—')}</b> · خارج الزون منذ{' '}
                        <b>{String(a.details.outside_minutes ?? '?')}</b> دقيقة
                      </p>
                    )}
                    <div className="mt-2 flex gap-2">
                      {!a.acknowledged_at ? (
                        <button disabled={alertWorkflow.isPending}
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
        <Suspense fallback={<div className="h-[420px] animate-pulse rounded-2xl bg-slate-100" data-testid="gps-trips-loading" />}>
          {openTrip ? <TripRouteMapWorkspace departureId={openTrip} /> : <TripRoutesWorkspace />}
        </Suspense>
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
          landmarks={mapLandmarks.data ?? []}
          liveVehicles={liveMap.data ?? []}
          events={zoneEvents.data ?? []}
          from={tripFrom}
          to={tripTo}
          setFrom={setTripFrom}
          setTo={setTripTo}
          pending={platformZone.isPending}
          onSave={(zone) => platformZone.mutate({ type: 'save', ...zone })}
          onArchive={(id) => platformZone.mutate({ type: 'archive', id })}
          sectors={sectorsList.data ?? []}
          sectorPending={zoneSector.isPending}
          onSetSector={(id, sectorId) => zoneSector.mutate({ id, sectorId })}
          routeGrace={routeSettings.data?.grace_minutes ?? 3}
          routeGracePending={saveRouteSettings.isPending}
          onSaveRouteGrace={(m) => saveRouteSettings.mutate(m)}
          landmarkPending={mapLandmark.isPending}
          onSaveLandmark={(landmark) => mapLandmark.mutate({ type: 'save', landmark })}
          onArchiveLandmark={(id) => mapLandmark.mutate({ type: 'archive', id })}
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
  landmarks,
  liveVehicles,
  events,
  from,
  to,
  setFrom,
  setTo,
  pending,
  onSave,
  onArchive,
  landmarkPending,
  onSaveLandmark,
  onArchiveLandmark,
  sectors,
  sectorPending,
  onSetSector,
  routeGrace,
  routeGracePending,
  onSaveRouteGrace,
}: {
  zones: GpsMapGeofence[]
  landmarks: GpsMapLandmark[]
  liveVehicles: GpsLiveDevice[]
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
  landmarkPending: boolean
  onSaveLandmark: (landmark: Omit<GpsMapLandmark, 'id'> & { id: string | null }) => void
  onArchiveLandmark: (id: string) => void
  sectors: Array<{ id: number; name: string; parent_sector?: string }>
  sectorPending: boolean
  onSetSector: (id: string, sectorId: number | null) => void
  routeGrace: number
  routeGracePending: boolean
  onSaveRouteGrace: (minutes: number) => void
}) {
  const [graceDraft, setGraceDraft] = useState<string>('')
  const [editing, setEditing] = useState<{
    id: string | null
    name: string
    color: string
    shape: ZoneShape
    coordinates: string
  } | null>(null)
  const [editingLandmark, setEditingLandmark] = useState<
    (Omit<GpsMapLandmark, 'id'> & { id: string | null }) | null
  >(null)
  const [error, setError] = useState('')
  const [assigning, setAssigning] = useState<GpsMapGeofence | null>(null)
  const [eventZone, setEventZone] = useState('')
  const [eventVehicle, setEventVehicle] = useState('')
  const [eventType, setEventType] = useState('')
  useEffect(() => {
    if (!editing && !editingLandmark) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEditing(null)
        setEditingLandmark(null)
      }
    }
    window.addEventListener('keydown', close)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', close)
    }
  }, [editing, editingLandmark])
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
  const linkedAreas = new Set(zones.filter((z) => z.sector_id).map((z) => z.sector_id))
  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <article className="rounded-[1.75rem] border border-amber-200 bg-amber-50/60 p-4 shadow-sm" data-testid="route-deviation-settings">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <b className="text-sm text-amber-900">تنبيه «خرجت من مسارها»</b>
              <p className="mt-1 text-xs text-amber-800">
                كل آلية تعمل في موقعها تُراقَب تلقائياً ضد زونات منطقتها (أو منطقة الدعم إن كانت مُعارة). لا تنبيه أثناء الطريق أو المحطة أو الصيانة.
                المناطق المرتبطة بزون: <b>{linkedAreas.size}</b> من {sectors.length}
                {sectors.length > 0 && linkedAreas.size < sectors.length && (
                  <span className="mr-1 text-rose-700" data-testid="route-unlinked-areas">
                    — بلا زون: {sectors.filter((s) => !linkedAreas.has(s.id)).map((s) => s.name).join('، ')}
                  </span>
                )}
              </p>
            </div>
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const m = Number(graceDraft === '' ? routeGrace : graceDraft)
                if (Number.isFinite(m) && m >= 0 && m <= 120) onSaveRouteGrace(m)
              }}
            >
              <label className="text-xs font-bold text-amber-900">
                مهلة التسامح (دقائق متواصلة خارج الزون)
                <input
                  data-testid="route-grace-input"
                  type="number"
                  min={0}
                  max={120}
                  value={graceDraft === '' ? routeGrace : graceDraft}
                  onChange={(e) => setGraceDraft(e.target.value)}
                  className="mr-2 h-10 w-20 rounded-xl border px-2 text-sm"
                />
              </label>
              <button data-testid="route-grace-save" disabled={routeGracePending} className="h-10 rounded-xl bg-amber-700 px-4 text-xs font-black text-white disabled:opacity-50">
                حفظ
              </button>
            </form>
          </div>
        </article>
        <article className="rounded-[1.75rem] border bg-white shadow-sm">
          <SectionHead
            icon={MapPinned}
            title="مناطق التشغيل"
            subtitle="زونات LVN ومناطق المنصة في سجل موحد — اربط كل زون بمنطقته التشغيلية"
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
                <label className="mt-3 block text-[11px] font-bold text-slate-600">
                  المنطقة التشغيلية
                  <select
                    data-testid={`zone-sector-${zone.id}`}
                    value={zone.sector_id ?? ''}
                    disabled={sectorPending}
                    onChange={(e) => onSetSector(zone.id, e.target.value ? Number(e.target.value) : null)}
                    className={`mt-1 h-10 w-full rounded-xl border px-2 text-xs ${zone.sector_id ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}
                  >
                    <option value="">— غير مرتبط (لا مراقبة مسار) —</option>
                    {sectors.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}{s.parent_sector ? ` — ${parentSectorLabel(s.parent_sector)}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
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
                          shape: 'polygon',
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
              onClick={() =>
                setEditing({
                  id: null,
                  name: '',
                  color: '#06b6d4',
                  shape: 'polygon',
                  coordinates: '',
                })
              }
              className="w-full rounded-2xl border border-dashed border-cyan-300 bg-cyan-50 p-4 text-xs font-black text-cyan-900"
            >
              + إنشاء زون تشغيلي جديد
            </button>
          </div>
        </article>
        <article className="rounded-[1.75rem] border bg-white shadow-sm">
          <SectionHead
            icon={MapPinned}
            title="المعالم التشغيلية"
            subtitle="مواقع ثابتة تظهر مباشرة فوق الخريطة الحية"
            badge={String(landmarks.length)}
          />
          <div className="grid gap-3 px-4 pb-4 md:grid-cols-2 xl:grid-cols-3">
            {landmarks.map((landmark) => (
              <div key={landmark.id} className="flex items-center gap-3 rounded-2xl border p-3">
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-xl text-white shadow"
                  style={{ backgroundColor: landmark.color }}
                >
                  <LandmarkGlyph icon={landmark.icon} />
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-xs">{landmark.name}</b>
                  <small className="text-slate-500">
                    {landmark.category} · {landmark.latitude.toFixed(5)},{' '}
                    {landmark.longitude.toFixed(5)}
                  </small>
                </div>
                <button
                  onClick={() =>
                    setEditingLandmark({
                      id: landmark.id,
                      name: landmark.name,
                      category: landmark.category,
                      icon: landmark.icon,
                      latitude: landmark.latitude,
                      longitude: landmark.longitude,
                      color: landmark.color,
                      notes: landmark.notes,
                    })
                  }
                  className="rounded-lg bg-slate-100 px-2 py-2 text-[10px] font-black"
                >
                  تعديل
                </button>
                <button
                  onClick={() => onArchiveLandmark(landmark.id)}
                  disabled={landmarkPending}
                  className="rounded-lg bg-rose-50 px-2 py-2 text-[10px] font-black text-rose-700"
                >
                  أرشفة
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                setEditingLandmark({
                  id: null,
                  name: '',
                  category: 'landmark',
                  icon: 'pin',
                  latitude: 33.3152,
                  longitude: 44.3661,
                  color: '#f97316',
                  notes: null,
                })
              }
              className="min-h-16 rounded-2xl border border-dashed border-orange-300 bg-orange-50 p-4 text-xs font-black text-orange-900"
            >
              + إضافة معلم على الخريطة الحية
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
      {editing &&
        createPortal(
          <div className="fixed inset-0 z-[2100] flex bg-slate-950 max-lg:flex-col" dir="rtl">
            <aside className="z-10 flex w-[360px] shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl max-lg:max-h-[42vh] max-lg:w-full">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[10px] font-black tracking-widest text-cyan-700">
                    محرر كامل الشاشة
                  </span>
                  <h2 className="mt-1 text-xl font-black">
                    {editing.id ? 'تعديل الزون' : 'إنشاء زون جديد'}
                  </h2>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">
                    ارسم مباشرة على الخريطة الحية الكبيرة ثم احفظ الحدود.
                  </p>
                </div>
                <button
                  aria-label="إغلاق محرر الزون"
                  onClick={() => setEditing(null)}
                  className="grid size-10 place-items-center rounded-xl bg-slate-100"
                >
                  <X size={18} />
                </button>
              </div>
              <label className="mt-6 block text-xs font-bold">
                اسم الزون
                <input
                  aria-label="اسم الزون"
                  value={editing.name}
                  onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                  className="mt-1 h-11 w-full rounded-xl border px-3"
                  placeholder="مثال: نطاق عمل الجادرية"
                />
              </label>
              <label className="mt-3 block text-xs font-bold">
                لون الظهور
                <input
                  aria-label="لون الزون"
                  type="color"
                  value={editing.color}
                  onChange={(event) => setEditing({ ...editing, color: event.target.value })}
                  className="mt-1 h-11 w-full rounded-xl border p-1"
                />
              </label>
              <details className="mt-4 rounded-xl border bg-slate-50 p-3">
                <summary className="cursor-pointer text-xs font-black">
                  الإحداثيات اليدوية (
                  {editing.coordinates ? editing.coordinates.split('\n').length : 0})
                </summary>
                <textarea
                  aria-label="إحداثيات الزون"
                  value={editing.coordinates}
                  onChange={(event) => setEditing({ ...editing, coordinates: event.target.value })}
                  rows={8}
                  dir="ltr"
                  className="mt-3 w-full rounded-xl border p-3 font-mono text-[10px]"
                />
              </details>
              {error && (
                <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">
                  {error}
                </p>
              )}
              <div className="mt-auto pt-5">
                <p className="mb-3 text-[10px] leading-5 text-slate-500">
                  الدائرة والأشكال المنتظمة تتحول داخلياً إلى حدود دقيقة ومتوافقة مع مراقبة دخول
                  وخروج الآليات.
                </p>
                <button
                  onClick={submit}
                  disabled={pending}
                  className="w-full rounded-xl bg-slate-950 py-3.5 text-xs font-black text-white disabled:opacity-40"
                >
                  {pending ? 'جارٍ الحفظ…' : 'حفظ الزون وتفعيله'}
                </button>
              </div>
            </aside>
            <main className="min-h-0 min-w-0 flex-1 p-3">
              <div className="h-full overflow-hidden rounded-3xl border border-white/10">
                <Suspense fallback={<div className="h-full animate-pulse bg-slate-800" />}>
                  <ZoneMapEditor
                    color={editing.color}
                    shape={editing.shape}
                    zones={zones.filter((zone) => zone.id !== editing.id)}
                    landmarks={landmarks}
                    vehicles={liveVehicles}
                    onShapeChange={(shape) => setEditing({ ...editing, shape })}
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
            </main>
          </div>,
          document.body,
        )}
      {editingLandmark &&
        createPortal(
          <div className="fixed inset-0 z-[2100] flex bg-slate-950 max-lg:flex-col" dir="rtl">
            <aside className="z-10 flex w-[360px] shrink-0 flex-col overflow-y-auto border-l bg-white p-5 shadow-2xl max-lg:max-h-[42vh] max-lg:w-full">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[10px] font-black text-orange-600">معلم الخريطة الحية</span>
                  <h2 className="mt-1 text-xl font-black">
                    {editingLandmark.id ? 'تعديل المعلم' : 'إضافة معلم جديد'}
                  </h2>
                </div>
                <button
                  aria-label="إغلاق محرر المعلم"
                  onClick={() => setEditingLandmark(null)}
                  className="grid size-10 place-items-center rounded-xl bg-slate-100"
                >
                  <X size={18} />
                </button>
              </div>
              <label className="mt-6 text-xs font-bold">
                اسم المعلم
                <input
                  aria-label="اسم المعلم"
                  value={editingLandmark.name}
                  onChange={(event) =>
                    setEditingLandmark({ ...editingLandmark, name: event.target.value })
                  }
                  className="mt-1 h-11 w-full rounded-xl border px-3"
                  placeholder="كراج، محطة، نقطة تجمع…"
                />
              </label>
              <label className="mt-3 text-xs font-bold">
                التصنيف
                <select
                  aria-label="تصنيف المعلم"
                  value={editingLandmark.category}
                  onChange={(event) =>
                    setEditingLandmark({
                      ...editingLandmark,
                      category: event.target.value as GpsMapLandmark['category'],
                    })
                  }
                  className="mt-1 h-11 w-full rounded-xl border px-3"
                >
                  <option value="landmark">معلم عام</option>
                  <option value="garage">كراج</option>
                  <option value="station">محطة</option>
                  <option value="maintenance">صيانة</option>
                  <option value="office">مقر إداري</option>
                  <option value="checkpoint">نقطة سيطرة</option>
                  <option value="hazard">موقع خطورة</option>
                  <option value="other">أخرى</option>
                </select>
              </label>
              <fieldset className="mt-4">
                <legend className="text-xs font-bold">شكل المعلم</legend>
                <p className="mt-1 text-[10px] text-slate-500">
                  اختر الرمز الذي سيظهر فوق الخريطة.
                </p>
                <div className="mt-3 grid grid-cols-6 gap-2">
                  {(Object.keys(landmarkIconLabels) as GpsMapLandmark['icon'][]).map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      aria-label={`شكل المعلم: ${landmarkIconLabels[icon]}`}
                      title={landmarkIconLabels[icon]}
                      onClick={() => setEditingLandmark({ ...editingLandmark, icon })}
                      className={`grid aspect-square place-items-center rounded-xl border transition ${editingLandmark.icon === icon ? 'border-orange-500 bg-orange-500 text-white shadow-md' : 'bg-slate-50 text-slate-700 hover:border-orange-300'}`}
                    >
                      <LandmarkGlyph icon={icon} size={17} />
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="mt-4 text-xs font-bold">
                اللون
                <input
                  aria-label="لون المعلم"
                  type="color"
                  value={editingLandmark.color}
                  onChange={(event) =>
                    setEditingLandmark({ ...editingLandmark, color: event.target.value })
                  }
                  className="mt-1 h-11 w-full rounded-xl border p-1"
                />
              </label>
              <label className="mt-3 text-xs font-bold">
                ملاحظات
                <textarea
                  aria-label="ملاحظات المعلم"
                  value={editingLandmark.notes ?? ''}
                  onChange={(event) =>
                    setEditingLandmark({ ...editingLandmark, notes: event.target.value || null })
                  }
                  rows={4}
                  className="mt-1 w-full rounded-xl border p-3"
                />
              </label>
              <div className="mt-4 rounded-xl bg-orange-50 p-3 text-[11px] font-bold text-orange-900">
                الموقع: {editingLandmark.latitude.toFixed(6)},{' '}
                {editingLandmark.longitude.toFixed(6)}
              </div>
              <button
                onClick={() => {
                  if (editingLandmark.name.trim().length >= 2) {
                    onSaveLandmark(editingLandmark)
                    setEditingLandmark(null)
                  }
                }}
                disabled={landmarkPending || editingLandmark.name.trim().length < 2}
                className="mt-auto rounded-xl bg-orange-600 py-3.5 text-xs font-black text-white disabled:opacity-40"
              >
                {landmarkPending ? 'جارٍ الحفظ…' : 'حفظ وإظهار على الخريطة'}
              </button>
            </aside>
            <main className="min-h-0 min-w-0 flex-1 p-3">
              <div className="h-full overflow-hidden rounded-3xl border border-white/10">
                <Suspense fallback={<div className="h-full animate-pulse bg-slate-800" />}>
                  <LandmarkMapPicker
                    point={{ lat: editingLandmark.latitude, lng: editingLandmark.longitude }}
                    color={editingLandmark.color}
                    icon={editingLandmark.icon}
                    zones={zones}
                    landmarks={landmarks.filter((item) => item.id !== editingLandmark.id)}
                    vehicles={liveVehicles}
                    onChange={(point) =>
                      setEditingLandmark({
                        ...editingLandmark,
                        latitude: point.lat,
                        longitude: point.lng,
                      })
                    }
                  />
                </Suspense>
              </div>
            </main>
          </div>,
          document.body,
        )}
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

function durationLabel(seconds: number) {
  const s = Math.max(0, Number(seconds || 0)),
    h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60)
  return h ? `${h}س ${m}د` : `${m}د`
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
