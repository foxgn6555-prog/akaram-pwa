import { lazy, Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
const Dashboard = lazy(() => import('./pages/Dashboard/OpsRoomDashboardPage'))
const Reports = lazy(() => import('./pages/OperationsData/OperationsDataPage'))
const Gps = lazy(() => import('./pages/Gps/GpsDataPage'))
const FleetDatabase = lazy(() =>
  import('@portals/central-garage/pages/VehiclesDatabasePage').then((module) => ({
    default: () => <module.default managementMode />,
  })),
)
const FleetDetail = lazy(() =>
  import('@portals/central-garage/pages/VehicleDetailPage').then((module) => ({
    default: () => <module.default managementMode />,
  })),
)
const FleetArchive = lazy(() =>
  import('@portals/central-garage/pages/GarageArchivePage').then((module) => ({
    default: () => <module.default managementMode />,
  })),
)
const load = (page: ReactNode) => (
  <Suspense fallback={<LoadingSpinner fullScreen />}>{page}</Suspense>
)
export const customRoutes: RouteObject[] = [
  { path: '', element: load(<Dashboard />) },
  { path: 'operations-data', element: load(<Reports />) },
  { path: 'vehicles-database', element: load(<FleetDatabase />) },
  { path: 'vehicles-database/:vehicleId', element: load(<FleetDetail />) },
  { path: 'vehicles-archive', element: load(<FleetArchive />) },
  { path: 'gps', element: load(<Gps />) },
]
