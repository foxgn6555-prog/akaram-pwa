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
import { sample, samplePeople } from '../../fixtures/exec-overview'

const h = vi.hoisted(() => ({
  overview: null as unknown, previous: null as unknown, people: null as unknown, lastFilters: null as unknown, withPrev: true,
  feedInbox: [] as unknown[], feedSent: [] as unknown[], recipients: [] as unknown[], detail: null as unknown,
  publish: vi.fn(async () => 'new-id'), ack: vi.fn(async () => undefined), archive: vi.fn(async () => undefined), download: vi.fn(async () => undefined),
}))
const mut = (fn: (...a: never[]) => Promise<unknown>) => ({ mutate: (v: never, o?: { onSuccess?: () => void }) => void fn(v).then(() => o?.onSuccess?.()), mutateAsync: fn, isPending: false })

vi.mock('@features/executive/hooks/useExecutive', () => ({
  useExecOverview: (f: unknown, withPrev = true) => { h.lastFilters = f; h.withPrev = withPrev; return { data: h.overview, previous: withPrev ? h.previous : null, isLoading: false, error: null, refetch: vi.fn(), isFetching: false } },
  useExecPeople: () => ({ data: h.people, isLoading: false, error: null }),
  useExecFilterOptions: () => ({ data: { sectors: [{ id: 91, name: 'قاطع الاختبار', parent: 'karrada' }, { id: 92, name: 'قاطع ثانٍ', parent: 'zaafaraniya' }], shifts: [{ key: 'morning', label: 'صباحي' }, { key: 'evening', label: 'مسائي' }], parents: [] } }),
  useAnnouncementFeed: (scope: string) => ({ data: scope === 'sent' ? h.feedSent : h.feedInbox, isLoading: false }),
  useAnnouncement: () => ({ data: h.detail, isLoading: false, error: null }),
  useAnnouncementRecipients: () => ({ data: h.recipients, isLoading: false }),
  useAnnouncementTargets: () => ({ data: { roles: [{ role: 'finance_officer', count: 2 }, { role: 'employee', count: 40 }], departments: [{ id: 'd1', name: 'قسم أ', count: 7 }], users: [{ id: 'u1', name: 'أحمد', department: 'قسم أ' }, { id: 'u2', name: 'سارة', department: null }], total_users: 60 }, isLoading: false }),
  useAnnouncementUnread: () => ({ data: 2 }),
  usePublishAnnouncement: () => mut(h.publish), useAckAnnouncement: () => mut(h.ack), useArchiveAnnouncement: () => mut(h.archive),
}))
vi.mock('@features/executive/lib/execExcel', async (orig) => ({ ...(await orig<Record<string, unknown>>()), downloadExecWorkbook: h.download }))
vi.mock('@features/disclosures/unit', () => ({ useDisclosureInbox: () => ({ data: [{ id: 'd1', status: 'pending' }] }) }))
// 00168: قسم شكاوى المواطنين يجلب بياناته بنفسه — يُعزل هنا
vi.mock('@components/citizen/CitizenReportPanel', () => ({ CitizenReportPanel: ({ from, to }: { from: string; to: string }) => <div data-testid="citizen-report">{from}→{to}</div> }))

import { ExecHome } from '@components/executive/ExecHome'
import { ExecReports } from '@components/executive/ExecReports'
import { ExecPeopleBody } from '@components/executive/ExecPeoplePanels'
import { HOME_TABS, REPORT_SECTIONS } from '@features/executive/lib/portal'
import { AnnouncementsPage } from '@components/executive/AnnouncementsPage'
import AnnouncementInbox, { AnnouncementDetail } from '@components/executive/AnnouncementInbox'
import DeputyHome from '@portals/deputy/pages/DeputyHome'

