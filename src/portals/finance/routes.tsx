/** مسارات بوابة الشؤون المالية — كل صفحة ملف مستقل داخل هذا المجلد */

import { lazy } from '@lib/router/lazy'
import { Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const FinanceDashboard = lazy(() => import('./pages/Dashboard/FinanceDashboard'))
const BudgetOverview = lazy(() => import('./pages/Budget/BudgetOverview'))
const PayrollOverview = lazy(() => import('./pages/Payroll/PayrollOverview'))
const FinancialReports = lazy(() => import('./pages/Reports/FinancialReports'))
const FinanceAnnouncements = lazy(() => import('./pages/Announcements/FinanceAnnouncements'))
const MaintenancePurchases = lazy(() => import('./pages/Purchases/MaintenancePurchases'))
const ContractorWagesPage = lazy(() => import('./pages/Contractors/ContractorWagesPage'))
const RentedSalariesPage = lazy(() => import('./pages/RentedSalaries/FinanceRentedSalariesPage'))   // 20261203000100
const FinanceAdvancesPage = lazy(() => import('./pages/Advances/FinanceAdvancesPage'))
const FinanceSettlementsPage = lazy(() => import('./pages/Settlements/FinanceSettlementsPage'))   // 00355: المنتهية خدماتهم والتصفية
const FinanceLettersPage = lazy(() => import('./pages/Letters/FinanceLettersPage'))   // 00356: سجل الكتب الرسمية
const FinanceExpensesPage = lazy(() => import('./pages/Expenses/FinanceExpensesPage'))   // 00358: المصاريف
const FinanceDisbursementsPage = lazy(() => import('./pages/Disbursements/FinanceDisbursementsPage'))   // مسار الصرف: أوامر الصرف المعتمدة
const FinanceDisbursementDetailPage = lazy(() => import('./pages/Disbursements/FinanceDisbursementDetailPage'))

const s = (node: ReactNode): ReactNode => (
  <Suspense fallback={<LoadingSpinner fullScreen />}>{node}</Suspense>
)

export const customRoutes: RouteObject[] = [
  { path: '', element: s(<FinanceDashboard />) },
  { path: 'budget', element: s(<BudgetOverview />) },
  { path: 'purchases', element: s(<MaintenancePurchases />) },
  { path: 'payroll', element: s(<PayrollOverview />) },
  { path: 'contractor-wages', element: s(<ContractorWagesPage />) },
  { path: 'rented-salaries', element: s(<RentedSalariesPage />) },   // 20261203000400: رواتب الآليات المؤجرة
  { path: 'advances', element: s(<FinanceAdvancesPage />) },
  { path: 'settlements', element: s(<FinanceSettlementsPage />) },
  { path: 'letters', element: s(<FinanceLettersPage />) },
  { path: 'expenses', element: s(<FinanceExpensesPage />) },
  { path: 'disbursements', element: s(<FinanceDisbursementsPage />) },
  { path: 'disbursements/:id', element: s(<FinanceDisbursementDetailPage />) },
  { path: 'reports', element: s(<FinancialReports />) },
  { path: 'announcements', element: s(<FinanceAnnouncements />) },
]
