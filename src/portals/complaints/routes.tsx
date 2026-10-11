/** مسارات بوابة الشكاوى؛ كل صفحة تستخدم feature hooks ثم SDK فقط. */

import { lazy } from '@lib/router/lazy'
import { Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const DashboardPage = lazy(() => import('./pages/Dashboard/DashboardPage'))
const InboxPage = lazy(() => import('./pages/Inbox/InboxPage'))
const AssignmentPage = lazy(() => import('./pages/Assignment/AssignmentPage'))
const ProcessingPage = lazy(() => import('./pages/Processing/ProcessingPage'))
const ComplaintDetailPage = lazy(() => import('./pages/Processing/ComplaintDetailPage'))
const TemplatesPage = lazy(() => import('./pages/Templates/TemplatesPage'))
const ReportEditorPage = lazy(() => import('./pages/Templates/ReportEditorPage'))
const DataPage = lazy(() => import('./pages/Data/DataPage'))
const DatabasePage = lazy(() => import('./pages/Database/DatabasePage'))
const SettingsPage = lazy(() => import('./pages/Settings/SettingsPage'))
const ArchivePage = lazy(() => import('./pages/Archive/ArchivePage'))
const SupportPage = lazy(() => import('./pages/Support/SupportPage'))
const GuidancePage = lazy(() => import('./pages/Guidance/GuidancePage'))

const s = (node: ReactNode): ReactNode => (
  <Suspense fallback={<LoadingSpinner fullScreen />}>{node}</Suspense>
)

export const customRoutes: RouteObject[] = [
  { path: '', element: s(<DashboardPage />) },
  { path: 'karrada-sector', element: s(<InboxPage sector="karrada" />) },
  { path: 'zaafaraniya-sector', element: s(<InboxPage sector="zaafaraniya" />) },
  { path: 'assignment', element: s(<AssignmentPage />) },
  { path: 'processing', element: s(<ProcessingPage />) },
  { path: 'items/:id', element: s(<ComplaintDetailPage />) },
  { path: 'templates', element: s(<TemplatesPage />) },
  { path: 'reports/:id', element: s(<ReportEditorPage />) },
  { path: 'data', element: s(<DataPage />) },
  { path: 'database', element: s(<DatabasePage />) },
  { path: 'pages-contact-settings', element: s(<SettingsPage />) },
  { path: 'archive', element: s(<ArchivePage />) },
  { path: 'technical-support', element: s(<SupportPage />) },
  { path: 'guidance', element: s(<GuidancePage />) },
]
