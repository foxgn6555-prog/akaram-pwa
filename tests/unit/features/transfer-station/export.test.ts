/**
 * منطق التصدير — حساب الصافي والعنوان (نقي، بلا React)
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('xlsx', () => ({
  utils: {
    aoa_to_sheet: vi.fn((rows: unknown) => ({ __rows: rows })),
    encode_cell: vi.fn(({ r, c }: { r: number; c: number }) =>
      String.fromCharCode(65 + c) + (r + 1)),
    book_new: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}))

import { netOf, sheetTitle, toExcel } from '@features/transfer-station/lib/export'
import * as XLSX from 'xlsx'
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

describe('toExcel — التصدير المنسّق', () => {
  const rec = (over: Partial<WeightRecord>): WeightRecord =>
    ({ ...base, ...over }) as WeightRecord

  it('يستدعي writeFile باسم ملف يتضمن التاريخ والشفت', async () => {
    await toExcel(
      [rec({ db_number: '12345', driver_name: 'سائق الأوزان', gross_weight: 25, tare_weight: 10, net_weight: 15 })],
      '2026-08-31', 'morning',
    )
    expect(XLSX.writeFile).toHaveBeenCalledTimes(1)
    const name = String(vi.mocked(XLSX.writeFile).mock.calls[0]?.[1] ?? '')
    expect(name).toContain('2026-08-31')
    expect(name).toContain('الصباحي')
    expect(name.endsWith('.xlsx')).toBe(true)
  })

  it('يبني جدولاً مرتباً: ترويسة + رؤوس أعمدة + بيانات + صف إجمالي', async () => {
    await toExcel(
      [rec({ db_number: '12345', driver_name: 'سائق الأوزان', gross_weight: 30, tare_weight: 12, net_weight: 18 })],
      '2026-08-31', 'evening',
    )
    const aoa = vi.mocked(XLSX.utils.aoa_to_sheet).mock.calls[0]?.[0] as unknown as
      (string | number)[][]
    // الترويسة الرئيسية + رؤوس الأعمدة
    expect(String(aoa[0]?.[0])).toContain('شركة جزيرة الأكرام')
    expect(aoa[2]).toContain('اسم السائق')
    expect(aoa[2]).toContain('الوزن الصافي (بالطن)')
    // صف البيانات الأول
    expect(aoa[3]).toContain('سائق الأوزان')
    expect(aoa[3]).toContain(18)
    // صف الإجمالي الأخير
    const last = aoa.at(-1)
    expect(last).toContain('الإجمالي (طن)')
    expect(last).toContain(18)
  })

  it('يدمج الترويسة على عرض الأعمدة ويضبط RTL والمرشحات', async () => {
    await toExcel([], '2026-08-31', 'morning')
    const ws = vi.mocked(XLSX.utils.aoa_to_sheet).mock.results[0]?.value as
      { __rows: unknown[] } & Record<string, unknown>
    expect(ws.__rows).toHaveLength(4) // ترويسة + تعريف + رؤوس + إجمالي (بلا بيانات)
    expect(ws['!rightToLeft']).toBe(true)
    expect(ws['!autofilter']).toBeTruthy()
    expect(Array.isArray(ws['!merges'])).toBe(true)
  })
})
