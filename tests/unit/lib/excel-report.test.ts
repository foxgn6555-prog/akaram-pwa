/**
 * منشئ تقارير Excel المشترك (exceljs) — بنية المصنف:
 * شعار/ترويسة · رؤوس أعمدة · صفوف متناوبة · صف إجمالي · RTL · تجميد · مرشّح · طباعة.
 */
import { describe, it, expect, vi } from 'vitest'
import { buildExcelReport, colLetter } from '@lib/export/excel-report'

// canvas غير متاح في Node — نحاكي مولّدات صور الرسوم حتى تُضاف أوراق الرسوم فعلاً
vi.mock('@lib/export/chart-image', () => ({
  renderBarChartPng: vi.fn(() => new ArrayBuffer(8)),
  renderDonutChartPng: vi.fn(() => new ArrayBuffer(8)),
}))

function callReport(opts?: { totalRow?: Record<string, unknown>; rows?: Record<string, unknown>[] }) {
  return buildExcelReport({
    sheetName: 'ورقة',
    company: 'شركة جزيرة الأكرام',
    companySub: 'وحدة اختبارية',
    title: 'تقرير اختباري',
    meta: 'تاريخ التصدير: 2026-09-02',
    columns: [
      { header: 'ت', key: '#', width: 5, align: 'center' },
      { header: 'DB', key: 'db', width: 12, align: 'center' },
      { header: 'الاسم', key: 'name', width: 22, align: 'right' },
      { header: 'الوزن', key: 'w', width: 12, numFmt: '0.00' },
    ],
    rows: opts?.rows ?? [
      { db: '111', name: 'سائق أول', w: 18.5 },
      { db: '222', name: 'سائق ثانٍ', w: 12.25 },
    ],
    fileName: 't.xlsx',
    orientation: 'landscape',
    totalRow: opts?.totalRow ?? { name: 'الإجمالي', w: 30.75 },
  })
}

describe('colLetter', () => {
  it('يحوّل فهرس العمود إلى حرف Excel', () => {
    expect(colLetter(0)).toBe('A')
    expect(colLetter(7)).toBe('H')
    expect(colLetter(25)).toBe('Z')
    expect(colLetter(26)).toBe('AA')
  })
})

describe('buildExcelReport', () => {
  it('يبني المصنف بالترويسة والعنوان في الصفوف الأولى', async () => {
    const wb = await callReport()
    const ws = wb.getWorksheet('ورقة')
    expect(ws).toBeTruthy()
    expect(String(ws!.getCell('B1').value)).toContain('شركة جزيرة الأكرام')
    expect(String(ws!.getCell('A2').value)).toContain('وحدة اختبارية')
    expect(String(ws!.getCell('A3').value)).toContain('تقرير اختباري')
  })

  it('يضع رؤوس الأعمدة في الصف 5 والبيانات بدءاً من 6', async () => {
    const wb = await callReport()
    const ws = wb.getWorksheet('ورقة')!
    expect(String(ws.getCell(5, 2).value)).toBe('DB')
    expect(String(ws.getCell(5, 3).value)).toBe('الاسم')
    expect(String(ws.getCell(6, 3).value)).toBe('سائق أول')
    expect(Number(ws.getCell(6, 4).value)).toBe(18.5)
    expect(ws.getCell(6, 4).numFmt).toBe('0.00')
  })

  it('يرقّم عمود «ت» تلقائياً', async () => {
    const wb = await callReport()
    const ws = wb.getWorksheet('ورقة')!
    expect(Number(ws.getCell(6, 1).value)).toBe(1)
    expect(Number(ws.getCell(7, 1).value)).toBe(2)
  })

  it('يكتب صف الإجمالي بالقيم الصحيحة', async () => {
    const wb = await callReport()
    const ws = wb.getWorksheet('ورقة')!
    const totalRow = 5 + 2 + 1 // رؤوس + بيانات
    expect(String(ws.getCell(totalRow, 3).value)).toContain('الإجمالي')
    expect(Number(ws.getCell(totalRow, 4).value)).toBeCloseTo(30.75, 2)
  })

  it('يضبط RTL والتجميد والمرشّح وإعداد الطباعة', async () => {
    const wb = await callReport()
    const ws = wb.getWorksheet('ورقة')!
    expect(ws.views?.[0]?.rightToLeft).toBe(true)
    expect(ws.views?.[0]?.state).toBe('frozen')
    expect(ws.autoFilter).toBeTruthy()
    expect(ws.pageSetup?.orientation).toBe('landscape')
    expect(ws.pageSetup?.fitToPage).toBe(true)
  })

  it('يعمل دون صف إجمالي ودون بيانات', async () => {
    const wb = await callReport({ totalRow: undefined, rows: [] })
    const ws = wb.getWorksheet('ورقة')!
    expect(ws).toBeTruthy()
    expect(String(ws.getCell('A3').value)).toContain('تقرير اختباري')
  })
})

