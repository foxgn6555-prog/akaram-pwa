/** SDK الأقسام: الإنشاء يرفع الرمز لأحرف كبيرة ويمر عبر sdkGuard */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }))

vi.mock('@sdk/client', async () => {
  const { SDKError } = await import('@lib/errors/SDKError')
  return {
    supabase: {
      from: fromMock,
      rpc: vi.fn(),
      auth: { getSession: vi.fn() },
    },
    isNetworkError: (e: unknown) => e instanceof TypeError,
    async sdkGuard(op: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
      const { data, error } = await op
      if (error) throw new SDKError(error.message, 'X', error)
      if (data === null || data === undefined) throw new SDKError('لا بيانات', 'EMPTY')
      return data
    },
    async sdkVoid(op: PromiseLike<{ error?: { message: string } | null }>) {
      const { error } = await op
      if (error) throw new SDKError(error.message, 'X', error)
    },
  }
})

import { departments } from '@sdk/departments.sdk'

describe('departments.sdk', () => {
  beforeEach(() => fromMock.mockReset())

  it('create يحوّل الرمز لأحرف كبيرة قبل الإرسال', async () => {
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'd1', code: 'MAINT' }, error: null }),
    }
    fromMock.mockReturnValue(chain)

    await departments.create({ name: 'شعبة الصيانة', code: 'maint' })
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'MAINT', parent_id: null }),
    )
  })
})
