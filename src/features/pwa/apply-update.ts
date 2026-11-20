/**
 * تطبيق تحديث الـSW بشكل مضمون (الجولة ٣-هـ).
 *
 * العطل الذي يصلحه: الضغط على «حدّث الآن» كان يرسل SKIP_WAITING إلى `registration.waiting`
 * ثم ينتظر `controllerchange` ليُعيد التحميل. على iPhone كثيراً ما لا يوجد عامل «منتظر»
 * (نشّط نفسه أو أُلغي) ⇒ لا رسالة تُستقبل ولا حدث يعود ⇒ الزر يدور بلا نهاية ولا جديد.
 *
 * المسار الجديد — ينتهي دائماً بشيء ملموس:
 *  ① إن وُجد عامل منتظر: SKIP_WAITING ثم انتظار التفعيل بمهلة قصيرة.
 *  ② إن لم يوجد: طلب فحص فوري (registration.update) ثم إعادة القراءة.
 *  ③ إن لم يصل التفعيل في المهلة (حالة iOS المعلَّقة): **إعادة تهيئة كاملة** (مسح كاش + إلغاء SW)
 *     ثم تحميل طازج — بدل الدوران الصامت.
 */
import { hardResetApp } from './hard-reset'
import { clearPendingUpdate } from './update-policy'

/** أقصى انتظار لتفعيل العامل الجديد قبل اللجوء إلى الإعادة الكاملة */
export const UPDATE_ACTIVATION_WAIT_MS = 2500

let reloading = false

/** إعادة تحميل واحدة فقط مهما تعدّدت المنادين (controllerchange + مسار التحديث) */
export function safeReload(reload: () => void = () => window.location.reload()): void {
  if (reloading) return
  reloading = true
  clearPendingUpdate()
  reload()
}

/** للاختبارات: تصفير حارس إعادة التحميل */
export function __resetReloadGuard(): void {
  reloading = false
}

/** ما نحتاجه فعلاً من التسجيل — نوع بنيوي كي يسهل اختباره بمزيّف */
export interface UpdateRegistrationLike {
  waiting: ServiceWorker | null
  update: () => Promise<unknown>
}

export interface ApplyUpdateDeps {
  getRegistration?: () => Promise<UpdateRegistrationLike | null | undefined>
  waitMs?: number
  hardReset?: () => Promise<void> | void
  reload?: () => void
  addControllerListener?: (fn: () => void, remove: boolean) => void
}

export type ApplyUpdateOutcome = 'activated' | 'reset' | 'no-worker'

export async function applyPwaUpdate(deps: ApplyUpdateDeps = {}): Promise<ApplyUpdateOutcome> {
  const waitMs = deps.waitMs ?? UPDATE_ACTIVATION_WAIT_MS
  const reload = deps.reload ?? (() => window.location.reload())
  const hardReset = deps.hardReset ?? (() => hardResetApp())
  const getRegistration: NonNullable<ApplyUpdateDeps['getRegistration']> = deps.getRegistration
    ?? (async () => (typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? (navigator.serviceWorker.getRegistration() as Promise<UpdateRegistrationLike | undefined>)
      : undefined))
  const listen = deps.addControllerListener ?? ((fn, remove) => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    if (remove) navigator.serviceWorker.removeEventListener('controllerchange', fn)
    else navigator.serviceWorker.addEventListener('controllerchange', fn)
  })

  let registration: UpdateRegistrationLike | null | undefined = null
  try {
    registration = await getRegistration()
  } catch {
    registration = null
  }

  let waiting = registration?.waiting ?? null

  // ② لا منتظر ⇒ نطلب فحصاً فورياً (قد يكون الإصدار الجديد لم يُنزَّل بعد)
  if (!waiting && registration) {
    try {
      await Promise.race([
        registration.update(),
        new Promise((resolve) => setTimeout(resolve, waitMs)),
      ])
    } catch { /* فشل الفحص — نكمل إلى الإعادة */ }
    waiting = registration.waiting ?? null
  }

  if (!waiting) {
    // لا يوجد ما يُفعّل: تحميل طازج مباشرة (لا نقرة ميتة)
    safeReload(reload)
    return 'no-worker'
  }

  // ① تفعيل العامل المنتظر ثم إعادة تحميل واحدة
  const activated = await new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (ok: boolean): void => {
      if (settled) return
      settled = true
      listen(onControllerChange, true)
      clearTimeout(timer)
      resolve(ok)
    }
    const onControllerChange = (): void => finish(true)
    listen(onControllerChange, false)
    const timer = setTimeout(() => finish(false), waitMs)
    try {
      waiting!.postMessage({ type: 'SKIP_WAITING' })
      waiting!.postMessage('SKIP_WAITING')
    } catch { /* العامل أُلغي بين القراءة والإرسال */ }
  })

  if (activated) {
    safeReload(reload)
    return 'activated'
  }

  // ③ الحالة المعلَّقة: لا نترك المستخدم يدور — إعادة تهيئة كاملة ثم تحميل طازج
  try {
    await hardReset()
  } catch {
    safeReload(reload)
  }
  return 'reset'
}
