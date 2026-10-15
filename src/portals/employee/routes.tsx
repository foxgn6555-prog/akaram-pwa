/** مسارات بوابة المتعهد — الرئيسية، إثبات التواجد والعدد (00258)، إرسال الصور (00257) */

import { lazy } from '@lib/router/lazy'
import { Suspense, type ReactNode } from 'react'
import type { RouteObject } from 'react-router'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

const ContractorDashboard = lazy(() => import('./pages/Dashboard/ContractorDashboard'))
const ContractorAttendancePage = lazy(() => import('./pages/Attendance/ContractorAttendancePage'))
const ContractorPhotosPage = lazy(() => import('./pages/Photos/ContractorPhotosPage'))

const s = (node: ReactNode): ReactNode => (
  <Suspense fallback={<LoadingSpinner fullScreen />}>{node}</Suspense>
)

export const customRoutes: RouteObject[] = [
  { path: '', element: s(<ContractorDashboard />) },
  { path: 'attendance', element: s(<ContractorAttendancePage />) },
  { path: 'photos', element: s(<ContractorPhotosPage />) },
]
