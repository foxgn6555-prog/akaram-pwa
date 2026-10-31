/** مسارات بوابة المدير التنفيذي: الرئيسية · التقارير · التبليغات (الإجراءات التنفيذية تُضاف لاحقاً) */
import { lazy } from '@lib/router/lazy'
import { Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const ExecutiveHome = lazy(() => import('./pages/ExecutiveHome'))
const ExecutiveReports = lazy(() => import('./pages/ExecutiveReports'))
const BehaviorReportsPage = lazy(() => import('@portals/hr/pages/Behavior/BehaviorReportsPage').then((m) => ({ default: () => <m.default readOnly /> })))   // 00249: قراءة فقط
const ExecutiveAnnouncements = lazy(() => import('./pages/ExecutiveAnnouncements'))
const ProceduresPage = lazy(() => import('@portals/admin-ops/pages/Procedures/ProceduresPage').then((m) => ({ default: () => <m.default hero /> })))   // 00163: الإجراءات (إنهاء الخدمة)
const ApprovalTasks = lazy(() => import('@portals/admin-ops/pages/Requests/TeamRequestsPage').then((m) => ({ default: () => <m.default title="طلبات الموافقة" hero /> })))   // 00162: طلبات الموافقة
const ExecReceivablesPage = lazy(() => import('./pages/Treasury/ExecReceivablesPage'))   // 00189
const ExecRewardsPage = lazy(() => import('./pages/Treasury/ExecRewardsPage'))
const ExecLettersPage = lazy(() => import('./pages/Letters/ExecLettersPage'))   // 00357
const ExecGpsPaymentsPage = lazy(() => import('./pages/Treasury/ExecGpsPaymentsPage'))
const ExecEventsPage = lazy(() => import('./pages/Treasury/ExecEventsPage'))
const ExecAttendanceEditsPage = lazy(() => import('./pages/AttendanceEdits/ExecAttendanceEditsPage'))   // 00397-ج
const StopHotspotsPage = lazy(() => import('@portals/ops-room/pages/WasteMap/OpsWasteMapPage').then((m) => ({ default: () => <m.default readOnly testId="executive-stop-hotspots" /> })))   // 00386-أ: خريطة النفايات (قراءة فقط) بدل المحرّك القديم

const s = (node: ReactNode): ReactNode => <Suspense fallback={<LoadingSpinner fullScreen />}>{node}</Suspense>

export const customRoutes: RouteObject[] = [
  { path: '', element: s(<ExecutiveHome />) },
  { path: 'reports', element: s(<ExecutiveReports />) },
  { path: 'announcements', element: s(<ExecutiveAnnouncements />) },
  { path: 'approvals', element: s(<ApprovalTasks />) },
  { path: 'procedures', element: s(<ProceduresPage />) },
  { path: 'receivables', element: s(<ExecReceivablesPage />) },
  { path: 'rewards', element: s(<ExecRewardsPage />) },
  { path: 'letters', element: s(<ExecLettersPage />) },
  { path: 'gps-payments', element: s(<ExecGpsPaymentsPage />) },
  { path: 'events', element: s(<ExecEventsPage />) },
  { path: 'behavior', element: s(<BehaviorReportsPage />) },
  { path: 'attendance-edits', element: s(<ExecAttendanceEditsPage />) },   // 00397-ج قراءة
  { path: 'stop-hotspots', element: s(<StopHotspotsPage />) },
]
