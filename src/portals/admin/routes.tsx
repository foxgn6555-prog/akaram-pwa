/** مسارات بوابة الإدارة العليا — كل صفحة ملف مستقل داخل هذا المجلد */
import type { RouteObject } from 'react-router'
import AdminDashboard from './pages/Dashboard/AdminDashboard'
import PortalManager from './pages/Portals/PortalManager'
import RoleAssignment from './pages/Portals/RoleAssignment'
import GeneralSettings from './pages/Settings/GeneralSettings'
import AuditLogViewer from './pages/AuditLogs/AuditLogViewer'
import DataBackup from './pages/Backup/DataBackup'

export const customRoutes: RouteObject[] = [
  { path: '', element: <AdminDashboard /> },
  { path: 'portals', element: <PortalManager /> },
  { path: 'roles', element: <RoleAssignment /> },
  { path: 'settings', element: <GeneralSettings /> },
  { path: 'audit-logs', element: <AuditLogViewer /> },
  { path: 'backup', element: <DataBackup /> },
]
