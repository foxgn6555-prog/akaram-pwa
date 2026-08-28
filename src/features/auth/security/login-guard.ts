/**
 * حارس الدخول (طبقة المتصفح) — UX protection:
 *  · 5 محاولات فاشلة → إقفال محلي 15 دقيقة مع عد تنازلي
 *  · الخادم هو الحاكم دائماً (is_login_locked RPC) — هذا الحارس
 *    يمنع الإزعاج المبكر ويخفف الضغط قبل الوصول للخادم.
 * التخزين: localStorage بمفتاح معزول + انتهاء صلاحية ذاتي.
 */
import { logger } from '@lib/monitoring/logger'

const STORAGE_KEY = 'akram:login-guard'
const MAX_FAILURES = 5
const LOCK_WINDOW_MS = 15 * 60_000

export interface GuardState {
  failures: number
  firstFailureAt: number
  lockedUntil: number
}

function read(): GuardState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as GuardState) : null
  } catch {
    return null
  }
}

function write(state: GuardState | null): void {
  try {
    if (state === null) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    logger.warn('login-guard: تعذر الحفظ في التخزين المحلي', { error })
  }
}

/** يصفّر العداد إذا فاتت نافذة الـ 15 دقيقة */
export function normalizeState(): GuardState | null {
  const state = read()
  if (!state) return null
  if (Date.now() - state.firstFailureAt > LOCK_WINDOW_MS && Date.now() > state.lockedUntil) {
    write(null)
    return null
  }
  return state
}

export interface LockStatus {
  locked: boolean
  remainingMs: number
  failuresLeft: number
}

export function lockStatus(): LockStatus {
  const state = normalizeState()
  if (!state) return { locked: false, remainingMs: 0, failuresLeft: MAX_FAILURES }

  const remainingMs = Math.max(0, state.lockedUntil - Date.now())
  return {
    locked: remainingMs > 0,
    remainingMs,
    failuresLeft: Math.max(0, MAX_FAILURES - state.failures),
  }
}

/** تسجيل فشل — يعيد الحالة بعد التسجيل */
export function recordFailure(): LockStatus {
  const now = Date.now()
  const state = normalizeState()

  if (!state || now - state.firstFailureAt > LOCK_WINDOW_MS) {
    const fresh: GuardState = { failures: 1, firstFailureAt: now, lockedUntil: 0 }
    write(fresh)
    return { locked: false, remainingMs: 0, failuresLeft: MAX_FAILURES - 1 }
  }

  const failures = state.failures + 1
  const locked = failures >= MAX_FAILURES
  const updated: GuardState = {
    ...state,
    failures,
    lockedUntil: locked ? now + LOCK_WINDOW_MS : state.lockedUntil,
  }
  write(updated)

  if (locked) {
    logger.warn('login-guard: إقفال محلي بعد 5 محاولات فاشلة')
  }
  return {
    locked,
    remainingMs: locked ? LOCK_WINDOW_MS : 0,
    failuresLeft: Math.max(0, MAX_FAILURES - failures),
  }
}

/** تسجيل نجاح الدخول — مسح كامل */
export function recordSuccess(): void {
  write(null)
}

/** معايرة الاختبارات — غير موجهة للاستهلاك العام */
export const __internals = { MAX_FAILURES, LOCK_WINDOW_MS, STORAGE_KEY }
