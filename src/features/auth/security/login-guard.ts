/**
 * واجهة العرض المحلية لقفل فرضه الخادم فقط.
 * لا تُحتسب الإخفاقات في المتصفح؛ استجابة staff-login هي المصدر الموثوق.
 * القفل المحلي مربوط بالبريد حتى لا يمنع حساباً آخر على الجهاز نفسه.
 */
import { logger } from '@lib/monitoring/logger'

const STORAGE_KEY = 'akram:server-login-lock'
const LOCK_DURATION_MS = 5 * 60_000
interface StoredLock { email: string; lockedUntil: number }
export interface LockStatus { locked: boolean; remainingMs: number; failuresLeft: number | null }

function read(): StoredLock | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredLock>
    if (typeof parsed.email !== 'string' || !Number.isFinite(parsed.lockedUntil)) return null
    return { email: parsed.email, lockedUntil: Number(parsed.lockedUntil) }
  } catch { return null }
}

/** يخزن موعد انتهاء أرسله الخادم، للعرض فقط. */
export function setServerLock(lockedUntil: string | number, email: string): LockStatus {
  const timestamp = typeof lockedUntil === 'number' ? lockedUntil : Date.parse(lockedUntil)
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) return lockStatus(email)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ email: email.trim().toLowerCase(), lockedUntil: timestamp }))
  } catch (error) {
    logger.warn('login-guard: تعذر حفظ موعد انتهاء القفل المبلّغ من الخادم', { error })
  }
  return lockStatus(email)
}

export function lockStatus(email = ''): LockStatus {
  const state = read()
  if (!state || state.email !== email.trim().toLowerCase()) return { locked: false, remainingMs: 0, failuresLeft: null }
  const remainingMs = Math.max(0, state.lockedUntil - Date.now())
  if (!remainingMs) clearLocalLock()
  return { locked: remainingMs > 0, remainingMs, failuresLeft: null }
}

export function recordSuccess(email?: string): void {
  if (!email || read()?.email === email.trim().toLowerCase()) clearLocalLock()
}

function clearLocalLock(): void {
  try { localStorage.removeItem(STORAGE_KEY) }
  catch (error) { logger.warn('login-guard: تعذر مسح القفل المحلي', { error }) }
}

export const __internals = { LOCK_DURATION_MS, STORAGE_KEY }
