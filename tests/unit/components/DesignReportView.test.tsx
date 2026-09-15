/**
 * بنية التقرير المصور الجديد:
 *  · الورقة 1 غلاف يدوي كما هو (أو ورقة عنوان إن غاب)
 *  · ورقة نص وسطية قبل صور كل نوع عمل
 *  · كل 4 صور بصفحة 2×2
 *  · النصوص قابلة للتعديل وتُحفظ عبر onSaveReport
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@features/media/hooks', () => ({
  useSignedPhotoUrls: () => ({ data: {} }),
}))

import DesignReportView from '@portals/media/pages/Designs/DesignReportView'

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
  it('غلاف يدوي + ورقة نص لكل نوع + صفحات رباعية', () => {
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
    // غلاف + (ورقة + صفحتان) لكنس + (ورقة + صفحة) للغسل = 6
    expect(pages.length).toBe(6)
    expect(screen.getByAltText('غلاف التقرير')).toBeInTheDocument()
    expect(screen.getByText('كنس الشوارع')).toBeInTheDocument()
    expect(screen.getByText('غسل المدارس')).toBeInTheDocument()
    // كنس: صفحة أولى 4 خلايا وثانية خلية واحدة — غسل: صفحتان في صفحة واحدة
    const grids = container.querySelectorAll('.rp-grid')
    expect(grids[0]?.children.length).toBe(4)
    expect(grids[1]?.children.length).toBe(1)
    expect(grids[2]?.children.length).toBe(2)
  })

  it('بلا غلاف: ورقة عنوان مطابقة للقالب', () => {
    const { container } = render(
      <DesignReportView title="عنوان التصميم" coverUrl={null} groups={[]} />,
    )
    const pages = container.querySelectorAll('.rp-page')
    expect(pages.length).toBe(1)
    expect(pages[0]?.querySelector('.rp-sheet-inner .rp-sheet-text')?.textContent).toBe(
      'عنوان التصميم',
    )
  })

  it('تعديل العبارة فوق الصورة ثم حفظ التعديلات', async () => {
    const onSave = vi.fn(async () => {})
    const { container } = render(
      <DesignReportView
        {...base}
        groups={[{ workType: 'كنس الشوارع', photos: [photo(1)] }]}
        onSaveReport={onSave}
      />,
    )
    // العنصران القابلان للتعديل: ورقة النص ثم شريط العبارة
    const editables = screen.getAllByTitle('انقر لتعديل النص')
    expect(editables.length).toBe(2)
    fireEvent.click(editables[1]!)
    const input = screen.getByLabelText('عبارة صورة كنس الشوارع')
    fireEvent.change(input, { target: { value: 'كنس شارع المستنك' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // ظهر زر الحفظ
    fireEvent.click(screen.getByText('حفظ التعديلات'))
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled())
    const [sheets, captions] = onSave.mock.calls[0] as unknown as [
      Array<{ workType: string; text: string }>,
      Array<{ rowId: string; text: string }>,
    ]
    expect(sheets).toEqual([{ workType: 'كنس الشوارع', text: 'كنس الشوارع' }])
    expect(captions).toEqual([{ rowId: 'row-1', text: 'كنس شارع المستنك' }])
    expect(container.querySelector('.rp-bar-input')).toBeNull()
  })
})
