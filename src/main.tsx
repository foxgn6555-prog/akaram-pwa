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
import { canApplyWhileHidden, clearPendingUpdate, readPendingUpdate } from '@features/pwa/update-policy'
import { applyPwaUpdate, safeReload } from '@features/pwa/apply-update'
import { watchPublishedVersion } from '@features/pwa/version-watch'
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
// ٣-هـ: إشارة الإقلاع ترفعها App.tsx بعد التركيب الفعلي (انظر تعليق الحارس في public/boot-watchdog.js)
declare global { interface Window { __akaramBooted?: boolean; akaramHardReset?: () => void } }

// 00349 B: التقاط حدث التثبيت (Android/Chrome) ورصد اكتماله — يغذّي زر «ثبّت التطبيق»
installPwaListeners()

// تسجيل SW فقط في الإنتاج — في dev يتعارض مع HMR ويخزن ردوداً قديمة
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // 00349 B: registerType = prompt — الإصدار الجديد ينتظر حتى يضغط المستخدم «حدّث الآن»
  // (كي لا يفقد نموذجاً يملؤه)؛ عندها يُرسل SKIP_WAITING ويسيطر الـ SW الجديد فنعيد التحميل مرة واحدة.
  // سياسة التأجيل: متابعة الحدّ الزمني، والتطبيق التلقائي في لحظة خمول آمنة
  // التطبيق يمرّ دائمًا عبر applyPwaUpdate المضمون (لا الزر الميت ولا الدوران الصامت)
  const applyUpdateForStore = async (): Promise<void> => { await applyPwaUpdate() }
  let lastInteractionAt = Date.now()
  const noteInteraction = (): void => { lastInteractionAt = Date.now() }
  for (const evt of ['pointerdown', 'keydown', 'touchstart'] as const) {
    window.addEventListener(evt, noteInteraction, { passive: true })
  }
  const enforceUpdatePolicy = (): void => {
    if (!pwaStore.getState().needRefresh) return
    const now = Date.now()
    pwaStore.refreshUpdateUrgency(now)
    const pending = readPendingUpdate()
    // الصفحة مخفية والمستخدم خامل ≥60 ثانية ⇒ لا إدخال جارٍ يُفقد: نطبّق التحديث بصمت
    if (canApplyWhileHidden(pending, now, lastInteractionAt, document.visibilityState === 'hidden')) {
      pwaStore.setUpdatesApplied()
      // مسار التطبيق الصامت يستخدم نفس منطق «حدّث الآن» المضمون (ينتهي دائمًا ببناء طازج)
      void applyPwaUpdate()
    }
  }
  document.addEventListener('visibilitychange', enforceUpdatePolicy)
  window.setInterval(enforceUpdatePolicy, 60_000)

  // إعادة التحميل بعد سيطرة إصدار جديد تمر عبر safeReload: تحميل واحد فقط مهما
  // تزامن مسار «حدّث الآن» مع حدث controllerchange (كانا يتزاحمان فيُعاد التحميل مرتين).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    clearPendingUpdate()
    safeReload()
  })
  // ٣-هـ: فحص إصدار مستقل عن الـSW — يكشف النشر الجديد على iPhone حتى لو بقي العامل القديم
  watchPublishedVersion({
    currentVersion: APP_VERSION,
    onOutdated: () => {
      if (!pwaStore.getState().needRefresh) pwaStore.setNeedRefresh(applyUpdateForStore)
    },
  })

  void import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({
      immediate: true,
      onNeedRefresh: () => pwaStore.setNeedRefresh(applyUpdateForStore),
      // أول تثبيت ناجح: نُخبر المستخدم أن التطبيق صار يعمل دون اتصال
      onOfflineReady: () => pwaStore.setOfflineReady(),
      // إعادة التحميل يتولاها safeReload (حارس يُبقيها مرة واحدة). القيمة الفارغة هنا
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
              if (!pwaStore.getState().needRefresh) pwaStore.setNeedRefresh(applyUpdateForStore)
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
