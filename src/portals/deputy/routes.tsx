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
const BehaviorReportsPage = lazy(() => import('@portals/hr/pages/Behavior/BehaviorReportsPage').then((m) => ({ default: () => <m.default readOnly /> })))   // 00249: قراءة فقط
const StopHotspotsPage = lazy(() => import('@portals/ops-room/pages/WasteMap/OpsWasteMapPage').then((m) => ({ default: () => <m.default readOnly testId="deputy-stop-hotspots" /> })))   // 00386-أ: خريطة النفايات (قراءة فقط) بدل المحرّك القديم
const DeputyAnnouncements = lazy(() => import('./pages/DeputyAnnouncements'))
const IncomingStatements = lazy(() => import('./pages/IncomingStatements'))
const StationFoldersPage = lazy(() => import('./pages/StationFolders/StationFoldersPage'))
const DataAnalysisPage = lazy(() => import('./pages/DataAnalysis/DataAnalysisPage'))
const SectorSupplies = lazy(() => import('./pages/SectorSupplies'))
const DeputyDeductionsPage = lazy(() => import('./pages/Deductions/DeputyDeductionsPage'))   // 00248: مراجعة الاستقطاعات قبل المالية
const DeputyRentedTaxPage = lazy(() => import('./pages/RentedTax/DeputyRentedTaxPage'))   // 00251: ضريبة الآليات المؤجرة
const DeputyOvertimePage = lazy(() => import('./pages/Overtime/DeputyOvertimePage'))   // 00353: الساعات الإضافية المدفوعة
const DeputyAttendanceEditsPage = lazy(() => import('./pages/AttendanceEdits/DeputyAttendanceEditsPage'))   // 00397-ج
const DeputyRewardsPage = lazy(() => import('@portals/executive/pages/Treasury/ExecRewardsPage').then((m) => ({ default: () => <m.default actor="deputy" /> })))   // 00203: المكافآت (نفس وحدة التنفيذي)
const DeputyLettersPage = lazy(() => import('@portals/executive/pages/Letters/ExecLettersPage').then((m) => ({ default: () => <m.default actor="deputy" /> })))   // 00357
const ProceduresPage = lazy(() => import('@portals/admin-ops/pages/Procedures/ProceduresPage').then((m) => ({ default: () => <m.default hero /> })))   // 00163: الإجراءات (إنهاء الخدمة)
const ApprovalTasks = lazy(() => import('@portals/admin-ops/pages/Requests/TeamRequestsPage').then((m) => ({ default: () => <m.default title="طلبات الموافقة" hero /> })))   // 00162: طلبات الموافقة (خطوات «حساب محدد» في السلاسل)

const s = (node: ReactNode): ReactNode => (
  <Suspense fallback={<LoadingSpinner fullScreen />}>{node}</Suspense>
)

export const customRoutes: RouteObject[] = [
  { path: '', element: s(<DeputyHome />) },
  { path: 'reports', element: s(<DeputyReports />) },
  { path: 'behavior', element: s(<BehaviorReportsPage />) },
  { path: 'announcements', element: s(<DeputyAnnouncements />) },
  { path: 'statements', element: s(<IncomingStatements />) },
  { path: 'deductions', element: s(<DeputyDeductionsPage />) },
  { path: 'rented-tax', element: s(<DeputyRentedTaxPage />) },
  { path: 'overtime', element: s(<DeputyOvertimePage />) },
  { path: 'attendance-edits', element: s(<DeputyAttendanceEditsPage />) },   // 00397-ج
  { path: 'station-folders', element: s(<StationFoldersPage />) },
  { path: 'data-analysis', element: s(<DataAnalysisPage />) },
  { path: 'stop-hotspots', element: s(<StopHotspotsPage />) },
  { path: 'sector-supplies', element: s(<SectorSupplies />) },
  { path: 'approvals', element: s(<ApprovalTasks />) },
  { path: 'procedures', element: s(<ProceduresPage />) },
  { path: 'rewards', element: s(<DeputyRewardsPage />) },
  { path: 'letters', element: s(<DeputyLettersPage />) },
]
