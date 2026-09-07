/** نقطة الدخول — المراقبة أولاً ثم التركيب */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initMonitoring } from '@lib/monitoring/sentry'
import { onErrorReport } from '@lib/monitoring/logger'
import { system } from '@sdk/system.sdk'
import App from './App'
import './styles/globals.css'

initMonitoring()

// تبلّغ الأخطاء إلى وحدة قاعدة البيانات — آمن الفشل ومحدود المعدل
onErrorReport((error, context) => {
  void system.reportError({
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
    context,
  })
})

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// تسجيل SW فقط في الإنتاج — في dev يتعارض مع HMR ويخزن ردوداً قديمة
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // إعادة تحميل واحدة آمنة عندما يسيطر SW جديد — تضمن وصول تحديثات
  // الواجهة (تصميم/إصلاحات) فوراً بدل البقاء على نسخة قديمة مخزنة
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    window.location.reload()
  })
  void import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true })
  })
}

// في dev: ألغِ أي SW قديم مسجل من جلسات سابقة
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const reg of regs) {
      void reg.unregister()
      console.info('[dev] Service Worker قديم أُلغي تسجيله تلقائياً')
    }
  })
}
