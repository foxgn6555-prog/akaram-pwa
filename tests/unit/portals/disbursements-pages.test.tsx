/**
 * مسار الصرف — صفحات المدير المفوض (قائمة + معاينة وقرار) والمالية (قائمة + أمر الصرف):
 *  اعتماد/رفض بسبب إلزامي · تحذير الرصيد عند الاعتماد · الصرف يُحجب بنقص الرصيد · إعادة الإرسال · المرشّحات · بطاقات الأسطر
 *  · الأرقام إنكليزية · لا شيء عن «البصمة الناقصة» للمدير المفوض (تُدفع كالموظفين) · الصلاحيات تُعطّل الأزرار
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'

const h = vi.hoisted(() => ({
  list: undefined as unknown, listError: false, detail: undefined as unknown, detailError: false,
  lines: { total: 0, net_total: 0, limit: 40, offset: 0, rows: [] as unknown[] } as { total: number; net_total: number; limit: number; offset: number; rows: unknown[] }, hasNext: false,
  listArgs: [] as Record<string, unknown>[], linesArgs: [] as Record<string, unknown>[],
  decide: vi.fn(), pay: vi.fn(), resubmit: vi.fn(), fetchNext: vi.fn(), refetch: vi.fn(),
}))
vi.mock('@features/disbursements/hooks', () => ({
  useDisbursementList: (f: Record<string, unknown>) => { h.listArgs.push(f); return { data: h.listError ? undefined : h.list, isLoading: false, isError: h.listError, refetch: h.refetch } },
  useDisbursementDetail: () => ({ data: h.detailError ? undefined : h.detail, isLoading: false, isError: h.detailError, error: new Error('DISBURSEMENT_NOT_FOUND'), refetch: h.refetch }),
  useDisbursementLines: (_id: string, f: Record<string, unknown>) => { h.linesArgs.push(f); return { data: { pages: [h.lines] }, isLoading: false, isError: false, hasNextPage: h.hasNext, isFetchingNextPage: false, fetchNextPage: h.fetchNext, refetch: h.refetch } },
  useDecideDisbursement: () => ({ mutate: (v: unknown, o?: { onSuccess?: () => void }) => { h.decide(v); o?.onSuccess?.() }, isPending: false }),
  usePayDisbursement: () => ({ mutate: (v: unknown, o?: { onSuccess?: () => void }) => { h.pay(v); o?.onSuccess?.() }, isPending: false }),
  useResubmitDisbursement: () => ({ mutate: (v: unknown, o?: { onSuccess?: () => void }) => { h.resubmit(v); o?.onSuccess?.() }, isPending: false }),
}))
import AdminDisbursementsPage from '@portals/admin/pages/Disbursements/AdminDisbursementsPage'
import AdminDisbursementDetailPage from '@portals/admin/pages/Disbursements/AdminDisbursementDetailPage'
import FinanceDisbursementsPage from '@portals/finance/pages/Disbursements/FinanceDisbursementsPage'
import FinanceDisbursementDetailPage from '@portals/finance/pages/Disbursements/FinanceDisbursementDetailPage'
import { useMyPermissionsStore } from '@features/permissions/my-permissions'

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
const req = (o: Record<string, unknown> = {}) => ({
  id: 'd1', request_no: 'DSB-2026-0001', kind: 'employee_payroll', kind_label: 'رواتب الموظفين', period_month: '2026-10-01', version: 1, status: 'pending_approval',
  source_export_id: 'x1', supersedes_id: null, people_count: 24, payable_count: 24, gross_total: 40000000, deductions_total: 1550000, net_total: 38450000, prev_net_total: 37100000, other_adjustments: 0,
  requested_by: 'f1', requested_by_name: 'المحاسب علي', requested_at: ago(20), decided_by: null, decided_by_name: null, decided_at: null, decision_note: null,
  paid_by: null, paid_by_name: null, paid_at: null, treasury_tx_id: null, treasury_ref_no: null, resubmitted_id: null, resubmitted_no: null, resubmitted_version: null,
  blocked_days: null, blocked_amount: null, created_at: ago(20), updated_at: ago(20), ...o,
})
const contractorReq = (o: Record<string, unknown> = {}) => req({ id: 'd2', request_no: 'DSB-2026-0002', kind: 'contractor_wages', kind_label: 'أجور المتعهدين', people_count: 6, payable_count: 6, gross_total: 9000000, deductions_total: 1200000, net_total: 7800000, prev_net_total: null, blocked_days: 9, blocked_amount: 1100000, ...o })
const counts = (o: Record<string, unknown> = {}) => ({ pending_approval: 2, approved: 1, paid: 3, rejected: 1, rejected_open: 1, ...o })
const detail = (r: Record<string, unknown>, o: Record<string, unknown> = {}) => ({
  request: r, events: [{ id: 1, event: 'created', actor: 'f1', actor_name: 'المحاسب علي', note: null, amount: 38450000, created_at: ago(20) }],
  balance: 50000000, balance_after: 11550000, shortfall: 0,
  facets: { groups: [{ group: 'الكرخ', sub_group: 'النقل', count: 3, net: 3000000 }, { group: 'الكرخ', sub_group: 'الإدارة', count: 1, net: 1000000 }, { group: 'الرصافة', sub_group: 'النقل', count: 2, net: 2000000 }], flags: { all: 24, deduction: 5, adjusted: 2, advance: 1, zero: 0 } }, ...o,
})
const empLine = (o: Record<string, unknown> = {}) => ({
  id: 'l1', person_id: 'p1', person_number: 'EMP-1042', full_name: 'أحمد حسن', group_name: 'الكرخ', sub_group_name: 'النقل', job_title: 'سائق', gross_amount: 1000000, deductions_total: 80000, net_amount: 920000,
  adjusted: false, has_deduction: true, has_advance: false, details: { working_days: 26, days_present: 24, days_absent: 2, late_minutes: 75 }, ...o,
})
const conLine = (o: Record<string, unknown> = {}) => ({
  id: 'l9', person_id: 'p9', person_number: null, full_name: 'متعهد أرخيته', group_name: 'الكرادة', sub_group_name: 'أرخيته', job_title: 'متعهد', gross_amount: 4050000, deductions_total: 409500, net_amount: 3640500, adjusted: false, has_deduction: true, has_advance: false,
  details: { contractor_daily_wage: 15000, worker_daily_wage: 8000, pay_days: 30, paid_days: 27, blocked_days: 3, late_days: 1, deduction_minutes: 20, blocked_amount: 405000, deduction_amount: 4500,
    days: [{ date: '2026-10-02', headcount: 16, state: 'blocked', reason: 'absent', required: 720, shortfall: 720, grace: 15, deduct_minutes: 0, base: 135000, deduction: 0, pay: 0 },
      { date: '2026-10-03', headcount: 16, state: 'paid', reason: null, required: 720, shortfall: 30, grace: 15, deduct_minutes: 30, base: 135000, deduction: 5625, pay: 129375 }] }, ...o,
})
const setLines = (rows: unknown[], extra: Record<string, unknown> = {}) => { h.lines = { total: rows.length, net_total: rows.reduce<number>((s, r) => s + (r as { net_amount: number }).net_amount, 0), limit: 40, offset: 0, rows, ...extra } }

const at = (path: string, route: string, el: React.ReactNode) => render(<MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={el} /></Routes></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks(); h.listArgs = []; h.linesArgs = []; h.listError = false; h.detailError = false; h.hasNext = false
  h.list = { items: [req(), contractorReq()], counts: counts(), balance: 50000000 }
  h.detail = detail(req()); setLines([empLine()])
})
afterEach(() => { act(() => useMyPermissionsStore.getState().reset()) })

describe('بوابة المدير المفوض — طلبات الصرف (القائمة)', () => {
  it('الرأس بأربعة أرقام حيّة، والبطاقات بالنوع والحالة والمبلغ الكبير وسطر الملخص وزر «معاينة وقرار»', () => {
    at('/admin/disbursements', '/admin/disbursements', <AdminDisbursementsPage />)
    expect(screen.getByTestId('disb-stat-pending')).toHaveTextContent('2')
    expect(screen.getByTestId('disb-stat-approved')).toHaveTextContent('1')
    expect(screen.getByTestId('disb-stat-paid')).toHaveTextContent('3')
    expect(screen.getByTestId('disb-stat-balance')).toHaveTextContent('50,000,000')
    const c1 = screen.getByTestId('disb-card-d1')
    expect(c1).toHaveAttribute('data-status', 'pending_approval'); expect(c1).toHaveAttribute('data-kind', 'employee_payroll')
    expect(c1).toHaveTextContent('رواتب الموظفين'); expect(c1).toHaveTextContent('تشرين الأول 2026'); expect(c1).toHaveTextContent('DSB-2026-0001')
    expect(screen.getByTestId('disb-card-amount-d1')).toHaveTextContent('38,450,000')
    expect(c1).toHaveTextContent('24 موظفاً'); expect(c1).toHaveTextContent('أقفلته الشؤون المالية قبل 20 دقيقة')
    expect(screen.getByTestId('disb-open-d1')).toHaveTextContent('معاينة وقرار')
    expect(screen.getByTestId('disb-open-d1')).toHaveAttribute('href', '/admin/disbursements/d1')
    const c2 = screen.getByTestId('disb-card-d2')
    expect(c2).toHaveTextContent('6 متعهداً'); expect(c2).toHaveTextContent('أرسلته الشؤون المالية')
    expect(screen.getByTestId('disb-card-blocked-d2')).toHaveTextContent('9 أيام محجوبة بسبب البصمة')
    expect(screen.queryByTestId('disb-card-blocked-d1')).toBeNull()
    expect(screen.getByTestId('admin-disbursements-page').textContent).not.toMatch(/[\u0660-\u0669]/)
  })
  it('المرشّحات: الافتراضي «بانتظار قراري»، وتغيير النوع والحالة والشهر والبحث يُرسل إلى القارئ', () => {
    at('/admin/disbursements', '/admin/disbursements', <AdminDisbursementsPage />)
    expect(h.listArgs.at(-1)).toMatchObject({ kind: null, status: 'pending_approval', month: null, search: null })
    expect(screen.getByTestId('disb-status-pending_approval')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('disb-status-pending_approval')).toHaveTextContent('2') // العدّاد
    fireEvent.click(screen.getByTestId('disb-kind-contractor_wages'))
    expect(h.listArgs.at(-1)).toMatchObject({ kind: 'contractor_wages' })
    fireEvent.click(screen.getByTestId('disb-status-paid'))
    expect(h.listArgs.at(-1)).toMatchObject({ kind: 'contractor_wages', status: 'paid' })
    fireEvent.click(screen.getByTestId('disb-status-all'))
    expect(h.listArgs.at(-1)).toMatchObject({ status: null })
    fireEvent.change(screen.getByTestId('disb-month'), { target: { value: '2026-10' } })
    expect(h.listArgs.at(-1)).toMatchObject({ month: '2026-10' })
    expect(screen.getByTestId('disb-month-clear')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('disb-month-clear'))
    expect(h.listArgs.at(-1)).toMatchObject({ month: null })
  })
  it('البحث برقم الطلب مؤجَّل 300ms ثم يُرسل', () => {
    vi.useFakeTimers()
    try {
      at('/admin/disbursements', '/admin/disbursements', <AdminDisbursementsPage />)
      fireEvent.change(screen.getByTestId('disb-search'), { target: { value: 'DSB-2026-0002' } })
      expect(h.listArgs.at(-1)).toMatchObject({ search: null })
      act(() => { vi.advanceTimersByTime(350) })
      expect(h.listArgs.at(-1)).toMatchObject({ search: 'DSB-2026-0002' })
    } finally { vi.useRealTimers() }
  })
  it('لا طلبات بانتظار قراره لكن للسجل طلبات ⇒ ينتقل مرة واحدة إلى «الكل» بدل شاشة فارغة موهمة', () => {
    h.list = { items: [req({ status: 'paid' })], counts: counts({ pending_approval: 0, approved: 0, paid: 1, rejected: 0, rejected_open: 0 }), balance: 1 }
    at('/admin/disbursements', '/admin/disbursements', <AdminDisbursementsPage />)
    expect(h.listArgs.at(-1)).toMatchObject({ status: null })
    expect(screen.getByTestId('disb-status-all')).toHaveAttribute('aria-pressed', 'true')
    // وبعدها اختياره «بانتظار قراري» يدوياً يبقى كما اختاره (لا قفز ثانٍ)
    fireEvent.click(screen.getByTestId('disb-status-pending_approval'))
    expect(h.listArgs.at(-1)).toMatchObject({ status: 'pending_approval' })
  })
  it('قائمة فارغة وخطأ تحميل وبطاقة الرصيد السالب', () => {
    h.list = { items: [], counts: counts({ pending_approval: 0 }), balance: -5 }
    const { unmount } = at('/admin/disbursements', '/admin/disbursements', <AdminDisbursementsPage />)
    expect(screen.getByText('لا توجد طلبات صرف بهذه المرشّحات')).toBeInTheDocument()
    unmount()
    h.listError = true
    at('/admin/disbursements', '/admin/disbursements', <AdminDisbursementsPage />)
    expect(screen.getByTestId('disb-list-error')).toBeInTheDocument()
    fireEvent.click(within(screen.getByTestId('disb-list-error')).getByRole('button', { name: 'إعادة المحاولة' }))
    expect(h.refetch).toHaveBeenCalled()
  })
  it('طلب مرفوض يظهر بسببه، وإن أُعيد إرساله تظهر إشارة إلى نسخته الجديدة', () => {
    h.list = { items: [req({ status: 'rejected', decision_note: 'راجعوا الاستقطاعات', decided_at: ago(60), resubmitted_id: 'd7', resubmitted_no: 'DSB-2026-0007', resubmitted_version: 2 }), req({ id: 'd8', request_no: 'DSB-2026-0008', status: 'rejected', decision_note: 'ناقص' })], counts: counts(), balance: 1 }
    at('/admin/disbursements', '/admin/disbursements', <AdminDisbursementsPage />)
    expect(screen.getByTestId('disb-card-d1')).toHaveTextContent('السبب: راجعوا الاستقطاعات')
    expect(screen.getByTestId('disb-card-resubmitted-d1')).toHaveTextContent('أُعيد إرساله: النسخة 2')
    expect(screen.queryByTestId('disb-card-resubmitted-d8')).toBeNull()
    expect(screen.getByTestId('disb-card-d1')).toHaveTextContent('رفضه المدير المفوض')
  })
})

describe('بوابة المدير المفوض — معاينة وقرار', () => {
  const open = () => at('/admin/disbursements/d1', '/admin/disbursements/:id', <AdminDisbursementDetailPage />)

  it('الملخص: المبلغ الكبير والأرقام المجمَّدة ومقارنة الشهر الماضي والرصيد وما يبقى، وخطوات المسار', () => {
    open()
    expect(screen.getByTestId('disb-detail-amount')).toHaveTextContent('38,450,000')
    expect(screen.getByTestId('disb-kpi-count')).toHaveTextContent('24')
    expect(screen.getByTestId('disb-kpi-gross')).toHaveTextContent('40,000,000')
    expect(screen.getByTestId('disb-kpi-deductions')).toHaveTextContent('1,550,000')
    expect(screen.getByTestId('disb-kpi-change')).toHaveTextContent('+3.6%')
    expect(screen.getByTestId('disb-balance')).toHaveTextContent('50,000,000')
    expect(screen.getByTestId('disb-balance-after')).toHaveTextContent('11,550,000')
    expect(screen.queryByTestId('disb-shortfall')).toBeNull()
    expect(screen.getByTestId('disb-detail-status')).toHaveTextContent('بانتظار القرار')
    const steps = within(screen.getByTestId('disb-steps')).getAllByRole('listitem')
    expect(steps.map((s) => s.getAttribute('data-state'))).toEqual(['done', 'current', 'todo'])
    expect(screen.getByTestId('disb-back')).toHaveAttribute('href', '/admin/disbursements')
    expect(screen.getByTestId('admin-disbursement-detail').textContent).not.toMatch(/[\u0660-\u0669]/)
  })
  it('شريط القرار: «اعتماد الصرف» و«رفض» لطلب بانتظار القرار فقط', () => {
    open()
    expect(screen.getByTestId('disb-action-bar')).toBeInTheDocument()
    expect(screen.getByTestId('disb-approve')).toBeEnabled(); expect(screen.getByTestId('disb-reject')).toBeEnabled()
  })
  it('الاعتماد: ورقة تأكيد بثلاث نقاط (إشعار المالية، لا خصم قبل الصرف، الرصيد) ثم decide(approve=true)', () => {
    open()
    fireEvent.click(screen.getByTestId('disb-approve'))
    const sheet = screen.getByTestId('disb-approve-sheet')
    expect(sheet).toHaveTextContent('يصل أمر الصرف إلى الشؤون المالية فوراً')
    expect(sheet).toHaveTextContent('لا يُخصم شيء من القاصة إلا حين تنفّذ المالية الصرف')
    expect(sheet).toHaveTextContent('يبقى بعد الصرف 11,550,000')
    expect(screen.queryByTestId('disb-approve-shortfall')).toBeNull()
    fireEvent.click(within(sheet).getByTestId('disb-approve-confirm'))
    expect(h.decide).toHaveBeenCalledTimes(1)
    expect(h.decide.mock.calls[0]![0]).toEqual({ id: 'd1', approve: true })
    expect(screen.queryByTestId('disb-approve-sheet')).toBeNull()
  })
  it('الرصيد أقل من المبلغ: تحذير في الملخص والورقة، لكن الاعتماد مسموح (المنع عند الصرف)', () => {
    h.detail = detail(req(), { balance: 30000000, balance_after: -8450000, shortfall: 8450000 })
    open()
    expect(screen.getByTestId('disb-shortfall')).toHaveTextContent('8,450,000')
    expect(screen.queryByTestId('disb-balance-after')).toBeNull()
    expect(screen.getByTestId('disb-approve')).toBeEnabled()
    fireEvent.click(screen.getByTestId('disb-approve'))
    expect(screen.getByTestId('disb-approve-shortfall')).toHaveTextContent('أقل من المبلغ بـ 8,450,000')
    expect(screen.getByTestId('disb-approve-sheet')).toHaveTextContent('الصرف يتعذّر حتى تُغطّى القاصة')
    fireEvent.click(screen.getByTestId('disb-approve-confirm'))
    expect(h.decide).toHaveBeenCalledWith({ id: 'd1', approve: true })
  })
  it('الرفض: السبب إلزامي (3 أحرف فأكثر) ثم decide(approve=false, note) مشذَّباً', () => {
    open()
    fireEvent.click(screen.getByTestId('disb-reject'))
    const sheet = screen.getByTestId('disb-reject-sheet')
    expect(within(sheet).getByTestId('disb-reject-confirm')).toBeDisabled()
    fireEvent.change(within(sheet).getByTestId('disb-reject-reason'), { target: { value: ' ا ' } })
    expect(within(sheet).getByTestId('disb-reject-confirm')).toBeDisabled()
    fireEvent.change(within(sheet).getByTestId('disb-reject-reason'), { target: { value: '  راجعوا الاستقطاعات  ' } })
    expect(within(sheet).getByTestId('disb-reject-confirm')).toBeEnabled()
    fireEvent.click(within(sheet).getByTestId('disb-reject-confirm'))
    expect(h.decide).toHaveBeenCalledTimes(1)
    expect(h.decide.mock.calls[0]![0]).toEqual({ id: 'd1', approve: false, note: 'راجعوا الاستقطاعات' })
  })
  it('«رجوع» وEscape والنقر خارج الورقة تغلقها بلا قرار', () => {
    open()
    fireEvent.click(screen.getByTestId('disb-approve'))
    fireEvent.click(screen.getByTestId('disb-approve-cancel'))
    expect(screen.queryByTestId('disb-approve-sheet')).toBeNull()
    fireEvent.click(screen.getByTestId('disb-reject'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('disb-reject-sheet')).toBeNull()
    fireEvent.click(screen.getByTestId('disb-approve'))
    fireEvent.mouseDown(screen.getByTestId('disb-approve-sheet-backdrop'))
    expect(screen.queryByTestId('disb-approve-sheet')).toBeNull()
    expect(h.decide).not.toHaveBeenCalled()
  })
  it('بلا صلاحية disbursement_decide: الزران معطَّلان ولا تفتح ورقة', () => {
    act(() => useMyPermissionsStore.getState().set('u1', { 'admin.dashboard': ['view'] }))
    open()
    expect(screen.getByTestId('disb-approve')).toBeDisabled(); expect(screen.getByTestId('disb-reject')).toBeDisabled()
    fireEvent.click(screen.getByTestId('disb-approve'))
    expect(screen.queryByTestId('disb-approve-sheet')).toBeNull()
  })
  it.each([
    ['approved', 'disb-note-approved'], ['paid', 'disb-note-paid'], ['rejected', 'disb-note-rejected'],
  ])('طلب %s: لا شريط قرار (القرار نهائي) بل ملاحظة الحالة', (status, note) => {
    h.detail = detail(req({ status, decided_at: ago(30), decided_by_name: 'المدير المفوض', decision_note: 'سبب', paid_at: ago(10), paid_by_name: 'المحاسب علي', treasury_ref_no: 'TRX-2026-0042' }))
    open()
    expect(screen.queryByTestId('disb-action-bar')).toBeNull()
    expect(screen.getByTestId(note)).toBeInTheDocument()
    if (status === 'paid') expect(screen.getByTestId('disb-note-paid')).toHaveTextContent('TRX-2026-0042')
    if (status === 'rejected') expect(screen.getByTestId('disb-rejection-reason')).toHaveTextContent('سبب')
  })
  it('أجور المتعهدين: الأيام المحجوبة بالبصمة والمبلغ في الملخص، وبطاقة المتعهد بحجبه واستقطاعه وجدول أيامه', () => {
    h.detail = detail(contractorReq({ id: 'd2' }), { facets: { groups: [{ group: 'الكرادة', sub_group: 'أرخيته', count: 1, net: 3640500 }], flags: { all: 6, deduction: 2, adjusted: 0, advance: 0, zero: 0 } } })
    setLines([conLine()])
    at('/admin/disbursements/d2', '/admin/disbursements/:id', <AdminDisbursementDetailPage />)
    expect(screen.getByTestId('disb-kpi-count')).toHaveTextContent('6')
    expect(screen.getByTestId('disb-kpi-blocked')).toHaveTextContent('9 أيام')
    expect(screen.getByTestId('disb-summary')).toHaveTextContent('أجور المتعهدين')
    const card = screen.getByTestId('disb-line-l9')
    expect(card).toHaveTextContent('محجوب بالبصمة: 3 أيام'); expect(card).toHaveTextContent('405,000')
    expect(card).toHaveTextContent('استقطاع نقص الدقائق'); expect(card).toHaveTextContent('4,500')
    expect(card).toHaveTextContent('3,640,500')
    expect(screen.queryByTestId('disb-line-days-l9')).toBeNull()
    fireEvent.click(screen.getByTestId('disb-line-days-toggle-l9'))
    const days = screen.getByTestId('disb-line-days-l9')
    expect(days).toHaveTextContent('محجوب — غياب البصمة'); expect(days).toHaveTextContent('نقص 30د'); expect(days).toHaveTextContent('129,375')
    // الشريحة الأولى للمتعهدين بتسميتها الخاصة، ولا ذكر لـ«ناقصة البصمة» (تُدفع كالموظفين)
    expect(screen.getByTestId('disb-flag-deduction')).toHaveTextContent('محجوب/مستقطع')
    expect(screen.getByTestId('admin-disbursement-detail').textContent).not.toMatch(/ناقص[ةه] البصمة|بصمة ناقصة|incomplete/i)
  })
  it('طلب غير موجود: رسالة خطأ بإعادة المحاولة مع رجوع', () => {
    h.detailError = true
    open()
    expect(screen.getByTestId('disb-detail-error')).toHaveTextContent('طلب الصرف غير موجود')
    expect(screen.getByTestId('disb-back')).toBeInTheDocument()
  })
})

describe('أسطر الطلب — المرشّحات وبطاقات الموظفين', () => {
  const open = () => at('/admin/disbursements/d1', '/admin/disbursements/:id', <AdminDisbursementDetailPage />)

  it('بطاقة الموظف: الاسم والصافي والرقم والفرع والقسم والشارات وشبكة الأيام', () => {
    setLines([empLine(), empLine({ id: 'l2', person_number: 'EMP-1043', full_name: 'سعد علي', has_deduction: false, deductions_total: 0, net_amount: 1000000, has_advance: true, adjusted: true, details: { working_days: 26, days_present: 26, days_absent: 0, late_minutes: 0, advance_installment: 100000, finance_note: 'تسوية بعد مراجعة' } })])
    open()
    const a = screen.getByTestId('disb-line-EMP-1042')
    expect(a).toHaveTextContent('أحمد حسن'); expect(a).toHaveTextContent('الكرخ · النقل'); expect(a).toHaveTextContent('EMP-1042'); expect(a).toHaveTextContent('سائق')
    expect(a).toHaveTextContent('استقطاع 80,000'); expect(a).toHaveTextContent('920,000'); expect(a).toHaveTextContent('1س 15د')
    const b = screen.getByTestId('disb-line-EMP-1043')
    expect(b).toHaveTextContent('سلفة 100,000'); expect(b).toHaveTextContent('معدَّل يدوياً'); expect(b).toHaveTextContent('ملاحظة المالية: تسوية بعد مراجعة')
    expect(screen.getByTestId('disb-lines-summary')).toHaveTextContent('2 موظف')
  })
  it('الفلاتر: الفرع ثم القسم (يتبعه) والشرائح بعدّاداتها والبحث والترتيب تصل كلها إلى القارئ', () => {
    open()
    expect(h.linesArgs.at(-1)).toMatchObject({ group: null, subGroup: null, flag: 'all', search: null, sort: 'number' })
    const group = screen.getByTestId('disb-filter-group'), sub = screen.getByTestId('disb-filter-subgroup')
    expect(within(group).getAllByRole('option').map((o) => o.textContent)).toEqual(['الكل', 'الكرخ', 'الرصافة'])
    expect(within(sub).getAllByRole('option').map((o) => o.textContent)).toEqual(['الكل', 'النقل', 'الإدارة'])
    fireEvent.change(group, { target: { value: 'الرصافة' } })
    expect(h.linesArgs.at(-1)).toMatchObject({ group: 'الرصافة', subGroup: null })
    expect(within(screen.getByTestId('disb-filter-subgroup')).getAllByRole('option').map((o) => o.textContent)).toEqual(['الكل', 'النقل'])
    fireEvent.change(screen.getByTestId('disb-filter-subgroup'), { target: { value: 'النقل' } })
    expect(h.linesArgs.at(-1)).toMatchObject({ group: 'الرصافة', subGroup: 'النقل' })
    fireEvent.change(screen.getByTestId('disb-filter-group'), { target: { value: '' } })
    expect(h.linesArgs.at(-1)).toMatchObject({ group: null, subGroup: null }) // تغيير الفرع يصفّر القسم
    expect(screen.getByTestId('disb-flag-deduction')).toHaveTextContent('5')
    expect(screen.getByTestId('disb-flag-adjusted')).toHaveTextContent('2')
    expect(screen.getByTestId('disb-flag-advance')).toHaveTextContent('1')
    expect(screen.queryByTestId('disb-flag-zero')).toBeNull() // لا صافٍ صفر ⇒ لا شريحة
    fireEvent.click(screen.getByTestId('disb-flag-advance'))
    expect(h.linesArgs.at(-1)).toMatchObject({ flag: 'advance' })
    expect(screen.getByTestId('disb-lines-summary')).toHaveTextContent('صافيهم')
    fireEvent.change(screen.getByTestId('disb-lines-sort'), { target: { value: 'net_desc' } })
    expect(h.linesArgs.at(-1)).toMatchObject({ sort: 'net_desc' })
  })
  it('لا نتائج ⇒ رسالة، و«عرض المزيد» يجلب الصفحة التالية فقط حين توجد', () => {
    setLines([])
    open()
    expect(screen.getByTestId('disb-lines-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('disb-lines-more')).toBeNull()
  })
  it('عرض المزيد: يظهر مع عدد المتبقي ويجلب الصفحة التالية', () => {
    setLines([empLine()], { total: 100 }); h.hasNext = true
    open()
    expect(screen.getByTestId('disb-lines-more')).toHaveTextContent('99 متبقٍ')
    fireEvent.click(screen.getByTestId('disb-lines-more'))
    expect(h.fetchNext).toHaveBeenCalledTimes(1)
  })
})

describe('بوابة المالية — أوامر الصرف', () => {
  it('القائمة: أرقامها (بانتظار صرفك) والافتراضي «بانتظار الصرف» حين يوجد معتمد، وزر «صرف من القاصة»', () => {
    h.list = { items: [req({ status: 'approved', decided_at: ago(30) })], counts: counts(), balance: 50000000 }
    at('/finance/disbursements', '/finance/disbursements', <FinanceDisbursementsPage />)
    expect(screen.getByTestId('finance-disbursements-page')).toBeInTheDocument()
    expect(screen.getByTestId('disb-stat-approved')).toHaveTextContent('1')
    expect(screen.getByTestId('disb-stat-rejected')).toHaveTextContent('1')
    expect(h.listArgs.at(-1)).toMatchObject({ status: 'approved' }) // انتقل من «الكل» إلى «بانتظار الصرف» لوجود معتمد
    expect(screen.getByTestId('disb-open-d1')).toHaveTextContent('صرف من القاصة')
    expect(screen.getByTestId('disb-open-d1')).toHaveAttribute('href', '/finance/disbursements/d1')
    expect(screen.getByTestId('disb-card-d1')).toHaveTextContent('اعتمده المدير المفوض')
  })
  it('مرفوض لم يُعَد إرساله ⇒ «مراجعة وإعادة إرسال»، وبعد إعادة الإرسال «عرض أمر الصرف»', () => {
    h.list = { items: [req({ status: 'rejected', decision_note: 'x' }), req({ id: 'd5', status: 'rejected', resubmitted_id: 'd6', resubmitted_no: 'DSB-2026-0006', resubmitted_version: 2 })], counts: counts({ approved: 0 }), balance: 1 }
    at('/finance/disbursements', '/finance/disbursements', <FinanceDisbursementsPage />)
    expect(screen.getByTestId('disb-open-d1')).toHaveTextContent('مراجعة وإعادة إرسال')
    expect(screen.getByTestId('disb-open-d5')).toHaveTextContent('عرض أمر الصرف')
  })

  const openFin = (r: Record<string, unknown>, o: Record<string, unknown> = {}) => { h.detail = detail(r, o); return at('/finance/disbursements/d1', '/finance/disbursements/:id', <FinanceDisbursementDetailPage />) }

  it('معتمد والرصيد كافٍ: زر الصرف بالمبلغ، وورقة التأكيد، ثم pay(id, note) مرة واحدة', () => {
    openFin(req({ status: 'approved', decided_at: ago(30), decided_by_name: 'المدير المفوض' }))
    expect(screen.getByTestId('finance-disbursement-detail')).toBeInTheDocument()
    expect(screen.getByTestId('disb-pay')).toBeEnabled(); expect(screen.getByTestId('disb-pay')).toHaveTextContent('صرف من القاصة · 38,450,000 د.ع')
    expect(screen.getByTestId('disb-note-howto')).toHaveTextContent('حركة واحدة نهائية')
    expect(screen.queryByTestId('disb-note-insufficient')).toBeNull()
    fireEvent.click(screen.getByTestId('disb-pay'))
    const sheet = screen.getByTestId('disb-pay-sheet')
    expect(sheet).toHaveTextContent('حركة قاصة واحدة نهائية بنوع «رواتب الموظفين»'); expect(sheet).toHaveTextContent('يُبلَّغ المدير المفوض'); expect(sheet).toHaveTextContent('11,550,000')
    fireEvent.change(within(sheet).getByTestId('disb-pay-note'), { target: { value: 'دفعة أولى' } })
    fireEvent.click(within(sheet).getByTestId('disb-pay-confirm'))
    expect(h.pay).toHaveBeenCalledTimes(1)
    expect(h.pay.mock.calls[0]![0]).toEqual({ id: 'd1', note: 'دفعة أولى' })
  })
  it('معتمد والرصيد غير كافٍ: الزر معطَّل بنصه الواضح، والتنبيه «تعذّر الصرف… لم يُخصم أي مبلغ» والنقص', () => {
    openFin(req({ status: 'approved', decided_at: ago(30) }), { balance: 30000000, balance_after: -8450000, shortfall: 8450000 })
    expect(screen.getByTestId('disb-pay')).toBeDisabled(); expect(screen.getByTestId('disb-pay')).toHaveTextContent('الرصيد غير كافٍ للصرف')
    expect(screen.getByTestId('disb-note-insufficient')).toHaveTextContent('تعذّر الصرف'); expect(screen.getByTestId('disb-note-insufficient')).toHaveTextContent('لم يُخصم أي مبلغ')
    expect(screen.getByTestId('disb-shortfall')).toHaveTextContent('8,450,000')
    fireEvent.click(screen.getByTestId('disb-pay'))
    expect(screen.queryByTestId('disb-pay-sheet')).toBeNull(); expect(h.pay).not.toHaveBeenCalled()
  })
  it('بلا صلاحية disbursement_pay: الزر معطَّل ولو كان الرصيد كافياً', () => {
    act(() => useMyPermissionsStore.getState().set('u1', { 'finance.dashboard': ['view'] }))
    openFin(req({ status: 'approved', decided_at: ago(30) }))
    expect(screen.getByTestId('disb-pay')).toBeDisabled()
    fireEvent.click(screen.getByTestId('disb-pay'))
    expect(h.pay).not.toHaveBeenCalled()
  })
  it('مرفوض: السبب ظاهر، «إعادة الإرسال» بملاحظة اختيارية، ثم resubmit(id, note)', () => {
    openFin(req({ status: 'rejected', decided_at: ago(60), decided_by_name: 'المدير المفوض', decision_note: 'راجعوا الاستقطاعات' }))
    expect(screen.getByTestId('disb-rejection-reason')).toHaveTextContent('راجعوا الاستقطاعات')
    expect(screen.queryByTestId('disb-pay')).toBeNull()
    fireEvent.click(screen.getByTestId('disb-resubmit'))
    const sheet = screen.getByTestId('disb-resubmit-sheet')
    expect(within(sheet).getByTestId('disb-resubmit-reason')).toHaveTextContent('راجعوا الاستقطاعات')
    expect(sheet).toHaveTextContent('الشهر يبقى مقفلاً')
    fireEvent.change(within(sheet).getByTestId('disb-resubmit-note'), { target: { value: 'عالجنا الاستقطاعات' } })
    fireEvent.click(within(sheet).getByTestId('disb-resubmit-confirm'))
    expect(h.resubmit).toHaveBeenCalledTimes(1)
    expect(h.resubmit.mock.calls[0]![0]).toEqual({ id: 'd1', note: 'عالجنا الاستقطاعات' })
  })
  it('مرفوض لمتعهدين: ورقة إعادة الإرسال تقول إنها تُحسب من الأجور والبصمة الحالية', () => {
    h.detail = detail(contractorReq({ status: 'rejected', decision_note: 'x', decided_at: ago(5) }))
    at('/finance/disbursements/d2', '/finance/disbursements/:id', <FinanceDisbursementDetailPage />)
    fireEvent.click(screen.getByTestId('disb-resubmit'))
    expect(screen.getByTestId('disb-resubmit-sheet')).toHaveTextContent('تُحسب من الأجور والبصمة الحالية')
  })
  it('مرفوض أُعيد إرساله: لا زر، ورابط إلى النسخة الجديدة', () => {
    openFin(req({ status: 'rejected', decision_note: 'x', decided_at: ago(5), resubmitted_id: 'd9', resubmitted_no: 'DSB-2026-0009', resubmitted_version: 2 }))
    expect(screen.queryByTestId('disb-resubmit')).toBeNull(); expect(screen.queryByTestId('disb-action-bar')).toBeNull()
    expect(screen.getByTestId('disb-resubmitted-link')).toHaveAttribute('href', '/finance/disbursements/d9')
    expect(screen.getByTestId('disb-resubmitted-link')).toHaveTextContent('النسخة 2')
  })
  it('بانتظار قرار المدير: ملاحظة بلا أزرار؛ ومصروف: مرجع القاصة ولا أزرار؛ والنسخة الثانية تشير إلى سابقتها', () => {
    const { unmount } = openFin(req({ status: 'pending_approval' }))
    expect(screen.getByTestId('disb-note-pending')).toHaveTextContent('لا يُصرف قبل اعتماده'); expect(screen.queryByTestId('disb-action-bar')).toBeNull(); unmount()
    const r2 = openFin(req({ status: 'paid', paid_at: ago(5), paid_by_name: 'المحاسب علي', treasury_ref_no: 'TRX-2026-0042', decided_at: ago(30), version: 2, supersedes_id: 'd0' }))
    expect(screen.getByTestId('disb-note-paid')).toHaveTextContent('TRX-2026-0042'); expect(screen.queryByTestId('disb-action-bar')).toBeNull()
    expect(screen.getByTestId('disb-note-supersedes')).toBeInTheDocument()
    expect(screen.getByTestId('disb-events')).toBeInTheDocument(); r2.unmount()
  })
  it('سجل الطلب يعرض الأحداث بسببها ومبلغها بأرقام إنكليزية', () => {
    openFin(req({ status: 'rejected', decision_note: 'x', decided_at: ago(5) }), { events: [
      { id: 1, event: 'created', actor: 'f1', actor_name: 'المحاسب علي', note: null, amount: 38450000, created_at: ago(120) },
      { id: 2, event: 'rejected', actor: 'm1', actor_name: 'المدير المفوض', note: 'راجعوا الاستقطاعات', amount: 38450000, created_at: ago(5) },
    ] })
    const ev = screen.getByTestId('disb-events')
    expect(ev).toHaveTextContent('سجل الطلب (2)'); expect(ev).toHaveTextContent('أُنشئ الطلب'); expect(ev).toHaveTextContent('رفضه المدير المفوض'); expect(ev).toHaveTextContent('«راجعوا الاستقطاعات»'); expect(ev).toHaveTextContent('38,450,000')
    expect(ev.textContent).not.toMatch(/[\u0660-\u0669]/)
  })
})
