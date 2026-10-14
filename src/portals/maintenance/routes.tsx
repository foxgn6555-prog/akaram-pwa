import { lazy } from '@lib/router/lazy'
import { Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
const Dashboard = lazy(() => import('./pages/Dashboard/MaintenanceDashboardPage'))
const Purchases = lazy(() => import('./pages/Purchases/MaintenancePurchasesPage'))
const Inventory = lazy(() => import('./pages/Inventory/MaintenanceInventoryPage'))
const Cases = lazy(() => import('./pages/VehicleCases/MaintenanceCasesPage'))
const Archive = lazy(() => import('./pages/Archive/MaintenanceArchivePage'))
const Employees = lazy(() => import('./pages/Employees/MaintenanceEmployeesPage'))   // 00223
const Requests = lazy(() => import('./pages/Requests/MaintenanceRequestsPage'))   // 00223
const Procedures = lazy(() => import('./pages/Procedures/MaintenanceProceduresPage'))   // 00223
const wrap = (node: ReactNode) => (
  <Suspense fallback={<LoadingSpinner fullScreen />}>{node}</Suspense>
)
export const customRoutes: RouteObject[] = [
  { path: '', element: wrap(<Dashboard />) },
  { path: 'purchases', element: wrap(<Purchases />) },
  { path: 'inventory', element: wrap(<Inventory />) },
  { path: 'vehicle-cases', element: wrap(<Cases />) },
  { path: 'employees', element: wrap(<Employees />) },
  { path: 'requests', element: wrap(<Requests />) },
  { path: 'procedures', element: wrap(<Procedures />) },
  { path: 'archive', element: wrap(<Archive />) },
]
