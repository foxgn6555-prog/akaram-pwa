import type { TripStatus } from '@features/vehicle-operations/trip-status'
import type { GarageFuelUnit } from './fuel-units'
import type { GarageOwnershipType, GarageVehicleCategory } from './vehicle-details'

export type GarageShift = 'morning' | 'evening' | 'night'
export type GarageFuelType = 'gas_oil' | 'hydraulic' | 'grease' | 'c_oil'
export type GarageParentSector = 'karrada' | 'zaafaraniya'

export interface GarageArea {
  id: number
  name: string
  parentSector: GarageParentSector
  sort: number
}

export interface GarageVehicle {
  id: string
  vehicleName: string
  dbNumber: string
  plateNumber: string
  chassisNumber: string
  vehicleCategory: GarageVehicleCategory
  ownershipType: GarageOwnershipType
  lessorName: string | null
  rentalContractNo: string | null
  rentalStartDate: string | null
  rentalEndDate: string | null
  modelYear: number | null
  vehicleColor: string | null
  specifications: string | null
  imagePath: string
  imageUrl?: string
  shift: GarageShift
  driverName: string
  /** هوية السائق في الموارد البشرية (null = سجل قديم بلا رابط، تصححه غرفة العمليات) */
  driverEmployeeId: string | null
  driverEmployeeNumber: string | null
  driverHasBiometric: boolean | null
  sectorId: number
  areaName: string
  parentSector: GarageParentSector
  createdAt: string
  updatedAt: string
  archivedAt: string | null
  archivedBy: string | null
  archiveReason: string | null
}

export interface GarageVehiclePage {
  rows: GarageVehicle[]
  totalCount: number
}

export interface GarageVehicleFilter {
  search?: string
  sectorId?: number
  shift?: GarageShift
  page?: number
  pageSize?: number
  archived?: boolean
}

export interface CreateGarageVehicleInput {
  vehicleName: string
  dbNumber: string
  plateNumber: string
  chassisNumber: string
  vehicleCategory?: GarageVehicleCategory
  ownershipType?: GarageOwnershipType
  lessorName?: string | null
  rentalContractNo?: string | null
  rentalStartDate?: string | null
  rentalEndDate?: string | null
  modelYear?: number | null
  vehicleColor?: string | null
  specifications?: string | null
  image: File
  shift: GarageShift
  driverEmployeeId: string
  sectorId: number
}

/** خيار سائق من قائمة الموظفين (fleet_driver_options) */
export interface FleetDriverOption {
  employeeId: string
  fullName: string
  employeeNumber: string
  jobTitle: string | null
  departmentName: string | null
  hasBiometric: boolean
  employmentStatus: string
  assignedVehicles: string[]
}

export interface GarageVehicleShiftAssignment {id:string;vehicleId:string;shift:GarageShift;driverName:string;driverEmployeeId:string|null;driverEmployeeNumber:string|null;sectorId:number;areaName:string;parentSector:GarageParentSector;startsAt:string;endsAt:string|null;changeReason:string|null}

export interface GarageDriverAssignment {
  id: string
  vehicleId: string
  driverName: string
  driverEmployeeId: string | null
  shift: GarageShift
  sectorId: number
  startsAt: string
  endsAt: string | null
  changeReason: string | null
}

export interface GarageTank {
  id: string
  fuelType: GarageFuelType
  tankName: string
  unit: GarageFuelUnit
  capacity: number
  currentQuantity: number
  lowStockThreshold: number
  createdAt: string
  updatedAt: string
  archivedAt: string | null
  parentSector: 'karrada' | 'zaafaraniya' | null
}

export interface GarageInventoryMovement {
  id: string
  tankId: string
  vehicleId: string | null
  movementType: 'stock_in' | 'vehicle_fill' | 'approved_reset'
  quantity: number
  quantityBefore: number
  quantityAfter: number
  fuelType: GarageFuelType | null
  unit: GarageFuelUnit | null
  tankName: string | null
  nextRefillDate: string | null
  notes: string | null
  actorId: string
  createdAt: string
}

export interface GarageTankZeroRequest {
  id: string
  tankId: string
  requestedQuantity: number
  reason: string
  status: 'pending' | 'rejected' | 'executed'
  requestedBy: string
  requestedAt: string
  decidedBy: string | null
  decidedAt: string | null
  decisionNote: string | null
}

/** انطلاقة سائق: خروج الآلية من الكراج إلى ورديتها، وتُغلق بالعودة إلى الكراج. */
export interface GarageDeparture {
  id: string
  vehicleId: string
  driverName: string
  shift: GarageShift
  sectorId: number
  departedAt: string
  arrivedAt: string | null
  siteDepartedAt: string | null
  returnedAt: string | null
  recipientManagerId: string | null
  recipientManagerName: string | null
  arrivalNotes: string | null
  siteDepartureNotes: string | null
  notes: string | null
  vehicleName: string
  dbNumber: string
  imagePath: string
  imageUrl?: string
  areaName: string
  parentSector: GarageParentSector
  tripStatus: TripStatus
}

