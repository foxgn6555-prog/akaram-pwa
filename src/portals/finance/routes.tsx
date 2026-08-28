/** مسارات بوابة الشؤون المالية — كل صفحة ملف مستقل داخل هذا المجلد */
import type { RouteObject } from 'react-router'
import FinanceDashboard from './pages/Dashboard/FinanceDashboard'
import BudgetOverview from './pages/Budget/BudgetOverview'
import PayrollOverview from './pages/Payroll/PayrollOverview'
import FinancialReports from './pages/Reports/FinancialReports'
import AuditReport from './pages/Reports/AuditReport'

export const customRoutes: RouteObject[] = [
  { path: '', element: <FinanceDashboard /> },
  { path: 'budget', element: <BudgetOverview /> },
  { path: 'payroll', element: <PayrollOverview /> },
  { path: 'reports', element: <FinancialReports /> },
  { path: 'audit-report', element: <AuditReport /> },
]
