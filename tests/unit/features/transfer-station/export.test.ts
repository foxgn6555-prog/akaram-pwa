/**
 * منطق التصدير — حساب الصافي والعنوان (نقي، بلا React)
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('xlsx', () => ({
  utils: {
    json_to_sheet: vi.fn(() => ({})),
    book_new: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}))

import { netOf, sheetTitle } from '@features/transfer-station/lib/export'
import type { WeightRecord } from '@features/transfer-station/types'

const base = {
  id: '1', db_number: '1', driver_name: 'س', vehicle_type: null, entry_time: null,
  log_date: '2026-08-31', shift: 'morning' as const, status: 'draft' as const,
  submitted_to_ops_at: null, archived_at: null, archived_by: null, archive_reason: null,
  created_by: null, created_at: null, seq: 1,
}

describe('netOf — الوزن الصافي', () => {
  it('يستخدم net_weight المخزّن إن وُجد', () => {
    const r = { ...base, gross_weight: 25, tare_weight: 10, net_weight: 15 } as WeightRecord
    expect(netOf(r)).toBe(15)
  })

  it('يحسب الكلي − الفارغ عند غياب الصافي', () => {
    const r = { ...base, gross_weight: 30, tare_weight: 12, net_weight: null } as WeightRecord
    expect(netOf(r)).toBe(18)
  })

  it('يعيد null عند نقص البيانات', () => {
    const r = { ...base, gross_weight: null, tare_weight: null, net_weight: null } as WeightRecord
    expect(netOf(r)).toBeNull()
  })
})

describe('sheetTitle', () => {
  it('عنوان عربي للشفت الصباحي', () => {
    expect(sheetTitle('2026-08-31', 'morning')).toContain('الصباحي')
  })
  it('عنوان عربي للشفت المسائي', () => {
    expect(sheetTitle('2026-08-31', 'evening')).toContain('المسائي')
  })
})
