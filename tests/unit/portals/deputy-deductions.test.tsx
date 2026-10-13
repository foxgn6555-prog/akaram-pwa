/** 00248 — وحدة مراجعة الاستقطاعات (معاون المدير المفوض): التفكيك، الإعفاء/التعديل/النسبة بسبب إلزامي، الاعتماد، والقفل بعده */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import DeputyDeductionsPage from '@portals/deputy/pages/Deductions/DeputyDeductionsPage'
import { reviewTotals } from '@portals/deputy/pages/Deductions/review-utils'
import type { DeputyKindBreakdown, DeputyReviewRow } from '@features/hr'

const h = vi.hoisted(() => ({
  months: [] as unknown[], rows: [] as unknown[], audit: [] as unknown[],
  adjust: vi.fn(async () => ({})), empWaive: vi.fn(async () => ({})), percent: vi.fn(async () => undefined), approve: vi.fn(async () => ({})), reopen: vi.fn(async () => undefined),
}))
const mut = (fn: (...a: never[]) => Promise<unknown>) => ({ mutate: (v: never) => void fn(v), mutateAsync: fn, isPending: false })
vi.mock('@features/hr', () => ({
  useDeputyMonths: () => ({ data: h.months, isLoading: false }), useDeputyReview: () => ({ data: h.rows, isLoading: false }), useDeputyAudit: () => ({ data: h.audit }),
  useDeputyAdjust: () => mut(h.adjust), useDeputyEmployeeWaive: () => mut(h.empWaive), useDeputyPercent: () => mut(h.percent), useDeputyApprove: () => mut(h.approve), useDeputyReopen: () => mut(h.reopen),
}))

const bk = (o: Partial<DeputyKindBreakdown> = {}): DeputyKindBreakdown => ({ original: 0, relief: 0, after: 0, mode: 'none', reason: null, set_amount: null, ...o })
const row = (o: Partial<DeputyReviewRow> = {}): DeputyReviewRow => ({
  export_id: 'x1', export_version: 1, review_status: 'pending', review_pct: 0, row_id: 'r1', employee_id: 'e1', employee_number: 'DD-1', full_name: 'أحمد علي', department_name: 'النقل', branch_name: null, job_title: null,
  pay_type: 'monthly', shift_minutes: 480, day_rate: 20000, shortfall_minutes: 60, shortfall_amount: 2500, absence_days: 1, absence_amount: 20000, ops_amount: 5000, ops_reasons: 'تلف عهدة', fines_amount: 7000, fines_count: 1,
  reviewable_total: 34500, relief_total: 0, pct_relief: 0, deductions_total: 34500, deductions_after: 34500, gross_amount: 600000, proposed_net: 565500, final_net: 565500, review_note: null, hour_bank_enabled: false,
  breakdown: { shortfall: bk({ original: 2500 }), absence: bk({ original: 20000 }), ops: bk({ original: 5000 }), fines: bk({ original: 7000 }), pct: 0, pct_relief: 0, reviewable_total: 34500, relief_total: 0, deductions_after: 34500, final_net_after: 565500, minute_rate: 41.6667 } as DeputyReviewRow['breakdown'],
  ...o,
})
const month = (o: Record<string, unknown> = {}) => ({ period_month: '2026-09-01', export_id: 'x1', version: 1, export_status: 'exported', exported_at: '2026-10-01T08:00:00Z', review_status: 'pending', reviewed_at: null, reviewed_by_name: null, review_pct: 0, rows_count: 2, employees_with_deductions: 1, deductions_total: 34500, relief_total: 0, net_total: 1065500, ...o })

beforeEach(() => { vi.clearAllMocks(); h.months = [month()]; h.rows = [row(), row({ row_id: 'r2', employee_id: 'e2', employee_number: 'DD-2', full_name: 'سارة', shortfall_minutes: 0, shortfall_amount: 0, absence_days: 0, absence_amount: 0, ops_amount: 0, fines_amount: 0, fines_count: 0, reviewable_total: 0, deductions_total: 0, deductions_after: 0, proposed_net: 500000, final_net: 500000, breakdown: { ...row().breakdown, shortfall: bk(), absence: bk(), ops: bk(), fines: bk(), reviewable_total: 0, deductions_after: 0, final_net_after: 500000 } })]; h.audit = [] })

