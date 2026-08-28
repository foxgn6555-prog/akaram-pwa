/** SDK البوابة التقنية: RPCs الصحيحة + رسائل أخطاء آمنة */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { rpcMock, invokeMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  invokeMock: vi.fn(),
}))

vi.mock('@sdk/client', () => ({
  sdkGuard: undefined,
  isNetworkError: (e: unknown) => e instanceof TypeError,
}))

// sdkGuard حقيقي يعتمد على supabase — نمسخر العميل فقط ونمرر عبر النتيجة
vi.mock('@sdk/client', async () => {
  const { SDKError } = await import('@lib/errors/SDKError')
  return {
    supabase: {
      rpc: rpcMock,
      functions: { invoke: invokeMock },
      from: vi.fn(),
      auth: { getSession: vi.fn(async () => ({ data: { session: null } })) },
    },
    isNetworkError: (e: unknown) => e instanceof TypeError,
    async sdkVoid(operation: PromiseLike<{ error?: { message: string; code?: string } | null }>) {
      const { error } = await operation
      if (error) throw new SDKError(error.message, error.code ?? 'UNKNOWN', error)
    },
    async sdkGuard(operation: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>) {
      const { data, error } = await operation
      if (error) throw new SDKError(error.message, error.code ?? 'UNKNOWN', error)
      if (data === null || data === undefined) throw new SDKError('لا بيانات', 'EMPTY_RESULT')
      return data
    },
  }
})

import { users } from '@sdk/users.sdk'
import { system } from '@sdk/system.sdk'

describe('users.sdk', () => {
  beforeEach(() => {
    rpcMock.mockReset()
    invokeMock.mockReset()
  })

  it('list يستدعي list_platform_users مع البحث', async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null })
    await users.list('أحمد')
    expect(rpcMock).toHaveBeenCalledWith('list_platform_users', { p_query: 'أحمد' })
  })

  it('list بلا بحث يمرر null', async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null })
    await users.list()
    expect(rpcMock).toHaveBeenCalledWith('list_platform_users', { p_query: null })
  })

  it('setUserRole يمرر المعاملات الثلاثة بالترتيب الصحيح', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null })
    await users.setUserRole('uid-1', 'hr_officer', true)
    expect(rpcMock).toHaveBeenCalledWith('set_user_role', {
      p_user_id: 'uid-1',
      p_role: 'hr_officer',
      p_grant: true,
    })
  })

  it('create يستدعي admin-users ويعيد user_id', async () => {
    invokeMock.mockResolvedValueOnce({ data: { user_id: 'uid-9' }, error: null })
    const result = await users.create({
      email: 'a@b.iq', password: 'Passw0rd1', full_name: 'أحمد', role: 'employee',
    })
    expect(invokeMock).toHaveBeenCalledWith('admin-users', { body: expect.objectContaining({ email: 'a@b.iq' }) })
    expect(result.user_id).toBe('uid-9')
  })

  it('create يحوّل خطأ الدالة إلى SDKError برسالة عربية', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'Edge error', code: 'EMAIL_TAKEN' } })
    await expect(
      users.create({ email: 'a@b.iq', password: 'Passw0rd1', full_name: 'أحمد', role: 'employee' }),
    ).rejects.toThrow('البريد الإلكتروني مستخدم مسبقاً')
  })
})

describe('system.sdk', () => {
  beforeEach(() => rpcMock.mockReset())

  it('dbStats يستدعي db_stats', async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null })
    await system.dbStats()
    expect(rpcMock).toHaveBeenCalledWith('db_stats')
  })

  it('dbOverview يستدعي db_overview', async () => {
    rpcMock.mockResolvedValueOnce({ data: { allowed: true }, error: null })
    await system.dbOverview()
    expect(rpcMock).toHaveBeenCalledWith('db_overview')
  })

  it('reportError آمن الفشل — لا يرمي حتى مع خطأ شبكة', async () => {
    rpcMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(
      system.reportError({ message: 'boom' }),
    ).resolves.toBeUndefined()
  })
})
