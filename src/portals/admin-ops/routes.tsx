/** مسارات بوابة مسؤول القاطع (00160) — الرئيسية، طلبات فريقي، التقارير، التبليغ، طلباتي */
import type { RouteObject } from 'react-router'
import SectorManagerDashboard from './pages/Dashboard/SectorManagerDashboard'
import TeamRequestsPage from './pages/Requests/TeamRequestsPage'
import SectorReportsPage from './pages/Reports/SectorReportsPage'
import NotifyPage from './pages/Notify/NotifyPage'
import MyRequests from '@portals/employee/pages/Requests/MyRequests'

export const customRoutes: RouteObject[] = [
  { path: '', element: <SectorManagerDashboard /> },
  { path: 'requests', element: <TeamRequestsPage /> },
  { path: 'reports', element: <SectorReportsPage /> },
  { path: 'notify', element: <NotifyPage /> },
  { path: 'my-requests', element: <MyRequests /> },
]
