import { lazy, Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const MediaDashboardPage = lazy(() => import('./pages/MediaDashboardPage'))
const MediaUnitPage = lazy(() => import('./pages/MediaUnitPage'))
const s = (node: ReactNode): ReactNode => <Suspense fallback={<LoadingSpinner fullScreen />}>{node}</Suspense>

export const customRoutes: RouteObject[] = [
  { path: '', element: s(<MediaDashboardPage />) },
  { path: 'karrada-sector', element: s(<MediaUnitPage title="قاطع الكرادة" kind="sector" />) },
  { path: 'zaafaraniya-sector', element: s(<MediaUnitPage title="الزعفرانية" kind="sector" />) },
  { path: 'zaafaraniya-folder', element: s(<MediaUnitPage title="فولدر الزعفرانية" kind="folder" />) },
  { path: 'karrada-folder', element: s(<MediaUnitPage title="فولدر الكرادة" kind="folder" />) },
  { path: 'design-templates', element: s(<MediaUnitPage title="قوالب التصميم" kind="templates" />) },
  { path: 'archive', element: s(<MediaUnitPage title="الأرشيف" kind="archive" />) },
]
