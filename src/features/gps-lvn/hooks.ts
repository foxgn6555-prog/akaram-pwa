import { useEffect, useRef, useState } from 'react'
import { lvnErrorToast } from './lvn-errors'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  gpsLvn,
  type GpsFilters,
  type GpsMapLandmark,
  type GpsStopHotspotSettingsPatch,
  type GpsTripInvestigation,
  type TripRoutesFilters,
} from '@sdk/gps-lvn.sdk'
import { useUiStore } from '@stores/ui.store'
import { handleAppError } from '@lib/errors/error.handler'

export const gpsKeys = {
  all: ['gps-lvn'] as const,
  dashboard: () => ['gps-lvn', 'dashboard'] as const,
  liveMap: () => ['gps-lvn', 'live-map'] as const,
  stopHotspots: (hours: number) => ['gps-lvn', 'stop-hotspots', hours] as const,
  stopHotspotEvents: (lat: number, lng: number, hours: number) => ['gps-lvn', 'stop-hotspot-events', lat, lng, hours] as const,
  stopHotspotSettings: () => ['gps-lvn', 'stop-hotspot-settings'] as const,
  mapGeofences: () => ['gps-lvn', 'map-geofences'] as const,
  mapLandmarks: () => ['gps-lvn', 'map-landmarks'] as const,
  alerts: () => ['gps-lvn', 'alerts'] as const,
  zoneEvents: (from: string, to: string) => ['gps-lvn', 'zone-events', from, to] as const,
  zoneVehicles: (zoneId: string, search: string) =>
    ['gps-lvn', 'zone-vehicles', zoneId, search] as const,
  alertPolicies: ['gps-lvn', 'alert-notification-policies'] as const,
  schedulerHealth: ['gps-lvn', 'scheduler-health'] as const,
  devices: (f: GpsFilters) => ['gps-lvn', 'devices', f] as const,
  options: () => ['gps-lvn', 'options'] as const,
  runs: () => ['gps-lvn', 'runs'] as const,
  detail: (id: string) => ['gps-lvn', 'detail', id] as const,
  route: (id: string, day: string) => ['gps-lvn', 'route', id, day] as const,
  routeWindow: (id: string, from: string, to: string) =>
    ['gps-lvn', 'route-window', id, from, to] as const,
  trips: (from: string, to: string) => ['gps-lvn', 'trips', from, to] as const,
  tripShiftContext: (departureId: string) =>
    ['gps-lvn', 'trip-shift-context', departureId] as const,
  tripMetrics: (departureIds: string[]) => ['gps-lvn', 'trip-metrics', departureIds] as const,
  tripDiagnostics: (departureIds: string[]) =>
    ['gps-lvn', 'trip-diagnostics', departureIds] as const,
  tripHistoryWindows: (departureId: string) =>
    ['gps-lvn', 'trip-history-windows', departureId] as const,
  tripWindowCoverageAudit: (departureId: string) =>
    ['gps-lvn', 'trip-window-coverage-audit', departureId] as const,
  tripEvents: (departureId: string, eventType: string, page: number) =>
    ['gps-lvn', 'trip-events', departureId, eventType, page] as const,
  tripZoneEvents: (departureId: string) => ['gps-lvn', 'trip-zone-events', departureId] as const,
  tripInvestigations: (departureId: string) =>
    ['gps-lvn', 'trip-investigations', departureId] as const,
  alertEscalations: (alertId: string) => ['gps-lvn', 'alert-escalations', alertId] as const,
  zones: (vehicleId: string) => ['gps-lvn', 'zones', vehicleId] as const,
  candidates: (q: string) => ['gps-lvn', 'candidates', q] as const,
}
export const useGpsDashboard = () =>
  useQuery({ queryKey: gpsKeys.dashboard(), queryFn: gpsLvn.dashboard, refetchInterval: 30_000 })
export const useGpsMapGeofences = () =>
  useQuery({ queryKey: gpsKeys.mapGeofences(), queryFn: gpsLvn.mapGeofences, staleTime: 60_000 })
