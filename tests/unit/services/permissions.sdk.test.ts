/** SDK المصفوفة: setRoleEffect بأثر null يحذف · canSee يستدعي can_i_see */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { rpcMock, fromMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
}))

vi.mock('@sdk/client', async () => {
  const { SDKError } = await import('@lib/errors/SDKError')
  return {
    supabase: { from: fromMock, rpc: rpcMock, auth: { getSession: vi.fn() } },
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

import { permissions } from '@sdk/permissions.sdk'

describe('permissions.sdk', () => {
  beforeEach(() => {
    fromMock.mockReset()
    rpcMock.mockReset()
  })

  it('setRoleEffect بـ null يحذف القاعدة', async () => {
    const chain = { delete: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
    fromMock.mockReturnValue(chain)

    await permissions.setRoleEffect('hr_officer', 'it.db.tables', null)
    expect(chain.delete).toHaveBeenCalled()
    expect(chain.eq).toHaveBeenCalledWith('role', 'hr_officer')
    expect(chain.eq).toHaveBeenCalledWith('page_key', 'it.db.tables')
  })

  it('setRoleEffect بـ grant يرفع upsert صحيح', async () => {
    const chain = { upsert: vi.fn().mockResolvedValue({ error: null }) }
    fromMock.mockReturnValue(chain)

    await permissions.setRoleEffect('it_admin', 'hr.reports', 'grant')
    expect(chain.upsert).toHaveBeenCalledWith(
      { role: 'it_admin', page_key: 'hr.reports', effect: 'grant' },
      { onConflict: 'role,page_key' },
    )
  })

  it('canSee يستدعي can_i_see RPC', async () => {
    rpcMock.mockResolvedValue({ data: true, error: null })
    const r = await permissions.canSee('it.users.list')
    expect(rpcMock).toHaveBeenCalledWith('can_i_see', { p_page_key: 'it.users.list' })
    expect(r).toBe(true)
  })

  it('setUserOverride بـ lock يرفع upsert مع سبب', async () => {
    const chain = { upsert: vi.fn().mockResolvedValue({ error: null }) }
    fromMock.mockReturnValue(chain)

    await permissions.setUserOverride('u1', 'it.users.list', 'lock', 'إجازة')
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', page_key: 'it.users.list', effect: 'lock', reason: 'إجازة' }),
      { onConflict: 'user_id,page_key' },
    )
  })
})
