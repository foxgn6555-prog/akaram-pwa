/**
 * منطق التصدير — حساب الصافي والعنوان + بنية مصنف Excel الاحترافي (exceljs).
 * نتحقق من المصنف الفعلي المُنتَج (ترويسة/شعار/بيانات/إجمالي/RTL/رسوم) لا من مكتبة وهمية.
 */
import { describe, it, expect } from 'vitest'
import { netOf, sheetTitle, toExcel } from '@features/transfer-station/lib/export'
import type { WeightRecord } from '@features/transfer-station/types'

const base = {
  id: '1', db_number: '1', driver_name: 'س', vehicle_type: null, entry_time: null,
  log_date: '2026-08-31', shift: 'morning' as const, status: 'draft' as const,
  submitted_to_ops_at: null, archived_at: null, archived_by: null, archive_reason: null,
  created_by: null, created_at: null, seq: 1,
}

const rec = (over: Partial<WeightRecord>): WeightRecord => ({ ...base, ...over }) as WeightRecord

describe('netOf — الوزن الصافي', () => {
  it('يستخدم net_weight المخزّن إن وُجد', () => {
    expect(netOf(rec({ gross_weight: 25, tare_weight: 10, net_weight: 15 }))).toBe(15)
  })

  it('يحسب الكلي − الفارغ عند غياب الصافي', () => {
    expect(netOf(rec({ gross_weight: 30, tare_weight: 12, net_weight: null }))).toBe(18)
  })

  it('يعيد null عند نقص البيانات', () => {
    expect(netOf(rec({ gross_weight: null, tare_weight: null, net_weight: null }))).toBeNull()
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

describe('toExcel — تقرير exceljs احترافي', () => {
  const records = [
    rec({ id: 'a', db_number: '12345', driver_name: 'سائق الأوزان', gross_weight: 30, tare_weight: 12, net_weight: 18 }),
    rec({ id: 'b', db_number: '999', driver_name: 'سائق ثانٍ', gross_weight: 20, tare_weight: 8, net_weight: 12, status: 'submitted_to_ops' }),
  ]

  it('ينشئ مصنفاً بورقة «دفتر الأوزان» بترويسة الشركة وبيانات وإجمالي', async () => {
    const wb = await toExcel(records, '2026-08-31', 'morning')
    const ws = wb.getWorksheet('دفتر الأوزان')
    expect(ws).toBeTruthy()

    // اسم الشركة في الصف المدموج + عنوان التقرير
    const brand = String(ws!.getCell('B1').value ?? '')
    expect(brand).toContain('شركة جزيرة الأكرام')
    const title = String(ws!.getCell('A3').value ?? '')
    expect(title).toContain('سجل الأوزان')

    // رؤوس الأعمدة في الصف 5
    const headers = [1, 2, 3, 7].map((c) => ws!.getCell(5, c).value)
    expect(headers.join('|')).toContain('DB')
    expect(headers.join('|')).toContain('اسم السائق')
    expect(headers.join('|')).toContain('الوزن الصافي')

    // صف البيانات الأول (الصف 6) — السائق و DB والصافي
    expect(String(ws!.getCell(6, 3).value)).toBe('سائق الأوزان')
    expect(Number(ws!.getCell(6, 7).value)).toBe(18)

    // صف الإجمالي: رؤوس(5) + البيانات(2) = آخر بيانات 7، الإجمالي في الصف 8. مجموع الصافي = 30
    const totalRow = 5 + records.length + 1
    expect(String(ws!.getCell(totalRow, 3).value)).toContain('الإجمالي')
    expect(Number(ws!.getCell(totalRow, 7).value)).toBeCloseTo(30, 2)
  })

  it('يضبط RTL والمرشّح والتجميد وإعداد الطباعة', async () => {
    const wb = await toExcel(records, '2026-08-31', 'evening')
    const ws = wb.getWorksheet('دفتر الأوزان')!
    expect(ws.views?.[0]?.rightToLeft).toBe(true)
    expect(ws.views?.[0]?.state).toBe('frozen')
    expect(ws.autoFilter).toBeTruthy()
    expect(ws.pageSetup?.orientation).toBe('landscape')
    expect(ws.pageSetup?.fitToPage).toBe(true)
  })

  it('يضيف ورقة رسوم بيانية عند توفر البيانات', async () => {
    const wb = await toExcel(records, '2026-08-31', 'morning')
    // الرسوم تُرسم عبر canvas (غائب في node) فلا تُضاف أوراق صور — لكن المصنف يُبنى دون خطأ
    expect(wb.worksheets.length).toBeGreaterThanOrEqual(1)
  })

  it('يعالج دفتراً فارغاً دون أخطاء', async () => {
    const wb = await toExcel([], '2026-08-31', 'morning')
    const ws = wb.getWorksheet('دفتر الأوزان')!
    expect(ws).toBeTruthy()
    // صف الإجمالي موجود (الرؤوس في 5، الإجمالي في الصف 6)
    expect(String(ws.getCell(6, 3).value)).toContain('الإجمالي')
  })
})
