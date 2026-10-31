import { afterEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ remove: vi.fn() }))
vi.mock('@sdk/client', () => ({
  supabase: { storage: { from: () => ({ remove: h.remove }) }, rpc: vi.fn(), functions: { invoke: vi.fn() } },
  sdkGuard: async (p: Promise<{ data: unknown }>) => (await p).data,
  sdkVoid: async () => undefined,
}))
vi.mock('@sdk/gps-warehouse.sdk', () => ({ gpsWarehouse: { run: vi.fn() } }))
import { platformReset } from '@sdk/platform-reset.sdk'

describe('00398-د حذف ملفات التصفير على دفعات', () => {
  afterEach(() => { vi.restoreAllMocks(); h.remove.mockReset() })
  it('يسجل العدد قبل إنهاء آخر دفعة، ويحتفظ بالتقدم لكل حاوية', async () => {
    vi.spyOn(platformReset, 'storageObjects').mockResolvedValueOnce([{ bucket_id: 'a', name: 'one' }, { bucket_id: 'b', name: 'two' }])
    const finish = vi.spyOn(platformReset, 'storageFinish').mockResolvedValueOnce({ id: 'q', remaining: 1, done: false }).mockResolvedValueOnce({ id: 'q', remaining: 0, done: true })
    h.remove.mockResolvedValue({ data: [{ name: 'one' }], error: null })
    const progress = vi.fn()
    expect(await platformReset.wipeStorage('q', progress)).toEqual({ deleted: 2, remaining: 0 })
    expect(finish.mock.calls).toEqual([['q', 1], ['q', 1]])
    expect(progress.mock.calls).toEqual([[1], [2]])
  })
  it('لا يدعي النجاح إن لم يُحذف كل ملف في الدفعة', async () => {
    vi.spyOn(platformReset, 'storageObjects').mockResolvedValueOnce([{ bucket_id: 'a', name: 'one' }])
    vi.spyOn(platformReset, 'storageFinish').mockResolvedValueOnce({ id: 'q', remaining: 1, done: false })
    h.remove.mockResolvedValue({ data: [], error: null })
    await expect(platformReset.wipeStorage('q')).rejects.toThrow('STORAGE_REMOVE_INCOMPLETE')
  })
})
