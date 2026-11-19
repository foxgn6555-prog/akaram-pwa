/**
 * فحص تحديثات الـ PWA عند الرجوع للتطبيق، واستعادتها إذا كان هناك SW ينتظر.
 * لا يفعّل التحديث تلقائياً؛ شريط التحديث يترك للمستخدم اختيار وقت إعادة التحميل كي لا يفقد نموذجاً مفتوحاً.
 */
export const PWA_UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000

type UpdateRegistration = Pick<ServiceWorkerRegistration, 'update' | 'waiting'>

interface WatchPwaUpdatesOptions {
  windowTarget?: Window
  documentTarget?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>
  isOnline?: () => boolean
  intervalMs?: number
  onUpdateReady?: () => void
}

/**
 * المتصفح يفحص الـ SW عند التسجيل، لكن جلسات PWA الطويلة قد تُعلَّق فيها المؤقّتات بالخلفية.
 * لذلك نعيد الفحص عند العودة للواجهة/الشبكة، ونُظهر التنبيه مجدداً إذا أغلقه المستخدم سابقاً.
 */
export function watchForPwaUpdates(
  registration: UpdateRegistration,
  options: WatchPwaUpdatesOptions = {},
): () => void {
  const win = options.windowTarget ?? window
  const doc = options.documentTarget ?? document
  const isOnline = options.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine)
  const intervalMs = options.intervalMs ?? PWA_UPDATE_CHECK_INTERVAL_MS
  let checking = false
  let stopped = false

  const check = (): void => {
    if (stopped || doc.visibilityState !== 'visible' || !isOnline()) return
    if (registration.waiting) {
      options.onUpdateReady?.()
      return
    }
    if (checking) return

    checking = true
    try {
      void registration.update().catch(() => undefined).finally(() => { checking = false })
    } catch {
      // قد يرفض المتصفح الفحص (مثلاً أثناء انقطاع الشبكة)؛ سنعيد المحاولة عند الاتصال/العودة أو المؤقّت.
      checking = false
    }
  }
  const checkWhenVisible = (): void => {
    if (doc.visibilityState === 'visible') check()
  }

  doc.addEventListener('visibilitychange', checkWhenVisible)
  win.addEventListener('focus', check)
  win.addEventListener('pageshow', check)
  win.addEventListener('online', check)
  const timer = win.setInterval(check, intervalMs)
  check()

  return () => {
    stopped = true
    doc.removeEventListener('visibilitychange', checkWhenVisible)
    win.removeEventListener('focus', check)
    win.removeEventListener('pageshow', check)
    win.removeEventListener('online', check)
    win.clearInterval(timer)
  }
}