export const useGpsMapLandmarks = () =>
  useQuery({ queryKey: gpsKeys.mapLandmarks(), queryFn: gpsLvn.mapLandmarks, staleTime: 60_000 })
export const useGpsLiveMap = () =>
  useQuery({ queryKey: gpsKeys.liveMap(), queryFn: gpsLvn.liveMap, refetchInterval: 30_000 })
export const useGpsOpenAlerts = () =>
  useQuery({ queryKey: gpsKeys.alerts(), queryFn: gpsLvn.openAlerts, refetchInterval: 30_000 })
export const useGpsZoneEvents = (from: string, to: string) =>
  useQuery({
    queryKey: gpsKeys.zoneEvents(from, to),
    queryFn: () => gpsLvn.zoneEvents(from, to),
    enabled: Boolean(from && to),
    refetchInterval: 30_000,
  })
export const useGpsSchedulerHealth = () =>
  useQuery({
    queryKey: gpsKeys.schedulerHealth,
    queryFn: gpsLvn.schedulerHealth,
    refetchInterval: 30_000,
  })
/** 00154: ربط الزون بالمنطقة + مهلة تنبيه الخروج عن المسار */
export function useGpsZoneSector() {
  const invalidate = useInvalidate(),
    toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (x: { id: string; sectorId: number | null }) => gpsLvn.setGeofenceSector(x.id, x.sectorId),
    onSuccess: (_, x) => {
      invalidate()
      toast({ type: 'success', message: x.sectorId ? 'رُبط الزون بالمنطقة — آليات المنطقة تُراقَب ضده تلقائياً' : 'فُكّ ربط الزون بالمنطقة' })
    },
    onError: (error) => toast({ type: 'error', message: handleAppError(error, { scope: 'gpsZoneSector' }).message }),
  })
}
export const useGpsRouteDeviationSettings = () =>
  useQuery({ queryKey: ['gps-lvn', 'route-deviation-settings'] as const, queryFn: gpsLvn.routeDeviationSettings })
// 00362 — بقع التوقف: تتحدّث تلقائياً كل دقيقة؛ تُفعَّل فقط عند تشغيل الطبقة
export const useGpsStopHotspots = (hours: number, enabled = true) =>
  useQuery({
    queryKey: gpsKeys.stopHotspots(hours),
    queryFn: () => gpsLvn.stopHotspots(hours),
    enabled,
    refetchInterval: enabled ? 60_000 : false,
    staleTime: 30_000,
    placeholderData: keepPreviousData,   // 00365: تبديل النافذة بلا وميض
  })
export const useGpsStopHotspotEvents = (spot: { lat: number; lng: number } | null, hours: number) =>
  useQuery({
    queryKey: gpsKeys.stopHotspotEvents(spot?.lat ?? 0, spot?.lng ?? 0, hours),
    queryFn: () => gpsLvn.stopHotspotEvents(spot!.lat, spot!.lng, hours),
    enabled: Boolean(spot),
    staleTime: 30_000,
  })
export const useGpsStopHotspotSettings = (enabled = true) =>
  useQuery({ queryKey: gpsKeys.stopHotspotSettings(), queryFn: gpsLvn.stopHotspotSettings, enabled, staleTime: 60_000 })
export function useSaveGpsStopHotspotSettings() {
  const qc = useQueryClient(),
    toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: async (patch: GpsStopHotspotSettingsPatch) => {
      const saved = await gpsLvn.saveStopHotspotSettings(patch)
      // 00365: الحفظ خفيف؛ إعادة الحساب تُطلب بعده (بميزانية خادمية) ولا تعطّل الحفظ إن تأخرت
      gpsLvn.refreshStopHotspots().then(() => void qc.invalidateQueries({ queryKey: ['gps-lvn', 'stop-hotspots'] })).catch(() => undefined)
      return saved
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: gpsKeys.stopHotspotSettings() })
      void qc.invalidateQueries({ queryKey: ['gps-lvn', 'stop-hotspots'] })
      toast({ type: 'success', message: 'حُفظت إعدادات بقع التوقف — تُطبَّق خلال لحظات' })
    },
    onError: (error) => toast({ type: 'error', message: handleAppError(error, { scope: 'gpsStopHotspots' }).message }),
  })
}
export const useGpsStopPullStatus = (enabled = true) =>
  useQuery({ queryKey: ['gps-lvn', 'stop-pull-status'] as const, queryFn: gpsLvn.stopPullStatus, enabled, refetchInterval: enabled ? 60_000 : false })
