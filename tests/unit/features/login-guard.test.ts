/** واجهة العرض المحلية للقفل الخادمي: لا تُحتسب إخفاقات محلية قابلة للتزوير. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { lockStatus, setServerLock, recordSuccess, __internals } from '@features/auth/security/login-guard'

describe('login-guard (server state presentation only)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T10:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('لا ينشئ قفلاً أو عدّاداً من تلقاء المتصفح', () => {
    expect(lockStatus('employee@akram.iq')).toEqual({ locked: false, remainingMs: 0, failuresLeft: null })
    expect(localStorage.getItem(__internals.STORAGE_KEY)).toBeNull()
  })

  it('يعرض فقط قفلاً وصل من الخادم ويربطه بالبريد المحدد', () => {
    const expiry = Date.now() + __internals.LOCK_DURATION_MS
    expect(setServerLock(expiry, 'employee@akram.iq').locked).toBe(true)
    expect(lockStatus('other@akram.iq').locked).toBe(false)
    expect(lockStatus('EMPLOYEE@AKRAM.IQ').remainingMs).toBe(__internals.LOCK_DURATION_MS)
  })

  it('ينتهي العرض بعد الوقت المحدد', () => {
    const expiry = Date.now() + __internals.LOCK_DURATION_MS
    setServerLock(expiry, 'employee@akram.iq')
    vi.advanceTimersByTime(__internals.LOCK_DURATION_MS + 1)
    expect(lockStatus('employee@akram.iq').locked).toBe(false)
    expect(localStorage.getItem(__internals.STORAGE_KEY)).toBeNull()
  })

  it('نجاح الدخول يمحو قفل البريد نفسه فقط', () => {
    setServerLock(Date.now() + 60_000, 'employee@akram.iq')
    recordSuccess('other@akram.iq')
    expect(lockStatus('employee@akram.iq').locked).toBe(true)
    recordSuccess('employee@akram.iq')
    expect(lockStatus('employee@akram.iq').locked).toBe(false)
  })
})
