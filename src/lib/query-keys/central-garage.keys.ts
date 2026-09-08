import type { GarageReportFilter } from '@features/central-garage/reports'
import type { GarageDashboardFilter, GarageVehicleFilter } from '@features/central-garage/types'

export const centralGarageKeys = {
  all: ['central-garage'] as const,
  areas: () => [...centralGarageKeys.all, 'areas'] as const,
  vehicles: () => [...centralGarageKeys.all, 'vehicles'] as const,
  vehicleList: (filter: GarageVehicleFilter) => [...centralGarageKeys.vehicles(), 'list', filter] as const,
  vehicle: (id: string) => [...centralGarageKeys.vehicles(), 'detail', id] as const,
  assignments: (id: string) => [...centralGarageKeys.vehicle(id), 'assignments'] as const,
  movements: (id: string) => [...centralGarageKeys.vehicle(id), 'movements'] as const,
  departures: () => [...centralGarageKeys.all, 'departures', 'today'] as const,
  tanks: () => [...centralGarageKeys.all, 'tanks'] as const,
  tankList: (fuelType?: string) => [...centralGarageKeys.tanks(), fuelType ?? 'all'] as const,
  tankMovements: (tankId: string) => [...centralGarageKeys.tanks(), tankId, 'movements'] as const,
  zeroRequests: (status?: string) => [...centralGarageKeys.tanks(), 'zero-requests', status ?? 'all'] as const,
  dashboard: () => [...centralGarageKeys.all, 'dashboard'] as const,
  dashboardSummary: (filter: GarageDashboardFilter = {}) => [...centralGarageKeys.dashboard(), filter] as const,
  reports: () => [...centralGarageKeys.all, 'reports'] as const,
  report: (filter: GarageReportFilter = {}) => [...centralGarageKeys.reports(), filter] as const,
}