/**
 * 00364 — سحب تلقائي من LVN عند تشغيل الطبقة (لغرفة العمليات/IT فقط): يبدأ فوراً ويكرر ما دام الطابور غير منتهٍ
 * (حتى 40 دفعة)، ثم كل 3 دقائق. يُرجع حالة التقدم.
 */
export function useGpsStopsAutoPull(enabled: boolean) {
  const qc = useQueryClient()
  const [state, setState] = useState<{ running: boolean; batches: number; inserted: number; lastError: string | null }>({ running: false, batches: 0, inserted: 0, lastError: null })
  const busy = useRef(false)
  const runRef = useRef<() => Promise<void>>(async () => {})
  runRef.current = async () => {
    if (busy.current) return
    busy.current = true
    setState((s) => ({ ...s, running: true }))
    let batches = 0, inserted = 0, lastError: string | null = null
    try {
      for (; batches < 40; batches++) {
        const r = await gpsLvn.pullStopsNow(2)
        inserted += r.inserted
        if (r.failed > 0) lastError = r.results.find((x) => x.error)?.error ?? 'LVN_PULL_FAILED'
        void qc.invalidateQueries({ queryKey: ['gps-lvn', 'stop-hotspots'] })
        void qc.invalidateQueries({ queryKey: ['gps-lvn', 'stop-pull-status'] })
        if (!r.remaining) break
        await new Promise((res) => setTimeout(res, 800))
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'LVN_PULL_FAILED'
    } finally {
      busy.current = false
      setState({ running: false, batches, inserted, lastError })
    }
  }
  useEffect(() => {
    if (!enabled) return
    void runRef.current()
    const id = setInterval(() => void runRef.current(), 180_000)
    return () => clearInterval(id)
  }, [enabled])
  return { ...state, pullNow: () => void runRef.current() }
}
export function useRefreshGpsStopHotspots() {
  const qc = useQueryClient(),
    toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: () => gpsLvn.refreshStopHotspots(),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['gps-lvn', 'stop-hotspots'] })
      void qc.invalidateQueries({ queryKey: gpsKeys.stopHotspotSettings() })
      toast({
        type: r.ok ? 'success' : 'info',
        message: r.ok ? `حُدّثت بقع التوقف: ${r.devices ?? 0} جهاز، ${r.upserted ?? 0} توقف` : 'التحديث جارٍ بالفعل — انتظر لحظات',
      })
    },
    onError: (error) => toast({ type: 'error', message: handleAppError(error, { scope: 'gpsStopHotspots' }).message }),
  })
}
export function useSaveGpsRouteDeviationSettings() {
  const qc = useQueryClient(),
    toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (graceMinutes: number) => gpsLvn.saveRouteDeviationSettings(graceMinutes),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['gps-lvn', 'route-deviation-settings'] })
      toast({ type: 'success', message: 'حُفظت مهلة التسامح لتنبيه الخروج عن المسار' })
    },
    onError: (error) => toast({ type: 'error', message: handleAppError(error, { scope: 'gpsRouteDeviation' }).message }),
  })
}
export const useGpsAlertNotificationPolicies = () =>
  useQuery({ queryKey: gpsKeys.alertPolicies, queryFn: gpsLvn.alertNotificationPolicies })
