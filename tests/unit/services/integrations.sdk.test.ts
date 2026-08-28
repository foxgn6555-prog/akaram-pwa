/** SDK التكاملات: رابط ADMS · فلاتر السجل */
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

import { integrations } from '@sdk/integrations.sdk'

describe('integrations.sdk', () => {
  beforeEach(() => fromFn.mockReset())

  it('getAdmsServerUrl يبني رابط Edge Function', () => {
    const url = integrations.getAdmsServerUrl()
    expect(url).toContain('/functions/v1/adms-receiver')
    expect(url).toMatch(/^https?:/)
  })

  it('listLogs بلا مزود يسحب الكل', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      eq: vi.fn(),
    }
    fromFn.mockReturnValue(chain)
    ;(chain as unknown as { then: unknown }).then = (res: (v: unknown) => void) =>
      res({ data: [], error: null })

    await integrations.listLogs()
    expect(chain.eq).not.toHaveBeenCalled()
  })

  it('listLogs بمزود يفلتر عليه', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    }
    fromFn.mockReturnValue(chain)
    ;(chain as unknown as { then: unknown }).then = (res: (v: unknown) => void) =>
      res({ data: [], error: null })

    await integrations.listLogs('biometric')
    expect(chain.eq).toHaveBeenCalledWith('provider', 'biometric')
  })
})
