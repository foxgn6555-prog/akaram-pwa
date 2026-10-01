/** 00164: الإعلام — فلاتر التذاكر (النوع/البحث) ودمج أكثر من تذكرة بمسمى واحد؛ التصميم يأخذ اسم الشارع لا «عام»؛
 * غرفة العمليات — «تقرير متابعة وتوثيق حملات التنظيف والخدمات» بتبويباته وفلاتره وتصدير Excel. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { designGroupLabel } from '@features/media/constants'

const h = vi.hoisted(() => ({ merge: vi.fn(), excel: vi.fn(), ops: vi.fn() }))
const t = (id: string, title: string, mode: string, extra: Record<string, unknown> = {}) => ({
  id, title, mode, work_type: mode === 'street' ? null : 'غسل الشارع', sector_parent: 'karrada', sector_ids: [4], event_date: '2026-09-28', exec_date: '2026-09-28', notes: null, photo_count: 3, status: 'submitted',
  submitted_by: 'u1', submitted_by_name: 'مسؤول قسم 4', archived_at: null, archive_reason: null, created_at: '2026-09-28T06:00:00Z', location: 'قرب الجامع', supervisors_count: 1, workers_count: 5,
  veh_tipper: 1, veh_tanker: 0, veh_compactor: 0, veh_loader: 0, veh_sweeper: 0, merged_into: null, merged_count: 0, ...extra,
})
const tickets = [t('s1', 'شارع الكرادة داخل', 'street'), t('s2', 'شارع الكرادة داخل', 'street', { exec_date: '2026-09-20' }), t('c1', 'حملة الفردوس', 'campaign', { location: 'ساحة الفردوس' })]
const opsRows = [
  { id: 'c1', mode: 'campaign', title: 'حملة الفردوس', location: 'ساحة الفردوس', work_type: 'غسل الشارع', sector_parent: 'karrada', sector_parent_name: 'الكرادة', sector_ids: [4], department_names: 'القاطع الرابع', exec_date: '2026-09-28', event_date: '2026-09-28',
    supervisors_count: 2, workers_count: 15, veh_tipper: 1, veh_tanker: 2, veh_compactor: 0, veh_loader: 1, veh_sweeper: 0, photo_count: 3, has_photos: true, notes: 'ملاحظة', submitted_by_name: 'مسؤول قسم 4', status: 'submitted', merged_count: 0, created_at: 'x' },
  { id: 'c2', mode: 'campaign', title: 'حملة الجادرية', location: null, work_type: 'رفع مخلفات', sector_parent: 'zaafaraniya', sector_parent_name: 'الزعفرانية', sector_ids: [7], department_names: 'القاطع السابع', exec_date: '2026-09-27', event_date: '2026-09-27',
    supervisors_count: 1, workers_count: 5, veh_tipper: 0, veh_tanker: 0, veh_compactor: 0, veh_loader: 0, veh_sweeper: 0, photo_count: 0, has_photos: false, notes: null, submitted_by_name: 'مسؤول قسم 7', status: 'submitted', merged_count: 2, created_at: 'x' },
]
vi.mock('@features/media/hooks', () => ({
  useSubmissions: () => ({ data: tickets, isLoading: false }),
  useSubmissionPhotos: () => ({ data: [], isLoading: false }),
  useUpdateSubmission: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdatePhotoCaption: () => ({ mutate: vi.fn(), isPending: false }),
  useArchiveSubmission: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateDesign: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAddDesignPhotos: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDesigns: () => ({ data: [] }),
  useMediaTemplates: () => ({ data: [] }),
  useMergeSubmissions: () => ({ mutate: h.merge, isPending: false }),
  useSignedPhotoUrls: () => ({ data: {} }),
  useOpsCampaigns: (f: Record<string, unknown>) => { h.ops(f); return { data: f.mode === 'campaign' ? opsRows.filter((r) => !f.sectorParent || r.sector_parent === f.sectorParent) : [], isLoading: false } },
}))
vi.mock('@features/sector', () => ({ useSectors: () => ({ data: [{ id: 4, name: 'القاطع الرابع', parent_sector: 'karrada' }, { id: 7, name: 'القاطع السابع', parent_sector: 'zaafaraniya' }] }) }))
vi.mock('@lib/export/excel-report', () => ({ buildExcelReport: h.excel }))
import MediaTicketsPage from '@portals/media/pages/Tickets/MediaTicketsPage'
import OpsCampaignsPage from '@portals/ops-room/pages/Campaigns/OpsCampaignsPage'
const wrap = (el: React.ReactElement) => render(<MemoryRouter>{el}</MemoryRouter>)

describe('الإعلام — فلاتر ودمج التذاكر (00164)', () => {
  beforeEach(() => vi.clearAllMocks())
  it('التصميم: اسم الشارع بدل «عام» لتذاكر الشارع، ونوع العمل للحملات', () => {
    expect(designGroupLabel({ mode: 'street', title: 'شارع الكرادة داخل', work_type: null })).toBe('شارع الكرادة داخل')
    expect(designGroupLabel({ mode: 'campaign', title: 'حملة', work_type: 'غسل الشارع' })).toBe('غسل الشارع')
    expect(designGroupLabel({ mode: 'campaign', title: 'حملة', work_type: null })).toBe('حملة')
  })
  it('فلتر النوع والبحث يعملان، والتذاكر المكررة بالاسم تُعلَّم «مكررة»', () => {
    wrap(<MediaTicketsPage sector="karrada" />)
    expect(screen.getAllByText('مكررة')).toHaveLength(2)
    fireEvent.change(screen.getByTestId('filter-mode'), { target: { value: 'campaign' } })
    expect(screen.queryByTestId('ticket-s1')).toBeNull(); expect(screen.getByTestId('ticket-c1')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('filter-mode'), { target: { value: '' } })
    fireEvent.change(screen.getByTestId('filter-q'), { target: { value: 'الفردوس' } })
    expect(screen.queryByTestId('ticket-s1')).toBeNull(); expect(screen.getByTestId('ticket-c1')).toBeInTheDocument()
  })
  it('وضع الدمج: تحديد تذكرتين → مسمى واحد → استدعاء الدمج بالمعرّفات', () => {
    wrap(<MediaTicketsPage sector="karrada" />)
    fireEvent.click(screen.getByTestId('merge-toggle'))
    expect(screen.getByTestId('merge-open')).toBeDisabled()
    fireEvent.click(screen.getByTestId('ticket-s1'))
    fireEvent.click(screen.getByTestId('ticket-s2'))
    expect(screen.getByTestId('merge-count')).toHaveTextContent('2 محددة')
    fireEvent.click(screen.getByTestId('merge-open'))
    expect(screen.getByTestId('merge-title')).toHaveValue('شارع الكرادة داخل')
    fireEvent.change(screen.getByTestId('merge-title'), { target: { value: 'شارع الكرادة داخل — غسل' } })
    fireEvent.change(screen.getByTestId('merge-worktype'), { target: { value: 'غسل الشارع' } })
    fireEvent.click(screen.getByTestId('merge-confirm'))
    expect(h.merge).toHaveBeenCalledWith([['s1', 's2'], 'شارع الكرادة داخل — غسل', 'غسل الشارع', null], expect.any(Object))
  })
  it('فتح التذكرة يعرض تفاصيل الحملة التي أرسلها مسؤول القسم', () => {
    wrap(<MediaTicketsPage sector="karrada" />)
    fireEvent.click(screen.getByTestId('ticket-c1'))
    const d = screen.getByTestId('ticket-campaign-details')
    expect(d).toHaveTextContent('الموقع: ساحة الفردوس'); expect(d).toHaveTextContent('مراقبون 1 · عمال 5'); expect(d).toHaveTextContent('قلاب 1')
  })
})

describe('غرفة العمليات — تقرير متابعة وتوثيق الحملات (00164)', () => {
  beforeEach(() => vi.clearAllMocks())
  it('التبويبات تغيّر النوع وتسميات الأعمدة؛ الجدول يعرض الموقع والقسم والآليات وعمود الصور يوجد/لا يوجد مع الإجمالي', () => {
    wrap(<OpsCampaignsPage />)
    expect(screen.getByTestId('camp-subtitle')).toHaveTextContent('الحملات')
    expect(screen.getByText('موقع الحملة')).toBeInTheDocument()
    expect(screen.getByTestId('camp-row-c1')).toHaveTextContent('ساحة الفردوس'); expect(screen.getByTestId('camp-row-c1')).toHaveTextContent('القاطع الرابع'); expect(screen.getByTestId('camp-row-c1')).toHaveTextContent('يوجد (3)')
    expect(screen.getByTestId('camp-row-c2')).toHaveTextContent('لا يوجد'); expect(screen.getByTestId('camp-row-c2')).toHaveTextContent('مدموجة 2')
    expect(screen.getByTestId('camp-table').querySelector('tfoot')).toHaveTextContent('الإجمالي (2)')
    expect(screen.getByTestId('camp-table').querySelector('tfoot')).toHaveTextContent('20')
    fireEvent.click(screen.getByTestId('camp-tab-school'))
    expect(screen.getByTestId('camp-subtitle')).toHaveTextContent('حملات المدارس')
    expect(h.ops).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'school' }))
    expect(screen.getByTestId('camp-empty')).toHaveTextContent('لا سجلات حملات المدارس')
    fireEvent.click(screen.getByTestId('camp-tab-street'))
    expect(screen.getByTestId('camp-subtitle')).toHaveTextContent('تنظيف الشوارع')
    expect(h.ops).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'street' }))
  })
  it('فلتر القاطع يقيّد الأقسام ويُمرَّر للخادم؛ التصدير يبني Excel بعنوان التقرير وشعار الشركة (القالب الموحّد) وبصف إجمالي', async () => {
    wrap(<OpsCampaignsPage />)
    fireEvent.change(screen.getByTestId('camp-parent'), { target: { value: 'karrada' } })
    const sec = screen.getByTestId('camp-sector') as HTMLSelectElement
    expect([...sec.options].map((o) => o.textContent)).toEqual(['كل الأقسام', 'القاطع الرابع'])
    expect(h.ops).toHaveBeenLastCalledWith(expect.objectContaining({ sectorParent: 'karrada' }))
    expect(screen.queryByTestId('camp-row-c2')).toBeNull()
    fireEvent.click(screen.getByTestId('camp-export'))
    await waitFor(() => expect(h.excel).toHaveBeenCalled())
    const opts = h.excel.mock.calls[0]![0]
    expect(opts.title).toBe('تقرير متابعة وتوثيق حملات التنظيف والخدمات — الحملات')
    expect(opts.columns.map((c: { header: string }) => c.header)).toEqual(expect.arrayContaining(['اسم الحملة', 'موقع الحملة', 'تاريخ تنفيذ الحملة', 'القاطع', 'القسم', 'عدد المراقبين', 'عدد العمال', 'قلاب', 'تنكر', 'كابسة', 'شفل', 'كناسة', 'الصور', 'ملاحظات']))
    expect(opts.rows[0]).toMatchObject({ title: 'حملة الفردوس', location: 'ساحة الفردوس', tanker: 2, photos: 'يوجد (3)', department: 'القاطع الرابع' })
    expect(opts.totalRow).toMatchObject({ workers: 15, tanker: 2 })
    expect(opts.orientation).toBe('landscape')
  })
})
