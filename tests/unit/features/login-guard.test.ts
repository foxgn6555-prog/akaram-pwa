/** اختبارات حارس الدخول المحلي: 5 محاولات → قفل 15 دقيقة → مسح عند النجاح */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  lockStatus,
  recordFailure,
  recordSuccess,
  __internals,
} from '@features/auth/security/login-guard'

describe('login-guard', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T10:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('يبدا غير مقفل و5 محاولات متاحة', () => {
    expect(lockStatus()).toEqual({ locked: false, remainingMs: 0, failuresLeft: 5 })
  })

  it('يسجل الفشل ويخصم المحاولات', () => {
    recordFailure()
    expect(lockStatus().failuresLeft).toBe(4)
    expect(lockStatus().locked).toBe(false)
  })

  it('يقفل بعد 5 محاولات فاشلة لمدة 15 دقيقة', () => {
    for (let i = 0; i < 5; i++) recordFailure()
    const status = lockStatus()
    expect(status.locked).toBe(true)
    expect(status.remainingMs).toBe(__internals.LOCK_WINDOW_MS)
  })

  it('يصفّر العداد بعد انقضاء نافذة الـ 15 دقيقة دون قفل', () => {
    recordFailure()
    recordFailure()
    vi.advanceTimersByTime(__internals.LOCK_WINDOW_MS + 1)
    expect(lockStatus()).toEqual({ locked: false, remainingMs: 0, failuresLeft: 5 })
  })

  it('يبقى القفل سارياً خلال المدة ثم ينتهي', () => {
    for (let i = 0; i < 5; i++) recordFailure()
    vi.advanceTimersByTime(__internals.LOCK_WINDOW_MS - 1_000)
    expect(lockStatus().locked).toBe(true)
    vi.advanceTimersByTime(1_001)
    expect(lockStatus().locked).toBe(false)
  })

  it('النجاح يمحو كل شيء', () => {
    recordFailure()
    recordFailure()
    recordSuccess()
    expect(lockStatus()).toEqual({ locked: false, remainingMs: 0, failuresLeft: 5 })
  })
})
