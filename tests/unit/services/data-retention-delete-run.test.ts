import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@sdk/client', () => ({ supabase: { rpc: h.rpc }, sdkGuard: async (p: Promise<{ data: unknown; error: unknown }>) => { const r = await p; if (r.error) throw r.error; return r.data } }))
import { dataRetention } from '@sdk/data-retention.sdk'

describe('dataRetention.deleteRun (00327)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('يكرر الدفعات حتى done ويبلّغ التقدم بعد كل دفعة', async () => {
    let left = 12
    h.rpc.mockImplementation(async (_fn: string, args: { p_limit: number }) => { left = Math.max(0, left - args.p_limit); return { data: { id: 'r1', status: left === 0 ? 'done' : 'deleting', rows_deleted: 12 - left, rows_deletable: left }, error: null } })
    const seen: number[] = []
    const r = await dataRetention.deleteRun('r1', { batch: 5, onProgress: (x) => seen.push(x.rows_deleted) })
    expect(r.status).toBe('done'); expect(seen).toEqual([5, 10, 12]); expect(h.rpc).toHaveBeenCalledTimes(3)
    expect(h.rpc).toHaveBeenCalledWith('data_retention_delete_batch', { p_request: 'r1', p_limit: 5 })
  })

  it('الإيقاف بعد الدفعة الحالية: لا دفعات بعد إشارة الإلغاء والنتيجة deleting', async () => {
    const ctrl = new AbortController()
    h.rpc.mockImplementation(async () => ({ data: { id: 'r1', status: 'deleting', rows_deleted: 5, rows_deletable: 50 }, error: null }))
    const r = await dataRetention.deleteRun('r1', { batch: 5, signal: ctrl.signal, onProgress: () => ctrl.abort() })
    expect(r.status).toBe('deleting'); expect(h.rpc).toHaveBeenCalledTimes(1)
  })

  it('خطأ من الخادم يوقف التشغيل ويُرفع كما هو', async () => {
    h.rpc.mockImplementation(async () => ({ data: null, error: { message: 'RETENTION_BAD_STATE: pending' } }))
    await expect(dataRetention.deleteRun('r1')).rejects.toMatchObject({ message: 'RETENTION_BAD_STATE: pending' })
  })
})
