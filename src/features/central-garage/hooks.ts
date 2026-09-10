import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { centralGarage } from '@sdk/central-garage.sdk'
import { exportGarageCsv, exportGarageReport, printGarageReport } from './export-report'
import { centralGarageKeys } from '@lib/query-keys/central-garage.keys'
import { API } from '@lib/constants/api.constants'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'
import type { GarageReportFilter } from './reports'
import type { GarageFuelUnit } from './fuel-units'
import type { CreateGarageVehicleInput, GarageDashboardFilter, GarageFuelType, GarageShift, GarageTankZeroRequest, GarageVehicleFilter } from './types'

export function useGarageAreas() {
  return useQuery({ queryKey: centralGarageKeys.areas(), queryFn: () => centralGarage.areas(), staleTime: API.STALE_TIME.REFERENCE })
}
export function useGarageDashboard(filter: GarageDashboardFilter = {}) {
  return useQuery({ queryKey: centralGarageKeys.dashboardSummary(filter), queryFn: () => centralGarage.dashboard(filter), staleTime: API.STALE_TIME.DEFAULT })
}
export function useGarageReport(filter: GarageReportFilter = {}) {
  return useQuery({ queryKey: centralGarageKeys.report(filter), queryFn: () => centralGarage.report(filter), staleTime: API.STALE_TIME.DEFAULT })
}
export function useExportGarageReport() {
  const addToast=useUiStore(state=>state.addToast);const onError=useGarageMutationError('exportGarageReport')
  return useMutation({mutationFn:async(input:{filter:Omit<GarageReportFilter,'page'|'pageSize'>;format:'xlsx'|'csv'|'print';printWindow?:Window|null})=>{const result=await centralGarage.reportAll(input.filter);if(input.format==='csv')exportGarageCsv(result);else if(input.format==='print')printGarageReport(result,input.printWindow);else await exportGarageReport(result)},onSuccess:(_data,input)=>addToast({type:'success',message:input.format==='print'?'تم تجهيز التقرير الكامل للطباعة':`تم إنشاء تقرير ${input.format==='csv'?'CSV للبيانات الخام':'Excel'} الكامل`}),onError:(error,input)=>{input.printWindow?.close();onError(error)}})
}
export function useGarageVehicles(filter: GarageVehicleFilter = {}) {
  return useQuery({ queryKey: centralGarageKeys.vehicleList(filter), queryFn: () => centralGarage.vehicles(filter), staleTime: API.STALE_TIME.DEFAULT })
}
export function useGarageVehicle(id: string) {
  return useQuery({ queryKey: centralGarageKeys.vehicle(id), queryFn: () => centralGarage.vehicle(id), enabled: Boolean(id), staleTime: API.STALE_TIME.DEFAULT })
}
export function useGarageAssignments(id: string) {
  return useQuery({ queryKey: centralGarageKeys.assignments(id), queryFn: () => centralGarage.assignmentHistory(id), enabled: Boolean(id) })
}
export function useGarageVehicleMovements(id: string) {
  return useQuery({ queryKey: centralGarageKeys.movements(id), queryFn: () => centralGarage.movements({ vehicleId: id }), enabled: Boolean(id) })
}

function useGarageMutationError(scope: string) {
  const addToast = useUiStore((state) => state.addToast)
  return (error: unknown) => addToast({ type: 'error' as const, message: handleAppError(error, { scope }).message })
}

