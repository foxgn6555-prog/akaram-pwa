/** مسارات بوابة المدير التنفيذي: الرئيسية · التقارير · التبليغات (الإجراءات التنفيذية تُضاف لاحقاً) */
import { lazy } from '@lib/router/lazy'
import { Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const ExecutiveHome = lazy(() => import('./pages/ExecutiveHome'))
const ExecutiveReports = lazy(() => import('./pages/ExecutiveReports'))
const ExecutiveAnnouncements = lazy(() => import('./pages/ExecutiveAnnouncements'))
const ApprovalTasks = lazy(() => import('@portals/admin-ops/pages/Requests/TeamRequestsPage').then((m) => ({ default: () => <m.default title="طلبات الموافقة" /> })))   // 00162: طلبات الموافقة
const s = (node: ReactNode): ReactNode => <Suspense fallback={<LoadingSpinner fullScreen />}>{node}</Suspense>

export const customRoutes: RouteObject[] = [
  { path: '', element: s(<ExecutiveHome />) },
  { path: 'reports', element: s(<ExecutiveReports />) },
  { path: 'announcements', element: s(<ExecutiveAnnouncements />) },
  { path: 'approvals', element: s(<ApprovalTasks />) },
]
