/**
 * مسارات بوابة معاون المدير المفوض:
 *  · '' → لوحة الوارد
 *  · statements → وارد الكشوفات المرفوعة من وحدة الكشوفات
 */
import { lazy, Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const DeputyDashboard = lazy(() => import('./pages/DeputyDashboard'))
const IncomingStatements = lazy(() => import('./pages/IncomingStatements'))
const StationFoldersPage = lazy(() => import('./pages/StationFolders/StationFoldersPage'))

const s = (node: ReactNode): ReactNode => (
  <Suspense fallback={<LoadingSpinner fullScreen />}>{node}</Suspense>
)

export const customRoutes: RouteObject[] = [
  { path: '', element: s(<DeputyDashboard />) },
  { path: 'statements', element: s(<IncomingStatements />) },
  { path: 'station-folders', element: s(<StationFoldersPage />) },
]
