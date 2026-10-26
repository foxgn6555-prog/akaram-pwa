/** نقطة الدخول — المراقبة أولاً ثم التركيب */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initMonitoring } from '@lib/monitoring/sentry'
import { installConsoleCapture } from '@lib/console/capture'
import { system } from '@sdk/system.sdk'
import { reloadOnce } from '@lib/router/lazy'
import { installPwaListeners, pwaStore } from '@features/pwa/pwa.store'
import App from './App'
import './styles/globals.css'

initMonitoring()

// قطعة قديمة بعد نشر جديد أو إعادة تحسين اعتماديات Vite: إعادة تحميل واحدة بدل شاشة خطأ ميتة
window.addEventListener('vite:preloadError', (e) => { if (reloadOnce('preload')) e.preventDefault() })

// Console (التطوير المركزية): رصد حي لكل أخطاء وتنبيهات المنصة من كل البوابات — آمن الفشل ومحدود المعدل
installConsoleCapture({ send: (events) => system.consoleReport(events) })

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// 00349 B: التقاط حدث التثبيت (Android/Chrome) ورصد اكتماله — يغذّي زر «ثبّت التطبيق»
installPwaListeners()

// تسجيل SW فقط في الإنتاج — في dev يتعارض مع HMR ويخزن ردوداً قديمة
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // 00349 B: registerType = prompt — الإصدار الجديد ينتظر حتى يضغط المستخدم «حدّث الآن»
  // (كي لا يفقد نموذجاً يملؤه)؛ عندها يُرسل SKIP_WAITING ويسيطر الـ SW الجديد فنعيد التحميل مرة واحدة.
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    window.location.reload()
  })
  void import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh: () => pwaStore.setNeedRefresh(updateSW),
      // فحص دوري للتحديثات كل ساعة (المتصفح يفحص عند كل تحميل؛ هذا للجلسات الطويلة المفتوحة)
      onRegisteredSW: (_url, reg) => { if (reg) window.setInterval(() => void reg.update(), 60 * 60 * 1000) },
    })
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