export function useCreateGarageVehicle() {
  const qc = useQueryClient(); const addToast = useUiStore((state) => state.addToast); const onError = useGarageMutationError('createGarageVehicle')
  return useMutation({ mutationFn: (input: CreateGarageVehicleInput) => centralGarage.createVehicle(input), onSuccess: () => { void qc.invalidateQueries({ queryKey: centralGarageKeys.vehicles() }); void qc.invalidateQueries({ queryKey: centralGarageKeys.dashboard() }); addToast({ type:'success',message:'تمت إضافة الآلية بنجاح' }) }, onError })
}
export function useUpdateGarageVehicle() {
  const qc = useQueryClient(); const addToast = useUiStore((state) => state.addToast); const onError = useGarageMutationError('updateGarageVehicle')
  return useMutation({ mutationFn: (input: { id:string;vehicleName:string;dbNumber:string;plateNumber:string;chassisNumber:string;image?:File }) => centralGarage.updateVehicle(input.id,input), onSuccess: (_data,input) => { void qc.invalidateQueries({ queryKey: centralGarageKeys.vehicle(input.id) }); void qc.invalidateQueries({ queryKey: centralGarageKeys.vehicles() }); addToast({ type:'success',message:'تم تحديث بيانات الآلية' }) }, onError })
}
export function useAssignGarageDriver() {
  const qc = useQueryClient(); const addToast = useUiStore((state) => state.addToast); const onError = useGarageMutationError('assignGarageDriver')
  return useMutation({ mutationFn: (input: { vehicleId:string;driverName:string;shift:GarageShift;sectorId:number;reason?:string }) => centralGarage.assignDriver(input.vehicleId,input.driverName,input.shift,input.sectorId,input.reason), onSuccess: (_data,input) => { void qc.invalidateQueries({ queryKey: centralGarageKeys.vehicle(input.vehicleId) }); void qc.invalidateQueries({ queryKey: centralGarageKeys.vehicles() }); void qc.invalidateQueries({ queryKey: centralGarageKeys.assignments(input.vehicleId) }); addToast({ type:'success',message:'تم تحديث انطلاقية السائق وحفظ السجل السابق' }) }, onError })
}
export function useArchiveGarageVehicle() {
  const qc = useQueryClient(); const addToast = useUiStore((state) => state.addToast); const onError = useGarageMutationError('archiveGarageVehicle')
  return useMutation({ mutationFn: ({vehicleId,reason}:{vehicleId:string;reason:string}) => centralGarage.archiveVehicle(vehicleId,reason), onSuccess: () => { void qc.invalidateQueries({ queryKey: centralGarageKeys.vehicles() }); void qc.invalidateQueries({ queryKey: centralGarageKeys.dashboard() }); addToast({ type:'warning',message:'نُقلت الآلية إلى الأرشيف' }) }, onError })
}
export function useRestoreGarageVehicle() {
  const qc = useQueryClient(); const addToast = useUiStore((state) => state.addToast); const onError = useGarageMutationError('restoreGarageVehicle')
  return useMutation({ mutationFn: ({vehicleId,reason}:{vehicleId:string;reason:string}) => centralGarage.restoreVehicle(vehicleId,reason), onSuccess: (_data,input) => { void qc.invalidateQueries({ queryKey: centralGarageKeys.vehicles() }); void qc.invalidateQueries({ queryKey: centralGarageKeys.vehicle(input.vehicleId) }); void qc.invalidateQueries({ queryKey: centralGarageKeys.assignments(input.vehicleId) }); void qc.invalidateQueries({ queryKey: centralGarageKeys.dashboard() }); addToast({ type:'success',message:'تمت استعادة الآلية وإعادة تفعيل انطلاقتها' }) }, onError })
}

export function useGarageTanks(fuelType?: GarageFuelType) {
  return useQuery({ queryKey: centralGarageKeys.tankList(fuelType), queryFn: () => centralGarage.tanks(fuelType), staleTime: API.STALE_TIME.DEFAULT })
}
export function useGarageTankMovements(tankId: string) {
  return useQuery({ queryKey: centralGarageKeys.tankMovements(tankId), queryFn: () => centralGarage.movements({ tankId }), enabled: Boolean(tankId) })
}
export function useGarageZeroRequests(status?: GarageTankZeroRequest['status']) {
  return useQuery({ queryKey: centralGarageKeys.zeroRequests(status), queryFn: () => centralGarage.zeroRequests(status), staleTime: API.STALE_TIME.DEFAULT })
}

