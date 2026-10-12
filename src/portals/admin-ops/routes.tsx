/** مسارات بوابة مسؤول القاطع (00160) — الرئيسية، طلبات فريقي، التقارير، التبليغ، الإجراءات (00163)، الكشوفات (00210)، طلباتي */

import { lazy } from '@lib/router/lazy'
import { Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const SectorManagerDashboard = lazy(() => import('./pages/Dashboard/SectorManagerDashboard'))
const TeamRequestsPage = lazy(() => import('./pages/Requests/TeamRequestsPage'))
const SectorReportsPage = lazy(() => import('./pages/Reports/SectorReportsPage'))
const NotifyPage = lazy(() => import('./pages/Notify/NotifyPage'))
const ProceduresPage = lazy(() => import('./pages/Procedures/ProceduresPage'))
const SectorDisclosuresPage = lazy(() => import('./pages/Disclosures/SectorDisclosuresPage'))   // 00210: الكشوفات (موظفوه فقط)
const MyRequests = lazy(() => import('@portals/employee/pages/Requests/MyRequests'))

const s = (node: ReactNode): ReactNode => (
  <Suspense fallback={<LoadingSpinner fullScreen />}>{node}</Suspense>
)

export const customRoutes: RouteObject[] = [
  { path: '', element: s(<SectorManagerDashboard />) },
  { path: 'requests', element: s(<TeamRequestsPage />) },
  { path: 'reports', element: s(<SectorReportsPage />) },
  { path: 'notify', element: s(<NotifyPage />) },
  { path: 'procedures', element: s(<ProceduresPage />) },
  { path: 'disclosures', element: s(<SectorDisclosuresPage />) },
  { path: 'my-requests', element: s(<MyRequests />) },
]
