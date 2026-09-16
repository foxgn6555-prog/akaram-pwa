/**
 * المصمم: ملء الشاشة + فتح الصور بالعارض + سحب وإفلات بين أنواع العمل
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ reorder: vi.fn() }))

vi.mock('@features/media/hooks', () => ({
  useDesigns: () => ({ data: [], isLoading: false }),
  useDesignDetail: () => ({
    isLoading: false,
    refetch: vi.fn(),
    data: {
      design: {
        id: 'd1',
        title: 'تقرير',
        period_type: 'first_half',
        sector_parent: 'karrada',
        status: 'draft',
        photo_count: 3,
        cover_image_path: null,
        period_start: '2026-09-01',
        period_end: '2026-09-14',
        summary: null,
        template_colors: null,
      },
      sheets: [],
      photos: [
        { photo_id: 'r1', source_photo_id: 's1', source_submission_id: 'x', work_type: 'كنس الشوارع', storage_path: 'p1', caption: 'أ', report_caption: null, display_fit: 'contain', display_zoom: 1, sort_order: 1 },
        { photo_id: 'r2', source_photo_id: 's2', source_submission_id: 'x', work_type: 'كنس الشوارع', storage_path: 'p2', caption: 'ب', report_caption: null, display_fit: 'contain', display_zoom: 1, sort_order: 2 },
        { photo_id: 'r3', source_photo_id: 's3', source_submission_id: 'x', work_type: 'غسل المدارس', storage_path: 'p3', caption: 'ج', report_caption: null, display_fit: 'contain', display_zoom: 1, sort_order: 1 },
      ],
    },
  }),
  useUpdateDesign: () => ({ mutate: vi.fn(), isPending: false }),
  useCompleteDesign: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveDesignPhoto: () => ({ mutate: vi.fn(), isPending: false }),
  useAddDesignPhotos: () => ({ mutate: vi.fn(), isPending: false }),
  useUploadCover: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteDesign: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveDesignReport: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReorderDesignPhotos: () => ({ mutate: h.reorder, isPending: false }),
  useSignedPhotoUrls: (paths: string[]) => ({
    data: Object.fromEntries(paths.map((p) => [p, `url:${p}`])),
  }),
  useSubmissions: () => ({ data: [] }),
  useSubmissionPhotos: () => ({ data: [], isLoading: false }),
}))

import MediaDesignsPage from '@portals/media/pages/Designs/MediaDesignsPage'

const openComposer = () =>
  render(
    <MemoryRouter initialEntries={['/media/designs?open=d1']}>
      <MediaDesignsPage />
    </MemoryRouter>,
  )

beforeEach(() => h.reorder.mockReset())

describe('المصمم بملء الشاشة', () => {
  it('يفتح بملء الشاشة مع تلميح السحب', () => {
    openComposer()
    expect(screen.getByTestId('composer-fullscreen')).toBeInTheDocument()
    expect(screen.getByText(/ملء الشاشة/)).toBeInTheDocument()
  })

  it('النقر على صورة يفتح العارض ويُغلق بالنقر', () => {
    openComposer()
    fireEvent.click(screen.getAllByLabelText('فتح الصورة')[0]!)
    const box = screen.getByTestId('lightbox')
    expect(box).toBeInTheDocument()
    fireEvent.click(box)
    expect(screen.queryByTestId('lightbox')).toBeNull()
  })

  it('سحب صورة وإفلاتها في نوع عمل آخر ينقلها ويحفظ الترتيب', () => {
    openComposer()
    fireEvent.dragStart(screen.getByTestId('drag-r1'))
    const target = screen.getByTestId('drop-group-غسل المدارس')
    fireEvent.dragOver(target)
    fireEvent.drop(target)
    expect(h.reorder).toHaveBeenCalled()
    const items = h.reorder.mock.calls[0]![0]![0] as Array<{
      rowId: string
      workType: string
      sortOrder: number
    }>
    const moved = items.find((i) => i.rowId === 'r1')
    expect(moved?.workType).toBe('غسل المدارس')
    // الصورة المنقولة بعد الموجودة في المجموعة الهدف
    const existing = items.find((i) => i.rowId === 'r3')
    expect((moved?.sortOrder ?? 0) > (existing?.sortOrder ?? 0)).toBe(true)
  })
})
