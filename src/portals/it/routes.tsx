/**
 * مسارات البوابة التقنية — النمط المعماري الموحد:
 *  · مسار الوحدة → صفحة الوحدة المركزية (Hub: أيقونات صفحاتها + تقاريرها)
 *  · الصفحات الفرعية → شاشات تنفيذية مستقلة
 */
import { lazy, Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const ITDashboard = lazy(() => import('@portals/it/pages/Dashboard/ITDashboard'))
const UserManagementHub = lazy(() => import('@portals/it/pages/UserManagement/UserManagementHub'))
const UsersList = lazy(() => import('@portals/it/pages/UserManagement/UsersList'))
const CreateUser = lazy(() => import('@portals/it/pages/UserManagement/CreateUser'))
const UserDetail = lazy(() => import('@portals/it/pages/UserManagement/UserDetail'))
const DepartmentsPage = lazy(() => import('@portals/it/pages/UserManagement/DepartmentsPage'))
const DatabaseHub = lazy(() => import('@portals/it/pages/Database/DatabaseHub'))
const DatabaseOverview = lazy(() => import('@portals/it/pages/Database/DatabaseOverview'))
const TableDetailPage = lazy(() => import('@portals/it/pages/Database/TableDetailPage'))
const ErrorLogs = lazy(() => import('@portals/it/pages/Database/ErrorLogs'))

// ── الوحدات الجديدة (الجولة 4) ──
const BranchesPage = lazy(() => import('@portals/it/pages/Branches/BranchesPage'))
const PermissionsMatrix = lazy(() => import('@portals/it/pages/Permissions/PermissionsMatrix'))
const BiometricPage = lazy(() => import('@portals/it/pages/Integrations/BiometricPage'))
const GpsPage = lazy(() => import('@portals/it/pages/Integrations/GpsPage'))
const UpdatesPage = lazy(() => import('@portals/it/pages/Updates/UpdatesPage'))
const ArchivePage = lazy(() => import('@portals/it/pages/Archive/ArchivePage'))

const s = (node: ReactNode): ReactNode => (
  <Suspense fallback={<LoadingSpinner fullScreen />}>{node}</Suspense>
)

export const customRoutes: RouteObject[] = [
  // الرئيسية (فهرس البوابة)
  { path: '', element: s(<ITDashboard />) },

  // ── وحدة إدارة المستخدمين ──
  { path: 'user-management', element: s(<UserManagementHub />) },
  { path: 'user-management/list', element: s(<UsersList />) },
  { path: 'user-management/create', element: s(<CreateUser />) },
  { path: 'user-management/departments', element: s(<DepartmentsPage />) },
  { path: 'user-management/:userId', element: s(<UserDetail />) },

  // ── وحدة قاعدة البيانات ──
  { path: 'database', element: s(<DatabaseHub />) },
  { path: 'database/tables', element: s(<DatabaseOverview />) },
  { path: 'database/tables/:tableName', element: s(<TableDetailPage />) },
  { path: 'database/errors', element: s(<ErrorLogs />) },

  // ── وحدة الفروع ──
  { path: 'branches', element: s(<BranchesPage />) },

  // ── وحدة مصفوفة الصلاحيات ──
  { path: 'permissions', element: s(<PermissionsMatrix />) },

  // ── وحدة التكاملات ──
  { path: 'integrations', element: s(<BiometricPage />) },
  { path: 'integrations/biometric', element: s(<BiometricPage />) },
  { path: 'integrations/gps', element: s(<GpsPage />) },

  // ── وحدة التحديثات والمراقبة ──
  { path: 'updates', element: s(<UpdatesPage />) },

  // ── وحدة الأرشيف ──
  { path: 'archive', element: s(<ArchivePage />) },
]
