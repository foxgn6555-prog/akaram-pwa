/** مسارات بوابة الموارد البشرية — الوحدات السبع المعتمدة، كل صفحة ملف مستقل */

import { lazy } from '@lib/router/lazy'
import { Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const HRDashboard = lazy(() => import('./pages/Dashboard/HRDashboard'))
const Recruitment = lazy(() => import('./pages/Recruitment/Recruitment'))
const HireRequestsPage = lazy(() => import('./pages/Recruitment/HireRequestsPage'))   // 00348 (B)
const EmployeesList = lazy(() => import('./pages/Employees/EmployeesList'))
const EmployeeDetail = lazy(() => import('./pages/Employees/EmployeeDetail'))
const AttendanceLog = lazy(() => import('./pages/Attendance/AttendanceLog'))
const BiometricLedger = lazy(() => import('./pages/Biometric/BiometricLedger'))
const UnmatchedPeoplePage = lazy(() => import('./pages/Biometric/UnmatchedPeoplePage'))
const Leaves = lazy(() => import('./pages/Leaves/Leaves'))
const NowBoardPage = lazy(() => import('./pages/Attendance/NowBoardPage'))   // 00389-ب
const MonthlyAttendanceReportPage = lazy(() => import('./pages/Attendance/MonthlyAttendanceReportPage'))   // 00389-ب
const EmployeeDocumentsPage = lazy(() => import('./pages/Employees/EmployeeDocumentsPage'))   // 00389-أ
const OrgStructure = lazy(() => import('./pages/Org/OrgStructure'))
const BehaviorReportsPage = lazy(() => import('./pages/Behavior/BehaviorReportsPage'))   // 00249

const s = (node: ReactNode): ReactNode => (
  <Suspense fallback={<LoadingSpinner fullScreen />}>{node}</Suspense>
)

export const customRoutes: RouteObject[] = [
  { path: '', element: s(<HRDashboard />) },
  { path: 'recruitment', element: s(<Recruitment />) },
  { path: 'hire-requests', element: s(<HireRequestsPage />) },
  { path: 'employees', element: s(<EmployeesList />) },
  { path: 'employees/:employeeId', element: s(<EmployeeDetail />) },
  { path: 'attendance', element: s(<AttendanceLog />) },
  { path: 'now', element: s(<NowBoardPage />) },
  { path: 'attendance-monthly', element: s(<MonthlyAttendanceReportPage />) },
  { path: 'leaves', element: s(<Leaves />) },
  { path: 'documents', element: s(<EmployeeDocumentsPage />) },
  { path: 'biometric', element: s(<BiometricLedger />) },
  { path: 'biometric/unmatched', element: s(<UnmatchedPeoplePage />) },
  { path: 'org', element: s(<OrgStructure />) },
  { path: 'behavior', element: s(<BehaviorReportsPage />) },
]
