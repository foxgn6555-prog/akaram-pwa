/** SDK البوابات: create ينظف الـ slug · addUnit يرفع الحمولة */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fromFn = vi.hoisted(() => vi.fn())

vi.mock('@sdk/client', async () => {
  const { SDKError } = await import('@lib/errors/SDKError')
  return {
    supabase: { from: fromFn, rpc: vi.fn(), auth: { getSession: vi.fn() } },
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

import { portals } from '@sdk/portals.sdk'

describe('portals.sdk', () => {
  beforeEach(() => fromFn.mockReset())

  it('create ينظف slug (أحرف صغيرة + أرقام وشرطات فقط)', async () => {
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'p1', slug: 'ops-2026' }, error: null }),
    }
    fromFn.mockReturnValue(chain)

    await portals.create({ name: 'بوابة العمليات', slug: 'OPS-2026!' })
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'ops-2026' }),
    )
  })

  it('addUnit يمرر الحمولة الكاملة', async () => {
    const chain = { insert: vi.fn().mockResolvedValue({ error: null }) }
    fromFn.mockReturnValue(chain)

    await portals.addUnit({
      portal_id: 'p1', unit_key: 'tracking', label: 'التتبع',
      icon: 'activity', page_keys: ['p_ops.map'],
    })
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ portal_id: 'p1', unit_key: 'tracking', page_keys: ['p_ops.map'] }),
    )
  })
})
