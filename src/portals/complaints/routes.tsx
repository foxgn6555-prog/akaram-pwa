/** مسارات بوابة الشكاوى؛ كل صفحة تستخدم feature hooks ثم SDK فقط. */
import type { RouteObject } from 'react-router'
import DashboardPage from './pages/Dashboard/DashboardPage'
import InboxPage from './pages/Inbox/InboxPage'
import AssignmentPage from './pages/Assignment/AssignmentPage'
import ProcessingPage from './pages/Processing/ProcessingPage'
import ComplaintDetailPage from './pages/Processing/ComplaintDetailPage'
import TemplatesPage from './pages/Templates/TemplatesPage'
import ReportEditorPage from './pages/Templates/ReportEditorPage'
import DataPage from './pages/Data/DataPage'
import SettingsPage from './pages/Settings/SettingsPage'
import ArchivePage from './pages/Archive/ArchivePage'
import SupportPage from './pages/Support/SupportPage'

export const customRoutes: RouteObject[] = [
  { path: '', element: <DashboardPage /> },
  { path: 'karrada-sector', element: <InboxPage sector="karrada" /> },
  { path: 'zaafaraniya-sector', element: <InboxPage sector="zaafaraniya" /> },
  { path: 'assignment', element: <AssignmentPage /> },
  { path: 'processing', element: <ProcessingPage /> },
  { path: 'items/:id', element: <ComplaintDetailPage /> },
  { path: 'templates', element: <TemplatesPage /> },
  { path: 'reports/:id', element: <ReportEditorPage /> },
  { path: 'data', element: <DataPage /> },
  { path: 'pages-contact-settings', element: <SettingsPage /> },
  { path: 'archive', element: <ArchivePage /> },
  { path: 'technical-support', element: <SupportPage /> },
]
