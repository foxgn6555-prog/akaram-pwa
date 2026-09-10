/**
 * مسارات بوابة وحدة الكشوفات:
 *  · '' → لوحة التقارير (داشبورد + رسوم بيانية)
 *  · statements → قائمة الكشوفات
 *  · statements/new → إنشاء كشف
 *  · archive → أرشيف الكشوفات
 */
import { lazy, Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const DisclosuresDashboard = lazy(() => import('./pages/Dashboard/DisclosuresDashboard'))
const StatementsPage = lazy(() => import('./pages/Statements/StatementsPage'))
const NewDisclosure = lazy(() => import('./pages/Statements/NewDisclosure'))
const EditDisclosure = lazy(() => import('./pages/Statements/NewDisclosure'))
const DisclosuresArchivePage = lazy(() => import('./pages/Archive/DisclosuresArchivePage'))
const DisclosureReportsPage = lazy(() => import('./pages/Reports/DisclosureReportsPage'))

const s = (node: ReactNode): ReactNode => (
  <Suspense fallback={<LoadingSpinner fullScreen />}>{node}</Suspense>
)

export const customRoutes: RouteObject[] = [
  { path: '', element: s(<DisclosuresDashboard />) },
  { path: 'statements', element: s(<StatementsPage />) },
  { path: 'statements/new', element: s(<NewDisclosure />) },
  { path: 'statements/:id/edit', element: s(<EditDisclosure />) },
  { path: 'reports', element: s(<DisclosureReportsPage />) },
  { path: 'archive', element: s(<DisclosuresArchivePage />) },
]
