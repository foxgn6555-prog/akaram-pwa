/**
 * 00250 — أغلفة تقارير الشكاوى: تعريف الأغلفة، النصوص الحية، سمة الصفحات
 * الداخلية، شريحة الغلاف في PowerPoint، ومنتقي الغلاف في الإعدادات والمحرر.
 */
import type { ReactNode } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  COMPLAINT_COVERS, DEFAULT_COVER_TITLE, DEFAULT_SLOGAN, coverBackgroundUrl, coverFor, coverTexts, formatCoverDate, isCoverId, reportTheme, toArabicDigits,
} from '../../../src/lib/pptx/complaintCovers'
import { composeComplaintSlides } from '../../../src/lib/pptx/complaintPptx'
import { ReportCoverPreview, ReportSlidePreview, ReportTablePreview } from '../../../src/portals/complaints/components/reportPreview'
import TemplatesPage from '../../../src/portals/complaints/pages/Templates/TemplatesPage'
import ReportEditorPage from '../../../src/portals/complaints/pages/Templates/ReportEditorPage'

const h = vi.hoisted(() => {
  const mk = () => ({ mutate: vi.fn((_vars?: unknown, _opts?: unknown) => {}), isPending: false })
  return { templates: [] as unknown[], report: null as unknown, muts: { saveTemplate: mk(), saveDraft: mk(), generate: mk() } }
})
vi.mock('@features/complaints', () => ({
  useComplaintTemplates: () => ({ data: h.templates, isLoading: false }),
  useComplaintReports: () => ({ data: [], isLoading: false }),
  useComplaintInbox: () => ({ data: [], isLoading: false }),
  useSaveComplaintTemplate: () => h.muts.saveTemplate,
  usePrepareComplaintReport: () => ({ mutate: vi.fn(), isPending: false }),
  usePrepareComplaintEmailReport: () => ({ mutate: vi.fn(), isPending: false }),
  useGenerateComplaintReport: () => h.muts.generate,
  useSetComplaintReportStatus: () => ({ mutate: vi.fn(), isPending: false }),
  useSendComplaintEmail: () => ({ mutate: vi.fn(), isPending: false }),
  useComplaintReportDownload: () => ({ mutate: vi.fn(), isPending: false }),
  useArchiveComplaintReport: () => ({ mutate: vi.fn(), isPending: false }),
  useComplaintReport: () => ({ data: h.report, isLoading: false }),
  useComplaintItemsMedia: () => ({ data: [], isLoading: false }),
  useComplaintManagers: () => ({ data: [], isLoading: false }),
  useSaveComplaintReportDraft: () => h.muts.saveDraft,
  reportStatusLabel: (status: string) => status,
}))

const view = (node: ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>)
const editorView = () => render(<MemoryRouter initialEntries={['/complaints/reports/r1']}><Routes><Route path="/complaints/reports/:id" element={<ReportEditorPage />} /></Routes></MemoryRouter>)

const item = {
  id: 'i1', complaintId: 'c1', sequenceNo: 1, referenceNo: 'CMP-2026-9', complaintStatus: 'new', sector: 'karrada',
  title: 'أنقاض', municipalCenter: 'المركز', neighborhood: '901', alley: '12', locationText: null, ocrText: null,
  assignedTo: null, status: 'processed', managerNotes: null, reviewerNotes: null, receivedAt: '2026-10-02T08:00:00Z',
}
const report = {
  id: 'r1', reportDate: '2026-10-02', sector: 'karrada', title: 'تقرير يومي', status: 'draft', scope: 'daily',
  pptxPath: null, recipients: ['a@b.iq'], deliveryId: null, createdAt: '2026-10-02T18:00:00Z',
  layout: { cover: 'k3' }, approvedAt: null, sentAt: null, archivedAt: null, deliveries: [],
  items: [{ itemId: 'i1', displayOrder: 1, included: true, slideLayout: {}, item }],
}
const entry = report.items[0] as unknown as Parameters<typeof ReportTablePreview>[0]['entries'][number]

