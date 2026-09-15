import { lazy, Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const MediaDashboardPage = lazy(() => import('./pages/MediaDashboardPage'))
const MediaUnitPage = lazy(() => import('./pages/MediaUnitPage'))
const MediaTicketsPage = lazy(() => import('./pages/Tickets/MediaTicketsPage'))
const MediaFolderPage = lazy(() => import('./pages/Folders/MediaFolderPage'))
const MediaDesignsPage = lazy(() => import('./pages/Designs/MediaDesignsPage'))
const MediaArchivePage = lazy(() => import('./pages/Archive/MediaArchivePage'))

const s = (node: ReactNode): ReactNode => <Suspense fallback={<LoadingSpinner fullScreen />}>{node}</Suspense>

export const customRoutes: RouteObject[] = [
  { path: '', element: s(<MediaDashboardPage />) },
  { path: 'karrada-sector', element: s(<MediaTicketsPage sector="karrada" />) },
  { path: 'zaafaraniya-sector', element: s(<MediaTicketsPage sector="zaafaraniya" />) },
  { path: 'karrada-folder', element: s(<MediaFolderPage sector="karrada" />) },
  { path: 'zaafaraniya-folder', element: s(<MediaFolderPage sector="zaafaraniya" />) },
  { path: 'designs', element: s(<MediaDesignsPage />) },
  { path: 'design-templates', element: s(<MediaUnitPage title="قوالب التصميم" kind="templates" />) },
  { path: 'archive', element: s(<MediaArchivePage />) },
]
