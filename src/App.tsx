/** جذر التطبيق — تركيب المزودات فقط، لا منطق أعمال */
import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { RouterProvider } from 'react-router'
import { queryClient } from '@config/query-client.config'
import { router } from '@router/index'
import { ErrorBoundary } from '@components/feedback/ErrorBoundary'
import { OfflineBanner } from '@components/feedback/OfflineBanner'
import { UpdateBanner } from '@features/pwa/PwaBanners'
import { startSessionWatch } from '@features/auth/session-watch'
import { ShiftRegistryLoader } from '@features/hr-shifts/hooks'
import './i18n'

export default function App() {
  // 00312: انتهاء الجلسة أثناء العمل داخل بوابة → تسجيل الدخول فوراً
  useEffect(() => startSessionWatch(router), [])
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <OfflineBanner />
        <UpdateBanner />
        <ShiftRegistryLoader />
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
