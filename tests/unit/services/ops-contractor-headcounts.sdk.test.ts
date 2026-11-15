/** SDK حضوريات العمال + عارض إثباتات التواجد (قراءة فقط) */
import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@sdk/client', async () => {
  const { SDKError } = await import('@lib/errors/SDKError')
  return {
    supabase: { rpc: m.rpc },
    async sdkGuard(op: PromiseLike<{ data: unknown; error: { message: string } | null }>) { const { data, error } = await op; if (error) throw new SDKError(error.message, 'X', error); return data },
  }
})
import { opsContractorHeadcounts } from '@sdk/ops-contractor-headcounts.sdk'

describe('ops-contractor-headcounts.sdk', () => {
  beforeEach(() => m.rpc.mockReset())
  it('presenceProofs يمرّر اليوم/القاطع/المتعهد ويحوّل null إلى مصفوفة فارغة', async () => {
    m.rpc.mockResolvedValue({ data: null, error: null })
    expect(await opsContractorHeadcounts.presenceProofs('2026-11-14', 'karrada', 'c1')).toEqual([])
    expect(m.rpc).toHaveBeenCalledWith('ops_contractor_presence_proofs', { p_date: '2026-11-14', p_parent: 'karrada', p_contractor: 'c1' })
    await opsContractorHeadcounts.presenceProofs()
    expect(m.rpc).toHaveBeenLastCalledWith('ops_contractor_presence_proofs', { p_date: null, p_parent: null, p_contractor: null })
  })
  it('sheet/audit يبقيان على أسماء الدوال السابقة', async () => {
    m.rpc.mockResolvedValue({ data: [], error: null })
    await opsContractorHeadcounts.sheet('2026-11', 'karrada')
    expect(m.rpc).toHaveBeenLastCalledWith('ops_contractor_headcounts_sheet', { p_month: '2026-11-01', p_parent: 'karrada' })
    await opsContractorHeadcounts.audit('2026-11')
    expect(m.rpc).toHaveBeenLastCalledWith('ops_contractor_audit', { p_month: '2026-11-01' })
  })
})
