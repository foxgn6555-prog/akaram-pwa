/** جذر التطبيق — تركيب المزودات فقط، لا منطق أعمال */
import { QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { RouterProvider } from 'react-router'
import { queryClient } from '@config/query-client.config'
import { router } from '@router/index'
import { ErrorBoundary } from '@components/feedback/ErrorBoundary'
import { OfflineBanner } from '@components/feedback/OfflineBanner'
import { OfflineReadyBanner, UpdateBanner } from '@features/pwa/PwaBanners'
import { startSessionWatch } from '@features/auth/session-watch'
import { ShiftRegistryLoader } from '@features/hr-shifts/hooks'
import { SectorsRegistryLoader } from '@features/sectors/labels'   // 00394: القطاعات من القاعدة
import './i18n'

export default function App() {
  // 00312: انتهاء الجلسة أثناء العمل داخل بوابة → تسجيل الدخول فوراً
  useEffect(() => startSessionWatch(router), [])
  // ٣-هـ: إشارة الإقلاع الناجح لحارس الإقلاع — تُرفع بعد التركيب الفعلي لا قبله،
  // فلو انهار React وبقي <div id="root"> فارغاً يبقى الحارس قادراً على الاسترداد.
  useEffect(() => {
    window.__akaramBooted = true
    try { sessionStorage.removeItem('akaram.boot.recoveryAt') } catch { /* تخزين محجوب */ }
  }, [])
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {/* إطار بارتفاع واحد: اللافتات العامة لا تُضاف فوق ارتفاع 100dvh فتقصّ أسفل الهاتف. */}
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <OfflineBanner />
          <UpdateBanner />
          <OfflineReadyBanner />
          <ShiftRegistryLoader />
          <SectorsRegistryLoader />
          <div className="min-h-0 flex-1">
            <RouterProvider router={router} />
          </div>
        </div>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