export const useGpsZoneVehicles = (zoneId: string, search: string) =>
  useQuery({
    queryKey: gpsKeys.zoneVehicles(zoneId, search),
    queryFn: () => gpsLvn.zoneVehicleCandidates(zoneId, search),
    enabled: Boolean(zoneId),
  })
export const useGpsDevices = (filters: GpsFilters) =>
  useQuery({
    queryKey: gpsKeys.devices(filters),
    queryFn: () => gpsLvn.devices(filters),
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
  })
export const useGpsOptions = () =>
  useQuery({ queryKey: gpsKeys.options(), queryFn: gpsLvn.options })
export const useGpsSyncRuns = () =>
  useQuery({ queryKey: gpsKeys.runs(), queryFn: gpsLvn.syncRuns, refetchInterval: 15_000 })
export const useGpsDetail = (id: string) =>
  useQuery({ queryKey: gpsKeys.detail(id), queryFn: () => gpsLvn.detail(id), enabled: Boolean(id) })
export const useGpsTripHistory = (from: string, to: string) =>
  useQuery({
    queryKey: gpsKeys.trips(from, to),
    queryFn: () => gpsLvn.tripHistory(from, to),
    enabled: Boolean(from && to),
  })
export const useGpsTripMetrics = (departureIds: string[]) =>
  useQuery({
    queryKey: gpsKeys.tripMetrics(departureIds),
    queryFn: () => gpsLvn.tripRouteMetrics(departureIds),
    enabled: departureIds.length > 0,
  })
export const useGpsTripInvestigations = (departureId: string) =>
  useQuery({
    queryKey: gpsKeys.tripInvestigations(departureId),
    queryFn: () => gpsLvn.tripInvestigations(departureId),
    enabled: Boolean(departureId),
  })
export const useGpsAlertEscalations = (alertId: string) =>
  useQuery({
    queryKey: gpsKeys.alertEscalations(alertId),
    queryFn: () => gpsLvn.alertEscalationHistory(alertId),
    enabled: Boolean(alertId),
  })
export const useGpsGeofences = (vehicleId: string, enabled = true) =>
  useQuery({
    queryKey: gpsKeys.zones(vehicleId),
    queryFn: () => gpsLvn.geofences(vehicleId),
    enabled: enabled && Boolean(vehicleId),
  })
export const useGpsCandidates = (search: string, enabled: boolean) =>
  useQuery({
    queryKey: gpsKeys.candidates(search),
    queryFn: () => gpsLvn.candidates(search),
    enabled,
  })
