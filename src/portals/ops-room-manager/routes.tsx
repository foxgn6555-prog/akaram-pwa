import { lazy } from '@lib/router/lazy'
import { Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const Dashboard = lazy(() => import('./pages/Dashboard/OpsManagerDashboardPage'))
const Approvals = lazy(() => import('./pages/Approvals/OpsManagerApprovalsPage'))   // 00400: الموافقات
const FuelReports = lazy(() => import('./pages/Fuel/FuelReportsPage'))   // 00400: تقارير الوقود

const load = (page: ReactNode) => <Suspense fallback={<LoadingSpinner fullScreen />}>{page}</Suspense>

export const customRoutes: RouteObject[] = [
  { path: '', element: load(<Dashboard />) },
  { path: 'approvals', element: load(<Approvals />) },
  { path: 'fuel-reports', element: load(<FuelReports />) },
]
