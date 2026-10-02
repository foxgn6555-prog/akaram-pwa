/**
 * منظومة الإدارة العليا (00146) — الصفحات:
 *   الرئيسية (المفوض/التنفيذي/المعاون/المالية) · التقارير (فلاتر/أقسام/Excel/PDF) · التبليغات (إنشاء/صادر/وارد/إقرار)
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
// تثبيت التاريخ: الفترات الجاهزة («هذا الشهر») تعتمد على اليوم، وفي أول يوم من الشهر تصبح يوماً واحداً
beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-29T09:00:00')) })
afterAll(() => vi.useRealTimers())
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { ReactNode } from 'react'
import { sample } from '../../fixtures/exec-overview'

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
// 00168: قسم شكاوى المواطنين يجلب بياناته بنفسه — يُعزل هنا
vi.mock('@components/citizen/CitizenReportPanel', () => ({ CitizenReportPanel: ({ from, to }: { from: string; to: string }) => <div data-testid="citizen-report">{from}→{to}</div> }))

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

const openTab = (k: string) => fireEvent.click(screen.getByTestId(`tab-${k}`))
const toStep3 = () => { fireEvent.click(screen.getByTestId('next-step')); fireEvent.click(screen.getByTestId('next-step')) }

describe('الرئيسية — تبويبات ثابتة ونظرة عامة خفيفة', () => {
  it('المدير المفوض: نظرة عامة = قرارات + 4 نتائج فقط + بطاقات؛ التبويبات بشارات الإنذار؛ ولا شيء تقني', () => {
    r(<ExecHome kind="admin" basePath="/admin" />)
    expect(screen.getByTestId('exec-home')).toHaveAttribute('data-tab', 'overview')
    expect(within(screen.getByTestId('home-tabs')).getAllByRole('tab').map((t) => t.textContent)).toEqual(['نظرة عامة', 'الشكاوى1', 'الأسطول والصيانة', 'المحطة التحويلية1', 'القوى العاملة1', 'المالية', 'الميدان'])
    const decisions = within(screen.getByTestId('decisions')).getAllByTestId('decision-item')
    expect(decisions.map((d) => d.textContent)).toEqual([expect.stringContaining('4طلب إجازة'), expect.stringContaining('30شكوى قيد المعالجة'), expect.stringContaining('4آلية متوقفة'), expect.stringContaining('6آلية في الميدان'), expect.stringContaining('6تنبيه')])
    const insights = within(screen.getByTestId('insights')).getAllByRole('listitem')
    expect(insights).toHaveLength(4)
    expect(insights[0]).toHaveAttribute('data-tone', 'bad')            // الأسوأ أولاً
    expect(screen.getByTestId('health-gauge')).toBeInTheDocument()
    const cards = screen.getByTestId('scorecards')
    expect(within(cards).getAllByTestId(/^card-/).map((c) => c.dataset.testid)).toEqual(['card-complaints', 'card-fleet', 'card-station', 'card-workforce', 'card-finance', 'card-field'])
    expect(within(within(cards).getByTestId('card-complaints')).getByTestId('delta')).toHaveAttribute('data-good', 'false')
    // لا لوحات تفصيلية في النظرة العامة (خفيفة)
    for (const id of ['panel-complaints', 'panel-fleet', 'panel-station', 'kpi-grid']) expect(screen.queryByTestId(id)).toBeNull()
    expect(screen.getByTestId('go-reports')).toHaveAttribute('href', '/admin/reports')
    expect(document.body.textContent).not.toMatch(/قاعدة البيانات|الجداول|Supabase|الخادم/)
  })
  it('تبويب الوحدة = استنتاجاتها + لوحتها فقط؛ البطاقة تفتح تبويبها؛ التبويب في hash الرابط', () => {
    r(<ExecHome kind="admin" basePath="/admin" />)
    openTab('complaints')
    expect(screen.getByTestId('exec-home')).toHaveAttribute('data-tab', 'complaints')
    expect(screen.getByTestId('tab-panel-complaints')).toBeInTheDocument()
    expect(screen.getByTestId('panel-complaints')).toBeInTheDocument()
    expect(within(screen.getByTestId('tab-insights')).getAllByRole('listitem').every((li) => li.textContent?.includes('الشكاوى'))).toBe(true)
    expect(screen.queryByTestId('panel-fleet')).toBeNull(); expect(screen.queryByTestId('scorecards')).toBeNull()
    openTab('overview')
    fireEvent.click(screen.getByTestId('open-station'))
    expect(screen.getByTestId('panel-station')).toBeInTheDocument()
    openTab('field')
    for (const id of ['panel-sectors', 'panel-disclosures', 'panel-supplies', 'panel-support']) expect(screen.getByTestId(id)).toBeInTheDocument()
  })
  it('فتح مباشر عبر hash: /admin#fleet', () => {
    r(<ExecHome kind="admin" basePath="/admin" />, '/admin#fleet')
    expect(screen.getByTestId('exec-home')).toHaveAttribute('data-tab', 'fleet')
    expect(screen.getByTestId('panel-fleet')).toBeInTheDocument()
  })
  it('كشف رواتب غير معتمد يتصدر بنود القرار', () => {
    h.overview = sample({ finance: { ...sample().finance, payroll: { ...sample().finance.payroll!, status: 'exported' } } })
    r(<ExecHome kind="admin" basePath="/admin" />)
    expect(within(screen.getByTestId('decisions')).getAllByTestId('decision-item')[0]).toHaveTextContent('بانتظار اعتماد المالية')
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

describe('الرسوم — SVG/CSS خالصة ومتجاوبة', () => {
  it('لا recharts؛ الاتجاه يعرض القيم نصاً (الإجمالي والذروة وتواريخ المحور) ويتمدد بـ viewBox', () => {
    h.overview = sample({ complaints: { ...sample().complaints, series: [{ d: '2026-09-01', count: 4 }, { d: '2026-09-02', count: 9 }, { d: '2026-09-03', count: 2 }] } })
    r(<ExecHome kind="executive" basePath="/executive" />, '/executive#complaints')
    expect(document.querySelector('.recharts-wrapper')).toBeNull()
    const trend = screen.getByTestId('panel-complaints').querySelector('.exec-chart')!
    expect(trend).toHaveAttribute('data-points', '3')
    expect(trend.textContent).toContain('شكاوى/يوم: 15')
    expect(trend.textContent).toContain('الذروة 9 يوم 09/02')
    const svg = trend.querySelector('svg')!
    expect(svg).toHaveAttribute('viewBox', '0 0 600 100'); expect(svg).toHaveAttribute('preserveAspectRatio', 'none'); expect(svg.getAttribute('class')).toContain('w-full')
    expect(svg.querySelector('path[d^="M"]')).not.toBeNull()   // منحنى ناعم
    expect(trend.textContent).toContain('09/01'); expect(trend.textContent).toContain('09/03')
  })
  it('الأعمدة الأفقية HTML: الاسم كاملاً + القيمة + النسبة، وعرض العمود نسبي', () => {
    r(<ExecHome kind="executive" basePath="/executive" />, '/executive#complaints')
    const bars = within(screen.getByTestId('panel-complaints')).getAllByRole('list').find((l) => l.textContent?.includes('نفايات'))!
    expect(bars).toHaveTextContent('نفايات80(100٪)')
    expect((bars.querySelector('li > div:last-child > div') as HTMLElement).style.width).toBe('100%')
  })
  it('الحلقة: مجموع في الوسط وقائمة كاملة بالنِّسب', () => {
    r(<ExecHome kind="executive" basePath="/executive" />, '/executive#fleet')
    const fleet = screen.getByTestId('panel-fleet')
    expect(fleet.querySelector('svg text')?.textContent).toBe('300')
    expect(fleet).toHaveTextContent('صباحي300 (100٪)')
  })
  it('المكدّس اليومي: أعمدة CSS بارتفاعات نسبية ومجاميع نصية', () => {
    r(<ExecHome kind="executive" basePath="/executive" />, '/executive#workforce')
    const wf = screen.getByTestId('panel-workforce')
    expect(wf).toHaveTextContent('حاضر: 90'); expect(wf).toHaveTextContent('غائب: 5')
    expect((wf.querySelector('.exec-chart div[title] div') as HTMLElement).style.height).toBe('90%')
  })
  it('حالة فارغة نصية بدل رسم فارغ', () => {
    h.overview = sample({ complaints: { total: 0, open: 0, resolved: 0, by_status: [], by_sector: [], by_type: [], series: [] } })
    r(<ExecHome kind="executive" basePath="/executive" />, '/executive#complaints')
    expect(within(screen.getByTestId('panel-complaints')).getAllByText('لا بيانات في هذه الفترة').length).toBeGreaterThanOrEqual(3)
  })
})

describe('الرئيسية — التنفيذي والمعاون والمالية', () => {
  it('التنفيذي: تبويبات تشغيلية بلا مالية، وبطاقات بلا بطاقة مالية، وقراءة بلا استنتاجات مالية', () => {
    r(<ExecHome kind="executive" basePath="/executive" />)
    expect(screen.getByText('المدير التنفيذي — الرئيسية')).toBeInTheDocument()
    expect(within(screen.getByTestId('home-tabs')).getAllByRole('tab').map((t) => t.textContent?.replace(/\d+$/, ''))).toEqual(['نظرة عامة', 'الشكاوى', 'الأسطول والصيانة', 'المحطة التحويلية', 'القوى العاملة', 'القواطع والدعم'])
    expect(within(screen.getByTestId('scorecards')).getAllByTestId(/^card-/).map((c) => c.dataset.testid)).toEqual(['card-complaints', 'card-fleet', 'card-station', 'card-workforce', 'card-field'])
    expect(within(screen.getByTestId('insights')).getAllByRole('listitem').some((li) => li.textContent?.includes('المالية'))).toBe(false)
    expect(screen.queryByTestId('decisions')).toBeNull()
  })
  it('المعاون: شريط الوارد العاجل فوق الملخص، ثم تبويبات الميدان وبطاقة القواطع أولاً', () => {
    r(<DeputyHome />)
    expect(screen.getByTestId('tile-statements')).toHaveTextContent('1 بانتظار الاعتماد')
    expect(screen.getByTestId('exec-home')).toHaveAttribute('data-kind', 'deputy')
    expect(within(screen.getByTestId('home-tabs')).getAllByRole('tab').map((t) => t.textContent?.replace(/\d+$/, ''))).toEqual(['نظرة عامة', 'القواطع', 'الكشوفات', 'المحطة التحويلية', 'الشكاوى', 'التجهيز', 'الأسطول'])
    expect(within(screen.getByTestId('scorecards')).getAllByTestId(/^card-/)[0]).toHaveAttribute('data-testid', 'card-sectors')
    expect(screen.getByTestId('card-sectors')).toHaveTextContent('الكرادة')
    openTab('sectors')
    expect(screen.getByTestId('panel-sectors')).toBeInTheDocument()
    expect(screen.queryByTestId('tab-finance')).toBeNull(); expect(screen.queryByTestId('card-finance')).toBeNull()
  })
  it('المالية: تبويبات مالية فقط، بطاقات مالية أربع، قراءة مالية أولاً، ولا شكاوى/أسطول/محطة في أي تبويب', () => {
    r(<ExecHome kind="finance" basePath="/finance" />)
    expect(within(screen.getByTestId('home-tabs')).getAllByRole('tab').map((t) => t.textContent?.replace(/\d+$/, ''))).toEqual(['نظرة عامة', 'الرواتب', 'الموازنة', 'الإنفاق', 'أثر الحضور'])
    const fk = screen.getByTestId('finance-kpis')
    expect(within(fk).getByTestId('kpi-payroll')).toHaveTextContent('88,000,000')
    expect(within(fk).getByTestId('kpi-payroll')).toHaveTextContent('2,000,000')
    expect(within(fk).getByTestId('kpi-budget')).toHaveTextContent('60٪')
    expect(within(fk).getByTestId('kpi-deductions')).toHaveTextContent('12')
    const ins = within(screen.getByTestId('insights')).getAllByRole('listitem')
    expect(ins.every((li) => /المالية|الموارد البشرية/.test(li.textContent ?? ''))).toBe(true)
    for (const k of ['payroll', 'budget', 'spend', 'workforce_cost']) { openTab(k); expect(screen.getByTestId(`tab-panel-${k}`)).toBeInTheDocument(); for (const id of ['panel-complaints', 'panel-fleet', 'panel-station']) expect(screen.queryByTestId(id)).toBeNull() }
    openTab('payroll'); expect(screen.getByTestId('panel-payroll')).toHaveTextContent('2026-08 · معتمد')
    openTab('budget'); expect(screen.getByTestId('panel-budget')).toHaveTextContent('وقود')
  })
})

describe('التقارير — معالج من ثلاث خطوات', () => {
  it('الخطوة ١: أنواع التقرير تضبط الفترة، والملخص يتحدث؛ الخطوة ٢: الأقسام مرقّمة بوصف؛ الخطوة ٣: معاينة مرقّمة بفهرس', () => {
    r(<ExecReports kind="admin" />)
    expect(screen.getByTestId('exec-reports')).toHaveAttribute('data-step', '1')
    expect(screen.getByTestId('step-1')).toHaveAttribute('data-state', 'current')
    fireEvent.click(screen.getByTestId('preset-year'))
    expect((h.lastFilters as { from: string }).from).toMatch(/-01-01$/)
    expect(screen.getByTestId('wizard-summary')).toHaveTextContent('تقرير سنوي')
    fireEvent.click(screen.getByTestId('preset-month'))
    fireEvent.click(screen.getByTestId('next-step'))
    expect(screen.getByTestId('exec-reports')).toHaveAttribute('data-step', '2')
    expect(screen.getByTestId('step-1')).toHaveAttribute('data-state', 'done')
    const items = within(screen.getByTestId('section-toggles')).getAllByRole('listitem')
    expect(items).toHaveLength(12)   // 00168: + شكاوى المواطنين والدعم
    expect(items[0]).toHaveTextContent('1. قراءة تحليلية'); expect(items[0]).toHaveTextContent('جمل جاهزة')
    fireEvent.click(screen.getByTestId('sec-finance'))
    expect(screen.getByTestId('wizard-summary')).toHaveTextContent('11 قسم')
    fireEvent.click(screen.getByTestId('next-step'))
    expect(screen.getByTestId('exec-reports')).toHaveAttribute('data-step', '3')
    expect(screen.getByTestId('rep-cover')).toHaveTextContent('تقرير شهري')
    expect(within(screen.getByTestId('rep-toc')).getAllByRole('listitem')).toHaveLength(13) // الموجز + ١١ قسماً + المصادقات
    expect(screen.getByTestId('rep-sec-insights')).toHaveTextContent('1قراءة تحليلية')
    expect(screen.getByTestId('rep-summary')).toHaveTextContent('الفترة السابقة')
    expect(screen.getByTestId('scorecards')).toBeInTheDocument()
    expect(screen.queryByTestId('rep-sec-finance')).toBeNull()
    fireEvent.click(screen.getByTestId('prev-step'))
    expect(screen.getByTestId('exec-reports')).toHaveAttribute('data-step', '2')
  })
  it('لا معاينة بلا أقسام؛ «تحديد الكل/إلغاء الكل»؛ إلغاء المقارنة يُسقط عمود الفترة السابقة', () => {
    r(<ExecReports kind="admin" />)
    fireEvent.click(screen.getByTestId('compare-toggle'))
    expect(h.withPrev).toBe(false)
    fireEvent.click(screen.getByTestId('next-step'))
    fireEvent.click(screen.getByTestId('toggle-all'))
    expect(screen.getByTestId('next-step')).toBeDisabled()
    fireEvent.click(screen.getByTestId('toggle-all'))
    fireEvent.click(screen.getByTestId('next-step'))
    expect(screen.getByTestId('rep-summary')).not.toHaveTextContent('الفترة السابقة')
  })
  it('تقارير المالية: أقسام مالية فقط، جدول مؤشرات مالي، وExcel بنطاق finance واسم «مالي»', async () => {
    r(<ExecReports kind="finance" />)
    expect(screen.getByText('التقارير المالية')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('next-step'))
    expect(within(screen.getByTestId('section-toggles')).getAllByRole('listitem').map((b) => b.textContent)).toEqual([expect.stringContaining('قراءة مالية'), expect.stringContaining('جدول المؤشرات المالية'), expect.stringContaining('الرواتب'), expect.stringContaining('الموازنة'), expect.stringContaining('الإنفاق التشغيلي'), expect.stringContaining('أثر الحضور على الرواتب')])
    fireEvent.click(screen.getByTestId('next-step'))
    expect(screen.getByTestId('rep-summary')).toHaveTextContent('صافي كشف الرواتب')
    expect(screen.getByTestId('rep-summary')).not.toHaveTextContent('الشكاوى الواردة')
    for (const id of ['panel-payroll', 'panel-budget', 'panel-spend']) expect(screen.getByTestId(id)).toBeInTheDocument()
    for (const id of ['panel-complaints', 'panel-fleet', 'panel-station', 'scorecards', 'health-gauge']) expect(screen.queryByTestId(id)).toBeNull()
    expect(screen.getByTestId('rep-cover')).toHaveTextContent('تقرير شهري — مالي')
    fireEvent.click(screen.getByTestId('export-excel'))
    await waitFor(() => expect(h.download).toHaveBeenCalled())
    const [, , , name, scope] = h.download.mock.calls[0] as unknown as [unknown, unknown[], unknown, string, string]
    expect(name).toMatch(/^تقرير شهري مالي \d{4}-\d{2}-\d{2} إلى \d{4}-\d{2}-\d{2}\.xlsx$/)
    expect(scope).toBe('finance')
  })
  it('تصدير Excel للإدارة بنطاق كامل، وPDF عبر الطباعة بلا هوامش متصفح وبألوان وكل قسم في صفحة', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    r(<ExecReports kind="executive" />)
    toStep3()
    fireEvent.click(screen.getByTestId('export-excel'))
    await waitFor(() => expect(h.download).toHaveBeenCalled())
    const [o, ins, prev, name, scope] = h.download.mock.calls[0] as unknown as [unknown, unknown[], unknown, string, string]
    expect(o).toBeTruthy(); expect(ins.length).toBeGreaterThan(3); expect(prev).toBeTruthy(); expect(scope).toBe('all')
    expect(name).toMatch(/^تقرير شهري \d{4}-\d{2}-\d{2} إلى \d{4}-\d{2}-\d{2}\.xlsx$/)
    fireEvent.click(screen.getByTestId('export-pdf'))
    expect(print).toHaveBeenCalled()
    const css = document.querySelector('style')!.textContent!
    expect(css).toContain('@page { size: A4; margin: 0; }')
    expect(css).toContain('print-color-adjust: exact')
    expect(css).toContain('.exec-brief, .exec-section, .exec-sign { break-before: page; }')
    // 00169 — التخطيط «الاثنان معاً»: غلاف ظاهر على الشاشة، موجز تنفيذي (٨ مؤشرات + أبرز النتائج + ما يحتاج قراراً)، أقسام مرقّمة بقراءة مكتوبة، ثم صفحة المصادقات
    expect(screen.getByTestId('rep-cover')).not.toHaveClass('hidden')
    expect(screen.getByTestId('rep-cover')).toHaveTextContent('شركة جزيرة الأكارم')
    expect(screen.getByTestId('rep-brief-kpis').children).toHaveLength(8)
    expect(screen.getByTestId('rep-brief-decisions')).toBeInTheDocument()
    expect(within(screen.getByTestId('rep-signatures')).getByText('اعتمده')).toBeInTheDocument()
    expect(within(screen.getByTestId('rep-signatures')).getByText('المدير التنفيذي')).toBeInTheDocument()
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
