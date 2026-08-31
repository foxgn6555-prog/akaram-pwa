/**
 * وظائف تصدير الكشوفات — Excel / Word / طباعة.
 * نتأكد أن الدوال تُنفّذ دون أخطاء (مكتبة xlsx تُحمَّل كسولة).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// محاكاة تنزيل المتصفح وفتح النوافذ
const mockWriteFile = vi.fn()
const clickSpy = vi.fn()
vi.mock('xlsx', () => ({
  utils: {
    aoa_to_sheet: vi.fn((rows) => ({ __rows: rows })),
    encode_cell: vi.fn(({ r, c }: { r: number; c: number }) =>
      String.fromCharCode(65 + c) + (r + 1)),
    book_new: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
  },
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}))

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

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

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

describe('toExcel', () => {
  it('يستدعي xlsx.writeFile مع مصنف واسم ملف', async () => {
    await toExcel([d])
    expect(mockWriteFile).toHaveBeenCalledTimes(1)
    const filename = mockWriteFile.mock.calls[0]?.[1]
    expect(String(filename)).toContain('.xlsx')
  })
})

describe('toWord', () => {
  it('ينشئ ملف .doc ويحفز التنزيل', () => {
    const createUrl = vi.fn(() => 'blob:test')
    const revoke = vi.fn()
    // jsdom لا يوفّر createObjectURL — نثبّتها يدوياً
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
