/** 00312: زوال الجلسة داخل مسار محمي → /login؛ المسارات العامة لا تُمسّ؛ التهيئة الأولى لا تُحوّل */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { listeners, clear } = vi.hoisted(() => ({ listeners: [] as Array<(t: string | null) => void>, clear: vi.fn() }))
vi.mock('@sdk/auth.sdk', () => ({
  auth: { onAuthStateChange: (cb: (t: string | null) => void) => { listeners.push(cb); return () => undefined } },
}))
vi.mock('@config/query-client.config', () => ({ queryClient: { clear } }))

import { shouldRedirectToLogin, isPublicPath, startSessionWatch } from '@features/auth/session-watch'
import { PUBLIC_ROUTES, PORTAL_ROUTES } from '@router/routes.config'

describe('session-watch', () => {
  beforeEach(() => { listeners.length = 0; clear.mockClear() })

  it('كل المسارات العامة المعرّفة في الموجّه تُعتبر عامة', () => {
    for (const r of PUBLIC_ROUTES) expect(isPublicPath(r.path)).toBe(true)
    expect(isPublicPath('/citizen/track/abc')).toBe(true)
    expect(isPublicPath('/')).toBe(true)
  })

  it('كل مسارات البوابات محمية: بلا جلسة → تحويل', () => {
    for (const p of PORTAL_ROUTES) {
      expect(shouldRedirectToLogin(p.path, false)).toBe(true)
      expect(shouldRedirectToLogin(p.path + '/attendance', false)).toBe(true)
      expect(shouldRedirectToLogin(p.path, true)).toBe(false)
    }
  })

  it('التهيئة الأولى بلا جلسة لا تُحوّل؛ الانتقال من جلسة إلى لا-جلسة يُحوّل ويُفرغ الكاش', () => {
    const navigate = vi.fn()
    const router = { state: { location: { pathname: '/ops-room/trips' } }, navigate }
    startSessionWatch(router)
    const emit = listeners[0]!
    emit(null)                     // INITIAL_SESSION بلا جلسة — الـloader هو من يتولى ذلك
    expect(navigate).not.toHaveBeenCalled()
    emit('jwt')                    // دخول
    emit('jwt2')                   // تحديث رمز — لا شيء
    expect(navigate).not.toHaveBeenCalled()
    emit(null)                     // انتهاء الجلسة
    expect(clear).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith('/login', { replace: true })
  })

  it('انتهاء الجلسة على مسار عام (مثل /citizen) لا يُحوّل', () => {
    const navigate = vi.fn()
    startSessionWatch({ state: { location: { pathname: '/citizen' } }, navigate })
    const emit = listeners[0]!
    emit('jwt'); emit(null)
    expect(navigate).not.toHaveBeenCalled()
  })
})
