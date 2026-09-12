import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  vehicleOperations,
  type OperationsAlert,
  type StationVisit,
} from '@sdk/vehicle-operations.sdk'
import { useUiStore } from '@stores/ui.store'
import { handleAppError } from '@lib/errors/error.handler'
const keys = {
  legs: (id: string) => ['vehicle-operations', 'legs', id],
  station: ['vehicle-operations', 'station'],
  maintenance: ['vehicle-operations', 'maintenance'],
  ops: (f: string, t: string) => ['vehicle-operations', 'ops', f, t],
}
const useAction = <T>(fn: (x: T) => Promise<unknown>, message: string) => {
  const qc = useQueryClient(),
    toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vehicle-operations'] })
      void qc.invalidateQueries({ queryKey: ['sector', 'vehicle-trips-day'] })
      void qc.invalidateQueries({ queryKey: ['central-garage'] })
      toast({ type: 'success', message })
    },
    onError: (e) =>
      toast({ type: 'error', message: handleAppError(e, { scope: 'vehicleOperations' }).message }),
  })
}
export const useTripLegs = (id: string) =>
  useQuery({
    queryKey: keys.legs(id),
    queryFn: () => vehicleOperations.legs(id),
    enabled: Boolean(id),
    refetchInterval: 30000,
  })
export const useSendVehicleToStation = () =>
  useAction(
    (x: { departureId: string; notes?: string }) =>
      vehicleOperations.sendToStation(x.departureId, x.notes),
    'تم إبلاغ المحطة بأن الآلية في الطريق إليها',
  )
export const useConfirmVehicleSiteReturn = () =>
  useAction(
    (x: { legId: string; notes?: string }) => vehicleOperations.confirmSiteReturn(x.legId, x.notes),
    'تم تأكيد عودة الآلية إلى موقع العمل',
  )
export const useSendVehicleToMaintenance = () =>
  useAction(
    (x: { departureId: string; faultType: string; priority: string; notes?: string }) =>
      vehicleOperations.sendToMaintenance(x.departureId, x.faultType, x.priority, x.notes),
    'سُجل العطل وطُبقت سياسة التنسيق مع الكراج المركزي',
  )
export const useMaintenanceDispatchState = (departureId: string) =>
  useQuery({
    queryKey: ['vehicle-operations', 'maintenance-dispatch-state', departureId],
    queryFn: () => vehicleOperations.maintenanceDispatchState(departureId),
    enabled: Boolean(departureId),
    refetchInterval: 30_000,
  })
export const useGarageMaintenanceCoordination = () =>
  useQuery({
    queryKey: ['vehicle-operations', 'garage-maintenance-coordination'],
    queryFn: vehicleOperations.garageMaintenanceCoordination,
    refetchInterval: 30_000,
  })
export const useGarageMaintenanceDecision = () =>
  useAction(
    (x: { caseId: string; decision: 'acknowledge' | 'approve' | 'reject'; notes?: string }) =>
      vehicleOperations.garageMaintenanceDecision(x.caseId, x.decision, x.notes),
    'تم تسجيل قرار الكراج وإبلاغ الأطراف',
  )
export const useStationVehicleMovements = () =>
  useQuery({
    queryKey: keys.station,
    queryFn: () => vehicleOperations.stationList(),
    refetchInterval: 30000,
  })
export const useStationMovementDays = () =>
  useQuery({
    queryKey: ['vehicle-operations', 'station-days'],
    queryFn: () => vehicleOperations.stationDays(),
    refetchInterval: 30000,
  })
export const useStationVisitsForDay = (
  day: string,
  filters: { search?: string; status?: StationVisit['status']; sectorId?: number },
) =>
  useQuery({
    queryKey: ['vehicle-operations', 'station-day', day, filters],
    queryFn: () => vehicleOperations.stationVisitsForDay(day, filters),
    enabled: Boolean(day),
    refetchInterval: 30000,
  })
export const useStationConfirmArrival = () =>
  useAction(
    (x: { legId: string; notes?: string }) => vehicleOperations.stationConfirm(x.legId, x.notes),
    'تم تأكيد وصول الآلية إلى المحطة',
  )
export const useStationDispatchVehicle = () =>
  useAction(
    (x: { departureId: string; destination: 'work_site' | 'garage'; notes?: string }) =>
      vehicleOperations.stationDispatch(x.departureId, x.destination, x.notes),
    'تم تسجيل مغادرة الآلية وإبلاغ وجهتها',
  )
export const useMaintenanceCases = () =>
  useQuery({
    queryKey: keys.maintenance,
    queryFn: () => vehicleOperations.maintenanceList(),
    refetchInterval: 30000,
  })
export const useMaintenanceConfirmArrival = () =>
  useAction(
    (x: { caseId: string; notes?: string }) =>
      vehicleOperations.maintenanceConfirm(x.caseId, x.notes),
    'تم استلام الآلية في الصيانة',
  )
export const useMaintenanceUpdate = () =>
  useAction(
    (x: {
      caseId: string
      status: string
      progress: number
      diagnosis?: string
      workNotes?: string
      partsNotes?: string
      expectedAt?: string
      technician?: string
      technicianId?: string
      estimatedCost?: number
      actualCost?: number
      delayReason?: string
    }) => vehicleOperations.maintenanceUpdate(x.caseId, x.status, x.progress, x),
    'تم حفظ تحديث الصيانة دون حذف السجل السابق',
  )
export const useMaintenanceTechnicians = () =>
  useQuery({
    queryKey: ['vehicle-operations', 'maintenance-technicians'],
    queryFn: () => vehicleOperations.maintenanceTechnicians(),
  })
