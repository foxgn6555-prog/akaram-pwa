/** مسارات بوابة العمليات الميدانية (00161) — الرئيسية، الطلبات، القواطع والمسؤولون، التقارير، التبليغ، الإجراءات (00163)، طلباتي */
import type { RouteObject } from 'react-router'
import FieldOpsDashboard from './pages/Dashboard/FieldOpsDashboard'
import SectorsPage from './pages/Sectors/SectorsPage'
import TeamRequestsPage from '@portals/admin-ops/pages/Requests/TeamRequestsPage'
import SectorReportsPage from '@portals/admin-ops/pages/Reports/SectorReportsPage'
import NotifyPage from '@portals/admin-ops/pages/Notify/NotifyPage'
import ProceduresPage from '@portals/admin-ops/pages/Procedures/ProceduresPage'
import MyRequests from '@portals/employee/pages/Requests/MyRequests'

export const customRoutes: RouteObject[] = [
  { path: '', element: <FieldOpsDashboard /> },
  { path: 'requests', element: <TeamRequestsPage /> },
  { path: 'sectors', element: <SectorsPage /> },
  { path: 'reports', element: <SectorReportsPage fieldOps /> },
  { path: 'notify', element: <NotifyPage fieldOps /> },
  { path: 'procedures', element: <ProceduresPage /> },
  { path: 'my-requests', element: <MyRequests /> },
]
