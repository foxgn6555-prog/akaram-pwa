/**
 * 00203 — مكتبة الغلافات: ترشيح نقي، نافذة الاختيار (شبكة/بحث/فلاتر/فارغ)، الاختيار يسجّل الاستخدام ويعيد المسار،
 * الإضافة بالملف + البيانات، التعديل، الأرشفة/الاستعادة، وزر «حفظ في المكتبة» للغلاف اليدوي، والتكامل مع المصمم.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({
  add: vi.fn(), save: vi.fn(), update: vi.fn(), status: vi.fn(), touch: vi.fn(), designUpdate: vi.fn(),
  covers: [] as unknown[],
}))
vi.mock('@features/media/hooks', () => ({
  useMediaCovers: () => ({ data: h.covers, isLoading: false }),
  useAddMediaCover: () => ({ mutate: h.add, isPending: false }),
  useSaveCoverToLibrary: () => ({ mutate: h.save, isPending: false }),
  useUpdateMediaCover: () => ({ mutate: h.update, isPending: false }),
  useSetMediaCoverStatus: () => ({ mutate: h.status, isPending: false }),
  useTouchMediaCover: () => ({ mutate: h.touch, isPending: false }),
  useSignedPhotoUrls: (paths: string[]) => ({ data: Object.fromEntries(paths.map((p) => [p, `url:${p}`])) }),
  // للمصمم
  useDesigns: () => ({ data: [], isLoading: false }),
  useDesignDetail: () => ({
    isLoading: false, refetch: vi.fn(),
    data: {
      design: { id: 'd1', title: 'التقرير اليومي — الكرادة', period_type: 'daily', sector_parent: 'karrada', status: 'draft', photo_count: 0, cover_image_path: null, period_start: '2026-10-07', period_end: '2026-10-07', summary: null, template_colors: null },
      sheets: [], photos: [],
    },
  }),
  useUpdateDesign: () => ({ mutate: h.designUpdate, isPending: false }),
  useCompleteDesign: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveDesignPhoto: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveDesignPhotos: () => ({ mutate: vi.fn(), isPending: false }),
  useAddDesignPhotos: () => ({ mutate: vi.fn(), isPending: false }),
  useUploadCover: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteDesign: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveDesignReport: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReorderDesignPhotos: () => ({ mutate: vi.fn(), isPending: false }),
  useSubmissions: () => ({ data: [] }),
  useSubmissionPhotos: () => ({ data: [], isLoading: false }),
}))

import { CoverLibraryDialog, PickCoverButton, SaveCoverToLibraryButton, filterCovers } from '@portals/media/components/CoverLibrary'
import MediaDesignsPage from '@portals/media/pages/Designs/MediaDesignsPage'
import type { MediaCover } from '@features/media/hooks'

const cover = (o: Partial<MediaCover>): MediaCover => ({ id: 'c', title: 'غلاف', storage_path: 'media-officer/c.jpg', sector_parent: null, period_type: null, tags: '', use_count: 0, status: 'active', created_at: '', updated_at: '', ...o })
const LIB = [
  cover({ id: 'c1', title: 'الإنجاز اليومي — الكرادة (ليلي)', storage_path: 'media-officer/k-night.jpg', sector_parent: 'karrada', period_type: 'daily', tags: 'ليلي', use_count: 9 }),
  cover({ id: 'c2', title: 'التقرير الشهري الزعفرانية', storage_path: 'media-officer/z-month.jpg', sector_parent: 'zaafaraniya', period_type: 'monthly' }),
  cover({ id: 'c3', title: 'غلاف عام', storage_path: 'media-officer/general.jpg' }),
  cover({ id: 'c4', title: 'قديم', storage_path: 'media-officer/old.jpg', status: 'archived' }),
]
beforeEach(() => { Object.values(h).forEach((f) => typeof f === 'function' && (f as ReturnType<typeof vi.fn>).mockReset()); h.covers = LIB })

describe('filterCovers (نقي)', () => {
  it('القاطع/النوع العام يظهر دائماً؛ المحدد يظهر لقاطعه فقط؛ البحث في العنوان والوسوم', () => {
    expect(filterCovers(LIB, { sector: 'karrada' }).map((c) => c.id)).toEqual(['c1', 'c3', 'c4'])
    expect(filterCovers(LIB, { sector: 'zaafaraniya', periodType: 'monthly' }).map((c) => c.id)).toEqual(['c2', 'c3', 'c4'])
    expect(filterCovers(LIB, { periodType: 'daily' }).map((c) => c.id)).toEqual(['c1', 'c3', 'c4'])
    expect(filterCovers(LIB, { q: 'ليلي' }).map((c) => c.id)).toEqual(['c1'])
    expect(filterCovers(LIB, {}).length).toBe(4)
  })
})

describe('CoverLibraryDialog', () => {
  it('تعرض الشبكة بالفلاتر الافتراضية (قاطع التصميم ونوعه) وتميّز الغلاف الحالي', () => {
    render(<CoverLibraryDialog close={vi.fn()} onPick={vi.fn()} defaultSector="karrada" defaultPeriod="daily" current="media-officer/k-night.jpg" />)
    const grid = screen.getByTestId('cover-grid')
    expect(within(grid).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByTestId('cover-item-c1').className).toContain('ring-2')
    expect(screen.getByText(/استُخدم 9/)).toBeInTheDocument()
    expect(screen.getByAltText('الإنجاز اليومي — الكرادة (ليلي)')).toHaveAttribute('src', 'url:media-officer/k-night.jpg')
  })
  it('البحث والفلاتر تُضيّق النتائج وتظهر حالة فارغة', () => {
    render(<CoverLibraryDialog close={vi.fn()} onPick={vi.fn()} />)
    fireEvent.change(screen.getByTestId('cover-search'), { target: { value: 'الزعفرانية' } })
    expect(within(screen.getByTestId('cover-grid')).getAllByRole('listitem')).toHaveLength(1)
    fireEvent.change(screen.getByTestId('cover-search'), { target: { value: 'لا شيء' } })
    expect(screen.getByTestId('cover-library-empty')).toBeInTheDocument()
  })
  it('الاختيار يسجّل الاستخدام ويعيد المسار ويغلق؛ المؤرشف لا يُختار', () => {
    const onPick = vi.fn(); const close = vi.fn()
    render(<CoverLibraryDialog close={close} onPick={onPick} />)
    expect(screen.getByTestId('cover-pick-c4')).toBeDisabled()
    fireEvent.click(screen.getByTestId('cover-pick-c1'))
    expect(h.touch).toHaveBeenCalledWith(['c1'])
    expect(onPick).toHaveBeenCalledWith('media-officer/k-night.jpg', expect.objectContaining({ id: 'c1' }))
    expect(close).toHaveBeenCalled()
  })
  it('إضافة غلاف: اختيار ملف ⇒ نموذج بيانات ⇒ add(file, meta)؛ العنوان القصير يمنع الحفظ', () => {
    render(<CoverLibraryDialog close={vi.fn()} defaultSector="karrada" defaultPeriod="daily" />)
    const file = new File(['x'], 'night-cover.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByTestId('cover-add-file'), { target: { files: [file] } })
    expect((screen.getByTestId('cover-title') as HTMLInputElement).value).toBe('night-cover')
    expect((screen.getByTestId('cover-sector') as HTMLSelectElement).value).toBe('karrada')
    fireEvent.change(screen.getByTestId('cover-title'), { target: { value: 'x' } })
    expect(screen.getByTestId('cover-meta-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('cover-title'), { target: { value: 'الإنجاز اليومي' } })
    fireEvent.change(screen.getByTestId('cover-period'), { target: { value: 'weekly' } })
    fireEvent.click(screen.getByTestId('cover-meta-submit'))
    expect(h.add).toHaveBeenCalledWith([file, { title: 'الإنجاز اليومي', sector: 'karrada', periodType: 'weekly', tags: '' }], expect.anything())
  })
  it('تعديل البيانات والأرشفة والاستعادة', () => {
    render(<CoverLibraryDialog close={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('تعديل غلاف عام'))
    fireEvent.change(screen.getByTestId('cover-title'), { target: { value: 'غلاف عام رسمي' } })
    fireEvent.click(screen.getByTestId('cover-meta-submit'))
    expect(h.update).toHaveBeenCalledWith(['c3', { title: 'غلاف عام رسمي', sector: null, periodType: null, tags: '' }], expect.anything())
    fireEvent.click(screen.getByLabelText('أرشفة غلاف عام'))
    expect(h.status).toHaveBeenCalledWith(['c3', 'archived'])
    fireEvent.click(screen.getByLabelText('استعادة قديم'))
    expect(h.status).toHaveBeenCalledWith(['c4', 'active'])
  })
})

describe('الأزرار المساعدة والتكامل', () => {
  it('SaveCoverToLibraryButton يحفظ المسار المرفوع يدوياً مع بيانات التصميم الافتراضية', () => {
    render(<SaveCoverToLibraryButton storagePath="media-officer/manual.jpg" defaultTitle="التقرير اليومي — الكرادة" defaultSector="karrada" defaultPeriod="daily" />)
    fireEvent.click(screen.getByTestId('save-cover-to-library'))
    expect((screen.getByTestId('cover-title') as HTMLInputElement).value).toBe('التقرير اليومي — الكرادة')
    fireEvent.click(screen.getByTestId('cover-meta-submit'))
    expect(h.save).toHaveBeenCalledWith(['media-officer/manual.jpg', { title: 'التقرير اليومي — الكرادة', sector: 'karrada', periodType: 'daily', tags: '' }], expect.anything())
  })
  it('PickCoverButton يفتح النافذة في body ويمرر الاختيار', () => {
    const onPick = vi.fn()
    render(<PickCoverButton onPick={onPick} />)
    fireEvent.click(screen.getByTestId('open-cover-library'))
    expect(screen.getByTestId('cover-library').parentElement).toBe(document.body)
    fireEvent.click(screen.getByTestId('cover-pick-c3'))
    expect(onPick).toHaveBeenCalledWith('media-officer/general.jpg', expect.anything())
    expect(screen.queryByTestId('cover-library')).toBeNull()
  })
  it('المصمم: اختيار غلاف من المكتبة يحفظه فوراً في التصميم ويظهر زر «حفظ في المكتبة»', () => {
    render(<MemoryRouter initialEntries={['/media/designs?open=d1']}><MediaDesignsPage /></MemoryRouter>)
    expect(screen.queryByTestId('save-cover-to-library')).toBeNull()
    fireEvent.click(screen.getByTestId('open-cover-library'))
    fireEvent.click(screen.getByTestId('cover-pick-c1'))
    expect(h.designUpdate).toHaveBeenCalledWith(['d1', expect.objectContaining({ coverPath: 'media-officer/k-night.jpg', periodType: 'daily' })], expect.anything())
    expect(screen.getByTestId('save-cover-to-library')).toBeInTheDocument()
  })
})
