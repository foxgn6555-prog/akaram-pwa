/**
 * مسارات بوابة المحطة التحويلية — النمط الموحد:
 *  · ''        → لوحة التقارير (الداشبورد)
 *  · weights   → صفحة الأوزان (النموذج + الدفتر + التصدير)
 *  · weights/log → نفس وحدة الأوزان (الإدخال)
 *  · fines     → الغرامات (قيد الإنشاء)
 *  · archive   → أرشيف المحطة (الحذف/الأرشفة نحو IT)
 */
import { lazy, Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const StationDashboard = lazy(() => import('./pages/Dashboard/StationDashboard'))
const WeightsPage = lazy(() => import('./pages/Weights/WeightsPage'))
const FinesPage = lazy(() => import('./pages/Fines/FinesPage'))
const StationArchivePage = lazy(() => import('./pages/Archive/StationArchivePage'))

const s = (node: ReactNode): ReactNode => (
  <Suspense fallback={<LoadingSpinner fullScreen />}>{node}</Suspense>
)

export const customRoutes: RouteObject[] = [
  { path: '', element: s(<StationDashboard />) },
  { path: 'weights', element: s(<WeightsPage />) },
  { path: 'weights/log', element: s(<WeightsPage />) },
  { path: 'fines', element: s(<FinesPage />) },
  { path: 'archive', element: s(<StationArchivePage />) },
]
