import { lazy, Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const Dashboard = lazy(() => import('./pages/CentralGarageDashboardPage'))
const GarageArchivePage = lazy(() => import('./pages/GarageArchivePage'))
const GarageReportsPage = lazy(() => import('./pages/GarageReportsPage'))
const FuelHubPage = lazy(() => import('./pages/FuelHubPage'))
const VehiclesDatabasePage = lazy(() => import('./pages/VehiclesDatabasePage'))
const DriversDispatchPage = lazy(() => import('./pages/DriversDispatchPage'))
const MaintenanceCoordinationPage = lazy(() => import('./pages/MaintenanceCoordinationPage'))
const VehicleDetailPage = lazy(() => import('./pages/VehicleDetailPage'))
const FuelTypePage = lazy(() => import('./pages/FuelTypePage'))
const s = (node: ReactNode): ReactNode => (
  <Suspense fallback={<LoadingSpinner fullScreen />}>{node}</Suspense>
)

export const customRoutes: RouteObject[] = [
  { path: '', element: s(<Dashboard />) },
  { path: 'drivers-dispatch', element: s(<DriversDispatchPage />) },
  { path: 'maintenance-coordination', element: s(<MaintenanceCoordinationPage />) },
  { path: 'vehicles-database', element: s(<VehiclesDatabasePage />) },
  { path: 'vehicles-database/:vehicleId', element: s(<VehicleDetailPage />) },
  { path: 'fuel', element: s(<FuelHubPage />) },
  { path: 'fuel/gas-oil', element: s(<FuelTypePage fuelType="gas_oil" />) },
  { path: 'fuel/hydraulic', element: s(<FuelTypePage fuelType="hydraulic" />) },
  { path: 'fuel/grease', element: s(<FuelTypePage fuelType="grease" />) },
  { path: 'fuel/c-oil', element: s(<FuelTypePage fuelType="c_oil" />) },
  { path: 'reports', element: s(<GarageReportsPage />) },
  { path: 'archive', element: s(<GarageArchivePage />) },
]
