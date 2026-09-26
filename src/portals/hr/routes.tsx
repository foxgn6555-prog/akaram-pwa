/** مسارات بوابة الموارد البشرية — الوحدات السبع المعتمدة، كل صفحة ملف مستقل */
import type { RouteObject } from 'react-router'
import HRDashboard from './pages/Dashboard/HRDashboard'
import Recruitment from './pages/Recruitment/Recruitment'
import EmployeesList from './pages/Employees/EmployeesList'
import EmployeeDetail from './pages/Employees/EmployeeDetail'
import AttendanceLog from './pages/Attendance/AttendanceLog'
import BiometricLedger from './pages/Biometric/BiometricLedger'
import Leaves from './pages/Leaves/Leaves'
import OrgStructure from './pages/Org/OrgStructure'

export const customRoutes: RouteObject[] = [
  { path: '', element: <HRDashboard /> },
  { path: 'recruitment', element: <Recruitment /> },
  { path: 'employees', element: <EmployeesList /> },
  { path: 'employees/:employeeId', element: <EmployeeDetail /> },
  { path: 'attendance', element: <AttendanceLog /> },
  { path: 'leaves', element: <Leaves /> },
  { path: 'biometric', element: <BiometricLedger /> },
  { path: 'org', element: <OrgStructure /> },
]
