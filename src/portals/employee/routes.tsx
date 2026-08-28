/** مسارات بوابة الموظف — كل صفحة ملف مستقل داخل هذا المجلد */
import type { RouteObject } from 'react-router'
import EmployeeDashboard from './pages/Dashboard/EmployeeDashboard'
import MyProfile from './pages/Profile/MyProfile'
import MyRequests from './pages/Requests/MyRequests'
import MyPayslips from './pages/Payroll/MyPayslips'
import MyDocuments from './pages/Documents/MyDocuments'
import MyAssets from './pages/Assets/MyAssets'

export const customRoutes: RouteObject[] = [
  { path: '', element: <EmployeeDashboard /> },
  { path: 'profile', element: <MyProfile /> },
  { path: 'requests', element: <MyRequests /> },
  { path: 'payslips', element: <MyPayslips /> },
  { path: 'documents', element: <MyDocuments /> },
  { path: 'my-assets', element: <MyAssets /> },
]