export const useMaintenanceApproveReadiness = () =>
  useAction(
    (x: { caseId: string; notes?: string }) =>
      vehicleOperations.maintenanceApproveReadiness(x.caseId, x.notes),
    'تم اعتماد جاهزية الآلية للمغادرة',
  )
export const useMaintenanceUploadAttachment = () =>
  useAction(
    (x: { caseId: string; file: File; caption?: string }) =>
      vehicleOperations.maintenanceUploadAttachment(x.caseId, x.file, x.caption),
    'تمت إضافة المرفق إلى سجل الصيانة',
  )
export const useMaintenanceEvents = (caseId: string) =>
  useQuery({
    queryKey: ['vehicle-operations', 'maintenance-events', caseId],
    queryFn: () => vehicleOperations.maintenanceEvents(caseId),
    enabled: Boolean(caseId),
    refetchInterval: 30_000,
  })
export const useMaintenanceTimeline = (caseId: string) =>
  useQuery({
    queryKey: ['vehicle-operations', 'maintenance-timeline', caseId],
    queryFn: () => vehicleOperations.maintenanceTimeline(caseId),
    enabled: Boolean(caseId),
  })
export const useMaintenanceInventory = (search = '') =>
  useQuery({
    queryKey: ['vehicle-operations', 'maintenance-inventory', search],
    queryFn: () => vehicleOperations.maintenanceInventory(search),
  })
export const useMaintenanceCreateInventory = () =>
  useAction(
    (x: { sku: string; name: string; unit: string; threshold: number }) =>
      vehicleOperations.maintenanceCreateInventory(x.sku, x.name, x.unit, x.threshold),
    'تمت إضافة صنف المخزون',
  )
export const useMaintenanceReceiveInventory = () =>
  useAction(
    (x: { itemId: string; quantity: number; unitCost: number; notes?: string }) =>
      vehicleOperations.maintenanceReceiveInventory(x.itemId, x.quantity, x.unitCost, x.notes),
    'تم استلام الكمية وتحديث متوسط الكلفة',
  )
export const useMaintenanceIssueInventory = () =>
  useAction(
    (x: { caseId: string; itemId: string; quantity: number; notes?: string }) =>
      vehicleOperations.maintenanceIssueInventory(x.caseId, x.itemId, x.quantity, x.notes),
    'تم صرف القطعة وربط كلفتها بالحالة',
  )
export const useMaintenanceInstallPart = () =>
  useAction(
    (x: { partId: string }) => vehicleOperations.maintenanceInstallPart(x.partId),
    'تم تثبيت تركيب القطعة',
  )
export const useMaintenanceReturnPart = () =>
  useAction(
    (x: { partId: string; notes?: string }) =>
      vehicleOperations.maintenanceReturnPart(x.partId, x.notes),
    'أعيدت القطعة غير المركبة إلى المخزون',
  )
export const useMaintenanceDays = () =>
  useQuery({
    queryKey: ['vehicle-operations', 'maintenance-days'],
    queryFn: () => vehicleOperations.maintenanceDays(),
  })
export const useMaintenanceForDay = (day: string) =>
  useQuery({
    queryKey: ['vehicle-operations', 'maintenance-day', day],
    queryFn: () => vehicleOperations.maintenanceForDay(day),
    enabled: Boolean(day),
  })
export const useMaintenanceDispatch = () =>
  useAction(
    (x: { caseId: string; destination: 'work_site' | 'garage'; notes?: string }) =>
      vehicleOperations.maintenanceDispatch(x.caseId, x.destination, x.notes),
    'غادرت الآلية الصيانة وأُبلغت الجهة المستلمة',
  )
export const useOpsMovements = (from: string, to: string) =>
  useQuery({
    queryKey: keys.ops(from, to),
    queryFn: () => vehicleOperations.opsMovements(from, to),
    enabled: Boolean(from && to),
  })
export const useOpsAttendance = (from: string, to: string) =>
  useQuery({
    queryKey: ['vehicle-operations', 'ops-attendance', from, to],
    queryFn: () => vehicleOperations.opsAttendance(from, to),
    enabled: Boolean(from && to),
  })
export const useOpsGarageTrips = (from: string, to: string) =>
  useQuery({
    queryKey: ['vehicle-operations', 'ops-garage', from, to],
    queryFn: () => vehicleOperations.opsGarageTrips(from, to),
    enabled: Boolean(from && to),
  })
export const useOpsMaintenance = (from: string, to: string) =>
  useQuery({
    queryKey: ['vehicle-operations', 'ops-maintenance', from, to],
    queryFn: () => vehicleOperations.opsMaintenance(from, to),
    enabled: Boolean(from && to),
  })
export const useOpsStationVisits = (from: string, to: string) =>
  useQuery({
    queryKey: ['vehicle-operations', 'ops-station', from, to],
    queryFn: () => vehicleOperations.opsStationVisits(from, to),
    enabled: Boolean(from && to),
  })
export const useOpsVehicleKpis = (
  from: string,
  to: string,
  filters: { search?: string; sectorId?: number; shift?: string },
) =>
  useQuery({
    queryKey: ['vehicle-operations', 'ops-kpis', from, to, filters],
    queryFn: () => vehicleOperations.opsVehicleKpis(from, to, filters),
    enabled: Boolean(from && to),
  })
export const useOpsAlerts = (filters: {
  sectorId?: number
  shift?: string
  severity?: OperationsAlert['severity']
}) =>
  useQuery({
    queryKey: ['vehicle-operations', 'ops-alerts', filters],
    queryFn: () => vehicleOperations.opsAlerts(filters),
    refetchInterval: 30000,
  })
