/** مسارات بوابة المدير التنفيذي: الرئيسية · التقارير · التبليغات (الإجراءات التنفيذية تُضاف لاحقاً) */
import { lazy, Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const ExecutiveHome = lazy(() => import('./pages/ExecutiveHome'))
const ExecutiveReports = lazy(() => import('./pages/ExecutiveReports'))
const ExecutiveAnnouncements = lazy(() => import('./pages/ExecutiveAnnouncements'))
const s = (node: ReactNode): ReactNode => <Suspense fallback={<LoadingSpinner fullScreen />}>{node}</Suspense>

export const customRoutes: RouteObject[] = [
  { path: '', element: s(<ExecutiveHome />) },
  { path: 'reports', element: s(<ExecutiveReports />) },
  { path: 'announcements', element: s(<ExecutiveAnnouncements />) },
]
