/** مسارات بوابة العمليات الميدانية (00161) — الرئيسية، الطلبات، القواطع والمسؤولون، التقارير، التبليغ، الإجراءات (00163)، طلباتي */

import { lazy } from '@lib/router/lazy'
import { Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const FieldOpsDashboard = lazy(() => import('./pages/Dashboard/FieldOpsDashboard'))
const SectorsPage = lazy(() => import('./pages/Sectors/SectorsPage'))
const TeamRequestsPage = lazy(() => import('@portals/admin-ops/pages/Requests/TeamRequestsPage'))
const SectorReportsPage = lazy(() => import('@portals/admin-ops/pages/Reports/SectorReportsPage'))
const NotifyPage = lazy(() => import('@portals/admin-ops/pages/Notify/NotifyPage'))
const ProceduresPage = lazy(() => import('@portals/admin-ops/pages/Procedures/ProceduresPage'))
const MyRequests = lazy(() => import('@portals/employee/pages/Requests/MyRequests'))

const s = (node: ReactNode): ReactNode => (
  <Suspense fallback={<LoadingSpinner fullScreen />}>{node}</Suspense>
)

export const customRoutes: RouteObject[] = [
  { path: '', element: s(<FieldOpsDashboard />) },
  { path: 'requests', element: s(<TeamRequestsPage />) },
  { path: 'sectors', element: s(<SectorsPage />) },
  { path: 'reports', element: s(<SectorReportsPage fieldOps />) },
  { path: 'notify', element: s(<NotifyPage fieldOps />) },
  { path: 'procedures', element: s(<ProceduresPage />) },
  { path: 'my-requests', element: s(<MyRequests />) },
]
