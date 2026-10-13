/**
 * مسارات بوابة معاون المدير المفوض:
 *  · '' → الرئيسية (وارد عاجل + ملخص الشركة)
 *  · reports → التقارير الجاهزة · announcements → التبليغات
 *  · statements → وارد الكشوفات المرفوعة من وحدة الكشوفات · rewards → المكافآت (00203) · deductions → مراجعة الاستقطاعات قبل المالية (00248)
 */
import { lazy } from '@lib/router/lazy'
import { Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const DeputyHome = lazy(() => import('./pages/DeputyHome'))
const DeputyReports = lazy(() => import('./pages/DeputyReports'))
const DeputyAnnouncements = lazy(() => import('./pages/DeputyAnnouncements'))
const IncomingStatements = lazy(() => import('./pages/IncomingStatements'))
const StationFoldersPage = lazy(() => import('./pages/StationFolders/StationFoldersPage'))
const DataAnalysisPage = lazy(() => import('./pages/DataAnalysis/DataAnalysisPage'))
const SectorSupplies = lazy(() => import('./pages/SectorSupplies'))
const DeputyDeductionsPage = lazy(() => import('./pages/Deductions/DeputyDeductionsPage'))   // 00248: مراجعة الاستقطاعات قبل المالية
const DeputyRewardsPage = lazy(() => import('@portals/executive/pages/Treasury/ExecRewardsPage').then((m) => ({ default: () => <m.default actor="deputy" /> })))   // 00203: المكافآت (نفس وحدة التنفيذي)
const ProceduresPage = lazy(() => import('@portals/admin-ops/pages/Procedures/ProceduresPage').then((m) => ({ default: () => <m.default hero /> })))   // 00163: الإجراءات (إنهاء الخدمة)
const ApprovalTasks = lazy(() => import('@portals/admin-ops/pages/Requests/TeamRequestsPage').then((m) => ({ default: () => <m.default title="طلبات الموافقة" hero /> })))   // 00162: طلبات الموافقة (خطوات «حساب محدد» في السلاسل)

const s = (node: ReactNode): ReactNode => (
  <Suspense fallback={<LoadingSpinner fullScreen />}>{node}</Suspense>
)

export const customRoutes: RouteObject[] = [
  { path: '', element: s(<DeputyHome />) },
  { path: 'reports', element: s(<DeputyReports />) },
  { path: 'announcements', element: s(<DeputyAnnouncements />) },
  { path: 'statements', element: s(<IncomingStatements />) },
  { path: 'deductions', element: s(<DeputyDeductionsPage />) },
  { path: 'station-folders', element: s(<StationFoldersPage />) },
  { path: 'data-analysis', element: s(<DataAnalysisPage />) },
  { path: 'sector-supplies', element: s(<SectorSupplies />) },
  { path: 'approvals', element: s(<ApprovalTasks />) },
  { path: 'procedures', element: s(<ProceduresPage />) },
  { path: 'rewards', element: s(<DeputyRewardsPage />) },
]
