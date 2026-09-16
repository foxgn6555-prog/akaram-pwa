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
    const dateBtn = summaryPage.querySelectorAll('.bg-amber-400 .rp-editable')[1]!
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