describe('00248 — مراجعة الاستقطاعات', () => {
  it('الرأس والمجاميع: شهر بانتظار، موظف واحد باستقطاع 34,500 مفكّكة إلى أنواعها؛ الفلتر الافتراضي يُخفي من لا استقطاع له', () => {
    render(<MemoryRouter><DeputyDeductionsPage /></MemoryRouter>)
    expect(screen.getByTestId('dd-pending-months')).toHaveTextContent('1')
    expect(screen.getByTestId('dd-with-deductions')).toHaveTextContent('1')
    expect(screen.getByTestId('dd-before')).toHaveTextContent('34,500')
    expect(screen.getByTestId('dd-k-shortfall')).toHaveTextContent('2,500'); expect(screen.getByTestId('dd-k-absence')).toHaveTextContent('20,000')
    expect(screen.getByTestId('dd-k-ops')).toHaveTextContent('5,000'); expect(screen.getByTestId('dd-k-fines')).toHaveTextContent('7,000')
    expect(screen.getByTestId('dd-status')).toHaveTextContent('بانتظار اعتمادك')
    expect(screen.getByTestId('dd-row-DD-1')).toBeInTheDocument(); expect(screen.queryByTestId('dd-row-DD-2')).toBeNull()
    expect(screen.getByTestId('dd-short-DD-1')).toHaveTextContent('1س 0د')
    expect(screen.getByTestId('dd-net-DD-1')).toHaveTextContent('565,500')
    fireEvent.click(screen.getByTestId('dd-f-all'))
    expect(screen.getByTestId('dd-row-DD-2')).toBeInTheDocument()
    expect(screen.getByTestId('dd-table').textContent).not.toMatch(/[\u0660-\u0669]/)
  })
  it('إعفاء كامل يطلب سبباً ثم يرسل (row, kind, waive)؛ تعديل المبلغ يرفض ما فوق الأصل', async () => {
    render(<MemoryRouter><DeputyDeductionsPage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('dd-open-DD-1'))
    const form = screen.getByTestId('dd-form-DD-1')
    fireEvent.change(within(form).getByTestId('dd-kind'), { target: { value: 'absence' } })
    fireEvent.click(within(form).getByTestId('dd-submit'))
    expect(screen.getByTestId('dd-form-error')).toHaveTextContent('السبب إلزامي'); expect(h.adjust).not.toHaveBeenCalled()
    fireEvent.change(within(form).getByTestId('dd-reason'), { target: { value: 'إجازة شفهية موثقة' } })
    fireEvent.click(within(form).getByTestId('dd-submit'))
    await waitFor(() => expect(h.adjust).toHaveBeenCalledWith({ rowId: 'r1', kind: 'absence', mode: 'waive', amount: null, reason: 'إجازة شفهية موثقة' }))
    fireEvent.change(within(form).getByTestId('dd-kind'), { target: { value: 'ops' } })
    fireEvent.change(within(form).getByTestId('dd-mode'), { target: { value: 'amount' } })
    fireEvent.change(within(form).getByTestId('dd-amount'), { target: { value: '9000' } })
    fireEvent.change(within(form).getByTestId('dd-reason'), { target: { value: 'ظرف إنساني' } })
    fireEvent.click(within(form).getByTestId('dd-submit'))
    expect(screen.getByTestId('dd-form-error')).toHaveTextContent('لا يتجاوز الأصل 5,000')
    fireEvent.change(within(form).getByTestId('dd-amount'), { target: { value: '2000' } })
    fireEvent.click(within(form).getByTestId('dd-submit'))
    await waitFor(() => expect(h.adjust).toHaveBeenCalledWith({ rowId: 'r1', kind: 'ops', mode: 'amount', amount: 2000, reason: 'ظرف إنساني' }))
  })
  it('التخفيض العام % يطلب سبباً؛ الاعتماد يطلب تأكيداً ويرسل export_id؛ التخفيف الحالي يظهر في الصف وبطاقاته', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    h.months = [month({ review_pct: 10 })]
    h.rows = [row({ review_pct: 10, relief_total: 24150, pct_relief: 1150, final_net: 589650, breakdown: { ...row().breakdown, absence: bk({ original: 20000, relief: 20000, after: 0, mode: 'waive', reason: 'إجازة شفهية' }), ops: bk({ original: 5000, relief: 3000, after: 2000, mode: 'amount', set_amount: 2000, reason: 'ظرف' }), pct: 10, pct_relief: 1150, relief_total: 24150 } })]
    render(<MemoryRouter><DeputyDeductionsPage /></MemoryRouter>)
    expect(screen.getByTestId('dd-relief-DD-1')).toHaveTextContent('−24,150')
    expect(screen.getByTestId('dd-after-DD-1')).toHaveTextContent('10,350')
    expect(screen.getByTestId('dd-net-DD-1')).toHaveTextContent('589,650')
    expect(screen.getByTestId('dd-pct-current')).toHaveTextContent('10%')
    fireEvent.click(screen.getByTestId('dd-open-DD-1'))
    expect(screen.getByTestId('dd-kind-absence-DD-1')).toHaveTextContent('إعفاء كامل · إجازة شفهية')
    expect(screen.getByTestId('dd-kind-ops-DD-1')).toHaveTextContent('2,000')
    expect(screen.getByTestId('dd-pct-row-DD-1')).toHaveTextContent('−1,150')
    fireEvent.click(screen.getByTestId('dd-clear-ops-DD-1'))
    await waitFor(() => expect(h.adjust).toHaveBeenCalledWith({ rowId: 'r1', kind: 'ops', mode: 'clear', amount: null, reason: null }))
    fireEvent.change(screen.getByTestId('dd-pct'), { target: { value: '15' } })
    fireEvent.click(screen.getByTestId('dd-pct-apply'))
    expect(alert).toHaveBeenCalled(); expect(h.percent).not.toHaveBeenCalled()
    fireEvent.change(screen.getByTestId('dd-pct-reason'), { target: { value: 'قرار إداري' } })
    fireEvent.click(screen.getByTestId('dd-pct-apply'))
    await waitFor(() => expect(h.percent).toHaveBeenCalledWith({ exportId: 'x1', pct: 15, reason: 'قرار إداري' }))
    fireEvent.click(screen.getByTestId('dd-approve'))
    await waitFor(() => expect(h.approve).toHaveBeenCalledWith('x1'))
  })
  it('بعد الاعتماد: الأزرار مقفلة، زر إعادة الفتح يطلب سبباً؛ وبعد اعتماد المالية لا إعادة فتح', async () => {
    h.months = [month({ review_status: 'approved', reviewed_by_name: 'المعاون' })]
    h.rows = [row({ review_status: 'approved' })]
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('مراجعة إضافية')
    const { unmount } = render(<MemoryRouter><DeputyDeductionsPage /></MemoryRouter>)
    expect(screen.getByTestId('dd-approve')).toBeDisabled(); expect(screen.getByTestId('dd-pct-apply')).toBeDisabled()
    expect(screen.getByTestId('dd-status')).toHaveTextContent('الكشف عند المالية')
    fireEvent.click(screen.getByTestId('dd-open-DD-1'))
    expect(screen.queryByTestId('dd-form-DD-1')).toBeNull()
    fireEvent.click(screen.getByTestId('dd-reopen'))
    await waitFor(() => expect(h.reopen).toHaveBeenCalledWith({ exportId: 'x1', reason: 'مراجعة إضافية' }))
    prompt.mockRestore(); unmount()
    h.months = [month({ review_status: 'approved', export_status: 'approved' })]
    render(<MemoryRouter><DeputyDeductionsPage /></MemoryRouter>)
    expect(screen.queryByTestId('dd-reopen')).toBeNull()
    expect(screen.getByTestId('dd-status')).toHaveTextContent('مقفل')
  })
  it('00249: إعفاء موظف بعينه بسبب (الآخرون لا يتأثرون) — زر في صفه، شارة «معفى كلياً»، وإلغاء الإعفاء', async () => {
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('')
    render(<MemoryRouter><DeputyDeductionsPage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('dd-f-all'))
    expect(screen.queryByTestId('dd-waive-emp-DD-2')).toBeNull()   // لا استقطاع عليه ⇒ لا زر
    fireEvent.click(screen.getByTestId('dd-waive-emp-DD-1'))
    expect(h.empWaive).not.toHaveBeenCalled()                     // بلا سبب ⇒ لا إرسال
    prompt.mockReturnValue('موظف مستجد — توجيه فقط')
    fireEvent.click(screen.getByTestId('dd-waive-emp-DD-1'))
    await waitFor(() => expect(h.empWaive).toHaveBeenCalledWith({ rowId: 'r1', reason: 'موظف مستجد — توجيه فقط' }))
    expect(prompt.mock.calls[1]?.[0]).toContain('بقية الموظفين لا يتأثرون')
    prompt.mockRestore()
  })
  it('00249: الموظف المعفى كلياً يحمل شارة وزر إلغاء الإعفاء يرسل reason=null بعد تأكيد', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    h.rows = [row({ employee_waived: true, relief_total: 34500, final_net: 600000, review_note: 'إعفاء كلي: موظف مستجد' })]
    render(<MemoryRouter><DeputyDeductionsPage /></MemoryRouter>)
    expect(screen.getByTestId('dd-waived-badge-DD-1')).toHaveTextContent('معفى كلياً')
    expect(screen.getByTestId('dd-row-DD-1')).toHaveAttribute('data-waived', 'true')
    expect(screen.queryByTestId('dd-waive-emp-DD-1')).toBeNull()
    expect(screen.getByTestId('dd-after-DD-1')).toHaveTextContent('0')
    fireEvent.click(screen.getByTestId('dd-restore-emp-DD-1'))
    await waitFor(() => expect(h.empWaive).toHaveBeenCalledWith({ rowId: 'r1', reason: null }))
  })
  it('reviewTotals: المجاميع والنِّسب', () => {
    const t = reviewTotals([row({ relief_total: 24150 }), row({ row_id: 'r2', reviewable_total: 0, shortfall_amount: 0, absence_amount: 0, ops_amount: 0, fines_amount: 0, final_net: 500000 })])
    expect(t).toMatchObject({ count: 2, withDeductions: 1, before: 34500, relief: 24150, after: 10350, relieved: 1, net: 1065500 })
  })
})
