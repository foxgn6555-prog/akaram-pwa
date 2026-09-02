/** كتاب مستلزمات القاطع الرسمي — بنية المحتوى، الشعار، الهروب من XSS */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { supplyBookHtml, toSupplyWord, printSupplyBook } from '@features/sector/lib/supply-book'
import type { SupplyRequest } from '@features/sector'

function makeReq(over: Partial<SupplyRequest> = {}): SupplyRequest {
  return {
    id: 'r1', manager_id: 'u1', manager_name: 'أحمد المدير', shift: 'morning', sectors: [1, 2],
    supply_type: 'أكياس نفايات سعة 50 لتر', quantity: 100, notes: 'للأسبوع الحالي',
    signed: true, ref_no: 'كتاب/مستلزمات/2026/0007', status: 'submitted_to_deputy',
    submitted_at: null, archived_at: null, archive_reason: null, created_at: '2026-09-01T08:00:00Z',
    ...over,
  }
}

describe('كتاب طلب مستلزمات القاطع', () => {
  it('يحمل شعار الشركة الموحّد', () => {
    const html = supplyBookHtml(makeReq())
    expect(html).toContain('icons/logo.png')
  })

  it('يحمل عنوان «كتاب رسمي»', () => {
    const html = supplyBookHtml(makeReq())
    expect(html).toContain('كتاب رسمي')
  })

  it('نافذة الطباعة تُفتح بمستند RTL عربي', () => {
    const write = vi.fn()
    const doc = { write, close: vi.fn() } as unknown as Document
    const win = { document: doc } as unknown as Window
    vi.spyOn(window, 'open').mockReturnValue(win)
    printSupplyBook(makeReq())
    expect(write).toHaveBeenCalledOnce()
    const sent = String(write.mock.calls[0]?.[0] ?? '')
    expect(sent).toContain('dir="rtl"')
    expect(sent).toContain('lang="ar"')
  })

  it('يعرض رقم الكتاب والمقدّم والمستلزمات والعدد', () => {
    const html = supplyBookHtml(makeReq())
    expect(html).toContain('كتاب/مستلزمات/2026/0007')
    expect(html).toContain('أحمد المدير')
    expect(html).toContain('أكياس نفايات سعة 50 لتر')
    expect(html).toContain('100')
  })

  it('يوجّه الكتاب إلى معاون المدير المفوض', () => {
    const html = supplyBookHtml(makeReq())
    expect(html).toContain('معاون المدير المفوض')
  })

  it('يترجم أسماء القواطع من الخريطة', () => {
    const html = supplyBookHtml(makeReq(), { 1: 'القاطع الأول', 2: 'القاطع الثاني' })
    expect(html).toContain('القاطع الأول')
    expect(html).toContain('القاطع الثاني')
  })

  it('يهرب وسوم HTML من المدخلات (منع XSS)', () => {
    const html = supplyBookHtml(makeReq({
      supply_type: '<script>alert(1)</script>أكياس',
      manager_name: '<img src=x onerror=alert(1)>',
      notes: '<b>ملاحظة</b>',
    }))
    expect(html).not.toContain('<script>')
    // لا يُحقن أي وسم <img> خام من بيانات المستخدم (الوسم الوحيد في الصفحة هو شعار الترويسة)
    const imgTags = (html.match(/<img[\s>]/g) ?? []).length
    expect(imgTags).toBe(1) // شعار الشركة فقط
    expect(html).not.toContain('<b>ملاحظة</b>')
    // الوسوم الخطرة تظهر مهرّبة (نص خالص)
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('لا يفشل بدون ملاحظات', () => {
    expect(() => supplyBookHtml(makeReq({ notes: null }))).not.toThrow()
  })

  describe('toSupplyWord', () => {
    const origCreate = URL.createObjectURL
    const origRevoke = URL.revokeObjectURL
    beforeEach(() => {
      URL.createObjectURL = vi.fn(() => 'blob:mock')
      URL.revokeObjectURL = vi.fn()
    })
    afterEach(() => {
      URL.createObjectURL = origCreate
      URL.revokeObjectURL = origRevoke
    })

    it('ينشئ ملف .doc ويبدأ التحميل باسم يحمل رقم الكتاب', () => {
      const click = vi.fn()
      const rec: { download?: string } = {}
      const anchor = {
        click,
        href: '',
        set download(v: string) { rec.download = v },
        get download() { return rec.download ?? '' },
      } as unknown as HTMLAnchorElement
      const createSpy = vi.spyOn(document, 'createElement').mockReturnValue(anchor)
      const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => anchor as unknown as Node)
      const removeSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => anchor as unknown as Node)

      toSupplyWord(makeReq())

      expect(click).toHaveBeenCalledOnce()
      expect(rec.download ?? '').toContain('كتاب-مستلزمات')
      expect(rec.download ?? '').toContain('.doc')
      createSpy.mockRestore()
      appendSpy.mockRestore()
      removeSpy.mockRestore()
    })
  })
})
