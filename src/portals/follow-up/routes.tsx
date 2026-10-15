import { lazy } from '@lib/router/lazy'
import { Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const Dashboard = lazy(() => import('./pages/FollowUpDashboardPage'))
const WorkersPage = lazy(() => import('./pages/FollowUpWorkersPage'))   // 00259: متابعة العمال
const ContainersPage = lazy(() => import('./pages/FollowUpContainersPage'))   // 00260: متابعة الحاويات
const s = (node: ReactNode): ReactNode => (
  <Suspense fallback={<LoadingSpinner fullScreen />}>{node}</Suspense>
)

export const customRoutes: RouteObject[] = [
  { path: '', element: s(<Dashboard />) },
  { path: 'containers', element: s(<ContainersPage />) },
  { path: 'workers', element: s(<WorkersPage />) },
]
