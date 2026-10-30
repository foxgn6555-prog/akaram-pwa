import { useParams } from 'react-router'
import { lazy } from '@lib/router/lazy'
import { Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const MediaDashboardPage = lazy(() => import('./pages/MediaDashboardPage'))
const MediaTicketsPage = lazy(() => import('./pages/Tickets/MediaTicketsPage'))
const MediaFolderPage = lazy(() => import('./pages/Folders/MediaFolderPage'))
const MediaDesignsPage = lazy(() => import('./pages/Designs/MediaDesignsPage'))
const MediaTemplatesPage = lazy(() => import('./pages/Templates/MediaTemplatesPage'))
const MediaArchivePage = lazy(() => import('./pages/Archive/MediaArchivePage'))

const s = (node: ReactNode): ReactNode => <Suspense fallback={<LoadingSpinner fullScreen />}>{node}</Suspense>

/** 00395: تذاكر/فولدر أي قطاع مضاف من التطوير المركزية حسب رمزه في المسار */
function SectorTicketsRoute() { const { code = '' } = useParams(); return <MediaTicketsPage sector={code} /> }
function SectorFolderRoute() { const { code = '' } = useParams(); return <MediaFolderPage sector={code} /> }

export const customRoutes: RouteObject[] = [
  { path: '', element: s(<MediaDashboardPage />) },
  { path: 'karrada-sector', element: s(<MediaTicketsPage sector="karrada" />) },
  { path: 'zaafaraniya-sector', element: s(<MediaTicketsPage sector="zaafaraniya" />) },
  { path: 'karrada-folder', element: s(<MediaFolderPage sector="karrada" />) },
  { path: 'zaafaraniya-folder', element: s(<MediaFolderPage sector="zaafaraniya" />) },
  { path: 'sector/:code', element: s(<SectorTicketsRoute />) },
  { path: 'folder/:code', element: s(<SectorFolderRoute />) },
  { path: 'designs', element: s(<MediaDesignsPage />) },
  { path: 'design-templates', element: s(<MediaTemplatesPage />) },
  { path: 'archive', element: s(<MediaArchivePage />) },
]
