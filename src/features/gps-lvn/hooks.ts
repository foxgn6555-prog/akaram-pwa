import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { gpsLvn, type GpsFilters, type GpsTripInvestigation } from '@sdk/gps-lvn.sdk'
import { useUiStore } from '@stores/ui.store'
import { handleAppError } from '@lib/errors/error.handler'

export const gpsKeys = {
  all: ['gps-lvn'] as const,
  dashboard: () => ['gps-lvn', 'dashboard'] as const,
  liveMap: () => ['gps-lvn', 'live-map'] as const,
  mapGeofences: () => ['gps-lvn', 'map-geofences'] as const,
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
export const useGpsRoute = (id: string, day: string, enabled = true) =>
  useQuery({
    queryKey: gpsKeys.route(id, day),
    queryFn: () => gpsLvn.route(id, day),
    enabled: enabled && Boolean(id && day),
  })
export const useGpsRouteWindow = (id: string, from: string, to: string, enabled = true) =>
  useQuery({
    queryKey: gpsKeys.routeWindow(id, from, to),
    queryFn: () => gpsLvn.routeWindow(id, from, to),
    enabled: enabled && Boolean(id && from && to),
  })
export const useGpsTripHistory = (from: string, to: string) =>
  useQuery({
    queryKey: gpsKeys.trips(from, to),
    queryFn: () => gpsLvn.tripHistory(from, to),
    enabled: Boolean(from && to),
  })
export const useGpsTripShiftContext = (departureId: string) =>
  useQuery({
    queryKey: gpsKeys.tripShiftContext(departureId),
    queryFn: () => gpsLvn.tripShiftContext(departureId),
    enabled: Boolean(departureId),
  })
export const useGpsTripMetrics = (departureIds: string[]) =>
  useQuery({
    queryKey: gpsKeys.tripMetrics(departureIds),
    queryFn: () => gpsLvn.tripRouteMetrics(departureIds),
    enabled: departureIds.length > 0,
  })
export const useGpsTripDiagnostics = (departureIds: string[]) =>
  useQuery({
    queryKey: gpsKeys.tripDiagnostics(departureIds),
    queryFn: () => gpsLvn.tripRouteDiagnostics(departureIds),
    enabled: departureIds.length > 0,
  })
export const useGpsHistoryWindows = (departureId: string) =>
  useQuery({
    queryKey: gpsKeys.tripHistoryWindows(departureId),
    queryFn: () => gpsLvn.tripHistoryWindows(departureId),
    enabled: Boolean(departureId),
  })
export const useGpsTripWindowCoverageAudit = (departureId: string) =>
  useQuery({
    queryKey: gpsKeys.tripWindowCoverageAudit(departureId),
    queryFn: () => gpsLvn.tripWindowCoverageAudit(departureId),
    enabled: Boolean(departureId),
  })
export const useGpsTripEvents = (
  departureId: string,
  eventType: '' | 'stop' | 'gap',
  page: number,
) =>
  useQuery({
    queryKey: gpsKeys.tripEvents(departureId, eventType, page),
    queryFn: () => gpsLvn.tripRouteEventsPage(departureId, eventType, page),
    enabled: Boolean(departureId),
  })
export const useGpsTripZoneEvents = (departureId: string) =>
  useQuery({
    queryKey: gpsKeys.tripZoneEvents(departureId),
    queryFn: () => gpsLvn.tripZoneEvents(departureId),
    enabled: Boolean(departureId),
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
        // The visible sync log reports failures; avoid a toast every 30 seconds.
      } finally {
        running.current = false
      }
    }
    const timer = window.setInterval(() => void execute(), 30_000)
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
          }
        | { type: 'archive'; id: string },
    ) => {
      if (action.type === 'save')
        return gpsLvn
          .savePlatformGeofence(action.id, action.name, action.polygon, action.color)
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
export function useGpsHistoryImport() {
  const invalidate = useInvalidate(),
    toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (
      target: { deviceId: string; day: string } | { departureId: string; windowIndex?: number },
    ) =>
      'departureId' in target
        ? gpsLvn.importDepartureHistory(target.departureId, target.windowIndex)
        : gpsLvn.importDayHistory(target.deviceId, target.day),
    onSuccess: (data) => {
      invalidate()
      toast({
        type: data.status === 'partial' ? 'warning' : 'success',
        message: `اكتمل تدقيق LVN: ${data.sourcePoints ?? 0} نقطة مستلمة، ${data.storedPoints ?? 0} نقطة مخزنة${data.rejectedPoints ? `، ${data.rejectedPoints} مرفوضة` : ''}`,
      })
    },
    onError: (error) =>
      toast({
        type: 'error',
        message: handleAppError(error, { scope: 'gpsHistoryImport' }).message,
      }),
  })
}
export function useGpsAllHistoryImport() {
  const invalidate = useInvalidate(),
    toast = useUiStore((s) => s.addToast),
    [progress, setProgress] = useState({ current: 0, total: 0 })
  const mutation = useMutation({
    mutationFn: async ({ departureId, indexes }: { departureId: string; indexes: number[] }) => {
      if (!indexes.length) return []
      setProgress({ current: 0, total: indexes.length })
      const results = []
      for (let position = 0; position < indexes.length; position++) {
        results.push(await gpsLvn.importDepartureHistory(departureId, indexes[position]))
        setProgress({ current: position + 1, total: indexes.length })
      }
      return results
    },
    onSuccess: (results) =>
      toast({
        type: 'success',
        message: results.length
          ? `اكتمل تدقيق ${results.length} نافذة من LVN بالتسلسل`
          : 'جميع نوافذ الانطلاقية مدققة مسبقاً',
      }),
    onError: (error) =>
      toast({
        type: 'error',
        message: handleAppError(error, { scope: 'gpsAllHistoryImport' }).message,
      }),
    onSettled: invalidate,
  })
  return { ...mutation, progress }
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
export function useGpsBatchHistoryAudit() {
  const invalidate = useInvalidate(),
    toast = useUiStore((state) => state.addToast),
    [progress, setProgress] = useState({
      currentTrip: 0,
      totalTrips: 0,
      currentWindow: 0,
      totalWindows: 0,
    }),
    [results, setResults] = useState<
      Array<{
        departureId: string
        windows: number
        audited: number
        status: 'success' | 'failed'
        error?: string
      }>
    >([])
  const mutation = useMutation({
    mutationFn: async (departureIds: string[]) => {
      const targets = [...new Set(departureIds)].slice(0, 20)
      if (!targets.length) return []
      setResults([])
      setProgress({ currentTrip: 0, totalTrips: targets.length, currentWindow: 0, totalWindows: 0 })
      const completed: typeof results = []
      for (let tripIndex = 0; tripIndex < targets.length; tripIndex++) {
        const departureId = targets[tripIndex]!
        try {
          const windows = await gpsLvn.tripHistoryWindows(departureId)
          const pending = windows.filter((window) => window.status !== 'success')
          setProgress({
            currentTrip: tripIndex + 1,
            totalTrips: targets.length,
            currentWindow: 0,
            totalWindows: pending.length,
          })
          for (let windowIndex = 0; windowIndex < pending.length; windowIndex++) {
            await gpsLvn.importDepartureHistory(departureId, pending[windowIndex]!.window_index)
            setProgress({
              currentTrip: tripIndex + 1,
              totalTrips: targets.length,
              currentWindow: windowIndex + 1,
              totalWindows: pending.length,
            })
          }
          completed.push({
            departureId,
            windows: windows.length,
            audited: pending.length,
            status: 'success',
          })
        } catch (error) {
          completed.push({
            departureId,
            windows: 0,
            audited: 0,
            status: 'failed',
            error: handleAppError(error, { scope: 'gpsBatchHistoryAudit' }).message,
          })
        }
        setResults([...completed])
      }
      return completed
    },
    onSuccess: (completed) => {
      const failed = completed.filter((result) => result.status === 'failed').length
      toast({
        type: failed ? 'warning' : 'success',
        message: `اكتمل التدقيق الجماعي: ${completed.length - failed} ناجحة${failed ? `، ${failed} متعثرة` : ''}`,
      })
    },
    onSettled: invalidate,
  })
  return { ...mutation, progress, results }
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
    onError: (error) =>
      toast({ type: 'error', message: handleAppError(error, { scope: 'gpsLvnSync' }).message }),
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
