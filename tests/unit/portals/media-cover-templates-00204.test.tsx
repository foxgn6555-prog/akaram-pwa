/**
 * 00204 — قوالب الأغلفة الديناميكية (9 تصاميم معتمدة كما هي) + حقل/فلتر الشفت:
 * نصوص الغلاف (نوع التقرير/البلدية/التاريخ/الشفت) تُشتق من التصميم، الترشيح بالشفت في المكتبة والقواطع،
 * اختيار قالب جاهز في المصمم يحفظ مساراً مدمجاً ويعرض الغلاف الحي، وقائمة التصاميم تُرشَّح بالقاطع والشفت.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({
  designUpdate: vi.fn(), setShift: vi.fn(), touch: vi.fn(), refetch: vi.fn(),
  designs: [] as unknown[],
  design: {} as Record<string, unknown>,
}))
vi.mock('@features/media/hooks', () => ({
  useMediaCovers: () => ({ data: [], isLoading: false }),
  useAddMediaCover: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveCoverToLibrary: () => ({ mutate: vi.fn(), isPending: false }),
  useSetDesignShift: () => ({ mutate: h.setShift, isPending: false }),
  useUpdateMediaCover: () => ({ mutate: vi.fn(), isPending: false }),
  useSetMediaCoverStatus: () => ({ mutate: vi.fn(), isPending: false }),
  useTouchMediaCover: () => ({ mutate: h.touch, isPending: false }),
  useSignedPhotoUrls: (paths: string[]) => ({ data: Object.fromEntries(paths.map((p) => [p, `url:${p}`])) }),
  useDesigns: () => ({ data: h.designs, isLoading: false }),
  useDesignDetail: () => ({ isLoading: false, refetch: h.refetch, data: { design: h.design, sheets: [], photos: [] } }),
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

import {
  COVER_TEMPLATES, SHIFT_LABEL, builtinCoverId, builtinCoverPath, coverTemplateById, coverTexts, isBuiltinCover, rankTemplates, slashYmd,
} from '@features/media/lib/cover-templates'
import type { CoverContext } from '@features/media/lib/cover-templates'
import CoverTemplate from '@portals/media/components/CoverTemplate'
import DesignCover from '@portals/media/components/DesignCover'
import { CoverLibraryDialog, filterCovers } from '@portals/media/components/CoverLibrary'
import MediaDesignsPage from '@portals/media/pages/Designs/MediaDesignsPage'
import type { MediaCover } from '@features/media/hooks'

const baseDesign = {
  id: 'd1', title: 'التقرير اليومي — الكرادة', period_type: 'daily', sector_parent: 'karrada', status: 'draft', photo_count: 0,
  cover_image_path: null as string | null, period_start: '2026-10-07', period_end: '2026-10-07', summary: null, template_colors: null, shift: null as string | null,
}
beforeEach(() => {
  Object.values(h).forEach((f) => typeof f === 'function' && (f as ReturnType<typeof vi.fn>).mockReset())
  h.design = { ...baseDesign }
  h.designs = []
})

describe('cover-templates (نقي)', () => {
  it('9 قوالب على الأقل بخلفيات من مجلد الأصول؛ المسار المدمج builtin:', () => {
    expect(COVER_TEMPLATES.length).toBeGreaterThanOrEqual(9)
    for (const t of COVER_TEMPLATES) expect(t.bg).toMatch(/^\/report-assets\/covers\/c\d+\.jpg$/)
    expect(isBuiltinCover('builtin:c3')).toBe(true)
    expect(isBuiltinCover('media-officer/x.jpg')).toBe(false)
    expect(isBuiltinCover(null)).toBe(false)
    expect(builtinCoverId('builtin:c3')).toBe('c3')
    expect(builtinCoverPath('c1')).toBe('builtin:c1')
    expect(coverTemplateById('c9')?.id).toBe('c9')
    expect(coverTemplateById('zz')).toBeUndefined()
  })
  it('slashYmd بأرقام لاتينية بلا أصفار بادئة: 2026-10-07 → 2026/10/7', () => {
    expect(slashYmd('2026-10-07')).toBe('2026/10/7')
    expect(slashYmd('2026-01-15T10:00:00Z')).toBe('2026/1/15')
    expect(slashYmd('x')).toBe('x')
  })
  it('coverTexts: يومي الكرادة ليلي / أسبوعي الزعفرانية صباحي / شهري بلا شفت', () => {
    expect(coverTexts({ periodType: 'daily', sector: 'karrada', periodStart: '2026-10-07', periodEnd: '2026-10-07', shift: 'night' })).toEqual({
      headline: 'الانجاز اليومي', municipality: 'بلدية الكرادة', date: 'ليوم 2026/10/7', shift: 'الشفت الليلي',
    })
    expect(coverTexts({ periodType: 'weekly', sector: 'zaafaraniya', periodStart: '2026-10-03', periodEnd: '2026-10-09', shift: 'morning' })).toEqual({
      headline: 'الانجاز الأسبوعي', municipality: 'بلدية الزعفرانية', date: 'من 2026/10/3 إلى 2026/10/9', shift: 'الشفت الصباحي',
    })
    const m = coverTexts({ periodType: 'monthly', sector: 'karrada', periodStart: '2026-10-01', periodEnd: '2026-10-31', shift: null })
    expect(m.headline).toBe('الانجاز الشهري')
    expect(m.shift).toBeNull()
    expect(coverTexts({ periodType: 'first_half', sector: 'karrada', periodStart: '2026-10-01', periodEnd: '2026-10-14', shift: null }).headline).toBe('الانجاز النصف شهري')
  })
  it('rankTemplates: قوالب الشفت المطلوب أولاً ثم العامة ثم الباقي، بلا فقدان', () => {
    const r = rankTemplates(COVER_TEMPLATES, 'night')
    expect(r).toHaveLength(COVER_TEMPLATES.length)
    const score = (s: string | null) => (s === 'night' ? 0 : s === null ? 1 : 2)
    for (let i = 1; i < r.length; i++) expect(score(r[i - 1]!.shiftHint)).toBeLessThanOrEqual(score(r[i]!.shiftHint))
    expect(COVER_TEMPLATES.some((t) => t.shiftHint === 'night')).toBe(true)
    expect(COVER_TEMPLATES.some((t) => t.shiftHint === 'morning')).toBe(true)
  })
})

describe('CoverTemplate / DesignCover (عرض)', () => {
  const ctx: CoverContext = { periodType: 'daily', sector: 'zaafaraniya', periodStart: '2026-10-07', periodEnd: '2026-10-07', shift: 'morning' }
  it('يرسم خلفية القالب كما هي ونصوصه الأربعة من السياق؛ بلا شفت لا تُرسم حبة الشفت', () => {
    const def = COVER_TEMPLATES[0]!
    const { rerender } = render(<CoverTemplate def={def} ctx={ctx} />)
    const root = screen.getByTestId(`cover-template-${def.id}`)
    expect(root.getAttribute('data-cover-template')).toBeTruthy()
    expect(root.querySelector('img')).toHaveAttribute('src', def.bg)
    expect(screen.getByTestId('cover-headline').textContent).toBe('الانجاز اليومي')
    expect(screen.getByTestId('cover-municipality').textContent).toBe('بلدية الزعفرانية')
    expect(screen.getByTestId('cover-date').textContent).toContain('ليوم 2026/10/7')
    expect(screen.getByTestId('cover-shift').textContent).toContain('الشفت الصباحي')
    rerender(<CoverTemplate def={def} ctx={{ ...ctx, shift: null }} />)
    expect(screen.queryByTestId('cover-shift')).toBeNull()
  })
  it('كل القوالب التسعة تُرسم بالنصوص نفسها', () => {
    for (const def of COVER_TEMPLATES) {
      const { unmount } = render(<CoverTemplate def={def} ctx={ctx} />)
      expect(screen.getByTestId('cover-municipality').textContent).toBe('بلدية الزعفرانية')
      unmount()
    }
  })
  it('DesignCover: مسار مدمج ⇒ قالب حي؛ مسار مخزن ⇒ صورة موقعة', () => {
    const { rerender } = render(<DesignCover coverPath="builtin:c2" ctx={ctx} />)
    expect(screen.getByTestId('cover-template-c2')).toBeInTheDocument()
    rerender(<DesignCover coverPath="media-officer/a.jpg" coverUrl="https://x/a.jpg" ctx={ctx} />)
    expect(screen.queryByTestId('cover-template-c2')).toBeNull()
    expect(screen.getByAltText('الغلاف')).toHaveAttribute('src', 'https://x/a.jpg')
  })
})

describe('مكتبة الغلافات: الشفت', () => {
  const cover = (o: Partial<MediaCover>): MediaCover => ({ id: 'c', title: 'غلاف', storage_path: 'p', sector_parent: null, period_type: null, shift: null, tags: '', use_count: 0, status: 'active', created_at: '', updated_at: '', ...o } as MediaCover)
  it('filterCovers بالشفت: العام يظهر دائماً والمحدد لشفته فقط', () => {
    const lib = [cover({ id: 'n', shift: 'night' as never }), cover({ id: 'm', shift: 'morning' as never }), cover({ id: 'g' })]
    expect(filterCovers(lib, { shift: 'night' }).map((c) => c.id)).toEqual(['n', 'g'])
    expect(filterCovers(lib, { shift: 'morning' }).map((c) => c.id)).toEqual(['m', 'g'])
    expect(filterCovers(lib, {}).map((c) => c.id)).toEqual(['n', 'm', 'g'])
  })
  it('النافذة: قسم القوالب الجاهزة يعرض 9 قوالب بنصوص التصميم؛ الاختيار يعيد builtin: ولا يسجّل استخداماً؛ فلتر الشفت موجود', () => {
    const onPick = vi.fn()
    const close = vi.fn()
    const ctx: CoverContext = { periodType: 'weekly', sector: 'karrada', periodStart: '2026-10-03', periodEnd: '2026-10-09', shift: 'night' }
    render(<CoverLibraryDialog close={close} onPick={onPick} ctx={ctx} />)
    const sec = screen.getByTestId('builtin-templates')
    expect(within(sec).getAllByRole('listitem')).toHaveLength(COVER_TEMPLATES.length)
    expect(within(sec).getAllByTestId('cover-headline')[0]!.textContent).toBe('الانجاز الأسبوعي')
    expect(within(sec).getAllByTestId('cover-shift')[0]!.textContent).toContain(SHIFT_LABEL.night)
    expect((screen.getByTestId('cover-filter-shift') as HTMLSelectElement).value).toBe('night')
    // الأول هو قالب ليلي (ترتيب حسب شفت التصميم)
    const firstId = within(sec).getAllByRole('listitem')[0]!.getAttribute('data-testid')!.replace('template-item-', '')
    expect(coverTemplateById(firstId)?.shiftHint).toBe('night')
    fireEvent.click(within(sec).getByTestId('template-pick-c5'))
    expect(onPick).toHaveBeenCalledWith('builtin:c5', expect.objectContaining({ storage_path: 'builtin:c5' }))
    expect(h.touch).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalled()
  })
})

describe('قائمة التصاميم: فلتر القاطع والشفت', () => {
  it('شارة الشفت تظهر؛ الفلاتر تُضيّق؛ نص فارغ مختلف عند عدم التطابق', () => {
    h.designs = [
      { ...baseDesign, id: 'a', title: 'أ', shift: 'night' },
      { ...baseDesign, id: 'b', title: 'ب', shift: 'morning', sector_parent: 'zaafaraniya' },
      { ...baseDesign, id: 'c', title: 'ج', shift: null },
    ]
    render(<MemoryRouter initialEntries={['/media/designs']}><MediaDesignsPage /></MemoryRouter>)
    expect(screen.getByTestId('designs-filters')).toBeInTheDocument()
    expect(screen.getByTestId('design-shift-a').textContent).toBe(SHIFT_LABEL.night)
    expect(screen.queryByTestId('design-shift-c')).toBeNull()
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3)
    fireEvent.click(screen.getByTestId('filter-shift-night'))
    expect(screen.getAllByRole('heading', { level: 3 }).map((e) => e.textContent)).toEqual(['أ'])
    fireEvent.click(screen.getByTestId('filter-sector-zaafaraniya'))
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
    expect(screen.getByText('لا توجد تصاميم مطابقة للترشيح الحالي.')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('filter-shift-all'))
    expect(screen.getAllByRole('heading', { level: 3 }).map((e) => e.textContent)).toEqual(['ب'])
    fireEvent.click(screen.getByTestId('filter-sector-all'))
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3)
  })
})

describe('المصمم: الشفت + القالب الجاهز', () => {
  it('تغيير الشفت يستدعي RPC ثم يعيد الجلب؛ اختيار قالب جاهز يحفظ builtin: ويعرض الغلاف الحي بشفت التصميم ويخفي «حفظ في المكتبة»', () => {
    h.design = { ...baseDesign, shift: 'night' }
    render(<MemoryRouter initialEntries={['/media/designs?open=d1']}><MediaDesignsPage /></MemoryRouter>)
    const sel = screen.getByTestId('composer-shift') as HTMLSelectElement
    expect(sel.value).toBe('night')
    expect(sel.disabled).toBe(false)
    fireEvent.change(sel, { target: { value: 'morning' } })
    expect(h.setShift).toHaveBeenCalledWith(['d1', 'morning'], expect.anything())
    ;(h.setShift.mock.calls[0]![1] as { onSuccess: () => void }).onSuccess()
    expect(h.refetch).toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('open-cover-library'))
    fireEvent.click(screen.getByTestId('template-pick-c1'))
    expect(h.designUpdate).toHaveBeenCalledWith(['d1', expect.objectContaining({ coverPath: 'builtin:c1' })], expect.anything())
    const thumb = screen.getByTestId('composer-builtin-cover')
    expect(within(thumb).getByTestId('cover-template-c1')).toBeInTheDocument()
    expect(within(thumb).getByTestId('cover-municipality').textContent).toBe('بلدية الكرادة')
    expect(within(thumb).getByTestId('cover-shift').textContent).toContain(SHIFT_LABEL.morning)
    expect(screen.queryByTestId('save-cover-to-library')).toBeNull()
  })
  it('التصميم المكتمل: حقل الشفت مقفل', () => {
    h.design = { ...baseDesign, status: 'completed', shift: 'morning' }
    render(<MemoryRouter initialEntries={['/media/designs?open=d1']}><MediaDesignsPage /></MemoryRouter>)
    expect((screen.getByTestId('composer-shift') as HTMLSelectElement).disabled).toBe(true)
  })
})
