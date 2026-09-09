import type { GarageFuelUnit } from './fuel-units'
import type { GarageFuelType, GarageParentSector } from './types'

export type GarageMovementType = 'stock_in' | 'vehicle_fill' | 'approved_reset'
export interface GarageReportFilter {
  from?: string
  to?: string
  sectorId?: number
  fuelType?: GarageFuelType
  tankId?: string
  vehicleId?: string
  movementType?: GarageMovementType
  page?: number
  pageSize?: number
}
export interface GarageReportRow {
  id: string
  tankId: string
  vehicleId: string | null
  movementType: GarageMovementType
  quantity: number
  quantityBefore: number
  quantityAfter: number
  nextRefillDate: string | null
  notes: string | null
  actorId: string
  actorName: string
  createdAt: string
  tankName: string
  fuelType: GarageFuelType
  unit: GarageFuelUnit
  vehicleName: string | null
  dbNumber: string | null
  areaName: string | null
  parentSector: GarageParentSector | null
}
export interface GarageReportResult {
  totalCount: number
  stockInTotal: number
  consumptionTotal: number
  resetTotal: number
  byType: Array<{ fuelType: GarageFuelType; unit: GarageFuelUnit; quantity: number }>
  byTank: Array<{ tankId: string; tankName: string; fuelType: GarageFuelType; unit: GarageFuelUnit; stockIn: number; consumption: number }>
  byVehicle: Array<{ vehicleId: string; vehicleName: string; dbNumber: string; unit: GarageFuelUnit; quantity: number }>
  byUnit: Array<{ unit: GarageFuelUnit; stockIn: number; consumption: number; reset: number }>
  rows: GarageReportRow[]
  from: string
  to: string
}
