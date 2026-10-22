/**
 * مسارات البوابة التقنية — النمط المعماري الموحد:
 *  · مسار الوحدة → صفحة الوحدة المركزية (Hub: أيقونات صفحاتها + تقاريرها)
 *  · الصفحات الفرعية → شاشات تنفيذية مستقلة
 */
import { lazy } from '@lib/router/lazy'
import { Suspense, type ReactNode } from 'react'
import { Navigate, type RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const ITDashboard = lazy(() => import('@portals/it/pages/Dashboard/ITDashboard'))
const UserManagementHub = lazy(() => import('@portals/it/pages/UserManagement/UserManagementHub'))
const UsersList = lazy(() => import('@portals/it/pages/UserManagement/UsersList'))
const CreateUser = lazy(() => import('@portals/it/pages/UserManagement/CreateUser'))
const ApprovalChainsPage = lazy(() => import('@portals/it/pages/ApprovalChains/ApprovalChainsPage'))
const DisclosureTypesPage = lazy(() => import('@portals/it/pages/UserManagement/DisclosureTypesPage'))   // 00170: أنواع الكشوفات
const MaintenanceWorkshopsPage = lazy(() => import('@portals/it/pages/UserManagement/MaintenanceWorkshopsPage'))   // 00274: ورش الصيانة
const UserDetail = lazy(() => import('@portals/it/pages/UserManagement/UserDetail'))
const DatabaseHub = lazy(() => import('@portals/it/pages/Database/DatabaseHub'))
const DatabaseOverview = lazy(() => import('@portals/it/pages/Database/DatabaseOverview'))
const TableDetailPage = lazy(() => import('@portals/it/pages/Database/TableDetailPage'))
const ConsolePage = lazy(() => import('@portals/it/pages/Console/ConsolePage'))

// ── الوحدات الجديدة (الجولة 4) ──
const BranchesPage = lazy(() => import('@portals/it/pages/Branches/BranchesPage'))
const PermissionsMatrix = lazy(() => import('@portals/it/pages/Permissions/PermissionsMatrix'))
const BiometricPage = lazy(() => import('@portals/it/pages/Integrations/BiometricPage'))
const UnmatchedPeoplePage = lazy(() => import('@portals/hr/pages/Biometric/UnmatchedPeoplePage'))
const AttendanceAuditPage = lazy(() => import('@portals/it/pages/Integrations/biometric/AttendanceAuditPage'))
const GpsPage = lazy(() => import('@portals/it/pages/Integrations/GpsPage'))
const GpsHealthPage = lazy(() => import('@portals/it/pages/Integrations/GpsHealthPage'))   // 00211: سلامة تكامل LVN (منقولة من غرفة العمليات)
const HrPolicyPage = lazy(() => import('@portals/it/pages/Integrations/HrPolicyPage'))
const AutoDeductionsPage = lazy(() => import('@portals/it/pages/Integrations/AutoDeductionsPage'))   // 00195: الاستقطاعات التلقائية — القواعد والنطاق والاستثناءات
const AdvanceTypesPage = lazy(() => import('@portals/it/pages/Integrations/AdvanceTypesPage'))   // 00191: السلف — الأنواع والسياسة
const LiveTrackingSettingsPage = lazy(() => import('@portals/it/pages/Integrations/LiveTrackingSettingsPage'))   // 00288: البث المباشر — الإعدادات
const UpdatesPage = lazy(() => import('@portals/it/pages/Updates/UpdatesPage'))
const ArchivePage = lazy(() => import('@portals/it/pages/Archive/ArchivePage'))
const ColdArchivePage = lazy(() => import('@portals/it/pages/ColdArchive/ColdArchivePage'))
const DataRetentionPage = lazy(() => import('@portals/it/pages/DataRetention/DataRetentionPage'))
const CentralGarageApprovalsPage = lazy(
  () => import('@portals/it/pages/CentralGarage/CentralGarageApprovalsPage'),
)
const DevOpsHub = lazy(() => import('@portals/it/pages/DevOps/DevOpsHub'))   // 00275: دليل التشغيل التقني
const DevOpsGuidePage = lazy(() => import('@portals/it/pages/DevOps/DevOpsGuidePage'))
const DevOpsStatusPage = lazy(() => import('@portals/it/pages/DevOps/DevOpsStatusPage'))
const NotificationPolicyControlPage = lazy(
  () => import('@portals/it/pages/Notifications/NotificationPolicyControlPage'),
)


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
  { path: 'user-management/approval-chains', element: s(<ApprovalChainsPage />) },
  { path: 'user-management/disclosure-types', element: s(<DisclosureTypesPage />) },
  { path: 'user-management/maintenance-workshops', element: s(<MaintenanceWorkshopsPage />) },
  { path: 'user-management/:userId', element: s(<UserDetail />) },

  // ── وحدة قاعدة البيانات ──
  { path: 'database', element: s(<DatabaseHub />) },
  { path: 'database/tables', element: s(<DatabaseOverview />) },
  { path: 'database/tables/:tableName', element: s(<TableDetailPage />) },
  // أخطاء التطبيق انتقلت إلى وحدة Console — نُبقي المسار القديم كتحويل حتى لا تنكسر الروابط المحفوظة
  { path: 'database/errors', element: <Navigate to="/it/console" replace /> },

  // ── وحدة دليل التشغيل التقني (00275) ──
  { path: 'devops', element: s(<DevOpsHub />) },
  { path: 'devops/status', element: s(<DevOpsStatusPage />) },
  { path: 'devops/:slug', element: s(<DevOpsGuidePage />) },

  // ── وحدة Console — رصد الأخطاء الحي لكل البوابات ──
  { path: 'console', element: s(<ConsolePage />) },

  // ── وحدة الفروع ──
  { path: 'branches', element: s(<BranchesPage />) },

  // ── وحدة مصفوفة الصلاحيات ──
  { path: 'permissions', element: s(<PermissionsMatrix />) },

  // ── وحدة التكاملات ──
  { path: 'integrations', element: s(<BiometricPage />) },
  { path: 'integrations/biometric', element: s(<BiometricPage />) },
  { path: 'integrations/biometric/unmatched', element: s(<UnmatchedPeoplePage readOnly />) },
  { path: 'integrations/biometric/attendance-audit', element: s(<AttendanceAuditPage />) },
  { path: 'integrations/gps', element: s(<GpsPage />) },
  { path: 'integrations/gps-health', element: s(<GpsHealthPage />) },
  { path: 'integrations/hr-policy', element: s(<HrPolicyPage />) },
  { path: 'integrations/auto-deductions', element: s(<AutoDeductionsPage />) },
  { path: 'integrations/advances', element: s(<AdvanceTypesPage />) },
  { path: 'integrations/live-tracking', element: s(<LiveTrackingSettingsPage />) },

  // ── وحدة التحديثات والمراقبة ──
  { path: 'updates', element: s(<UpdatesPage />) },
  { path: 'notification-policies', element: s(<NotificationPolicyControlPage />) },

  // ── وحدة الأرشيف ──
  { path: 'archive', element: s(<ArchivePage />) },
  { path: 'central-garage-approvals', element: s(<CentralGarageApprovalsPage />) },
  { path: 'cold-archive', element: s(<ColdArchivePage />) },
  { path: 'data-retention', element: s(<DataRetentionPage />) },

]