export function useGarageDepartures() {
  return useQuery({ queryKey: centralGarageKeys.departures(), queryFn: () => centralGarage.todayDepartures(), staleTime: API.STALE_TIME.DEFAULT })
}
export function useGarageDepartureDays(){return useQuery({queryKey:['central-garage','departure-days'],queryFn:()=>centralGarage.departureDays(),staleTime:API.STALE_TIME.DEFAULT})}
export function useGarageDeparturesForDay(day:string){return useQuery({queryKey:['central-garage','departures','day',day],queryFn:()=>centralGarage.departuresForDay(day),enabled:Boolean(day),staleTime:API.STALE_TIME.DEFAULT})}
export function useGarageShiftAssignments(vehicleId:string){return useQuery({queryKey:['central-garage','shift-assignments',vehicleId],queryFn:()=>centralGarage.shiftAssignments(vehicleId),enabled:Boolean(vehicleId)})}
export function useGarageShiftDispatchRecipients(vehicleId:string,shift:GarageShift){return useQuery({queryKey:['central-garage','shift-recipients',vehicleId,shift],queryFn:()=>centralGarage.shiftDispatchRecipients(vehicleId,shift),enabled:Boolean(vehicleId&&shift)})}
export function useSetGarageShiftAssignment(){const qc=useQueryClient(),toast=useUiStore(s=>s.addToast);return useMutation({mutationFn:(x:{vehicleId:string;shift:GarageShift;driverName:string;sectorId:number;reason:string})=>centralGarage.setShiftAssignment(x.vehicleId,x.shift,x.driverName,x.sectorId,x.reason),onSuccess:(_,x)=>{void qc.invalidateQueries({queryKey:['central-garage','shift-assignments',x.vehicleId]});toast({type:'success',message:'تم حفظ سائق وموقع الشفت مع الاحتفاظ بالسجل'})}})}
export function useRecordGarageShiftDeparture(){const qc=useQueryClient(),toast=useUiStore(s=>s.addToast);return useMutation({mutationFn:(x:{vehicleId:string;shift:GarageShift;recipientManagerId:string;notes?:string})=>centralGarage.recordShiftDeparture(x.vehicleId,x.shift,x.recipientManagerId,x.notes),onSuccess:()=>{void qc.invalidateQueries({queryKey:['central-garage']});toast({type:'success',message:'سُجل انطلاق شفت الآلية وأُبلغ مسؤول القسم'})}})}
export function useGarageDispatchRecipients(vehicleId:string){return useQuery({queryKey:['central-garage','dispatch-recipients',vehicleId],queryFn:()=>centralGarage.dispatchRecipients(vehicleId),enabled:Boolean(vehicleId)})}
export function useRecordGarageDeparture() {
  const qc = useQueryClient(); const addToast = useUiStore((state) => state.addToast); const onError = useGarageMutationError('recordGarageDeparture')
  return useMutation({ mutationFn: (x: { vehicleId: string; notes?: string;recipientManagerId?:string }) => centralGarage.recordDeparture(x.vehicleId, x.notes,x.recipientManagerId),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: centralGarageKeys.departures() });void qc.invalidateQueries({queryKey:['central-garage','departure-days']});void qc.invalidateQueries({queryKey:['central-garage','departures','day']}); addToast({ type: 'success', message: 'سُجّل انطلاق السائق من الكراج إلى ورديته' }) }, onError })
}
export function useRecordGarageReturn() {
  const qc = useQueryClient(); const addToast = useUiStore((state) => state.addToast); const onError = useGarageMutationError('recordGarageReturn')
  return useMutation({ mutationFn: (x: { departureId: string }) => centralGarage.recordReturn(x.departureId),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: centralGarageKeys.departures() });void qc.invalidateQueries({queryKey:['central-garage','departure-days']});void qc.invalidateQueries({queryKey:['central-garage','departures','day']}); addToast({ type: 'success', message: 'سُجّلت عودة الآلية إلى الكراج' }) }, onError })
}
function useInvalidateGarageFuel() {
  const qc=useQueryClient()
  return () => { void qc.invalidateQueries({queryKey:centralGarageKeys.tanks()});void qc.invalidateQueries({queryKey:centralGarageKeys.dashboard()}) }
}
export function useAddGarageTank(){const invalidate=useInvalidateGarageFuel();const addToast=useUiStore(s=>s.addToast);const onError=useGarageMutationError('addGarageTank');return useMutation({mutationFn:(x:{fuelType:GarageFuelType;tankName:string;unit?:GarageFuelUnit;capacity:number;initialQuantity:number;lowStockThreshold:number})=>centralGarage.addTank(x.fuelType,x.tankName,x.unit??'liter',x.capacity,x.initialQuantity,x.lowStockThreshold),onSuccess:()=>{invalidate();addToast({type:'success',message:'تم إنشاء الخزان وتسجيل الكمية الابتدائية'})},onError})}
export function useAddGarageTankStock(){const qc=useQueryClient();const invalidate=useInvalidateGarageFuel();const addToast=useUiStore(s=>s.addToast);const onError=useGarageMutationError('addGarageTankStock');return useMutation({mutationFn:(x:{tankId:string;quantity:number;notes?:string})=>centralGarage.addTankStock(x.tankId,x.quantity,x.notes),onSuccess:(_d,x)=>{invalidate();void qc.invalidateQueries({queryKey:centralGarageKeys.tankMovements(x.tankId)});addToast({type:'success',message:'تمت إضافة الكمية إلى الخزان'})},onError})}

export function useFillGarageVehicle(){const qc=useQueryClient();const invalidate=useInvalidateGarageFuel();const addToast=useUiStore(s=>s.addToast);const onError=useGarageMutationError('fillGarageVehicle');return useMutation({mutationFn:(x:{tankId:string;vehicleId:string;quantity:number;nextRefillDate?:string;notes?:string})=>centralGarage.fillVehicle(x.tankId,x.vehicleId,x.quantity,x.nextRefillDate,x.notes),onSuccess:(_d,x)=>{invalidate();void qc.invalidateQueries({queryKey:centralGarageKeys.tankMovements(x.tankId)});void qc.invalidateQueries({queryKey:centralGarageKeys.movements(x.vehicleId)});addToast({type:'success',message:'تمت تعبئة الآلية وخصم الكمية من الخزان'})},onError})}
export function useRequestGarageTankZero(){const qc=useQueryClient();const addToast=useUiStore(s=>s.addToast);const onError=useGarageMutationError('requestGarageTankZero');return useMutation({mutationFn:(x:{tankId:string;reason:string})=>centralGarage.requestTankZero(x.tankId,x.reason),onSuccess:()=>{void qc.invalidateQueries({queryKey:centralGarageKeys.tanks()});addToast({type:'success',message:'أُرسل طلب التصفير إلى بوابة التطوير المركزية'})},onError})}
export function useDecideGarageTankZero(){const qc=useQueryClient();const addToast=useUiStore(s=>s.addToast);const onError=useGarageMutationError('decideGarageTankZero');return useMutation({mutationFn:(x:{requestId:string;approved:boolean;note?:string})=>centralGarage.decideTankZero(x.requestId,x.approved,x.note),onSuccess:(_d,x)=>{void qc.invalidateQueries({queryKey:centralGarageKeys.tanks()});addToast({type:x.approved?'success':'warning',message:x.approved?'تمت الموافقة وتصفير الخزان':'تم رفض طلب التصفير'})},onError})}
