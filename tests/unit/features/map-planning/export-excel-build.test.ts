/**
 * بناء ملف Excel فعلي (لا مجرد استدعاء): نتحقق أن الأعمدة والصفوف
 * والإجمالي تصل إلى أوراق المصنف، وأن عدد الأعمدة المختارة يحدّد عرض الورقة.
 */
import { describe, expect, it } from 'vitest'
import { buildExcelReport, colLetter } from '@lib/export/excel-report'
import {
  columnsFor,
  resolveColumns,
  toReportColumns,
  toReportRows,
  totalRow,
  type ColumnContext,
  type Row,
} from '@features/map-planning/export-columns'

const ctx: ColumnContext = { zoneName: 'الرياض', shiftLabel: (s) => s ?? '—' }

const rows: Row[] = [
  { place_kind: 'street', place_code: 'STR-0001', place_name: 'شارع أ', mahalla_code: null, length_m: 100, width_m: 10, visited: true, confirmed: true, visits_count: 2, vehicles_count: 1, total_dwell_seconds: 420, first_entered_at: '2026-11-22T20:00:00Z', last_exited_at: '2026-11-22T20:07:00Z' },
  { place_kind: 'alley', place_code: 'ALY-0001', place_name: 'زقاق ب', mahalla_code: 'MHL-0001', length_m: 60, width_m: 4, visited: false, confirmed: false, visits_count: 0, vehicles_count: 0, total_dwell_seconds: 0, first_entered_at: null, last_exited_at: null },
]

const build = async (cols = columnsFor('places')) =>
  buildExcelReport({
    sheetName: 'التخطيط',
    companySub: 'غرفة العمليات',
    title: 'تقرير الاختبار',
    meta: 'يوم 2026-11-22',
    columns: toReportColumns(cols),
    rows: toReportRows(rows, cols, ctx),
    totalRow: totalRow(rows, cols, ctx),
    fileName: 'test.xlsx',
    deferSave: true,
  })

describe('① ملف حقيقي يُبنى', () => {
  it('مصنف بورقة واحدة على الأقل', async () => {
    const wb = await build()
    expect(wb.worksheets.length).toBeGreaterThanOrEqual(1)
    expect(wb.worksheets[0]?.name).toBe('التخطيط')
  })

  it('الترويسة تُكتب في صفّها فوق البيانات', async () => {
    const wb = await build()
    const ws = wb.worksheets[0]!
    const flat: string[] = []
    ws.eachRow((row) => row.eachCell((c) => flat.push(String(c.value ?? ''))))
    expect(flat).toContain('الكود')
    expect(flat).toContain('الطول (م)')
  })

  it('بيانات الصفوف موجودة فعلاً في الخلايا', async () => {
    const wb = await build()
    const ws = wb.worksheets[0]!
    const flat: string[] = []
    ws.eachRow((row) => row.eachCell((c) => flat.push(String(c.value ?? ''))))
    expect(flat).toContain('STR-0001')
    expect(flat).toContain('ALY-0001')
  })

  it('عدد الأعمدة المختارة يحدّد آخر عمود في الورقة', async () => {
    const three = resolveColumns('places', [
      { id: 'place_code', visible: true, order: 0 },
      { id: 'place_name', visible: true, order: 1 },
      { id: 'length_m', visible: true, order: 2 },
    ])
    expect(three).toHaveLength(3)
    const wb = await build(three)
    const ws = wb.worksheets[0]!
    // أوسع صف هو صف الترويسة ⇒ ٣ أعمدة
    expect(ws.columnCount).toBe(3)
    expect(colLetter(2)).toBe('C')
  })

  it('صف الإجمالي يحمل مجموع الطول', async () => {
    const wb = await build()
    const ws = wb.worksheets[0]!
    const nums: number[] = []
    ws.eachRow((row) => row.eachCell((c) => { if (typeof c.value === 'number') nums.push(c.value) }))
    expect(nums).toContain(160) // 100 + 60
  })

  it('حالة «لم تُدخل» تُكتب نصاً لا فراغاً', async () => {
    const cols = resolveColumns('places', [{ id: 'coverage_state', visible: true, order: 0 }])
    const wb = await build(cols)
    const ws = wb.worksheets[0]!
    const flat: string[] = []
    ws.eachRow((row) => row.eachCell((c) => flat.push(String(c.value ?? ''))))
    expect(flat).toContain('لم تُدخل')
    expect(flat).toContain('مؤكد')
  })
})
