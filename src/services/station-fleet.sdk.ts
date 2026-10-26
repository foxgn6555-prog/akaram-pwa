/**
 * أسطول المحطة التحويلية (00328/00329): الفئات الموحّدة، آليات المحطة، الوجهات وزوناتها،
 * السائقون الخارجيون، تسجيل الخروج، سجل الخروج/الوصول.
 * الإدارة: غرفة العمليات فقط. المحطة: قراءة + تسجيل الخروج.
 */
import { sdkGuard, supabase } from './client'

const rpc = <T,>(fn: string, args: Record<string, unknown> = {}) => sdkGuard(supabase.rpc(fn as never, args as never)) as Promise<T>

export type WeighingDestination = 'press' | 'transfer_station' | 'both'
export interface VehicleCategory {
  code: string
  label: string
  min_tons: number | null
  max_tons: number | null
  weighing_destination: WeighingDestination | null
  garage_usable: boolean
  station_outbound: boolean
  active: boolean
  sort: number
  updated_at: string | null
  updated_by: string | null
}
export interface VehicleCategoryInput {
  code: string
  label: string
  minTons: number | null
  maxTons: number | null
  weighingDestination: WeighingDestination | null
  garageUsable: boolean
  stationOutbound: boolean
  sort: number
  active: boolean
}
export interface StationFleetCandidate {
  id: string
  vehicle_name: string
  db_number: string
  plate_number: string
  vehicle_category: string
  category_label: string
  station_outbound: boolean
  is_station_vehicle: boolean
  driver_name: string | null
  has_gps: boolean
  ownership_type: 'owned' | 'rented'
  sector_name: string | null
}
export interface StationFleetVehicle {
  id: string
  vehicle_name: string
  db_number: string
  plate_number: string
  vehicle_category: string
  category_label: string
  station_outbound: boolean
  driver_employee_id: string | null
  driver_name: string | null
  has_gps: boolean
  device_id: string | null
  ownership_type: 'owned' | 'rented'
}
export interface StationDestination {
  id: string
  name: string
  geofence_id: string | null
  geofence_name: string | null
  has_zone: boolean
  active: boolean
  sort: number
}
export interface StationExternalDriver {
  id: string
  full_name: string
  phone: string | null
  contractor_name: string
  license_no: string | null
  license_image_path: string | null
  notes: string | null
  active: boolean
  created_at: string
  updated_at: string
}
export interface StationExternalDriverInput {
  id: string | null
  fullName: string
  contractorName: string
  phone: string | null
  licenseNo: string | null
  licenseImagePath: string | null
  notes: string | null
  active: boolean
}
export type StationDriverKind = 'employee' | 'external' | 'contracted'
export interface StationDriverOption { driver_kind: 'employee' | 'external'; ref_id: string; full_name: string; detail: string; phone: string | null }
export interface StationExitInput {
  vehicleId: string
  driverKind: StationDriverKind
  destinationId: string
  driverEmployeeId?: string | null
  externalDriverId?: string | null
  driverName?: string | null
  weightTons?: number | null
  logDate?: string | null
}
export interface StationExitResult { id: string; table: 'ts_saksat_records' | 'ts_carrier_records'; tracking: 'gps' | 'none'; driver_name: string; shift_name: string | null; destination: string; category: string }
export type StationOutboundStatus = 'en_route' | 'arrived' | 'untracked' | 'legacy'
export interface StationOutboundRow {
  id: string
  source: 'saksat' | 'carrier'
  exit_time: string
  log_date: string
  vehicle_id: string | null
  db_number: string | null
  vehicle_category: string | null
  category_label: string | null
  driver_kind: 'legacy' | StationDriverKind
  driver_name: string
  destination_id: string | null
  destination_name: string | null
  tracking: 'gps' | 'none'
  arrived_at: string | null
  minutes_to_arrival: number | null
  shift_name: string | null
  weight_tons: number | null
  status: StationOutboundStatus
}

