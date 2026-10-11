/** مسارات بوابة المتعهد (00158) — الرئيسية، فريقي، حضورية العمال */

import { lazy } from '@lib/router/lazy'
import { Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const ContractorDashboard = lazy(() => import('./pages/Dashboard/ContractorDashboard'))
const ContractorTeamPage = lazy(() => import('./pages/Team/ContractorTeamPage'))
const ContractorAttendancePage = lazy(() => import('./pages/Attendance/ContractorAttendancePage'))

const s = (node: ReactNode): ReactNode => (
  <Suspense fallback={<LoadingSpinner fullScreen />}>{node}</Suspense>
)

export const customRoutes: RouteObject[] = [
  { path: '', element: s(<ContractorDashboard />) },
  { path: 'team', element: s(<ContractorTeamPage />) },
  { path: 'attendance', element: s(<ContractorAttendancePage />) },
]
