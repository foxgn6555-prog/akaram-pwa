/** مسارات بوابة مدير القسم — كل صفحة ملف مستقل داخل هذا المجلد */
import type { RouteObject } from 'react-router'
import ManagerDashboard from './pages/Dashboard/ManagerDashboard'
import TeamOverview from './pages/Team/TeamOverview'
import PendingApprovals from './pages/Approvals/PendingApprovals'
import ManagerAttendance from './pages/Attendance/ManagerAttendance'
import DepartmentReports from './pages/Reports/DepartmentReports'

export const customRoutes: RouteObject[] = [
  { path: '', element: <ManagerDashboard /> },
  { path: 'team', element: <TeamOverview /> },
  { path: 'approvals', element: <PendingApprovals /> },
  { path: 'attendance', element: <ManagerAttendance /> },
  { path: 'reports', element: <DepartmentReports /> },
]
