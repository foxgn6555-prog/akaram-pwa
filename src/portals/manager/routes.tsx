/** مسارات بوابة مسؤول القسم (قواطع/شفتات) — كل صفحة ملف مستقل داخل هذا المجلد */
import type { RouteObject } from 'react-router'
import ManagerDashboard from './pages/Dashboard/ManagerDashboard'
import TeamPage from './pages/Team/TeamPage'
import NewRequestPage from './pages/Request/NewRequestPage'
import AttendancePage from './pages/Attendance/AttendancePage'
import BreakdownPage from './pages/Breakdown/BreakdownPage'
import PhotosPage from './pages/Photos/PhotosPage'
import ArchivePage from './pages/Archive/ArchivePage'
import AssignedComplaintsPage from './pages/Complaints/AssignedComplaintsPage'

export const customRoutes: RouteObject[] = [
  { path: '', element: <ManagerDashboard /> },
  { path: 'team', element: <TeamPage /> },
  { path: 'request', element: <NewRequestPage /> },
  { path: 'attendance', element: <AttendancePage /> },
  { path: 'breakdown', element: <BreakdownPage /> },
  { path: 'complaints', element: <AssignedComplaintsPage /> },
  { path: 'photos', element: <PhotosPage /> },
  { path: 'archive', element: <ArchivePage /> },
]
