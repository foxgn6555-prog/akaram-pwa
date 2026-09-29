/** مسارات بوابة المتعهد (00158) — الرئيسية، فريقي، حضورية العمال */
import type { RouteObject } from 'react-router'
import ContractorDashboard from './pages/Dashboard/ContractorDashboard'
import ContractorTeamPage from './pages/Team/ContractorTeamPage'
import ContractorAttendancePage from './pages/Attendance/ContractorAttendancePage'

export const customRoutes: RouteObject[] = [
  { path: '', element: <ContractorDashboard /> },
  { path: 'team', element: <ContractorTeamPage /> },
  { path: 'attendance', element: <ContractorAttendancePage /> },
]