const useInvalidate = () => {
  const qc = useQueryClient()
  return () => void qc.invalidateQueries({ queryKey: gpsKeys.all })
}
export function useGpsAutoSync(enabled = true) {
  const qc = useQueryClient(),
    running = useRef(false),
    [lastAttempt, setLastAttempt] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) return
    const execute = async () => {
      if (document.visibilityState !== 'visible' || running.current) return
      running.current = true
      try {
        await gpsLvn.sync('incremental')
        await qc.invalidateQueries({ queryKey: gpsKeys.all })
        setLastAttempt(new Date().toISOString())
      } catch {
        // The visible sync log reports failures; avoid a toast every second.
      } finally {
        running.current = false
      }
    }
    // مزامنة أجهزة GPS كل ثانية (كانت 30 ثانية) — حارس running يمنع تراكب الطلبات.
    const timer = window.setInterval(() => void execute(), 1_000)
    return () => window.clearInterval(timer)
  }, [enabled, qc])
  return { lastAttempt }
}
export function useGpsAlertWorkflow() {
  const invalidate = useInvalidate(),
    toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (
      action:
        | { type: 'acknowledge'; alertId: string }
        | { type: 'resolve'; alertId: string; note: string },
    ) =>
      action.type === 'acknowledge'
        ? gpsLvn.acknowledgeAlert(action.alertId)
        : gpsLvn.resolveAlert(action.alertId, action.note),
    onSuccess: (_, action) => {
      invalidate()
      toast({
        type: 'success',
        message:
          action.type === 'acknowledge'
            ? 'تم إقرار متابعة التنبيه'
            : 'تم إغلاق التنبيه وتسجيل المعالجة',
      })
    },
    onError: (error) =>
      toast({
        type: 'error',
        message: handleAppError(error, { scope: 'gpsAlertWorkflow' }).message,
      }),
  })
}
export function useGpsAlertNotificationPolicySave() {
  const client = useQueryClient(),
    toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: gpsLvn.saveAlertNotificationPolicy,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: gpsKeys.alertPolicies })
      toast({ type: 'success', message: 'تم حفظ سياسة إشعار GPS' })
    },
    onError: (error) =>
      toast({ type: 'error', message: handleAppError(error, { scope: 'gpsAlertPolicy' }).message }),
  })
}
export function useGpsZoneVehicleAssignment() {
  const invalidate = useInvalidate(),
    toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (input: { zoneId: string; vehicleIds: string[] }) =>
      gpsLvn.replaceZoneVehicles(input.zoneId, input.vehicleIds),
    onSuccess: (count) => {
      invalidate()
      toast({ type: 'success', message: `تم حفظ إسناد الزون إلى ${count} آلية` })
    },
    onError: (error) =>
      toast({
        type: 'error',
        message: handleAppError(error, { scope: 'gpsZoneVehicles' }).message,
      }),
  })
}
export function useGpsPlatformGeofence() {
  const invalidate = useInvalidate(),
    toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (
      action:
        | {
            type: 'save'
            id: string | null
            name: string
            polygon: Array<{ lat: number; lng: number } | [number, number]>
            color: string
            sectorId?: number | null
          }
        | { type: 'archive'; id: string },
    ) => {
      if (action.type === 'save')
        return gpsLvn
          .savePlatformGeofence(action.id, action.name, action.polygon, action.color, action.sectorId ?? null)
          .then(() => undefined)
      return gpsLvn.archivePlatformGeofence(action.id)
    },
    onSuccess: (_, action) => {
      invalidate()
      toast({
        type: 'success',
        message: action.type === 'save' ? 'تم حفظ الزون التشغيلي' : 'تمت أرشفة الزون',
      })
    },
    onError: (error) =>
      toast({
        type: 'error',
        message: handleAppError(error, { scope: 'gpsPlatformZone' }).message,
      }),
  })
}
export function useGpsMapLandmark() {
  const qc = useQueryClient()
  const toast = useUiStore((state) => state.addToast)
  return useMutation({
    mutationFn: (
      action:
        | { type: 'save'; landmark: Omit<GpsMapLandmark, 'id'> & { id: string | null } }
        | { type: 'archive'; id: string },
    ) =>
      action.type === 'save'
        ? gpsLvn.saveMapLandmark(action.landmark).then(() => undefined)
        : gpsLvn.archiveMapLandmark(action.id),
    onSuccess: (_, action) => {
      void qc.invalidateQueries({ queryKey: gpsKeys.mapLandmarks() })
      toast({
        type: 'success',
        message: action.type === 'save' ? 'تم حفظ المعلم على الخريطة الحية' : 'تمت أرشفة المعلم',
      })
    },
    onError: (error) =>
      toast({
        type: 'error',
        message: handleAppError(error, { scope: 'gpsMapLandmark' }).message,
      }),
  })
}
export function useGpsTripInvestigationSave() {
  const client = useQueryClient(),
    toast = useUiStore((state) => state.addToast)
  return useMutation({
    mutationFn: (input: {
      id?: string
      departureId: string
      eventType: GpsTripInvestigation['event_type']
      eventAt: string
      note: string
      status: GpsTripInvestigation['status']
    }) => gpsLvn.saveTripInvestigation(input),
    onSuccess: (_, input) => {
      void client.invalidateQueries({ queryKey: gpsKeys.tripInvestigations(input.departureId) })
      toast({
        type: 'success',
        message: input.id ? 'تم تحديث معالجة ملاحظة GPS' : 'تم حفظ ملاحظة التحقيق وتدقيقها',
      })
    },
    onError: (error) =>
      toast({
        type: 'error',
        message: handleAppError(error, { scope: 'gpsTripInvestigation' }).message,
      }),
  })
}
export function useGpsSync() {
  const invalidate = useInvalidate(),
    toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (action: 'test' | 'full' | 'incremental') => gpsLvn.sync(action),
    onSuccess: (data) => {
      invalidate()
      toast({
        type: 'success',
        message:
          data.action === 'test'
            ? 'تم الاتصال بخدمة LVN بنجاح'
            : `اكتملت المزامنة: ${data.received ?? 0} جهاز مستلم، ${data.inserted ?? 0} جديد`,
      })
    },
    onError: (error) => {
      handleAppError(error, { scope: 'gpsLvnSync' })
      toast({ type: 'error', message: lvnErrorToast((error as { code?: string; message?: string }).code ?? (error as Error).message) })
    },
  })
}
export function useGpsBind() {
  const invalidate = useInvalidate(),
    toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (x: { deviceId: string; vehicleId: string; notes?: string }) =>
      gpsLvn.bind(x.deviceId, x.vehicleId, x.notes),
    onSuccess: () => {
      invalidate()
      toast({ type: 'success', message: 'تم ربط جهاز GPS بالآلية' })
    },
    onError: (error) =>
      toast({ type: 'error', message: handleAppError(error, { scope: 'gpsLvnBind' }).message }),
  })
}
export function useGpsGeofenceAssignment() {
  const invalidate = useInvalidate(),
    toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (x: { vehicleId: string; geofenceId: string; assigned: boolean }) =>
      x.assigned
        ? gpsLvn.unassignGeofence(x.vehicleId, x.geofenceId)
        : gpsLvn.assignGeofence(x.vehicleId, x.geofenceId),
    onSuccess: () => {
      invalidate()
      toast({ type: 'success', message: 'تم تحديث الزون المخصص للآلية' })
    },
    onError: (error) =>
      toast({ type: 'error', message: handleAppError(error, { scope: 'gpsGeofence' }).message }),
  })
}
export function useGpsUnbind() {
  const invalidate = useInvalidate(),
    toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (deviceId: string) => gpsLvn.unbind(deviceId),
    onSuccess: () => {
      invalidate()
      toast({ type: 'success', message: 'تم فك ارتباط جهاز GPS عن الآلية' })
    },
    onError: (error) =>
      toast({ type: 'error', message: handleAppError(error, { scope: 'gpsLvnUnbind' }).message }),
  })
}

