/**
 * مسارات بوابة المدير المفوض — أعمال صافية 100%:
 *  · ''             → الرئيسية (ملخص كل الوحدات + استنتاجات)
 *  · reports        → التقارير الجاهزة (يومي/شهري/نصف سنوي/سنوي) + Excel/PDF
 *  · announcements  → التبليغات (نشر + صادر + وارد)
 *  · approvals      → طلبات الموافقة (00163) · procedures → الإجراءات: إنهاء الخدمة (نطاقه الجميع)
 * لا صفحات تقنية هنا — كل ما هو تقني في بوابة التطوير المركزية /it.
 */
import { lazy } from '@lib/router/lazy'
import { Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const AdminHome = lazy(() => import('./pages/AdminHome'))
const AdminReports = lazy(() => import('./pages/AdminReports'))
const AdminAnnouncements = lazy(() => import('./pages/AdminAnnouncements'))
const ApprovalTasks = lazy(() => import('@portals/admin-ops/pages/Requests/TeamRequestsPage').then((m) => ({ default: () => <m.default title="طلبات الموافقة" /> })))   // 00163: خطوات السلاسل التي تصل المدير المفوض
const ProceduresPage = lazy(() => import('@portals/admin-ops/pages/Procedures/ProceduresPage'))   // 00163: الإجراءات (إنهاء الخدمة — نطاق المدير المفوض: الجميع)
const s = (node: ReactNode): ReactNode => <Suspense fallback={<LoadingSpinner fullScreen />}>{node}</Suspense>

export const customRoutes: RouteObject[] = [
  { path: '', element: s(<AdminHome />) },
  { path: 'reports', element: s(<AdminReports />) },
  { path: 'announcements', element: s(<AdminAnnouncements />) },
  { path: 'approvals', element: s(<ApprovalTasks />) },
  { path: 'procedures', element: s(<ProceduresPage />) },
]
