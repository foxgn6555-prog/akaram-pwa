/**
 * بنية التقرير المصور:
 *  · الورقة 1 غلاف يدوي كما هو (أو ورقة عنوان إن غاب)
 *  · الورقة 2 صفحة الجدول الرسمية قابلة للتعديل بالكامل
 *  · ورقة نص وسطية قبل صور كل نوع عمل
 *  · كل 4 صور بصفحة 2×2 بعبارات وأبعاد وألوان قابلة للتعديل تُحفظ عبر onSaveReport
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@features/media/hooks', () => ({
  useSignedPhotoUrls: () => ({ data: {} }),
}))

import DesignReportView, { type ReportSummary } from '@portals/media/pages/Designs/DesignReportView'

const photo = (n: number) => ({
  id: `src-${n}`,
  rowId: `row-${n}`,
  path: `p${n}`,
  caption: `صورة ${n}`,
  reportCaption: null,
})

const base = {
  title: 'تجربة بنية الأوراق',
  coverUrl: 'blob:cover',
}

describe('بنية أوراق التقرير', () => {
  it('غلاف + صفحة جدول + ورقة نص لكل نوع + صفحات رباعية', () => {
    const { container } = render(
      <DesignReportView
        {...base}
        groups={[
          { workType: 'كنس الشوارع', photos: [1, 2, 3, 4, 5].map((n) => photo(n)) },
          { workType: 'غسل المدارس', photos: [6, 7].map((n) => photo(n)) },
        ]}
      />,
    )
    const pages = container.querySelectorAll('.rp-page')
    // غلاف + جدول + (ورقة + صفحتان) لكنس + (ورقة + صفحة) للغسل = 7
    expect(pages.length).toBe(7)
    expect(screen.getByAltText('غلاف التقرير')).toBeInTheDocument()
    expect(pages[1]?.querySelector('.rp-summary')).not.toBeNull()
    // الفقرات المنجزة تُشتق تلقائياً من أنواع العمل
    expect(screen.getAllByText('كنس الشوارع').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('غسل المدارس').length).toBeGreaterThanOrEqual(2)
    const grids = container.querySelectorAll('.rp-grid')
    expect(grids[0]?.children.length).toBe(4)
    expect(grids[1]?.children.length).toBe(1)
    expect(grids[2]?.children.length).toBe(2)
  })

  it('بلا غلاف: ورقة عنوان + صفحة الجدول', () => {
    const { container } = render(
      <DesignReportView title="عنوان التصميم" coverUrl={null} groups={[]} />,
    )
    const pages = container.querySelectorAll('.rp-page')
    expect(pages.length).toBe(2)
    expect(pages[0]?.querySelector('.rp-sheet-inner .rp-sheet-text')?.textContent).toBe('عنوان التصميم')
  })

  it('تعديل العبارة فوق الصورة ثم حفظ التعديلات بأبعادها وملخصها وألوانها', async () => {
    const onSave = vi.fn(async () => {})
    const { container } = render(
      <DesignReportView
        {...base}
        groups={[{ workType: 'كنس الشوارع', photos: [photo(1)] }]}
        onSaveReport={onSave}
      />,
    )
    // تعديل شريط العبارة
    fireEvent.click(container.querySelector('.rp-bar')!)
    const input = screen.getByLabelText('عبارة صورة كنس الشوارع')
    fireEvent.change(input, { target: { value: 'كنس شارع المستنك' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // تقريب الصورة
    fireEvent.click(screen.getByLabelText('تقريب'))
    // تغيير لون الحدود
    fireEvent.change(screen.getByLabelText('لون الحدود'), { target: { value: '#123456' } })
    fireEvent.click(screen.getByTestId('report-save'))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
    const [sheets, captions, extra] = onSave.mock.calls[0] as unknown as [
      Array<{ workType: string; text: string }>,
      Array<{ rowId: string; text: string; fit: string; zoom: number }>,
      { summary: ReportSummary; colors: Record<string, string> },
    ]
    expect(sheets).toEqual([{ workType: 'كنس الشوارع', text: 'كنس الشوارع' }])
    expect(captions).toEqual([
      { rowId: 'row-1', text: 'كنس شارع المستنك', fit: 'contain', zoom: 1.25 },
    ])
    expect(extra.colors.border).toBe('#123456')
    expect(extra.summary.rows.map((r) => r.work)).toEqual(['كنس الشوارع'])
  })

  it('جدول الملخص: ثلاثة أعمدة ثابتة المحاذاة وصف ترويسة مستقل', () => {
    const { container } = render(
      <DesignReportView
        {...base}
        groups={[{ workType: 'كنس الشوارع', photos: [photo(1)] }]}
      />,
    )
    const table = container.querySelector('.rp-summary table')!
    expect(table.querySelectorAll('colgroup col').length).toBe(3)
    const headerRow = table.querySelectorAll('tr')[3]!
    expect(headerRow.children.length).toBe(3)
    expect(headerRow.textContent).toContain('الفقرات المنجزة')
    expect(headerRow.textContent).toContain('اسم القاطع')
    expect(headerRow.textContent).toContain('ت')
    // صف الفقرات الأول: عمود العمل + القاطع (rowSpan) + الترقيم
    const firstRow = table.querySelectorAll('tr')[4]!
    expect(firstRow.children.length).toBe(3)
  })

  it('لوحة التخصيص: حالة التقرير + قوالب الصفحات والخط والثيم تُطبق وتُحفظ', async () => {
    const onSave = vi.fn(async () => {})
    const { container } = render(
      <DesignReportView
        {...base}
        groups={[{ workType: 'كنس الشوارع', photos: [1, 2, 3, 4].map((n) => photo(n)) }]}
        onSaveReport={onSave}
      />,
    )
    // حالة التقرير: غلاف وصور وأوراق
    expect(screen.getByText('✓ الغلاف مرفوع')).toBeInTheDocument()
    expect(screen.getByText('4 صورة')).toBeInTheDocument()
    expect(screen.getByText('4 ورقة')).toBeInTheDocument()
    // القالب الافتراضي كلاسيكي ثم فسيفساء
    expect(container.querySelector('.rp-grid')?.getAttribute('data-layout')).toBe('classic')
    fireEvent.click(screen.getByText('فسيفساء: عنوان كبير + ثلاث'))
    expect(container.querySelector('.rp-grid')?.getAttribute('data-layout')).toBe('mosaic')
    // الخط
    fireEvent.click(screen.getByText('أميري'))
    expect((container.querySelector('#design-report') as HTMLElement).style.fontFamily).toContain('Amiri')
    // الثيم الأخضر: صف التاريخ كهرماني ضمن الثيم
    fireEvent.click(screen.getByText('أخضر ميداني'))
    const dateRow = container.querySelectorAll('table tbody tr')[2] as HTMLElement
    expect(dateRow.style.background).toMatch(/fbbf24|251, 191, 36/)
    // قالب ورقة النص
    fireEvent.click(screen.getByText('إطار مزدوج'))
    expect(container.querySelector('.rp-sheet-inner')?.getAttribute('data-style')).toBe('double')
    // الحفظ يحمل النمط كاملاً
    fireEvent.click(screen.getByTestId('report-save'))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
    const extra = (onSave.mock.calls[0] as unknown[])[2] as { style: Record<string, string> }
    expect(extra.style).toEqual({
      photoLayout: 'mosaic',
      sheetStyle: 'double',
      summaryTheme: 'green',
      font: 'amiri',
    })
  })

  it('القوالب الموسعة: شريط فيلم وكولاج وخط تحت النص والثيم الملكي', () => {
    const { container } = render(
      <DesignReportView
        {...base}
        groups={[{ workType: 'كنس الشوارع', photos: [1, 2, 3, 4].map((n) => photo(n)) }]}
        onSaveReport={vi.fn(async () => {})}
      />,
    )
    fireEvent.click(screen.getByText('شريط فيلم أفقي'))
    expect(container.querySelector('.rp-grid')?.getAttribute('data-layout')).toBe('film')
    fireEvent.click(screen.getByText('كولاج: كبير جانبياً'))
    expect(container.querySelector('.rp-grid')?.getAttribute('data-layout')).toBe('collage')
    fireEvent.click(screen.getByText('خط أنيق تحت النص'))
    expect(container.querySelector('.rp-sheet-inner')?.getAttribute('data-style')).toBe('underline')
    fireEvent.click(screen.getByText('بنفسجي ملكي'))
    const orgRow = container.querySelectorAll('table tbody tr')[0] as HTMLElement
    expect(orgRow.style.background).toMatch(/581c87|88, 28, 135/)
  })

  it('css الطباعة يفكك الحاويات الثابتة ويفصل الأوراق', () => {
    const { container } = render(
      <DesignReportView {...base} groups={[{ workType: 'كنس الشوارع', photos: [photo(1)] }]} />,
    )
    const css = container.querySelector('style')?.textContent ?? ''
    expect(css).toContain('[data-rp-overlay]')
    expect(css).toContain('[data-rp-preview]')
    expect(css).toContain('break-after: page')
    expect(css).not.toContain('inset: 0; width: 100%')
    // الألوان تُطبع إجبارياً ورؤوس المتصفح مُلغاة بالهامش الصفري
    expect(css).toContain('print-color-adjust: exact')
    expect(css).toContain('@page { size: A4; margin: 0; }')
  })

  it('صفحة الجدول: تعديل قيمة التاريخ وإضافة فقرة', async () => {
    const onSave = vi.fn(async () => {})
    const { container } = render(
      <DesignReportView
        {...base}
        groups={[{ workType: 'كنس الشوارع', photos: [photo(1)] }]}
        onSaveReport={onSave}
      />,
    )
    const summaryPage = container.querySelectorAll('.rp-page')[1]!
    const dateBtn = summaryPage.querySelectorAll('table tbody tr')[2]!.querySelectorAll('.rp-editable')[1]!
    fireEvent.click(dateBtn)
    const dateInput = screen.getByLabelText('قيمة التاريخ')
    fireEvent.change(dateInput, { target: { value: 'من 1 الى 14 اب 2026' } })
    fireEvent.keyDown(dateInput, { key: 'Enter' })
    fireEvent.click(screen.getByText('+ إضافة فقرة'))
    fireEvent.click(screen.getByTestId('report-save'))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
    const [, , extra] = onSave.mock.calls[0] as unknown as [
      unknown,
      unknown,
      { summary: ReportSummary; colors: unknown },
    ]
    expect(extra.summary.dateValue).toBe('من 1 الى 14 اب 2026')
    expect(extra.summary.rows.length).toBe(2)
  })
})