const r = (ui: ReactNode, path = '/x') => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={ui} /></Routes></MemoryRouter>)
const ann = (over: Record<string, unknown> = {}) => ({
  id: 'a1', title: 'تعميم الدوام', body: 'يرجى الالتزام بالدوام الرسمي من الساعة الثامنة صباحاً.', priority: 'important', audience_kind: 'all', audience_roles: [], audience_departments: [], audience_users: [],
  requires_ack: true, pinned: false, attachment_path: null, published_by: 'u0', publisher_name: 'المدير', publisher_role: 'super_admin', published_at: '2026-09-27T08:00:00Z', expires_at: null, archived_at: null,
  recipients_count: 60, read_count: 20, ack_count: 5, my_read_at: null, my_acked_at: null, is_mine: false, ...over,
})

beforeEach(() => { h.overview = sample(); h.previous = sample({ complaints: { ...sample().complaints, total: 50 } }); h.people = samplePeople(); h.feedInbox = []; h.feedSent = []; h.recipients = []; h.detail = null; vi.clearAllMocks() })

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
  it('00217 — الحضور: منحنى نسبة الحضور اليومية (متوسط ٪) بدل المكدّس، مع عدّادات حضور/تأخير/غياب نصية', () => {
    r(<ExecHome kind="executive" basePath="/executive" />, '/executive#workforce')
    const wf = screen.getByTestId('panel-workforce')
    expect(within(wf).getByTestId('attendance-rate-trend')).toHaveTextContent('متوسط نسبة الحضور')
    expect(within(wf).getByTestId('attendance-rate-trend').textContent).toMatch(/٪/)
    expect(wf).toHaveTextContent('يوم حضور'); expect(wf).toHaveTextContent('يوم غياب')
  })
  it('حالة فارغة نصية بدل رسم فارغ', () => {
    h.overview = sample({ complaints: { total: 0, open: 0, resolved: 0, by_status: [], by_sector: [], by_type: [], series: [] } })
    r(<ExecHome kind="executive" basePath="/executive" />, '/executive#complaints')
    expect(within(screen.getByTestId('panel-complaints')).getAllByText('لا بيانات في هذه الفترة').length).toBeGreaterThanOrEqual(3)
  })
})

