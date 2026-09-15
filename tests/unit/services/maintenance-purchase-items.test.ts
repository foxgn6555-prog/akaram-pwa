/**
 * بنود المشتريات تصل jsonb كمصفوفة حقيقية — حرس ضد الترميز المزدوج
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@sdk/client', () => ({
  supabase: { rpc: h.rpc },
  sdkGuard: async (value: Promise<{ data: unknown; error: null | { message: string } }>) => {
    const result = await value
    if (result.error) throw new Error(result.error.message)
    return result.data
  },
}))
import { vehicleOperations } from '@sdk/vehicle-operations.sdk'

describe('بنود مشتريات الصيانة', () => {
  beforeEach(() => {
    h.rpc.mockReset()
    h.rpc.mockResolvedValue({ data: { id: 'pc1' }, error: null })
  })
  it('p_items مصفوفة كائنات وليس نص JSON', async () => {
    await vehicleOperations.maintenancePurchaseCreate('مورد تجريبي', 'ملاحظات', [
      { part_category: 'فلاتر', item_name: 'فلتر هواء', quantity: 2, unit: 'قطعة', unit_price: 25000 },
    ])
    const params = h.rpc.mock.calls[0]![1] as { p_items: unknown }
    expect(Array.isArray(params.p_items)).toBe(true)
    expect(params.p_items).toEqual([
      {
        part_category: 'فلاتر',
        item_name: 'فلتر هواء',
        quantity: 2,
        unit: 'قطعة',
        unit_price: 25000,
      },
    ])
  })
})
