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
  driverName: string
  sectorId: number
}

export interface GarageVehicleShiftAssignment {id:string;vehicleId:string;shift:GarageShift;driverName:string;sectorId:number;areaName:string;parentSector:GarageParentSector;startsAt:string;endsAt:string|null;changeReason:string|null}

export interface GarageDriverAssignment {
  id: string
  vehicleId: string
  driverName: string
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
}

export interface GarageDispatchRecipient { userId: string; managerName: string; shift: GarageShift; sectors: number[] }
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
