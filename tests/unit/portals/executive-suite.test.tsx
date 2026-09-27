/**
 * منظومة الإدارة العليا (00146) — الصفحات:
 *   الرئيسية (المفوض/التنفيذي/المعاون/المالية) · التقارير (فلاتر/أقسام/Excel/PDF) · التبليغات (إنشاء/صادر/وارد/إقرار)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { ReactNode } from 'react'
import { sample } from '../../fixtures/exec-overview'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children?: ReactNode }) => <div data-testid="area-chart">{children}</div>,
  BarChart: ({ children }: { children?: ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  PieChart: ({ children }: { children?: ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Area: () => null, Bar: () => null, Pie: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null, Cell: () => null, Legend: () => null,
}))

const h = vi.hoisted(() => ({
  overview: null as unknown, previous: null as unknown, lastFilters: null as unknown, withPrev: true,
  feedInbox: [] as unknown[], feedSent: [] as unknown[], recipients: [] as unknown[], detail: null as unknown,
  publish: vi.fn(async () => 'new-id'), ack: vi.fn(async () => undefined), archive: vi.fn(async () => undefined), download: vi.fn(async () => undefined),
}))
const mut = (fn: (...a: never[]) => Promise<unknown>) => ({ mutate: (v: never, o?: { onSuccess?: () => void }) => void fn(v).then(() => o?.onSuccess?.()), mutateAsync: fn, isPending: false })

vi.mock('@features/executive/hooks/useExecutive', () => ({
  useExecOverview: (f: unknown, withPrev = true) => { h.lastFilters = f; h.withPrev = withPrev; return { data: h.overview, previous: withPrev ? h.previous : null, isLoading: false, error: null, refetch: vi.fn(), isFetching: false } },
  useExecFilterOptions: () => ({ data: { sectors: [{ id: 91, name: 'قاطع الاختبار', parent: 'karrada' }, { id: 92, name: 'قاطع ثانٍ', parent: 'zaafaraniya' }], shifts: [{ key: 'morning', label: 'صباحي' }, { key: 'evening', label: 'مسائي' }], parents: [] } }),
  useAnnouncementFeed: (scope: string) => ({ data: scope === 'sent' ? h.feedSent : h.feedInbox, isLoading: false }),
  useAnnouncement: () => ({ data: h.detail, isLoading: false, error: null }),
  useAnnouncementRecipients: () => ({ data: h.recipients, isLoading: false }),
  useAnnouncementTargets: () => ({ data: { roles: [{ role: 'finance_officer', count: 2 }, { role: 'employee', count: 40 }], departments: [{ id: 'd1', name: 'قسم أ', count: 7 }], users: [{ id: 'u1', name: 'أحمد', department: 'قسم أ' }, { id: 'u2', name: 'سارة', department: null }], total_users: 60 }, isLoading: false }),
  useAnnouncementUnread: () => ({ data: 2 }),
  usePublishAnnouncement: () => mut(h.publish), useAckAnnouncement: () => mut(h.ack), useArchiveAnnouncement: () => mut(h.archive),
}))
vi.mock('@features/executive/lib/execExcel', async (orig) => ({ ...(await orig<Record<string, unknown>>()), downloadExecWorkbook: h.download }))
vi.mock('@features/disclosures', () => ({ useDisclosureList: () => ({ data: [{ status: 'submitted_to_deputy' }, { status: 'draft' }] }) }))

import { ExecHome } from '@components/executive/ExecHome'
import { ExecReports } from '@components/executive/ExecReports'
import { AnnouncementsPage } from '@components/executive/AnnouncementsPage'
import AnnouncementInbox, { AnnouncementDetail } from '@components/executive/AnnouncementInbox'
import DeputyHome from '@portals/deputy/pages/DeputyHome'

const r = (ui: ReactNode, path = '/x') => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={ui} /></Routes></MemoryRouter>)
const ann = (over: Record<string, unknown> = {}) => ({
  id: 'a1', title: 'تعميم الدوام', body: 'يرجى الالتزام بالدوام الرسمي من الساعة الثامنة صباحاً.', priority: 'important', audience_kind: 'all', audience_roles: [], audience_departments: [], audience_users: [],
  requires_ack: true, pinned: false, attachment_path: null, published_by: 'u0', publisher_name: 'المدير', publisher_role: 'super_admin', published_at: '2026-09-27T08:00:00Z', expires_at: null, archived_at: null,
  recipients_count: 60, read_count: 20, ack_count: 5, my_read_at: null, my_acked_at: null, is_mine: false, ...over,
})

beforeEach(() => { h.overview = sample(); h.previous = sample({ complaints: { ...sample().complaints, total: 50 } }); h.feedInbox = []; h.feedSent = []; h.recipients = []; h.detail = null; vi.clearAllMocks() })

describe('الرئيسية — المدير المفوض', () => {
  it('استنتاجات + مؤشر الأداء + المؤشرات بدلتا + لوحات كل الوحدات + روابط التقارير والتبليغات', () => {
    r(<ExecHome kind="admin" basePath="/admin" />)
    expect(screen.getByTestId('exec-home')).toHaveAttribute('data-kind', 'admin')
    expect(screen.getByText('المدير المفوض — الرئيسية')).toBeInTheDocument()
    expect(screen.getByTestId('health-gauge')).toBeInTheDocument()
    const insights = within(screen.getByTestId('insights')).getAllByRole('listitem')
    expect(insights.length).toBeGreaterThanOrEqual(6)
    expect(insights.some((li) => li.textContent?.includes('وردت 100 شكوى') && li.textContent?.includes('بارتفاع 100٪'))).toBe(true)
    const kpi = within(screen.getByTestId('kpi-complaints'))
    expect(kpi.getByTestId('delta')).toHaveAttribute('data-good', 'false')   // ارتفاع الشكاوى سلبي
    for (const id of ['panel-complaints', 'panel-fleet', 'panel-station', 'panel-workforce', 'panel-finance', 'panel-support']) expect(screen.getByTestId(id)).toBeInTheDocument()
    expect(screen.queryByTestId('panel-disclosures')).toBeNull()
    expect(screen.getByTestId('go-reports')).toHaveAttribute('href', '/admin/reports')
    expect(screen.getByTestId('go-announcements')).toHaveAttribute('href', '/admin/announcements')
    // لا شيء تقني في الصفحة
    expect(document.body.textContent).not.toMatch(/قاعدة البيانات|الجداول|Supabase|الخادم/)
  })
  it('تغيير الفترة والقاطع والشفت يعيد الاستعلام بالفلاتر الصحيحة', () => {
    r(<ExecHome kind="admin" basePath="/admin" />)
    fireEvent.click(screen.getByTestId('preset-year'))
    expect((h.lastFilters as { from: string }).from).toMatch(/^\d{4}-01-01$/)
    fireEvent.change(screen.getByTestId('sector-filter'), { target: { value: '91' } })
    expect((h.lastFilters as { sector: number }).sector).toBe(91)
    fireEvent.change(screen.getByTestId('shift-filter'), { target: { value: 'evening' } })
    expect((h.lastFilters as { shift: string }).shift).toBe('evening')
    fireEvent.click(screen.getByTestId('clear-filters'))
    expect((h.lastFilters as { sector: null; shift: null }).sector).toBeNull()
    fireEvent.change(screen.getByTestId('date-from'), { target: { value: '2026-03-01' } })
    expect((h.lastFilters as { from: string }).from).toBe('2026-03-01')
    expect(screen.getByTestId('preset-custom')).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('الرئيسية — التنفيذي والمعاون والمالية', () => {
  it('التنفيذي: نفس المحرك بعنوانه', () => {
    r(<ExecHome kind="executive" basePath="/executive" />)
    expect(screen.getByText('المدير التنفيذي — الرئيسية')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-grid')).toBeInTheDocument()
  })
  it('المعاون: شريط الوارد العاجل (كشوفات بانتظار الاعتماد) فوق الملخص + لوحة الكشوفات بدل المالية', () => {
    r(<DeputyHome />)
    expect(screen.getByTestId('tile-statements')).toHaveTextContent('1 بانتظار الاعتماد')
    expect(screen.getByTestId('exec-home')).toHaveAttribute('data-kind', 'deputy')
    expect(screen.getByTestId('panel-disclosures')).toBeInTheDocument()
    expect(screen.queryByTestId('panel-finance')).toBeNull()
  })
  it('المالية: الأرقام المالية أولاً (رواتب/استقطاعات/إنفاق/موازنة) ثم الاستنتاجات المالية في المقدمة', () => {
    r(<ExecHome kind="finance" basePath="/finance" />)
    const fk = screen.getByTestId('finance-kpis')
    expect(within(fk).getByTestId('kpi-payroll')).toHaveTextContent('88,000,000')
    expect(fk.compareDocumentPosition(screen.getByTestId('panel-insights')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const first = within(screen.getByTestId('insights')).getAllByRole('listitem')[0]!
    expect(first.textContent).toContain('المالية')
    expect(screen.getByTestId('panel-payroll-months')).toBeInTheDocument()
  })
})

describe('التقارير الجاهزة', () => {
  it('غلاف للطباعة + اختيار الأقسام + مقارنة اختيارية', () => {
    r(<ExecReports kind="admin" />)
    expect(screen.getByTestId('rep-cover')).toHaveTextContent('تقرير شهري')
    expect(screen.getByTestId('rep-insights')).toBeInTheDocument()
    expect(screen.getByTestId('rep-summary')).toHaveTextContent('الفترة السابقة')
    fireEvent.click(screen.getByTestId('sec-finance'))
    expect(screen.queryByTestId('panel-finance')).toBeNull()
    fireEvent.click(screen.getByTestId('sec-finance'))
    expect(screen.getByTestId('panel-finance')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('compare-toggle'))
    expect(h.withPrev).toBe(false)
    expect(screen.getByTestId('rep-summary')).not.toHaveTextContent('الفترة السابقة')
  })
  it('تصدير Excel باسم ملف يعكس نوع التقرير وفترته، وPDF عبر الطباعة بلا هوامش متصفح', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    r(<ExecReports kind="finance" />)
    fireEvent.click(screen.getByTestId('export-excel'))
    await waitFor(() => expect(h.download).toHaveBeenCalled())
    const [o, ins, prev, name] = h.download.mock.calls[0] as unknown as [unknown, unknown[], unknown, string]
    expect(o).toBeTruthy(); expect(ins.length).toBeGreaterThan(3); expect(prev).toBeTruthy()
    expect(name).toMatch(/^تقرير شهري \d{4}-\d{2}-\d{2} إلى \d{4}-\d{2}-\d{2}\.xlsx$/)
    fireEvent.click(screen.getByTestId('export-pdf'))
    expect(print).toHaveBeenCalled()
    const css = document.querySelector('style')!.textContent!
    expect(css).toContain('@page { size: A4; margin: 0; }')
    expect(css).toContain('print-color-adjust: exact')
    expect(css).toContain('#exec-report')
    print.mockRestore()
  })
})

describe('التبليغات — النشر', () => {
  it('يتحقق من المدخلات ثم ينشر للكل مع أولوية وإقرار', async () => {
    r(<AnnouncementsPage />)
    fireEvent.click(screen.getByTestId('tab-compose'))
    fireEvent.click(screen.getByTestId('ann-submit'))
    expect(screen.getByTestId('ann-error')).toHaveTextContent('عنوان التبليغ مطلوب')
    fireEvent.change(screen.getByTestId('ann-title'), { target: { value: 'تعميم عام' } })
    fireEvent.click(screen.getByTestId('ann-submit'))
    expect(screen.getByTestId('ann-error')).toHaveTextContent('نص التبليغ مطلوب')
    fireEvent.change(screen.getByTestId('ann-body'), { target: { value: 'يرجى الالتزام بالدوام الرسمي' } })
    fireEvent.click(screen.getByTestId('prio-urgent'))
    fireEvent.click(screen.getByTestId('ann-ack'))
    expect(screen.getByTestId('recipients-preview')).toHaveTextContent('60')
    fireEvent.click(screen.getByTestId('ann-submit'))
    await waitFor(() => expect(h.publish).toHaveBeenCalledWith(expect.objectContaining({ title: 'تعميم عام', body: 'يرجى الالتزام بالدوام الرسمي', priority: 'urgent', audience_kind: 'all', requires_ack: true })))
    await waitFor(() => expect(screen.getByTestId('tab-sent')).toHaveAttribute('aria-pressed', 'true'))
  })
  it('استهداف أقسام: لا نشر بلا اختيار، ومعاينة عدد المستلمين تتبع الاختيار', async () => {
    r(<AnnouncementsPage />)
    fireEvent.click(screen.getByTestId('tab-compose'))
    fireEvent.change(screen.getByTestId('ann-title'), { target: { value: 'اجتماع' } })
    fireEvent.change(screen.getByTestId('ann-body'), { target: { value: 'الاجتماع الساعة 10' } })
    fireEvent.click(screen.getByTestId('aud-departments'))
    expect(screen.getByTestId('recipients-preview')).toHaveTextContent('0')
    fireEvent.click(screen.getByTestId('ann-submit'))
    expect(screen.getByTestId('ann-error')).toHaveTextContent('اختر جهة مستهدفة')
    fireEvent.click(within(screen.getByTestId('aud-depts-list')).getByRole('checkbox'))
    expect(screen.getByTestId('recipients-preview')).toHaveTextContent('7')
    fireEvent.click(screen.getByTestId('ann-submit'))
    await waitFor(() => expect(h.publish).toHaveBeenCalledWith(expect.objectContaining({ audience_kind: 'departments', departments: ['d1'] })))
  })
  it('استهداف أشخاص مع بحث، واستهداف أدوار بأسمائها العربية', async () => {
    r(<AnnouncementsPage />)
    fireEvent.click(screen.getByTestId('tab-compose'))
    fireEvent.click(screen.getByTestId('aud-users'))
    fireEvent.change(screen.getByTestId('aud-user-search'), { target: { value: 'سارة' } })
    const list = screen.getByTestId('aud-users-list')
    expect(within(list).getAllByRole('checkbox')).toHaveLength(1)
    fireEvent.click(within(list).getByRole('checkbox'))
    expect(screen.getByTestId('recipients-preview')).toHaveTextContent('1')
    fireEvent.click(screen.getByTestId('aud-roles'))
    expect(screen.getByTestId('aud-roles-list')).toHaveTextContent('الشؤون المالية')
    expect(screen.getByTestId('aud-roles-list')).toHaveTextContent('الموظفون')
  })
})

describe('التبليغات — الصادر والوارد', () => {
  it('الصادر: عدّادات القراءة/الإقرار + قائمة المستلمين + الأرشفة', async () => {
    h.feedSent = [ann({ is_mine: true })]
    h.recipients = [{ user_id: 'u1', full_name: 'أحمد', department_name: 'قسم أ', delivered_at: 'x', read_at: 'y', acked_at: 'z' }, { user_id: 'u2', full_name: 'سارة', department_name: null, delivered_at: 'x', read_at: null, acked_at: null }]
    vi.spyOn(window, 'prompt').mockReturnValue('انتهى')
    r(<AnnouncementsPage />)
    expect(screen.getByTestId('tab-sent')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('ann-stats')).toHaveTextContent('20/60 قرأ · 5 أقرّ')
    fireEvent.click(screen.getByTestId('ann-stats'))
    const rows = within(screen.getByTestId('recipients-modal')).getAllByTestId('recipient-row')
    expect(rows[0]).toHaveTextContent('أحمد'); expect(rows[0]).toHaveTextContent('أقرّ')
    expect(rows[1]).toHaveTextContent('لم يقرأ')
    fireEvent.click(screen.getByTestId('ann-archive'))
    await waitFor(() => expect(h.archive).toHaveBeenCalledWith({ id: 'a1', reason: 'انتهى' }))
  })
  it('الوارد: غير المقروء مميّز، ويمكن فتحه من أي بوابة', () => {
    h.feedInbox = [ann({ my_read_at: null }), ann({ id: 'a2', title: 'قديم', my_read_at: '2026-09-20T00:00:00Z', priority: 'normal', requires_ack: false })]
    r(<AnnouncementInbox />, '/employee/announcements/inbox')
    const cards = screen.getAllByTestId('announcement-card')
    expect(cards[0]).toHaveAttribute('data-unread', 'true'); expect(cards[0]).toHaveTextContent('جديد'); expect(cards[0]).toHaveTextContent('يتطلب إقراراً')
    expect(cards[1]).toHaveAttribute('data-unread', 'false')
    expect(within(cards[0]!).getByTestId('ann-open-link')).toHaveAttribute('href', '/employee/announcements/inbox/a1')
  })
  it('التفصيل: زر الإقرار يستدعي الإقرار، وبعده يظهر التوقيت', async () => {
    h.detail = ann()
    render(<MemoryRouter initialEntries={['/employee/announcements/inbox/a1']}><Routes><Route path="/employee/announcements/inbox/:announcementId" element={<AnnouncementDetail />} /></Routes></MemoryRouter>)
    expect(screen.getByTestId('announcement-detail')).toHaveTextContent('تعميم الدوام')
    fireEvent.click(screen.getByTestId('ack-btn'))
    await waitFor(() => expect(h.ack).toHaveBeenCalledWith('a1'))
    h.detail = ann({ my_acked_at: '2026-09-27T09:00:00Z' })
    render(<MemoryRouter initialEntries={['/employee/announcements/inbox/a1']}><Routes><Route path="/employee/announcements/inbox/:announcementId" element={<AnnouncementDetail />} /></Routes></MemoryRouter>)
    expect(screen.getByTestId('acked')).toBeInTheDocument()
  })
  it('بلا صلاحية نشر: تبويب الوارد فقط', () => {
    r(<AnnouncementsPage canPublish={false} />)
    expect(screen.queryByTestId('tab-compose')).toBeNull(); expect(screen.queryByTestId('new-announcement')).toBeNull()
    expect(screen.getByTestId('inbox-list')).toBeInTheDocument()
  })
})
