/** مسارات بوابة الموارد البشرية — كل صفحة ملف مستقل داخل هذا المجلد */
import type { RouteObject } from 'react-router'
import HRDashboard from './pages/Dashboard/HRDashboard'
import EmployeesList from './pages/Employees/EmployeesList'
import AllRequests from './pages/Requests/AllRequests'
import AttendanceLog from './pages/Attendance/AttendanceLog'
import PayrollManager from './pages/Payroll/PayrollManager'
import HRReports from './pages/Reports/HRReports'

export const customRoutes: RouteObject[] = [
  { path: '', element: <HRDashboard /> },
  { path: 'employees', element: <EmployeesList /> },
  { path: 'requests', element: <AllRequests /> },
  { path: 'attendance', element: <AttendanceLog /> },
  { path: 'payroll', element: <PayrollManager /> },
  { path: 'reports', element: <HRReports /> },
]