describe('تنقية أسماء أوراق Excel — يمنع فشل زر التصدير', () => {
  it('ينقّي اسم الورقة الرئيسية من المحارف الممنوعة (\\ / * ? : [ ])', async () => {
    const wb = await buildExcelReport({
      sheetName: 'حالة الكشوفات (مسودة / مرفوعة)',
      company: 'شركة جزيرة الأكرام',
      title: 'تقرير اختباري',
      columns: [{ header: 'ت', key: '#', width: 5 }],
      rows: [{ '#': 1 }],
      fileName: 't.xlsx',
    })
    const name = wb.worksheets[0]!.name
    expect(name).toContain('–') // استُبدلت «/» بشرطة
    expect(name).not.toMatch(/[*?:\\[\]/]/)
    expect(name.length).toBeLessThanOrEqual(31)
  })

  it('يقصّ الأسماء الطويلة إلى حد Excel (31 حرفاً) ولا يفشل عند الفراغ', async () => {
    const long = 'عنوان طويل جداً '.repeat(4) // > 31 حرفاً مع محارف ممنوعة
    const wb = await buildExcelReport({
      sheetName: long,
      company: 'شركة جزيرة الأكرام',
      title: 'تقرير اختباري',
      columns: [{ header: 'ت', key: '#', width: 5 }],
      rows: [],
      fileName: 't.xlsx',
    })
    expect(wb.worksheets[0]!.name.length).toBeLessThanOrEqual(31)

    const wb2 = await buildExcelReport({
      sheetName: '***',
      company: 'شركة جزيرة الأكرام',
      title: 'تقرير اختباري',
      columns: [{ header: 'ت', key: '#', width: 5 }],
      rows: [],
      fileName: 't.xlsx',
    })
    expect(wb2.worksheets[0]!.name).toBe('–––') // لا اسم فارغ أبداً
  })

  it('ينقّي أسماء أوراق الرسوم البيانية ويضمن تفرّدها', async () => {
    const wb = await buildExcelReport({
      sheetName: 'الكشوفات',
      company: 'شركة جزيرة الأكرام',
      title: 'تقرير اختباري',
      columns: [{ header: 'ت', key: '#', width: 5 }],
      rows: [{ '#': 1 }],
      fileName: 't.xlsx',
      charts: [
        { title: 'حالة الكشوفات (مسودة / مرفوعة)', kind: 'donut', data: [] },
        { title: 'حالة الكشوفات (مسودة / مرفوعة)', kind: 'bar', data: [] },
      ],
    })
    const names = wb.worksheets.map((w) => w.name)
    expect(names.length).toBe(3)
    expect(new Set(names).size).toBe(3) // لا تكرار أسماء
    for (const n of names) {
      expect(n).not.toMatch(/[*?:\\[\]/]/)
      expect(n.length).toBeLessThanOrEqual(31)
    }
    expect(names[2]).toContain(' (2)')
  })
})