export const STATION_ERRORS: Record<string, string> = {
  DUPLICATE_SUBMIT: 'نُفِّذت هذه العملية قبل لحظات — لم تُكرَّر.', // 00349: حارس التكرار في قاعدة البيانات
  PERMISSION_DENIED: 'ليست لديك صلاحية هذا الإجراء — راجع التطوير المركزية.', // 00350: إنفاذ الصلاحيات في الخادم
  OPS_ROOM_FORBIDDEN: 'هذه العملية لغرفة العمليات فقط',
  STATION_FORBIDDEN: 'غير مصرح لهذا الحساب',
  TS_KIND_CODE_INVALID: 'رمز الفئة: أحرف لاتينية صغيرة وأرقام و_ فقط (2–40)',
  TS_KIND_LABEL_REQUIRED: 'اسم الفئة مطلوب',
  TS_KIND_MIN_INVALID: 'الحد الأدنى بالطن مطلوب لفئات الوزن ويجب أن يكون بين 0.1 و99.9',
  TS_KIND_MAX_INVALID: 'الحد الأعلى يجب أن يكون ≥ الحد الأدنى وأقل من 100',
  STATION_DESTINATION_INVALID: 'وجهة الوزن غير صحيحة',
  VEHICLE_CATEGORY_OTHER_LOCKED: 'فئة «أخرى» لا يمكن إيقافها',
  GARAGE_VEHICLE_NOT_FOUND: 'الآلية غير موجودة أو مؤرشفة',
  GARAGE_VEHICLE_CATEGORY_INVALID: 'فئة الآلية غير معروفة أو موقوفة',
  STATION_DESTINATION_NAME_INVALID: 'اسم الوجهة مطلوب (2–80 حرفاً)',
  STATION_DESTINATION_ZONE_NOT_FOUND: 'الزون المختار غير موجود أو موقوف',
  STATION_DESTINATION_NOT_FOUND: 'الوجهة غير موجودة أو موقوفة',
  STATION_DESTINATION_DUPLICATE: 'توجد وجهة بهذا الاسم',
  STATION_DRIVER_NAME_INVALID: 'اسم السائق مطلوب (2–120 حرفاً)',
  STATION_DRIVER_CONTRACTOR_REQUIRED: 'اسم المتعهد مطلوب',
  STATION_DRIVER_PHONE_INVALID: 'رقم الهاتف غير صحيح (أرقام فقط، 7–20)',
  STATION_DRIVER_NOT_FOUND: 'السائق غير موجود',
  STATION_DRIVER_INACTIVE: 'السائق الخارجي موقوف — فعّله من غرفة العمليات أولاً',
  STATION_DRIVER_KIND_INVALID: 'نوع السائق غير صحيح',
  STATION_VEHICLE_NOT_FOUND: 'الآلية غير موجودة',
  STATION_VEHICLE_NOT_STATION: 'هذه الآلية ليست من آليات المحطة',
  STATION_VEHICLE_CATEGORY_NOT_OUTBOUND: 'فئة هذه الآلية ليست فئة خروج (نسافة/سكس/ناقلة)',
  STATION_CONTRACTED_REQUIRES_RENTED_VEHICLE: 'السائق المتعاقد يُسجَّل على آلية مؤجرة فقط',
  STATION_WEIGHT_REQUIRED: 'وزن الحمولة مطلوب للناقلة',
  STATION_WEIGHT_INVALID: 'الوزن غير صحيح',
  STATION_DATE_RANGE_INVALID: 'المدة غير صحيحة (حتى 92 يوماً)',
  FLEET_DRIVER_REQUIRED: 'اختر السائق',
  FLEET_DRIVER_NOT_FOUND: 'السائق غير موجود',
  FLEET_DRIVER_TERMINATED: 'السائق منتهي الخدمة',
  FLEET_DRIVER_NOT_DRIVER_TITLE: 'هذا الموظف ليس سائقاً حسب مسماه الوظيفي',
}
export const stationErrorMessage = (e: unknown): string => {
  const m = e instanceof Error ? e.message : String(e)
  const key = Object.keys(STATION_ERRORS).find((k) => m.includes(k))
  return key ? STATION_ERRORS[key]! : m
}

export const stationFleet = {
  categories: (includeInactive = true) => rpc<VehicleCategory[]>('vehicle_categories_list', { p_include_inactive: includeInactive }),
  saveCategory: (x: VehicleCategoryInput) =>
    rpc<VehicleCategory>('ops_vehicle_category_save', {
      p_code: x.code, p_label: x.label, p_min_tons: x.minTons, p_max_tons: x.maxTons, p_weighing_destination: x.weighingDestination,
      p_garage_usable: x.garageUsable, p_station_outbound: x.stationOutbound, p_sort: x.sort, p_active: x.active,
    }),
  candidates: (search: string, onlyStation = false) => rpc<StationFleetCandidate[]>('station_fleet_candidates', { p_search: search || null, p_only_station: onlyStation, p_limit: 60 }),
  setStationVehicle: (vehicleId: string, isStation: boolean) => rpc<unknown>('garage_set_station_vehicle', { p_vehicle_id: vehicleId, p_is_station: isStation }),
  fleet: () => rpc<StationFleetVehicle[]>('station_fleet_list'),
  destinations: (includeInactive = false) => rpc<StationDestination[]>('station_destinations_list', { p_include_inactive: includeInactive }),
  saveDestination: (x: { id: string | null; name: string; geofenceId: string | null; sort: number; active: boolean }) =>
    rpc<unknown>('station_destination_save', { p_id: x.id, p_name: x.name, p_geofence_id: x.geofenceId, p_sort: x.sort, p_active: x.active }),
  externalDrivers: async (): Promise<StationExternalDriver[]> =>
    ((await sdkGuard(supabase.from('station_external_drivers' as never).select('*').order('active', { ascending: false }).order('full_name'))) ?? []) as unknown as StationExternalDriver[],
  saveExternalDriver: (x: StationExternalDriverInput) =>
    rpc<StationExternalDriver>('station_external_driver_save', {
      p_id: x.id, p_full_name: x.fullName, p_contractor_name: x.contractorName, p_phone: x.phone, p_license_no: x.licenseNo,
      p_license_image_path: x.licenseImagePath, p_notes: x.notes, p_active: x.active,
    }),
  drivers: () => rpc<StationDriverOption[]>('station_drivers_list'),
  recordExit: (x: StationExitInput) =>
    rpc<StationExitResult>('station_record_exit', {
      p_vehicle_id: x.vehicleId, p_driver_kind: x.driverKind, p_destination_id: x.destinationId,
      p_driver_employee_id: x.driverEmployeeId ?? null, p_external_driver_id: x.externalDriverId ?? null, p_driver_name: x.driverName ?? null,
      p_weight_tons: x.weightTons ?? null, p_log_date: x.logDate ?? null,
    }),
  outbound: (from: string, to: string, onlyOpen = false) => rpc<StationOutboundRow[]>('station_outbound_list', { p_from: from, p_to: to, p_only_open: onlyOpen }),
}
