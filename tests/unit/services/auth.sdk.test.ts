/** SDK المصادقة — اختبار بوابة staff-login دون اتصال شبكي */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@sdk/client', () => ({
  sdkGuard: vi.fn(),
  sdkVoid: vi.fn(),
  supabase: {
    functions: { invoke: vi.fn() },
    auth: { setSession: vi.fn(), getSession: vi.fn(), signOut: vi.fn() },
    from: vi.fn(),
  },
}))

import { auth } from '@sdk/auth.sdk'
import { supabase } from '@sdk/client'

const gatewayError = (body: Record<string, unknown>) => ({
  message: 'Edge Function returned a non-2xx status code',
  context: new Response(JSON.stringify(body), { status: 401, headers: { 'Content-Type': 'application/json' } }),
})

describe('auth.sdk staff-login gateway', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('يعرض رسالة بيانات موحدة عند رفض بيانات الدخول', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({ data: null, error: gatewayError({ error: 'INVALID_CREDENTIALS', failures_left: 8 }) } as never)

    await expect(auth.login(' X@Y.Z ', 'wrong-pass')).rejects.toThrow('البريد الإلكتروني أو كلمة المرور غير صحيحة')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('staff-login', expect.objectContaining({
      body: expect.objectContaining({ email: 'x@y.z', password: 'wrong-pass', source_id: expect.any(String) }),
    }))
    expect(supabase.auth.setSession).not.toHaveBeenCalled()
  })

  it('يعرض موعد القفل الذي أعاده الخادم ولا يرسل محاولة دخول إضافية', async () => {
    const lockedUntil = '2026-11-08T23:05:00.000Z'
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({ data: null, error: gatewayError({ error: 'SOURCE_LOCKED', locked_until: lockedUntil }) } as never)

    await expect(auth.login('locked@akram.iq', 'Password1')).rejects.toMatchObject({
      message: 'أُوقف الدخول مؤقتاً من هذا الجهاز لمدة خمس دقائق. يمكنك التواصل مع الدعم.',
      lockedUntil,
    })
    expect(supabase.auth.setSession).not.toHaveBeenCalled()
  })
})
