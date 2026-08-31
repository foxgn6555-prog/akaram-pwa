/** SDK FlowBridge (00037/00038): حالة المصمم + الأحداث الحقيقية + الروابط */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fromFn = vi.hoisted(() => vi.fn())
const getUserFn = vi.hoisted(() => vi.fn())

vi.mock('@sdk/client', async () => {
  const { SDKError } = await import('@lib/errors/SDKError')
  return {
    supabase: {
      from: fromFn,
      rpc: vi.fn(),
      auth: { getSession: vi.fn(), getUser: getUserFn },
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

import { flowbridge } from '@sdk/flowbridge.sdk'

describe('flowbridge.sdk', () => {
  beforeEach(() => {
    fromFn.mockReset()
    getUserFn.mockReset()
  })

  it('getState يقرأ مفتاحاً واحداً ويعيد null عند عدم وجوده', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    fromFn.mockReturnValue(chain)

    const result = await flowbridge.getState('portals')
    expect(fromFn).toHaveBeenCalledWith('flowbridge_state')
    expect(chain.eq).toHaveBeenCalledWith('key', 'portals')
    expect(result).toBeNull()
  })

  it('getState يعيد الصف عند وجوده', async () => {
    const row = { key: 'graph', value: { nodes: [], flows: [] }, updated_by: null, version: 1, updated_at: '2026-01-01' }
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
    }
    fromFn.mockReturnValue(chain)

    const result = await flowbridge.getState('graph')
    expect(result).toEqual(row)
  })

  it('getState يرمي عند خطأ RLS/شبكة', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'denied' } }),
    }
    fromFn.mockReturnValue(chain)

    await expect(flowbridge.getState('settings')).rejects.toThrow()
  })

  it('setState يستخدم upsert بمفتاح onConflict=key ويُدرج updated_by من الجلسة', async () => {
    getUserFn.mockResolvedValue({ data: { user: { id: 'u-1' } } })
    const upsert = vi.fn().mockResolvedValue({ error: null })
    fromFn.mockReturnValue({ upsert })

    await flowbridge.setState('settings', { autosave: true, apiUrl: '', apiToken: '', categories: [] })

    expect(fromFn).toHaveBeenCalledWith('flowbridge_state')
    expect(upsert).toHaveBeenCalledWith(
      { key: 'settings', value: { autosave: true, apiUrl: '', apiToken: '', categories: [] }, updated_by: 'u-1' },
      { onConflict: 'key' },
    )
  })

  it('setState يمرر updated_by=null إن لم توجد جلسة', async () => {
    getUserFn.mockResolvedValue({ data: { user: null } })
    const upsert = vi.fn().mockResolvedValue({ error: null })
    fromFn.mockReturnValue({ upsert })

    await flowbridge.setState('portals', [])

    expect(upsert).toHaveBeenCalledWith(
      { key: 'portals', value: [], updated_by: null },
      { onConflict: 'key' },
    )
  })

  it('recentEvents يطلب الترتيب تنازلياً بحد أقصى', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn(),
    }
    fromFn.mockReturnValue(chain)
    chain.limit.mockReturnValue(Promise.resolve({ data: [], error: null }))

    await flowbridge.recentEvents(10)
    expect(fromFn).toHaveBeenCalledWith('flowbridge_events')
    expect(chain.order).toHaveBeenCalledWith('occurred_at', { ascending: false })
    expect(chain.limit).toHaveBeenCalledWith(10)
  })

  it('createBinding يُدرج ويعيد الصف المُنشأ', async () => {
    const created = { id: 'b-1', flow_id: 'f-1', source: 'audit', match_table: 'requests' }
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: created, error: null }),
    }
    fromFn.mockReturnValue(chain)

    const result = await flowbridge.createBinding({ flow_id: 'f-1', source: 'audit', match_table: 'requests' })
    expect(chain.insert).toHaveBeenCalledWith({ flow_id: 'f-1', source: 'audit', match_table: 'requests' })
    expect(result).toEqual(created)
  })

  it('deleteBinding يحذف بالمعرّف', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    fromFn.mockReturnValue({ delete: vi.fn().mockReturnValue({ eq }) })

    await flowbridge.deleteBinding('b-1')
    expect(eq).toHaveBeenCalledWith('id', 'b-1')
  })
})