/* 00343: قائمة مسارات الانطلاقيات */
export const useTripRoutesList = (filters: TripRoutesFilters, limit: number, offset: number, live = false) =>
  useQuery({
    queryKey: ['gps-lvn', 'trip-routes', filters, limit, offset] as const,
    queryFn: () => gpsLvn.tripRoutesList(filters, limit, offset),
    placeholderData: (prev) => prev,
    refetchInterval: live ? 60_000 : false,
  })
export const useTripRoutesFilterOptions = () =>
  useQuery({ queryKey: ['gps-lvn', 'trip-routes', 'options'] as const, queryFn: gpsLvn.tripRoutesFilterOptions, staleTime: 5 * 60_000 })
export const usePullTripRouteNow = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (departureId: string) => gpsLvn.pullTripRouteNow(departureId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['gps-lvn', 'trip-routes'] }),
  })
}
/* 00344: مسار انطلاقية واحدة (يُحدَّث كل دقيقة ما دام غير نهائي) */
export const useTripRoute = (departureId: string | null | undefined, maxPoints = 3000) =>
  useQuery({
    queryKey: ['gps-lvn', 'trip-routes', 'detail', departureId, maxPoints] as const,
    queryFn: () => gpsLvn.tripRoute(departureId as string, maxPoints),
    enabled: Boolean(departureId),
    refetchInterval: (q) => (q.state.data && !q.state.data.is_final ? 60_000 : false),
  })