describe('الرئيسية — التنفيذي والمعاون والمالية', () => {
  it('00219 — التنفيذي = المفوض: نفس التبويبات (مع المالية) ونفس البطاقات ونفس القرارات والاستنتاجات المالية', () => {
    r(<ExecHome kind="executive" basePath="/executive" />)
    expect(screen.getByText('المدير التنفيذي — الرئيسية')).toBeInTheDocument()
    expect(REPORT_SECTIONS.executive).toEqual(REPORT_SECTIONS.admin)
    expect(HOME_TABS.executive).toEqual(HOME_TABS.admin)
    expect(within(screen.getByTestId('home-tabs')).getAllByRole('tab').map((t) => t.textContent?.replace(/\d+$/, ''))).toEqual(['نظرة عامة', 'الشكاوى', 'الأسطول والصيانة', 'المحطة التحويلية', 'القوى العاملة', 'المالية', 'الميدان'])
    expect(within(screen.getByTestId('scorecards')).getAllByTestId(/^card-/).map((c) => c.dataset.testid)).toEqual(['card-complaints', 'card-fleet', 'card-station', 'card-workforce', 'card-finance', 'card-field'])
    expect(screen.getByTestId('decisions')).toBeInTheDocument()
  })
  it('00219 — تقرير التنفيذي: 13 قسماً كالمفوض، وقسم الأشخاص يعرض المبالغ والاستقطاعات', () => {
    r(<ExecReports kind="executive" />); fireEvent.click(screen.getByTestId('next-step'))
    expect(within(screen.getByTestId('section-toggles')).getAllByRole('listitem')).toHaveLength(13)
    fireEvent.click(screen.getByTestId('next-step'))
    expect(screen.getByTestId('rep-sec-finance')).toBeInTheDocument()
    expect(within(screen.getByTestId('rep-sec-people')).getByTestId('people-deductions')).toHaveTextContent('150,000 د.ع')
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
    expect(items).toHaveLength(13)   // 00168: + شكاوى المواطنين والدعم · 00218: + الأشخاص
    expect(items[0]).toHaveTextContent('1. قراءة تحليلية'); expect(items[0]).toHaveTextContent('جمل جاهزة')
    fireEvent.click(screen.getByTestId('sec-finance'))
    expect(screen.getByTestId('wizard-summary')).toHaveTextContent('12 قسم')
    fireEvent.click(screen.getByTestId('next-step'))
    expect(screen.getByTestId('exec-reports')).toHaveAttribute('data-step', '3')
    expect(screen.getByTestId('rep-cover')).toHaveTextContent('تقرير شهري')
    expect(within(screen.getByTestId('rep-toc')).getAllByRole('listitem')).toHaveLength(14) // الموجز + ١٢ قسماً + المصادقات
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
    expect(screen.getByTestId('rep-brief-kpis').children).toHaveLength(6)
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

describe('00215 — بوابة المدير المفوض: رأس جديد، شريط الأرقام، تقرير بنقرة', () => {
  it('الرئيسية: الرأس يحمل الاسم والاختصارات الأربعة، شريط الأرقام الأربعة يفتح التبويب، ومؤشر الأداء مرة واحدة فقط', () => {
    r(<ExecHome kind="admin" basePath="/admin" userName="سامر" />)
    expect(screen.getByTestId('exec-header')).toHaveTextContent('سامر')
    const quick = within(screen.getByTestId('exec-quick')).getAllByRole('link')
    expect(quick.map((a) => a.getAttribute('href'))).toEqual(['/admin/reports', '/admin/announcements', '/admin/approvals', '/admin/disclosures'])
    expect(screen.getAllByTestId('health-gauge')).toHaveLength(1)
    const hero = within(screen.getByTestId('hero-strip')).getAllByRole('button')
    expect(hero).toHaveLength(4)
    expect(screen.getByTestId('hero-complaints')).toHaveTextContent('100')
    expect(screen.getByTestId('hero-workforce')).toHaveTextContent('95٪')
    fireEvent.click(screen.getByTestId('hero-station'))
    expect(screen.getByTestId('exec-home')).toHaveAttribute('data-tab', 'station')
    expect(screen.getByTestId('panel-station')).toBeInTheDocument()
  })
  it('المالية: لا شريط أرقام تشغيلية ولا مؤشر أداء، واختصاران فقط', () => {
    r(<ExecHome kind="finance" basePath="/finance" />)
    expect(screen.queryByTestId('hero-strip')).toBeNull(); expect(screen.queryByTestId('health-gauge')).toBeNull()
    expect(within(screen.getByTestId('exec-quick')).getAllByRole('link')).toHaveLength(2)
  })
  it('التقارير: «تقرير بنقرة واحدة» يضبط الفترة ويختار كل الأقسام ويقفز للمعاينة مع شريط تنقّل بين الأقسام', () => {
    r(<ExecReports kind="admin" />)
    expect(within(screen.getByTestId('quick-reports')).getAllByRole('button')).toHaveLength(4)
    fireEvent.click(screen.getByTestId('quick-prev_month'))
    expect(screen.getByTestId('exec-reports')).toHaveAttribute('data-step', '3')
    expect((h.lastFilters as { from: string }).from).toBe('2026-08-01')
    expect(screen.getByTestId('rep-cover')).toHaveTextContent('تقرير شهري')
    const nav = within(screen.getByTestId('rep-nav')).getAllByRole('link')
    expect(nav[0]).toHaveAttribute('href', '#rep-brief')
    expect(nav.length).toBe(screen.getAllByTestId(/^rep-sec-/).length + 1)
    expect(document.getElementById('rep-sec-complaints')).toBeInTheDocument()
    expect(screen.queryByTestId('quick-reports')).toBeNull()
  })
})

describe('00216 — ترتيب موحّد لكل وحدات بوابة المدير المفوض', () => {
  it('التبليغات بالرأس الموحّد: أرقام حيّة (سارية/إقرار/غير مقروء)، زر تبليغ جديد، وتبويبات بأيقونات تعمل', () => {
    h.feedSent = [ann({ id: 's1', is_mine: true, requires_ack: true, ack_count: 5, recipients_count: 60 }), ann({ id: 's2', is_mine: true, archived_at: '2026-09-01T00:00:00Z' })]
    h.feedInbox = [ann({ id: 'i1' }), ann({ id: 'i2', my_read_at: '2026-09-27T09:00:00Z' })]
    r(<AnnouncementsPage hero />)
    const hdr = screen.getByTestId('exec-page-header')
    expect(hdr).toHaveTextContent('التبليغات')
    expect(within(screen.getByTestId('exec-page-header-stats')).getAllByRole('definition').map((d) => d.textContent)).toEqual(['1', '1', '1'])
    expect(within(screen.getByTestId('ann-tabs')).getAllByRole('tab')).toHaveLength(3)
    fireEvent.click(screen.getByTestId('new-announcement'))
    expect(screen.getByTestId('tab-compose')).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByTestId('tab-inbox'))
    expect(screen.getByTestId('inbox-list')).toBeInTheDocument()
  })
  it('رأس الوحدة: بلا أرقام ولا روابط لا يعرض شبكة الإحصاءات؛ ومع روابط يعرضها بمساراتها', async () => {
    const { ExecPageHeader } = await import('@components/executive/ExecPageHeader')
    r(<ExecPageHeader icon="flow" title="الإجراءات" links={[{ to: '/admin/approvals', label: 'الموافقات', icon: 'check-square' }]} />)
    expect(screen.queryByTestId('exec-page-header-stats')).toBeNull()
    expect(within(screen.getByTestId('exec-page-header-links')).getByRole('link')).toHaveAttribute('href', '/admin/approvals')
  })
})

describe('00217 — وثيقة التقرير الرسمية', () => {
  it('الموجز: ستة مؤشرات بحكم واضح، خلاصة مرقّمة، جدول قرارات بجهة مسؤولة؛ وجدول المؤشرات مجمّع بعناوين وحدات', () => {
    r(<ExecReports kind="admin" />); toStep3()
    const kpis = screen.getByTestId('rep-brief-kpis')
    expect(kpis.children).toHaveLength(6)
    expect(kpis).toHaveTextContent('الشكاوى الواردة'); expect(kpis).toHaveTextContent('▲ 100٪ · تراجع')   // الشكاوى 100 مقابل 50 سابقاً
    expect(within(screen.getByTestId('rep-brief-findings')).getAllByRole('listitem').length).toBeLessThanOrEqual(5)
    expect(within(screen.getByTestId('rep-brief-decisions')).getAllByTestId('decision-row')[0]).toHaveTextContent('المدراء المباشرون')
    const table = screen.getByTestId('rep-summary')
    expect(table).toHaveTextContent('الأسطول والصيانة'); expect(table).toHaveTextContent('الحكم')
    expect(table.querySelectorAll('[data-verdict]').length).toBeGreaterThan(5)
  })
  it('بلا نشاط: لا «ممتاز» ولا رسوم فارغة — مؤشر الأداء «لا بيانات كافية»، الأقسام الخاملة تُخفى افتراضياً ويمكن إظهارها، وجدول المؤشرات يطوي الوحدة الخاملة في سطر', () => {
    const base = sample()
    h.overview = sample({
      complaints: { total: 0, open: 0, resolved: 0, by_status: [], by_sector: [], by_type: [], series: [] },
      station: { ...base.station, weighings: 0, tons: 0, violations: 0, deficit_tons: 0, series: [], by_kind: [], top_violators: [] },
      fleet: { ...base.fleet, departures: 0, open_now: 0, series: [], maintenance: { ...base.fleet.maintenance, opened: 0, open_now: 0 } },
      workforce: { ...base.workforce, attendance: { ...base.workforce.attendance, present: 0, late: 0, absent: 0, incomplete: 0 } },
    })
    h.previous = h.overview
    r(<ExecReports kind="admin" />); toStep3()
    expect(screen.getByTestId('health-na')).toBeInTheDocument()
    expect(screen.queryByTestId('health-gauge')).toBeNull()
    expect(screen.queryByTestId('rep-sec-complaints')).toBeNull()
    expect(screen.getByTestId('hide-idle')).toHaveTextContent('الشكاوى')
    fireEvent.click(within(screen.getByTestId('hide-idle')).getByRole('checkbox'))
    expect(within(screen.getByTestId('rep-sec-complaints')).getByTestId('no-activity')).toBeInTheDocument()
    expect(screen.getAllByTestId('group-idle').length).toBeGreaterThan(0)
    expect(screen.getByTestId('rep-figs-complaints')).toHaveTextContent('الواردة')
  })

  it('00218 — الأشخاص: ملخّص، سائقون مقابل البصمات مع تنبيه غير المربوط، الأكثر غياباً/تأخراً/التزاماً/كشوفات، الاستقطاعات للإدارة فقط، وقراءة مكتوبة', () => {
    r(<ExecReports kind="admin" />); toStep3()
    const sec = screen.getByTestId('rep-sec-people')
    expect(sec).toHaveTextContent('الأشخاص: الالتزام والمخالفات')
    expect(within(sec).getByTestId('people-summary').children).toHaveLength(5)
    expect(within(sec).getByTestId('people-summary')).toHaveTextContent('12')
    const drv = within(sec).getByTestId('people-drivers')
    expect(drv).toHaveTextContent('2 سائق · 30 يوم انطلاق · بصمة في 24 يوماً (80%)')
    expect(within(sec).getByTestId('people-drivers-flag')).toHaveTextContent('5 انطلاقة بلا سائق')
    expect(within(drv).getAllByRole('row')[1]).toHaveTextContent('كرار حسين'); expect(within(drv).getAllByRole('row')[1]).toHaveTextContent('67%')
    expect(within(sec).getByTestId('people-absent')).toHaveTextContent('حيدر كاظم')
    expect(within(sec).getByTestId('people-late')).toHaveTextContent('4 س 35 د')
    expect(within(sec).getByTestId('people-committed')).toHaveTextContent('07:41')
    expect(within(sec).getByTestId('people-disclosures')).toHaveTextContent('75,000 د.ع')
    expect(within(sec).getByTestId('people-deductions')).toHaveTextContent('150,000 د.ع')
    expect(within(sec).getByTestId('rep-reading-people')).toHaveTextContent('الأكثر غياباً حيدر كاظم')
    expect(within(sec).getByTestId('rep-reading-people')).toHaveTextContent('أعلى استقطاع')
  })
  it('00218 — المعاون يرى الأشخاص بلا مبالغ؛ والفراغ حالة واضحة لا جدول فارغ', () => {
    h.people = samplePeople({ absent: [], late: [], committed: [], disclosures: [], deductions: [], drivers: { rows: [], drivers: 0, dep_days: 0, punched_days: 0, unlinked_departures: 0 } })
    r(<ExecPeopleBody data={h.people as never} kind="deputy" />)
    const sec = screen.getByTestId('exec-people')
    expect(within(sec).queryByTestId('people-deductions')).toBeNull()
    expect(within(sec).queryByTestId('people-drivers-flag')).toBeNull()
    expect(within(sec).getAllByTestId('people-empty')).toHaveLength(5)
    expect(within(sec).getByTestId('people-absent')).toHaveTextContent('لا غياب مسجّل خلال الفترة')
    expect(within(sec).getByTestId('rep-reading-people')).toHaveTextContent('لا غياب مسجّل على أي موظف')
    expect(within(sec).queryByText(/د\.ع/)).toBeNull()
  })
})
