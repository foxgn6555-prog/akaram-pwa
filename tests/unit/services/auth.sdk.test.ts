/** SDK المصادقة — عبر mock كامل لعميل Supabase */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@sdk/client', () => ({
  isNetworkError: (e: unknown) => e instanceof TypeError,
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      getSession: vi.fn(),
    },
    from: vi.fn(),
    rpc: vi.fn(async () => ({ data: false, error: null })) as never,  // is_login_locked → غير مقفل
  },
}))

import { auth } from '@sdk/auth.sdk'
import { supabase } from '@sdk/client'

describe('auth.sdk', () => {
  beforeEach(() => vi.clearAllMocks())

  it('login يفشل برسالة موحدة آمنة (لا تسرّب تفاصيل الخادم)', async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials', code: '400' },
    } as never)

    // الرسالة للمستخدم موحدة دائماً — لا تفرق بين بريد غير موجود وكلمة مرور خاطئة
    await expect(auth.login('x@y.z', 'wrong-pass')).rejects.toThrow(
      'البريد الإلكتروني أو كلمة المرور غير صحيحة',
    )
    // وفشل المصادقة سُجل على الخادم نحو إقفال الحساب
    expect(supabase.rpc).toHaveBeenCalledWith('record_login_attempt', {
      p_email: 'x@y.z',
      p_success: false,
    })
  })

  it('حساب مقفل → يرفض قبل استهلاك محاولة مصادقة', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: true, error: null } as never)

    await expect(auth.login('locked@akram.iq', 'Password1')).rejects.toThrow('قفل الدخول')
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled()
  })
})
