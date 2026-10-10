/**
 * 00198 — إصلاحات بوابة الإعلام:
 *   المحرر يفتح بالنوع/الغلاف/التاريخ الحقيقيين للتصميم (لا «نصف شهري» بلا غلاف) · يوم التقرير ثابت ويُغيَّر صراحةً
 *   · حذف صور الفقرة/كل الصور بضغطة · يوم التذكرة بتوقيت بغداد · المسودة تُختار بالفترة لا بالنوع فقط
 *   · جدول الفقرات يتبع فقرات التصميم · حسابات ضغط الصور · المصمم يُرسم في body فوق الشريط الجانبي.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({ update: vi.fn(), removeMany: vi.fn(), loading: false, design: {} as Record<string, unknown> }))
vi.mock('@features/media/hooks', () => ({
  useDesigns: () => ({ data: [], isLoading: false }),
  useDesignDetail: () => ({
    isLoading: h.loading, refetch: vi.fn(),
    data: h.loading ? undefined : {
      design: { id: 'd1', title: 'التقرير اليومي — الكرادة', period_type: 'daily', sector_parent: 'karrada', status: 'draft', photo_count: 3, cover_image_path: 'media-officer/cover-1.jpg', period_start: '2026-10-07', period_end: '2026-10-07', summary: null, template_colors: null, ...h.design },
      sheets: [],
      photos: [
        { photo_id: 'r1', source_photo_id: 's1', source_submission_id: 'x', work_type: 'كنس الشوارع', storage_path: 'p1', caption: 'أ', report_caption: null, display_fit: 'contain', display_zoom: 1, sort_order: 1 },
        { photo_id: 'r2', source_photo_id: 's2', source_submission_id: 'x', work_type: 'كنس الشوارع', storage_path: 'p2', caption: 'ب', report_caption: null, display_fit: 'contain', display_zoom: 1, sort_order: 2 },
        { photo_id: 'r3', source_photo_id: 's3', source_submission_id: 'y', work_type: 'غسل المدرسة', storage_path: 'p3', caption: 'ج', report_caption: null, display_fit: 'contain', display_zoom: 1, sort_order: 3 },
      ],
    },
  }),
  useUpdateDesign: () => ({ mutate: h.update, isPending: false }),
  useCompleteDesign: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveDesignPhoto: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveDesignPhotos: () => ({ mutate: h.removeMany, isPending: false }),
  useAddDesignPhotos: () => ({ mutate: vi.fn(), isPending: false }),
  useUploadCover: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteDesign: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveDesignReport: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReorderDesignPhotos: () => ({ mutate: vi.fn(), isPending: false }),
  useSignedPhotoUrls: (paths: string[]) => ({ data: Object.fromEntries(paths.map((p) => [p, `url:${p}`])) }),
  useSubmissions: () => ({ data: [] }),
  useSubmissionPhotos: () => ({ data: [], isLoading: false }),
}))

import MediaDesignsPage from '@portals/media/pages/Designs/MediaDesignsPage'
import { findDraftForDay, ticketDay } from '@features/media/constants'
import { syncSummaryRows } from '@portals/media/pages/Designs/DesignReportView'
import { jpegName, shouldRecompress, targetSize } from '@features/media/lib/image-compress'

const open = () => render(<MemoryRouter initialEntries={['/media/designs?open=d1']}><MediaDesignsPage /></MemoryRouter>)
beforeEach(() => { h.update.mockReset(); h.removeMany.mockReset(); h.loading = false; h.design = {}; vi.spyOn(window, 'confirm').mockReturnValue(true) })

describe('00198 — المحرر يفتح بحالة التصميم الحقيقية', () => {
  it('النوع «يومي»، الغلاف المحفوظ، يوم التقرير 2026-10-07 — لا «نصف شهري» ولا «بلا غلاف»', () => {
    open()
    expect((screen.getByTestId('composer-period') as HTMLSelectElement).value).toBe('daily')
    expect((screen.getByTestId('composer-ref-day') as HTMLInputElement).value).toBe('2026-10-07')
    expect(screen.getByTestId('composer-period-range')).toHaveTextContent('2026-10-07')
    expect(screen.getByAltText('الغلاف')).toHaveAttribute('src', 'url:media-officer/cover-1.jpg')
    expect(screen.queryByText('بلا غلاف')).toBeNull()
    expect(screen.getByDisplayValue('التقرير اليومي — الكرادة')).toBeInTheDocument()
  })
  it('أثناء التحميل يظهر مؤشر فقط ولا يُهيَّأ المحرر بقيم افتراضية', () => {
    h.loading = true
    open()
    expect(screen.getByText('جارٍ فتح التصميم…')).toBeInTheDocument()
    expect(screen.queryByTestId('composer-period')).toBeNull()
  })
  it('المصمم يُرسم في body (بوابة) بطبقة z-[80] فوق الشريط الجانبي', () => {
    open()
    const el = screen.getByTestId('composer-fullscreen')
    expect(el.parentElement).toBe(document.body)
    expect(el.className).toContain('z-[80]')
  })
  it('الحفظ بلا تغيير في الفترة لا يرسل يوماً مرجعياً (التاريخ لا ينزلق)؛ تغيير يوم التقرير يرسله ويُعلّم «غير محفوظ»', () => {
    open()
    fireEvent.click(screen.getByText('حفظ'))
    expect(h.update).toHaveBeenCalledWith(['d1', { title: 'التقرير اليومي — الكرادة', periodType: 'daily', coverPath: 'media-officer/cover-1.jpg', refDay: null }], expect.anything())
    fireEvent.change(screen.getByTestId('composer-ref-day'), { target: { value: '2026-10-08' } })
    expect(screen.getByTestId('composer-period-range')).toHaveTextContent('2026-10-08')
    expect(screen.getByText(/غير محفوظ/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('حفظ'))
    expect(h.update).toHaveBeenLastCalledWith(['d1', expect.objectContaining({ refDay: '2026-10-08' })], expect.anything())
  })
  it('تغيير النوع إلى أسبوعي يحسب الفترة من يوم التصميم (3/10–9/10) لا من اليوم', () => {
    open()
    fireEvent.change(screen.getByTestId('composer-period'), { target: { value: 'weekly' } })
    expect(screen.getByTestId('composer-period-range')).toHaveTextContent('2026-10-03 ← 2026-10-09')
  })
  it('حذف صور الفقرة بضغطة (بعد تأكيد) وحذف كل الصور', () => {
    open()
    fireEvent.click(screen.getByTestId('remove-group-كنس الشوارع'))
    expect(h.removeMany).toHaveBeenCalledWith([['r1', 'r2']], expect.anything())
    fireEvent.click(screen.getByTestId('remove-all-photos'))
    expect(h.removeMany).toHaveBeenLastCalledWith([['r1', 'r2', 'r3']], expect.anything())
    expect(screen.getByTestId('remove-all-photos')).toHaveTextContent('حذف كل الصور (3)')
    ;(window.confirm as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false)
    fireEvent.click(screen.getByTestId('remove-all-photos'))
    expect(h.removeMany).toHaveBeenCalledTimes(2)
  })
  it('التصميم المكتمل: لا أزرار حذف ولا حقول', () => {
    h.design = { status: 'completed' }
    open()
    expect(screen.queryByTestId('remove-all-photos')).toBeNull()
    expect(screen.queryByTestId(/^remove-group-/)).toBeNull()
  })
})

describe('00198 — دوال نقية', () => {
  it('ticketDay: تاريخ التنفيذ ← الحدث ← الإنشاء بتوقيت بغداد (01:30 بغداد = 22:30 UTC اليوم السابق)', () => {
    expect(ticketDay({ exec_date: '2026-10-07', event_date: '2026-10-06', created_at: '2026-10-05T10:00:00Z' })).toBe('2026-10-07')
    expect(ticketDay({ exec_date: null, event_date: '2026-10-06T00:00:00', created_at: '2026-10-05T10:00:00Z' })).toBe('2026-10-06')
    expect(ticketDay({ created_at: '2026-10-07T22:30:00Z' })).toBe('2026-10-08')
    expect(ticketDay({ created_at: '2026-10-07T20:59:00Z' })).toBe('2026-10-07')
  })
  it('findDraftForDay: مسودة يومية ليوم سابق لا تُختار ليوم جديد؛ تُختار مسودة الفترة الصحيحة فقط وأحدثها', () => {
    const ds = [
      { id: 'old', period_type: 'daily', status: 'draft', period_start: '2026-10-06', period_end: '2026-10-06', created_at: '2026-10-06T05:00:00Z' },
      { id: 'done', period_type: 'daily', status: 'completed', period_start: '2026-10-07', period_end: '2026-10-07', created_at: '2026-10-07T05:00:00Z' },
      { id: 'w', period_type: 'weekly', status: 'draft', period_start: '2026-10-03', period_end: '2026-10-09', created_at: '2026-10-03T05:00:00Z' },
      { id: 'today1', period_type: 'daily', status: 'draft', period_start: '2026-10-07', period_end: '2026-10-07', created_at: '2026-10-07T06:00:00Z' },
      { id: 'today2', period_type: 'daily', status: 'draft', period_start: '2026-10-07', period_end: '2026-10-07', created_at: '2026-10-07T09:00:00Z' },
    ]
    expect(findDraftForDay(ds, 'daily', '2026-10-07')?.id).toBe('today2')
    expect(findDraftForDay(ds, 'daily', '2026-10-08')).toBeUndefined()
    expect(findDraftForDay(ds, 'weekly', '2026-10-08')?.id).toBe('w')
    expect(findDraftForDay(ds, 'weekly', '2026-10-10')).toBeUndefined()
  })
  it('syncSummaryRows: الفقرة الجديدة تُلحق، المحذوفة تُزال، اليدوية تبقى، القديمة (بلا src) تبقى، والترقيم يُعاد', () => {
    const rows = [{ t: '1', work: 'شارع جواد', src: 'شارع جواد' }, { t: '2', work: 'زها حديد (منقّح)', src: 'شارع زها حديد' }, { t: '3', work: 'ملاحظة يدوية', manual: true }, { t: '4', work: 'قديم' }]
    const next = syncSummaryRows(rows, [{ workType: 'شارع زها حديد' }, { workType: 'غسل المدرسة' }])
    expect(next.map((r) => r.work)).toEqual(['زها حديد (منقّح)', 'ملاحظة يدوية', 'قديم', 'غسل المدرسة'])
    expect(next.map((r) => r.t)).toEqual(['1', '2', '3', '4'])
    expect(next[3]).toMatchObject({ src: 'غسل المدرسة' })
    // بلا تغيير ⇒ نفس المحتوى
    expect(syncSummaryRows(next, [{ workType: 'شارع زها حديد' }, { workType: 'غسل المدرسة' }]).map((r) => r.work)).toEqual(next.map((r) => r.work))
  })
  it('ضغط الصور: 4000×3000 ⇒ 2000×1500؛ الصغيرة لا تُكبَّر؛ قرار إعادة الترميز؛ اسم jpg', () => {
    expect(targetSize(4000, 3000)).toEqual({ width: 2000, height: 1500, scaled: true })
    expect(targetSize(3000, 4000)).toEqual({ width: 1500, height: 2000, scaled: true })
    expect(targetSize(1200, 800)).toEqual({ width: 1200, height: 800, scaled: false })
    expect(shouldRecompress({ type: 'image/jpeg', size: 5_000_000 }, 4000, 3000)).toBe(true)
    expect(shouldRecompress({ type: 'image/jpeg', size: 300_000 }, 1200, 800)).toBe(false)
    expect(shouldRecompress({ type: 'image/png', size: 300_000 }, 1200, 800)).toBe(true)
    expect(shouldRecompress({ type: 'image/gif', size: 9_000_000 }, 5000, 5000)).toBe(false)
    expect(shouldRecompress({ type: 'application/pdf', size: 9_000_000 }, 5000, 5000)).toBe(false)
    expect(jpegName('IMG_0001.HEIC')).toBe('IMG_0001.jpg'); expect(jpegName('photo')).toBe('photo.jpg')
  })
})