beforeEach(() => { h.templates = []; h.report = null; for (const m of Object.values(h.muts)) { m.mutate.mockReset(); m.mutate.mockImplementation(() => {}) } })

describe('تعريف الأغلفة والنصوص الحية', () => {
  it('يوفر التصميم الرسمي + ملصقات المستخدم الستة وملفات الخلفية موجودة فعلاً في public وأصول دالة الحافة', () => {
    expect(COMPLAINT_COVERS.map(cover => cover.id)).toEqual(['official', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6'])
    for (const cover of COMPLAINT_COVERS.filter(cover => cover.bg)) {
      expect(existsSync(join(process.cwd(), 'public', 'report-assets', 'complaints-covers', cover.bg!))).toBe(true)
      expect(existsSync(join(process.cwd(), 'supabase', 'functions', 'complaint-generate-report', 'assets', `cover-${cover.id}.jpg`))).toBe(true)
    }
    expect(coverBackgroundUrl(COMPLAINT_COVERS[0]!)).toBeNull()
    expect(coverBackgroundUrl(coverFor({ cover: 'k2' }))).toBe('/report-assets/complaints-covers/k2.jpg')
    expect(coverFor({ cover: 'غير موجود' }).id).toBe('official')
    expect(isCoverId('k6')).toBe(true); expect(isCoverId('k9')).toBe(false)
  })

  it('يبني النصوص الست افتراضياً من بيانات التقرير ويحترم التجاوز اليدوي لكل سطر', () => {
    const texts = coverTexts({}, { sector: 'karrada', reportDate: '2026-10-02' })
    expect(texts).toEqual({
      authorityLine: 'أمانة بغداد / دائرة بلدية الكرادة', contractorLine: 'تحالف شركات جزيرة الأكارم وفيرست ترايد',
      title: DEFAULT_COVER_TITLE, dateLine: 'التاريخ : 2026/10/2', sectorLine: 'قاطع الكرادة', slogan: DEFAULT_SLOGAN,
    })
    const custom = coverTexts({ title: 'تقرير خاص', coverSectorLine: 'قاطع الزعفرانية', coverDateDigits: 'arabic', coverSlogan: 'معاً.. لمستقبل أفضل', contractorLine: 'تحالف الأكارم' }, { sector: 'karrada', reportDate: '2026-10-02' })
    expect(custom.title).toBe('تقرير خاص'); expect(custom.sectorLine).toBe('قاطع الزعفرانية'); expect(custom.dateLine).toBe('التاريخ : ٢٠٢٦/١٠/٢')
    expect(custom.slogan).toBe('معاً.. لمستقبل أفضل'); expect(custom.contractorLine).toBe('تحالف الأكارم')
    expect(coverTexts({ coverSlogan: '' }, { sector: 'zaafaraniya', reportDate: '2026-01-05' }).slogan).toBe('')
    expect(coverTexts({ coverDateText: 'التاريخ : الخميس 2/10/2026' }, { sector: 'zaafaraniya', reportDate: '2026-10-02' }).dateLine).toBe('التاريخ : الخميس 2/10/2026')
  })

  it('يهيئ التاريخ كما في الملصق (سنة/شهر/يوم بلا أصفار) بأرقام لاتينية أو عربية', () => {
    expect(formatCoverDate('2026-10-02', 'latin')).toBe('التاريخ : 2026/10/2')
    expect(formatCoverDate('2026-10-02', 'arabic')).toBe('التاريخ : ٢٠٢٦/١٠/٢')
    expect(toArabicDigits('0123456789')).toBe('٠١٢٣٤٥٦٧٨٩')
    expect(formatCoverDate('غير معروف', 'latin')).toBe('التاريخ : غير معروف')
  })

  it('سمة الصفحات الداخلية: الرسمي يتبع لون الهوية، والملصقات تفرض لوحتها (أخضر k3 / كحلي k1)', () => {
    const official = reportTheme({ accent: '#123456' })
    expect(official).toMatchObject({ primary: '#123456', styled: false })
    expect(reportTheme({ accent: 'سيئ' }).primary).toBe('#CF63C6')
    expect(reportTheme({ cover: 'k3', accent: '#123456' })).toMatchObject({ primary: '#0F4C45', gold: '#C9A24A', styled: true })
    expect(reportTheme({ cover: 'k1' }).primary).toBe('#0D2C4F')
  })
})

describe('شرائح PowerPoint', () => {
  const base = {
    reportTitle: 'تقرير يومي', coverTitle: '', authorityLine: 'أمانة بغداد / دائرة بلدية الكرادة', contractorLine: 'تحالف شركات جزيرة الأكارم وفيرست ترايد',
    reportDate: '2026-10-02', sectorLabel: 'قاطع الكرادة', scopeLabel: 'تقرير يومي جامع', sector: 'karrada',
    items: [{ id: 'i1', alley: '12', neighborhood: '901', center: 'المركز', title: 'أنقاض', dateLabel: '2/10/2026', arrivalLabel: '8:00 ص' }],
    mediaFor: () => ({ afters: [] }), brand: [],
  }
  it('غلاف الملصق = صورة خلفية كاملة + النصوص الست الحية، والصفحات الداخلية تأخذ لون اللوحة والزوايا المائلة', () => {
    const bg = { name: 'cover-k3.jpg', bytes: new Uint8Array([0xff, 0xd8, 0xff]) }
    const slides = composeComplaintSlides({ ...base, layout: { cover: 'k3', coverDateDigits: 'arabic', coverSlogan: 'معاً.. لمستقبل أفضل' }, coverBackground: bg })
    const cover = slides[0]!
    expect(cover.images).toEqual([bg])
    expect(cover.rels).toContain('Target="../media/cover-k3.jpg"')
    expect(cover.xml).toContain('<p:pic>')
    expect(cover.xml).not.toContain('brand-')
    for (const text of ['أمانة بغداد / دائرة بلدية الكرادة', 'تحالف شركات جزيرة الأكارم وفيرست ترايد', DEFAULT_COVER_TITLE, 'التاريخ : ٢٠٢٦/١٠/٢', 'قاطع الكرادة', 'معاً.. لمستقبل أفضل']) expect(cover.xml).toContain(text)
    const table = slides[1]!
    expect(table.xml).toContain('val="0F4C45"'); expect(table.xml).toContain('val="C9A24A"'); expect(table.xml).toContain('prst="rtTriangle"')
    const photo = slides[2]!
    expect(photo.xml).toContain('val="0F4C45"'); expect(photo.xml).toContain('prst="rtTriangle"')
  })
  it('التصميم الرسمي يبقى كما هو: إطار بلون الهوية وشعارات حية بلا خلفية ولا زوايا مائلة', () => {
    const slides = composeComplaintSlides({ ...base, layout: { accent: '#123456' }, coverBackground: null })
    expect(slides[0]!.xml).toContain('val="123456"'); expect(slides[0]!.xml).not.toContain('<p:pic>')
    expect(slides[0]!.xml).toContain('قاطع الكرادة - 2026/10/2')
    expect(slides[1]!.xml).not.toContain('rtTriangle')
  })
  it('يرفض غلاف الملصق بلا خلفية محمّلة بالعودة إلى التصميم الرسمي بدل إنتاج شريحة فارغة', () => {
    const slides = composeComplaintSlides({ ...base, layout: { cover: 'k1' }, coverBackground: null })
    expect(slides[0]!.xml).not.toContain('<p:pic>'); expect(slides[0]!.xml).toContain(DEFAULT_COVER_TITLE)
  })
})

describe('المعاينة البصرية', () => {
  it('غلاف الملصق في المعاينة يعرض الخلفية والنصوص الحية بمواضع المنطقة المفرّغة', () => {
    view(<ReportCoverPreview layout={{ cover: 'k5', coverSlogan: '' }} title="تقرير يومي" accent="#0D2C4F" sector="zaafaraniya" reportDate="2026-10-02" />)
    const poster = screen.getByTestId('cover-poster')
    expect(poster.dataset.cover).toBe('k5')
    expect(poster.querySelector('img')?.getAttribute('src')).toBe('/report-assets/complaints-covers/k5.jpg')
    expect(within(poster).getByText('أمانة بغداد / دائرة بلدية الزعفرانية')).toBeInTheDocument()
    expect(within(poster).getByText('التاريخ : 2026/10/2')).toBeInTheDocument()
    expect(within(poster).getByText('قاطع الزعفرانية')).toBeInTheDocument()
    expect(within(poster).queryByText(DEFAULT_SLOGAN)).toBeNull()
  })
  it('الجدول وصفحة الصور يأخذان زخرفة الملصق فقط عند اختيار غلاف ملصق', () => {
    const { container, unmount } = view(<ReportTablePreview entries={[entry]} accent="#0F4C45" layout={{ cover: 'k3' }} />)
    expect(container.querySelectorAll('[style*="clip-path"], [style*="clipPath"]').length).toBeGreaterThanOrEqual(4)
    unmount()
    const plain = view(<ReportSlidePreview entry={entry} accent="#cf63c6" layout={{}} />)
    expect(plain.container.querySelectorAll('[style*="clip-path"]').length).toBe(0)
  })
})

describe('الإعدادات والمحرر', () => {
  it('إعدادات القوالب: اختيار غلاف افتراضي يُحفظ في تخطيط القالب مع الشعار', () => {
    view(<TemplatesPage />)
    fireEvent.click(screen.getByText(/تصميم القوالب/))
    fireEvent.change(screen.getByLabelText('اسم القالب'), { target: { value: 'قالب الملصق' } })
    fireEvent.click(screen.getByRole('radio', { name: 'دجلة — أخضر/ذهبي' }))
    fireEvent.change(screen.getByLabelText('شعار الغلاف'), { target: { value: 'معاً.. لمستقبل أفضل' } })
    fireEvent.click(screen.getByText('إنشاء القالب'))
    expect(h.muts.saveTemplate.mutate).toHaveBeenCalledWith(expect.objectContaining({ layout: expect.objectContaining({ cover: 'k3', coverSlogan: 'معاً.. لمستقبل أفضل' }) }), expect.anything())
  })
  it('محرر التقرير: يبدأ بغلاف القالب ويتيح تغييره والقاطع وأرقام التاريخ والشعار لكل تقرير ثم يحفظها في التخطيط', () => {
    h.report = report
    editorView()
    expect(screen.getByTestId('cover-poster').dataset.cover).toBe('k3')
    fireEvent.click(screen.getByRole('radio', { name: 'المئذنة والجسر — غروب' }))
    expect(screen.getByTestId('cover-poster').dataset.cover).toBe('k6')
    fireEvent.click(screen.getByRole('button', { name: 'قاطع الزعفرانية' }))
    fireEvent.click(screen.getByRole('button', { name: /عربية/ }))
    fireEvent.change(screen.getByLabelText('شعار الغلاف'), { target: { value: '' } })
    const poster = screen.getByTestId('cover-poster')
    expect(within(poster).getByText('قاطع الزعفرانية')).toBeInTheDocument()
    expect(within(poster).getByText('التاريخ : ٢٠٢٦/١٠/٢')).toBeInTheDocument()
    expect(within(poster).queryByText(DEFAULT_SLOGAN)).toBeNull()
    fireEvent.click(screen.getByText('حفظ التصميم'))
    expect(h.muts.saveDraft.mutate).toHaveBeenCalledWith(expect.objectContaining({ layout: expect.objectContaining({ cover: 'k6', coverSectorLine: 'قاطع الزعفرانية', coverDateDigits: 'arabic', coverSlogan: '' }) }), expect.anything())
  })
  it('محرر التقرير: التصميم الرسمي يبقى خياراً ويظهر معه لون الهوية فقط', () => {
    h.report = { ...report, layout: {} }
    editorView()
    expect(screen.getByTestId('cover-poster').dataset.cover).toBe('official')
    expect(screen.getByText('اللون الرئيسي')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'نصب الحرية — فاتح كحلي/ذهبي' }))
    expect(screen.queryByText('اللون الرئيسي')).toBeNull()
  })
})
