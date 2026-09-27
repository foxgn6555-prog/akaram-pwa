/**
 * مسارات بوابة المدير المفوض — أعمال صافية 100%:
 *  · ''             → الرئيسية (ملخص كل الوحدات + استنتاجات)
 *  · reports        → التقارير الجاهزة (يومي/شهري/نصف سنوي/سنوي) + Excel/PDF
 *  · announcements  → التبليغات (نشر + صادر + وارد)
 * لا صفحات تقنية هنا — كل ما هو تقني في بوابة التطوير المركزية /it.
 */
import { lazy } from '@lib/router/lazy'
import { Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const AdminHome = lazy(() => import('./pages/AdminHome'))
const AdminReports = lazy(() => import('./pages/AdminReports'))
const AdminAnnouncements = lazy(() => import('./pages/AdminAnnouncements'))
const s = (node: ReactNode): ReactNode => <Suspense fallback={<LoadingSpinner fullScreen />}>{node}</Suspense>

export const customRoutes: RouteObject[] = [
  { path: '', element: s(<AdminHome />) },
  { path: 'reports', element: s(<AdminReports />) },
  { path: 'announcements', element: s(<AdminAnnouncements />) },
]