export interface GarageDispatchRecipient { userId: string; managerName: string; shift: GarageShift; sectors: number[]; resolution: 'direct' | 'parent_fallback'; pickRank: number }
export interface GarageTripDay { tripDay:string;totalCount:number;openCount:number;firstDepartureAt:string;lastActivityAt:string }

export interface GarageDashboardFilter {
  from?: string
  to?: string
  sectorId?: number
  fuelType?: GarageFuelType
}

export interface GarageDashboardSummary {
  vehiclesTotal: number
  driversTotal: number
  dispatchesTotal: number
  vehiclesByShift: Partial<Record<GarageShift, number>>
  vehiclesByArea: Array<{ sectorId: number; sector: GarageParentSector; area: string; total: number }>
  tankStock: Array<{ id: string; fuelType: GarageFuelType; name: string; unit: GarageFuelUnit; capacity: number; quantity: number; percent: number; lowStock: boolean }>
  fuelUnits: Partial<Record<GarageFuelType, GarageFuelUnit>>
  consumptionByType: Partial<Record<GarageFuelType, number>>
  consumptionByUnit: Partial<Record<GarageFuelUnit, number>>
  dailyConsumption: Array<{ date: string; quantity: number }>
  monthlyConsumption: Array<{ month: string; quantity: number }>
  topConsumers: Array<{ vehicleId: string; vehicleName: string; dbNumber: string; unit: GarageFuelUnit; quantity: number }>
  recentFills: Array<{ id: string; vehicleName: string; dbNumber: string; tankName: string; fuelType: GarageFuelType; unit: GarageFuelUnit; quantity: number; nextRefillDate: string | null; createdAt: string }>
  pendingZeroItems: Array<{ id: string; tankName: string; fuelType: GarageFuelType; unit: GarageFuelUnit; requestedQuantity: number; reason: string; requestedAt: string }>
  pendingZeroRequests: number
  from: string
  to: string
  sectorId: number | null
  fuelType: GarageFuelType | null
}

/* ─── 00207: موظفو الكراج (بيانات أساسية غير حساسة) ─── */
export interface GarageEmployeeRow {
  id: string; employee_number: string; full_name: string; job_title: string | null; department: string; is_driver: boolean
  hire_date: string; employment_status: 'active' | 'on_leave' | 'suspended' | 'terminated'; contract_type: 'monthly' | 'daily'; phone: string | null
  shift: string | null; vehicle: string | null
  month: { present: number; late: number; absent: number; leave: number; working_days: number }
  open_disclosures: number; approved_disclosures_month: number
}
export interface GarageEmployees {
  month: string; department: string | null; scoped: boolean
  summary: { total: number; drivers: number; active: number; on_leave: number; absent_today: number; with_open_disclosures: number }
  rows: GarageEmployeeRow[]
}

/* ─── 00208: ملخص طلبات موظفي الكراج ─── */
export interface GarageLeavesSummary { pending: number; my_decisions: number; on_leave_today: number; permits_month: number; scoped: boolean }

/* ─── 00209/00348: الإجراءات — طلب تعيين (بلا رقم وظيفي؛ الموظف يُنشأ لاحقاً من الموارد البشرية بعد الموافقات) ─── */
export interface GarageHireOptions {
  job_titles: { id: string; name: string; department_id: string; department: string; drives_vehicles: boolean }[]
  shifts: { id: string; name: string; start_time: string; end_time: string }[]
  scoped: boolean
  /** السلسلة المضبوطة من التطوير المركزية لهذا الدور (null ⇒ الافتراضي: المدير المفوض) */
  chain: { steps: number; labels: string[] } | null
}
export interface GarageHireInput { full_name: string; phone?: string | null; job_title_id: string; hire_date: string; contract_type: 'monthly' | 'daily'; shift_id?: string | null; note?: string | null }
export interface HireRequestResult { id: string; full_name: string; job_title: string; department: string | null; hire_date: string; contract_type: 'monthly' | 'daily'; status: 'pending'; via_chain: boolean }
export type HireRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'completed'
export interface MyHireRequest {
  id: string; full_name: string; phone: string | null; job_title: string; department: string | null; hire_date: string; contract_type: 'monthly' | 'daily'; shift_name: string | null
  status: HireRequestStatus; current_step: string | null; rejected_note: string | null; created_at: string; decided_at: string | null; completed_at: string | null; employee_number: string | null
}
export interface GarageRecentHire {
  id: string; employee_number: string; full_name: string; job_title: string | null; is_driver: boolean; hire_date: string; contract_type: 'monthly' | 'daily'
  employment_status: string; has_biometric: boolean; has_manager: boolean; salary_ready: boolean
}
