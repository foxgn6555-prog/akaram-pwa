/**
 * 00413 — قفل الجلسة عند الخمول (30 دقيقة) للبوابات الحساسة: المالية و/admin.
 *
 * كان الملف فارغًا (`export {}`) والثابت `appConfig.sessionIdleTimeoutMs` بلا مستهلك،
 * والخادم `sessions_inactivity_timeout = 0` ⇒ جلسة مفتوحة إلى الأبد على جهاز مشترك.
 * هنا: مؤقت خمول في الواجهة — يُنبّه قبل دقيقة، ثم يخرج من الحساب ويعيد إلى /login.
 * الحساب نفسه على الخادم (JWT) لم يُغيَّر: هذا قفل شاشة/جلسة على مستوى المتصفح.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Lock } from 'lucide-react'
import { appConfig } from '@config/app.config'
import { useLogout } from '@features/auth/hooks/useAuth'

/** أحداث تُعدّ «نشاطًا» — بلا mousemove حتى لا يُبقي تحرّك الفأرة العابر الجلسة مفتوحة */
export const IDLE_EVENTS = ['mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const

/** فترة السماح للتنبيه قبل القفل */
export const WARN_WINDOW_MS = 60_000

/** قرار نقي قابل للاختبار */
export function idleState(lastActivity: number, now: number, timeoutMs: number): 'active' | 'warning' | 'expired' {
  const idle = now - lastActivity
  if (idle >= timeoutMs) return 'expired'
  if (timeoutMs - idle <= WARN_WINDOW_MS) return 'warning'
  return 'active'
}

export function SessionTimeout({
  enabled,
  timeoutMs = appConfig.sessionIdleTimeoutMs,
  tickMs = 15_000,
}: {
  enabled: boolean
  timeoutMs?: number
  tickMs?: number
}) {
  const navigate = useNavigate()
  const logout = useLogout()
  const lastActivity = useRef<number>(Date.now())
  const expired = useRef(false)
  const [state, setState] = useState<'active' | 'warning' | 'expired'>('active')
  const [secondsLeft, setSecondsLeft] = useState(0)

  const touch = (): void => {
    if (expired.current) return
    lastActivity.current = Date.now()
    setState('active')
  }

  useEffect(() => {
    if (!enabled) return
    lastActivity.current = Date.now()
    expired.current = false
    for (const event of IDLE_EVENTS) window.addEventListener(event, touch, { passive: true })

    const check = (): void => {
      if (expired.current) return
      const now = Date.now()
      const next = idleState(lastActivity.current, now, timeoutMs)
      setState(next)
      setSecondsLeft(Math.max(0, Math.ceil((timeoutMs - (now - lastActivity.current)) / 1000)))
      if (next === 'expired') {
        expired.current = true
        // نمسح الكاش ونخرج — ثم 404/الجذر لا يصلان لأننا ننتقل إلى /login مباشرة
        void logout.mutateAsync().catch(() => undefined).finally(() => navigate('/login', { replace: true }))
      }
    }

    const id = window.setInterval(check, Math.min(tickMs, 5_000))
    check()
    const onVisible = (): void => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      for (const event of IDLE_EVENTS) window.removeEventListener(event, touch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, timeoutMs, tickMs])

  if (!enabled || state !== 'warning') return null

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      data-testid="session-idle-warning"
      className="fixed inset-x-0 bottom-4 z-[120] mx-auto flex w-[min(92vw,34rem)] items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm shadow-xl"
    >
      <Lock size={18} className="shrink-0 text-amber-700" aria-hidden />
      <p className="flex-1 font-bold text-amber-900">
        سيتم قفل الجلسة خلال {secondsLeft} ثانية لعدم النشاط.
      </p>
      <button
        type="button"
        data-testid="session-idle-keep"
        onClick={touch}
        className="h-9 rounded-xl bg-amber-900 px-4 text-xs font-black text-white"
      >
        أنا هنا
      </button>
    </div>
  )
}
