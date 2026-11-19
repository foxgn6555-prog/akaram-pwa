/** نقطة الدخول — المراقبة أولاً ثم التركيب */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { initMonitoring, Sentry } from '@lib/monitoring/sentry'
import { APP_VERSION } from '@config/build-info'
import { installConsoleCapture } from '@lib/console/capture'
import { system } from '@sdk/system.sdk'
import { reloadOnce } from '@lib/router/lazy'
import { installPwaListeners, pwaStore } from '@features/pwa/pwa.store'
import { watchForPwaUpdates } from '@features/pwa/update-check'
import App from './App'
// خط عربي مستضاف ذاتياً: يمنع اعتماد التخطيط على خط النظام (تفاوت عرضه يسبب انزياحاً على الهاتف).
import '@fontsource/cairo/400.css'
import '@fontsource/cairo/500.css'
import '@fontsource/cairo/600.css'
import '@fontsource/cairo/700.css'
import '@fontsource/cairo/900.css'
import './styles/globals.css'

initMonitoring()

// بصمة البناء على <html> — تُقرأ من أدوات الدعم («أي نسخة عندك؟») دون أي أثر بصري
document.documentElement.dataset.appVersion = APP_VERSION

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
      // إعادة التحميل مصدرها الوحيد مستمع controllerchange أدناه. القيمة الفارغة هنا
      // تُلغي إعادة التحميل الثانية التي يضيفها vite-plugin-pwa في وضع prompt (كانتا تتزاحمان).
      onNeedReload: () => undefined,
      // فشل تسجيل الـ SW صامت افتراضياً؛ لو فشل مرة فلن تصل تحديثات أبداً — نسجّله للمراقبة
      onRegisterError: (error) => {
        console.error('[pwa] تعذّر تسجيل عامل الخدمة', error)
        Sentry.captureException(error)
      },
      // فحص عند العودة للتطبيق/الشبكة أيضاً؛ مؤقّتات الخلفية كل ساعة قد تُعلّقها أنظمة الهاتف.
      // إن كان هناك SW ينتظر بعد إخفاء الشريط سابقاً، نعيد عرض خيار التحديث دون فرض إعادة التحميل.
      onRegisteredSW: (_url, reg) => {
        if (reg) {
          watchForPwaUpdates(reg, {
            onUpdateReady: () => {
              if (!pwaStore.getState().needRefresh) pwaStore.setNeedRefresh(updateSW)
            },
          })
        }
      },
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
