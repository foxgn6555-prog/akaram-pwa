/** SDK الفروع: إنشاء يرفع الرمز للأحرف الكبيرة · تفعيل عبر update */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fromMock = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('@sdk/client', async () => {
  const { SDKError } = await import('@lib/errors/SDKError')
  return {
    supabase: { from: fromMock.from, rpc: vi.fn(), auth: { getSession: vi.fn() } },
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

import { branches } from '@sdk/branches.sdk'

describe('branches.sdk', () => {
  beforeEach(() => fromMock.from.mockReset())

  it('create يرفع الرمز للأحرف الكبيرة', async () => {
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'b1', code: 'KRR' }, error: null }),
    }
    fromMock.from.mockReturnValue(chain)

    await branches.create({ name: 'فرع الكرادة', code: 'krr' })
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'KRR' }),
    )
  })

  it('list بدون الموقوفة يفلتر is_active=true', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    }
    fromMock.from.mockReturnValue(chain)
    // thenable
    (chain as unknown as { then: unknown }).then = (res: (v: unknown) => void) =>
      res({ data: [], error: null })

    await branches.list(false)
    expect(chain.eq).toHaveBeenCalledWith('is_active', true)
  })
})
