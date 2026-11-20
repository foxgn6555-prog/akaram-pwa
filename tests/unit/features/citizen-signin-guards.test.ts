/**
 * الجولة ٩ — بوابة المواطن: عقد عميل `citizen_sign_in` بعد 20261120210000.
 *   · نجاح ⇒ جلسة فيها token (returning يمرّ كما هو).
 *   · كائن خطأ بلا token ⇒ استثناء يحمل رمز الخطأ، و`citizenErrorMessage` يترجمه لعربية.
 *   · لا يُقبل أبداً «جلسة» بلا token (كان هذا يخزّن جلسة معطوبة في localStorage).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('@sdk/client', () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a) },
  sdkGuard: async (p: Promise<{ data: unknown; error: unknown }>) => { const r = await p; if (r.error) throw r.error; return r.data },
  sdkMaybe: async (p: Promise<{ data: unknown; error: unknown }>) => { const r = await p; return r.error ? null : r.data },
  sdkVoid: async (p: Promise<{ data: unknown; error: unknown }>) => { const r = await p; if (r.error) throw r.error },
}))

import { citizen, citizenErrorMessage } from '@sdk/citizen.sdk'

beforeEach(() => rpc.mockReset())

describe('citizen_sign_in — العقد الجديد', () => {
  it('يمرّر المعاملات ويعيد الجلسة مع returning', async () => {
    rpc.mockResolvedValue({ data: { token: 'tok-1', full_name: 'علي حسين', phone: '07701234567', returning: true }, error: null })
    const s = await citizen.signIn('علي حسين', '07701234567')
    expect(rpc).toHaveBeenCalledWith('citizen_sign_in', { p_name: 'علي حسين', p_phone: '07701234567' })
    expect(s.token).toBe('tok-1')
    expect(s.returning).toBe(true)
  })

  it('كائن خطأ «الاسم لا يطابق» ⇒ استثناء بالرمز العربي المفهوم', async () => {
    rpc.mockResolvedValue({ data: { error: 'CITIZEN_IDENTITY_MISMATCH', message: 'الاسم لا يطابق صاحب هذا الرقم', attempts_left: 3 }, error: null })
    await expect(citizen.signIn('حسين محمد', '07701234567')).rejects.toThrow('CITIZEN_IDENTITY_MISMATCH')
    await citizen.signIn('حسين محمد', '07701234567').catch((e) => {
      expect(citizenErrorMessage(e)).toContain('لا يطابق')
    })
  })

  it('كائن مقفل ⇒ رسالة «أعد المحاولة بعد ساعة»', async () => {
    rpc.mockResolvedValue({ data: { error: 'CITIZEN_SIGNIN_LOCKED' }, error: null })
    await expect(citizen.signIn('علي حسين', '07701234567')).rejects.toThrow('CITIZEN_SIGNIN_LOCKED')
    expect(citizenErrorMessage(new Error('CITIZEN_SIGNIN_LOCKED'))).toContain('بعد ساعة')
  })

  it('استجابة بلا token ⇒ لا تُعامل كجلسة صالحة', async () => {
    rpc.mockResolvedValue({ data: {}, error: null })
    await expect(citizen.signIn('علي حسين', '07701234567')).rejects.toThrow('CITIZEN_SESSION_INVALID')
  })

  it('خطأ RPC نفسه (شبكة/صلاحية) يبقى استثناءً كما هو', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('PERMISSION_DENIED') })
    await expect(citizen.signIn('علي حسين', '07701234567')).rejects.toThrow('PERMISSION_DENIED')
  })
})
