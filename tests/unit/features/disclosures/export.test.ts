/**
 * وظائف تصدير الكشوفات — Excel (exceljs) / Word / طباعة.
 * نتحقق من بنية المصنف الفعلي + بناء نموذج HTML + تنزيل Word + نافذة الطباعة.
 */
import { describe, it, expect, vi } from 'vitest'

const clickSpy = vi.fn()

import { toExcel, toWord, printDisclosure, disclosureHtml } from '@features/disclosures/lib/export'
import type { Disclosure } from '@features/disclosures/types'

const d = {
  id: 'd1', ref_no: 'م/كشف 1', db_number: '88120', driver_name: 'سائق مخالف',
  vehicle_type: 'قلاب', contractor_name: 'متعهد', sector: 'القطاع الشمالي',
  shift: 'morning', log_date: '2026-08-31', violation_type: 'delay',
  penalty_type: 'warning', details: 'تأخر عن الدوام ثلاث مرات',
  status: 'draft', submitted_at: null, prepared_by_name: 'المنظم',
  archived_at: null, archived_by: null, archive_reason: null,
  created_by: null, created_at: null,
} as unknown as Disclosure

describe('disclosureHtml — بناء النموذج', () => {
  it('يضمّن البيانات الأساسية والحقول المطلوبة من النموذج', () => {
    const html = disclosureHtml(d)
    expect(html).toContain('88120')
    expect(html).toContain('سائق مخالف')
    expect(html).toContain('شركة جزيرة الأكرام')
    expect(html).toContain('معاون المدير المفوض')
    expect(html).toContain('تفاصيل الكشف')
    expect(html).toContain('اسم منظم الكشف')
    expect(html).toContain('تأخير')
    // الشعار
    expect(html).toContain('icons/logo.png')
  })

  it('يهرب النصوص الخاصة HTML لتفادي الكسر', () => {
    const evil = { ...d, driver_name: '<script>x</script>' } as Disclosure
    const html = disclosureHtml(evil)
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('يعرض المخالفات الجديدة (انسحاب مبكر / نقص حمولة)', () => {
    expect(disclosureHtml({ ...d, violation_type: 'early_withdrawal' } as Disclosure))
      .toContain('انسحاب مبكر')
    expect(disclosureHtml({ ...d, violation_type: 'load_deficiency' } as Disclosure))
      .toContain('نقص حمولة')
  })
})

describe('toExcel — تقرير exceljs احترافي', () => {
  it('يبني مصنف «الكشوفات» بترويسة الشركة ورؤوس الأعمدة والبيانات', async () => {
    const wb = await toExcel([d])
    const ws = wb.getWorksheet('الكشوفات')
    expect(ws).toBeTruthy()

    // اسم الشركة + العنوان
    expect(String(ws!.getCell('B1').value ?? '')).toContain('شركة جزيرة الأكرام')
    expect(String(ws!.getCell('A3').value ?? '')).toContain('سجل الكشوفات')

    // رؤوس الأعمدة صف 5 — DB واسم السائق ونوع المخالفة
    const headers = [3, 4, 10].map((c) => String(ws!.getCell(5, c).value))
    expect(headers.join('|')).toContain('DB')
    expect(headers.join('|')).toContain('اسم السائق')
    expect(headers.join('|')).toContain('نوع المخالفة')

    // صف البيانات الأول صف 6 — السائق و DB
    expect(String(ws!.getCell(6, 4).value)).toBe('سائق مخالف')
    expect(String(ws!.getCell(6, 3).value)).toBe('88120')
  })

  it('يضبط RTL والتجميد والمرشّح واتجاه الطباعة أفقي', async () => {
    const wb = await toExcel([d])
    const ws = wb.getWorksheet('الكشوفات')!
    expect(ws.views?.[0]?.rightToLeft).toBe(true)
    expect(ws.views?.[0]?.state).toBe('frozen')
    expect(ws.autoFilter).toBeTruthy()
    expect(ws.pageSetup?.orientation).toBe('landscape')
  })

  it('يعالج قائمة فارغة دون أخطاء', async () => {
    const wb = await toExcel([])
    expect(wb.getWorksheet('الكشوفات')).toBeTruthy()
  })
})

describe('toWord', () => {
  it('ينشئ ملف .doc ويحفز التنزيل', () => {
    const createUrl = vi.fn(() => 'blob:test')
    const revoke = vi.fn()
    const origCreate = (URL as unknown as { createObjectURL?: unknown }).createObjectURL
    const origRevoke = (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL
    Object.defineProperty(URL, 'createObjectURL', { value: createUrl, configurable: true, writable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revoke, configurable: true, writable: true })

    const anchor = {
      href: '', download: '', click: clickSpy,
    } as unknown as HTMLAnchorElement
    const createEl = vi.spyOn(document, 'createElement').mockReturnValue(anchor)
    const append = vi.spyOn(document.body, 'appendChild').mockImplementation(() => anchor as never)
    const remove = vi.spyOn(document.body, 'removeChild').mockImplementation(() => anchor as never)

    toWord(d)

    expect(createEl).toHaveBeenCalledWith('a')
    expect(anchor.download).toContain('.doc')
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(createUrl).toHaveBeenCalledTimes(1)

    append.mockRestore(); remove.mockRestore(); createEl.mockRestore()
    if (origCreate) Object.defineProperty(URL, 'createObjectURL', { value: origCreate, configurable: true, writable: true })
    if (origRevoke) Object.defineProperty(URL, 'revokeObjectURL', { value: origRevoke, configurable: true, writable: true })
  })
})

describe('printDisclosure', () => {
  it('يفتح نافذة طباعة ويكتب المستند', () => {
    const write = vi.fn()
    const close = vi.fn()
    const fakeWin = { document: { write, close } } as unknown as Window
    vi.spyOn(window, 'open').mockReturnValue(fakeWin)

    printDisclosure(d)
    expect(window.open).toHaveBeenCalled()
    expect(write).toHaveBeenCalledTimes(1)
    expect(String(write.mock.calls[0]?.[0])).toContain('<html')
  })
})
