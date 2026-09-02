/**
 * مسارات بوابة المحطة التحويلية — النمط الموحد:
 *  · ''          → لوحة التقارير (الداشبورد)
 *  · weights     → صفحة الأوزان (النموذج + الدفتر + التصدير)
 *  · weights/log → نفس وحدة الأوزان (الإدخال)
 *  · saksat      → السكسات الخارجة (هيكل أولي — المحتوى لاحقاً)
 *  · trips       → النسافات الخارجة (هيكل أولي — المحتوى لاحقاً)
 *  · fines       → الغرامات (قيد الإنشاء)
 *  · archive     → أرشيف المحطة (الحذف/الأرشفة نحو IT)
 *
 * ملاحظة: أُلغيت وحدة «الحضورية» من هذه البوابة — الحضور والانصراف من اختصاص
 * بوابة الموارد البشرية (HR) ولا يُدار هنا.
 */
import { lazy, Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const StationDashboard = lazy(() => import('./pages/Dashboard/StationDashboard'))
const WeightsPage = lazy(() => import('./pages/Weights/WeightsPage'))
const SaksatPage = lazy(() => import('./pages/Saksat/SaksatPage'))
const TripsPage = lazy(() => import('./pages/Trips/TripsPage'))
const FinesPage = lazy(() => import('./pages/Fines/FinesPage'))
const StationArchivePage = lazy(() => import('./pages/Archive/StationArchivePage'))

const s = (node: ReactNode): ReactNode => (
  <Suspense fallback={<LoadingSpinner fullScreen />}>{node}</Suspense>
)

export const customRoutes: RouteObject[] = [
  { path: '', element: s(<StationDashboard />) },
  { path: 'weights', element: s(<WeightsPage />) },
  { path: 'weights/log', element: s(<WeightsPage />) },
  { path: 'saksat', element: s(<SaksatPage />) },
  { path: 'trips', element: s(<TripsPage />) },
  { path: 'fines', element: s(<FinesPage />) },
  { path: 'archive', element: s(<StationArchivePage />) },
]
