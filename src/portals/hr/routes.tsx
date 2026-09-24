/** مسارات بوابة الموارد البشرية — الوحدات الست المعتمدة، كل صفحة ملف مستقل */
import type { RouteObject } from 'react-router'
import HRDashboard from './pages/Dashboard/HRDashboard'
import Recruitment from './pages/Recruitment/Recruitment'
import EmployeesList from './pages/Employees/EmployeesList'
import AttendanceLog from './pages/Attendance/AttendanceLog'
import BiometricLedger from './pages/Biometric/BiometricLedger'
import Leaves from './pages/Leaves/Leaves'

export const customRoutes: RouteObject[] = [
  { path: '', element: <HRDashboard /> },
  { path: 'recruitment', element: <Recruitment /> },
  { path: 'employees', element: <EmployeesList /> },
  { path: 'attendance', element: <AttendanceLog /> },
  { path: 'leaves', element: <Leaves /> },
  { path: 'biometric', element: <BiometricLedger /> },
]
