/**
 * 00353 — الساعات الإضافية المدفوعة:
 *   وحدة المعاون (الرأس، الجدول، الصرف/الرفض/الإلغاء مع الأسباب، الأجر الثابت، التفصيل اليومي، التوقف عند تعطيل النظام)
 *   · قسم التطوير المركزية في سياسة الموارد البشرية (افتراضياً متوقف، الوحدة، قبل/بعد الشفت، الكتلة) · كشف المالية (شارة + معادلة + عمود Excel + تحقق المجاميع).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import DeputyOvertimePage from '@portals/deputy/pages/Overtime/DeputyOvertimePage'
import HrPolicyPage from '@portals/it/pages/Integrations/HrPolicyPage'
import { buildPayrollWorkbook, MAIN_COL, MAIN_HEADERS } from '@features/hr/lib/payrollExcel'
import { explainRow, RECONCILE_ISSUE_LABELS, sheetTotals, totalsConsistent } from '@features/hr/lib/payrollSheetModel'
import type { OvertimeEmployee, OvertimeOverview, PayrollReconcileRow, PayrollSheetRow } from '@features/hr'
import { monthStart } from '@portals/hr/components/hr-format'

const CUR = monthStart()   // الصفحة تفتح على الشهر الحالي

const h = vi.hoisted(() => ({
  overview: null as unknown, days: [] as unknown[], rates: [] as unknown[], history: [] as unknown[],
  pay: vi.fn(async () => ({})), reject: vi.fn(async () => ({})), cancel: vi.fn(async () => undefined), rateSet: vi.fn(async () => ({})), memberSet: vi.fn(async () => ({})), memberEvents: [] as unknown[],
  policy: {} as Record<string, unknown>, setPolicy: vi.fn(async () => ({})),
}))
const mut = (fn: (...a: never[]) => Promise<unknown>) => ({ mutate: (v: never) => void fn(v), mutateAsync: fn, isPending: false })
vi.mock('@features/hr', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useOvertimeOverview: () => ({ data: h.overview, isLoading: false }), useOvertimeDays: (id: string | null) => ({ data: id ? h.days : undefined, isLoading: false }),
  useOvertimeRates: (on: boolean) => ({ data: on ? h.rates : undefined, isLoading: false }), useOvertimeHistory: (on: boolean) => ({ data: on ? h.history : undefined, isLoading: false }),
  useOvertimePay: () => mut(h.pay), useOvertimeReject: () => mut(h.reject), useOvertimeCancel: () => mut(h.cancel), useOvertimeRateSet: () => mut(h.rateSet), useOvertimeMemberSet: () => mut(h.memberSet), useOvertimeMemberEvents: (on: boolean) => ({ data: on ? h.memberEvents : undefined, isLoading: false }),
  useHrPolicy: () => ({ data: h.policy, isLoading: false }), useSetHrPolicy: () => mut(h.setPolicy), useLeaveTypes: () => ({ data: [], isLoading: false }), useSaveLeaveType: () => mut(async () => undefined),
}))

const emp = (o: Partial<OvertimeEmployee>): OvertimeEmployee => ({ employee_id: 'e', employee_number: 'X', full_name: 'x', department_name: 'النظافة', job_title: 'عامل', days_count: 3, early_minutes: 60, late_minutes: 220, counted_minutes: 280, payable_minutes: 240, hour_rate: 3750, rate_source: 'salary', shift_minutes: 480, day_rate: 30000, amount: 15000, fixed_rate: null, member: true, payout: null, ...o })
const OV = (over: Partial<OvertimeOverview> = {}): OvertimeOverview => ({
  month: '2026-09-01', settings: { enabled: true, unit: 'hours', before_shift: true, after_shift: true, min_block_minutes: 30 }, payroll_month: '2026-09-01', month_locked: false, members_count: 4, export_status: 'exported', export_review_status: null,
  employees: [
    emp({ employee_id: 'e1', employee_number: 'A-1', full_name: 'كرار' }),
    emp({ employee_id: 'e2', employee_number: 'A-2', full_name: 'حيدر', hour_rate: 7000, rate_source: 'fixed', amount: 28000, fixed_rate: { enabled: true, hourly_amount: 7000, note: 'اتفاق' }, payout: { id: 'p2', status: 'paid', amount: 28000, payable_minutes: 240, counted_minutes: 280, hour_rate: 7000, rate_source: 'fixed', unit: 'hours', payroll_month: '2026-09-01', note: null, decided_at: '2026-10-02T09:00:00Z', decided_by_name: 'المعاون', settled: false, changed_since: false } }),
    emp({ employee_id: 'e3', employee_number: 'A-3', full_name: 'علي', counted_minutes: 40, payable_minutes: 0, amount: 0, days_count: 1, early_minutes: 0, late_minutes: 40 }),
    emp({ employee_id: 'e4', employee_number: 'A-4', full_name: 'سجاد', payout: { id: 'p4', status: 'rejected', amount: 0, payable_minutes: 240, counted_minutes: 280, hour_rate: 3750, rate_source: 'salary', unit: 'hours', payroll_month: '2026-09-01', note: 'لم تُكلَّف بعمل إضافي', decided_at: '2026-10-02T09:00:00Z', decided_by_name: 'المعاون', settled: false, changed_since: false } }),
  ], ...over,
})
beforeEach(() => {
  vi.clearAllMocks(); h.overview = OV(); h.days = [{ work_date: '2026-09-01', shift_name: 'صباحي', expected_in: '2026-09-01T05:00:00Z', expected_out: '2026-09-01T13:00:00Z', check_in: '2026-09-01T04:00:00Z', check_out: '2026-09-01T14:30:00Z', status: 'present', early_minutes: 60, late_minutes: 90, counted_minutes: 150, shortfall_minutes: 0 }]
  h.rates = [{ employee_id: 'e1', employee_number: 'A-1', full_name: 'كرار', department_name: 'النظافة', job_title: 'عامل', enabled: false, hourly_amount: 0, note: null, updated_at: null, salary_hour_rate: 3750, salary_source: 'salary', member: true, member_since: '2026-09-01', member_note: 'حملة' },
    { employee_id: 'e9', employee_number: 'A-9', full_name: 'باسم', department_name: 'النقل', job_title: 'سائق', enabled: false, hourly_amount: 0, note: null, updated_at: null, salary_hour_rate: 4000, salary_source: 'salary', member: false, member_since: null, member_note: null }]
  h.memberEvents = [{ id: 'ev1', employee_id: 'e1', employee_number: 'A-1', full_name: 'كرار', action: 'add', note: 'حملة', actor_name: 'المعاون', created_at: '2026-09-01T08:00:00Z' }]
  h.history = []; h.policy = { deduction_tiers: [{ from: 1, to: null, minutes: 0 }], overtime_enabled: false, overtime_min_block_minutes: 30, overtime_minutes_per_leave_day: null }
})
const open = () => render(<MemoryRouter><DeputyOvertimePage /></MemoryRouter>)

describe('00353 — وحدة المعاون: الساعات الإضافية المدفوعة', () => {
  it('الرأس والجدول: مفعّل، 1 بانتظار القرار، مصروف 28,000، مستحق غير مصروف 15,000؛ الساعات 4 لكل من كرار وحيدر؛ المصادر والحالات؛ أرقام لاتينية', () => {
    open()
    expect(screen.getByTestId('ot-enabled')).toHaveTextContent('مفعّل'); expect(screen.getByTestId('ot-members')).toHaveTextContent('4'); expect(screen.getByTestId('ot-pending')).toHaveTextContent('1')
    expect(screen.getByTestId('ot-paid-total')).toHaveTextContent('28,000'); expect(screen.getByTestId('ot-pending-total')).toHaveTextContent('15,000')
    expect(screen.getByTestId('ot-settings')).toHaveTextContent('بالساعة الكاملة'); expect(screen.getByTestId('ot-settings')).toHaveTextContent('قبل الشفت + بعد الشفت'); expect(screen.getByTestId('ot-settings')).toHaveTextContent('30 د')
    expect(screen.getByTestId('ot-hours-A-1')).toHaveTextContent('4'); expect(screen.getByTestId('ot-early-A-1')).toHaveTextContent('1س'); expect(screen.getByTestId('ot-late-A-1')).toHaveTextContent('3س 40د')
    expect(screen.getByTestId('ot-source-A-1')).toHaveTextContent('من الراتب'); expect(screen.getByTestId('ot-amount-A-1')).toHaveTextContent('15,000'); expect(screen.getByTestId('ot-status-A-1')).toHaveTextContent('بانتظار القرار')
    expect(screen.getByTestId('ot-source-A-2')).toHaveTextContent('أجر ثابت'); expect(screen.getByTestId('ot-amount-A-2')).toHaveTextContent('28,000'); expect(screen.getByTestId('ot-status-A-2')).toHaveTextContent('مصروف'); expect(screen.getByTestId('ot-row-A-2')).toHaveTextContent('راتب 2026-09')
    expect(screen.getByTestId('ot-status-A-3')).toHaveTextContent('أقل من ساعة'); expect(screen.getByTestId('ot-pay-A-3')).toBeDisabled()
    expect(screen.getByTestId('ot-status-A-4')).toHaveTextContent('مرفوض'); expect(screen.getByTestId('ot-row-A-4')).toHaveTextContent('لم تُكلَّف بعمل إضافي')
    expect(screen.getByTestId('ot-k-payroll')).toHaveTextContent('2026-09'); expect(screen.getByTestId('ot-k-export')).toHaveTextContent('مُصدَّر')
    expect(screen.queryByTestId('ot-no-members-note')).toBeNull()
    expect(screen.getByTestId('ot-formula')).toHaveTextContent('900,000 ÷ 30 يوماً = 30,000 لليوم ÷ 8 ساعات = 3,750 للساعة؛ 10 ساعات إضافية = 37,500')
    expect(screen.getByTestId('deputy-overtime').textContent).not.toMatch(/[\u0660-\u0669]/)
    fireEvent.click(screen.getByTestId('ot-filter-pending')); expect(screen.getAllByTestId(/^ot-row-/)).toHaveLength(2)   // كرار (مستحق) + علي (أقل من ساعة، بلا قرار)
    fireEvent.click(screen.getByTestId('ot-filter-paid')); expect(screen.getAllByTestId(/^ot-row-/)).toHaveLength(1)
  })
  it('الصرف يرسل الموظف والشهر والملاحظة؛ الرفض يتطلب سبباً (3 أحرف)؛ الإلغاء بسبب يرسل معرّف القرار', async () => {
    const prompt = vi.spyOn(window, 'prompt')
    open()
    prompt.mockReturnValueOnce('ساعات الحملة')
    fireEvent.click(screen.getByTestId('ot-pay-A-1'))
    await waitFor(() => expect(h.pay).toHaveBeenCalledWith({ employeeId: 'e1', month: CUR, note: 'ساعات الحملة' }))
    expect(prompt.mock.calls[0]?.[0]).toContain(`صرف 4 ساعة لـ كرار عن ${CUR.slice(0, 7)} بمبلغ 15,000`)
    prompt.mockReturnValueOnce(null); fireEvent.click(screen.getByTestId('ot-pay-A-1')); expect(h.pay).toHaveBeenCalledTimes(1)
    prompt.mockReturnValueOnce('لا'); fireEvent.click(screen.getByTestId('ot-reject-A-1')); expect(h.reject).not.toHaveBeenCalled()
    prompt.mockReturnValueOnce('لم يُكلَّف'); fireEvent.click(screen.getByTestId('ot-reject-A-1'))
    await waitFor(() => expect(h.reject).toHaveBeenCalledWith({ employeeId: 'e1', month: CUR, note: 'لم يُكلَّف' }))
    prompt.mockReturnValueOnce('خطأ في الأجر'); fireEvent.click(screen.getByTestId('ot-cancel-A-2'))
    await waitFor(() => expect(h.cancel).toHaveBeenCalledWith({ payoutId: 'p2', note: 'خطأ في الأجر' }))
    prompt.mockRestore()
  })
  it('النظام متوقف: تنبيه، وأزرار الصرف/الرفض معطّلة، والدقائق تبقى للاطلاع؛ المصروف المعتمد بلا زر إلغاء', () => {
    const paidSettled = emp({ employee_id: 'e5', employee_number: 'A-5', full_name: 'مصطفى', payout: { id: 'p5', status: 'paid', amount: 15000, payable_minutes: 240, counted_minutes: 280, hour_rate: 3750, rate_source: 'salary', unit: 'hours', payroll_month: '2026-08-01', note: null, decided_at: '2026-09-02T09:00:00Z', decided_by_name: 'المعاون', settled: true, changed_since: true } })
    h.overview = OV({ settings: { enabled: false, unit: 'minutes', before_shift: false, after_shift: true, min_block_minutes: 0 }, employees: [emp({ employee_id: 'e1', employee_number: 'A-1', full_name: 'كرار' }), paidSettled] })
    open()
    expect(screen.getByTestId('ot-enabled')).toHaveTextContent('متوقف'); expect(screen.getByTestId('ot-disabled-note')).toBeInTheDocument()
    expect(screen.getByTestId('ot-pay-A-1')).toBeDisabled(); expect(screen.getByTestId('ot-reject-A-1')).toBeDisabled()
    expect(screen.getByTestId('ot-settings')).toHaveTextContent('بالدقيقة'); expect(screen.getByTestId('ot-settings')).toHaveTextContent('النطاق: بعد الشفت')
    expect(screen.queryByTestId('ot-cancel-A-5')).toBeNull(); expect(screen.getByTestId('ot-row-A-5')).toHaveTextContent('معتمد'); expect(screen.getByTestId('ot-changed-A-5')).toBeInTheDocument()
  })
  it('التفصيل اليومي يفتح بالضغط على الاسم ويعرض المعادلة والأيام؛ تبويب الأجر الثابت يحفظ 7,000 مع ملاحظة ويرفض الصفر', async () => {
    open()
    fireEvent.click(screen.getByTestId('ot-open-A-1'))
    const d = screen.getByTestId('ot-days-dialog')
    expect(d).toHaveTextContent('أجر اليوم 30,000 · دقائق الشفت 480 · أجر الساعة 3,750'); expect(within(d).getAllByTestId('ot-day-row')).toHaveLength(1)
    expect(within(d).getByTestId('ot-day-row')).toHaveTextContent('2س 30د')
    fireEvent.click(screen.getByTestId('ot-tab-members'))
    expect(screen.getByTestId('ot-rate-fixed-A-1')).toHaveTextContent('متوقف')
    fireEvent.click(screen.getByTestId('ot-rate-edit-A-1'))
    const r = screen.getByTestId('ot-rate-dialog')
    fireEvent.click(within(r).getByTestId('ot-rate-enabled'))
    expect(within(r).getByTestId('ot-rate-save')).toBeDisabled()
    fireEvent.change(within(r).getByTestId('ot-rate-amount'), { target: { value: '7000' } })
    fireEvent.change(within(r).getByTestId('ot-rate-note'), { target: { value: 'اتفاق خاص' } })
    fireEvent.click(within(r).getByTestId('ot-rate-save'))
    await waitFor(() => expect(h.rateSet).toHaveBeenCalledWith({ employeeId: 'e1', enabled: true, amount: 7000, note: 'اتفاق خاص' }))
  })
})

describe('00353 — الشمول بالاسم (المعاون فقط)', () => {
  it('تبويب المشمولون: كرار مشمول منذ 2026-09-01 وله أزرار الإزالة والأجر؛ باسم غير مشمول (رصيد إجازات) وله زر إدراج فقط؛ الإدراج بملاحظة اختيارية والإزالة بسبب إلزامي؛ المرشّحات؛ السجل', async () => {
    const prompt = vi.spyOn(window, 'prompt')
    open()
    fireEvent.click(screen.getByTestId('ot-tab-members'))
    expect(screen.getByTestId('ot-member-A-1')).toHaveTextContent('مشمول منذ 2026-09-01'); expect(screen.getByTestId('ot-rate-row-A-1')).toHaveTextContent('حملة')
    expect(screen.getByTestId('ot-member-A-9')).toHaveTextContent('غير مشمول'); expect(screen.getByTestId('ot-rate-row-A-9')).toHaveTextContent('رصيد إجازات')
    expect(screen.queryByTestId('ot-rate-edit-A-9')).toBeNull(); expect(screen.getByTestId('ot-member-toggle-A-9')).toHaveTextContent('إدراج'); expect(screen.getByTestId('ot-member-toggle-A-1')).toHaveTextContent('إزالة من المشمولين')
    prompt.mockReturnValueOnce(''); fireEvent.click(screen.getByTestId('ot-member-toggle-A-9'))
    await waitFor(() => expect(h.memberSet).toHaveBeenCalledWith({ employeeId: 'e9', active: true, note: null }))
    expect(prompt.mock.calls[0]?.[0]).toContain('إدراج باسم')
    prompt.mockReturnValueOnce('لا'); fireEvent.click(screen.getByTestId('ot-member-toggle-A-1')); expect(h.memberSet).toHaveBeenCalledTimes(1)
    prompt.mockReturnValueOnce('انتهى تكليفه'); fireEvent.click(screen.getByTestId('ot-member-toggle-A-1'))
    await waitFor(() => expect(h.memberSet).toHaveBeenCalledWith({ employeeId: 'e1', active: false, note: 'انتهى تكليفه' }))
    fireEvent.click(screen.getByTestId('ot-mfilter-members')); expect(screen.getAllByTestId(/^ot-rate-row-/)).toHaveLength(1)
    fireEvent.click(screen.getByTestId('ot-mfilter-others')); expect(screen.getAllByTestId(/^ot-rate-row-/)).toHaveLength(1); expect(screen.getByTestId('ot-rate-row-A-9')).toBeInTheDocument()
    expect(screen.getAllByTestId('ot-member-event')).toHaveLength(1); expect(screen.getByTestId('ot-member-events')).toHaveTextContent('إدراج')
    prompt.mockRestore()
  })
  it('النظام مفعّل بلا مشمولين ⇒ تنبيه أحمر وعدّاد 0؛ موظف له قرار سابق لكنه أُزيل يظهر «غير مشمول حالياً» وزر الصرف معطّل', () => {
    h.overview = OV({ members_count: 0, employees: [emp({ employee_id: 'e1', employee_number: 'A-1', full_name: 'كرار', member: false })] })
    open()
    expect(screen.getByTestId('ot-members')).toHaveTextContent('0'); expect(screen.getByTestId('ot-no-members-note')).toBeInTheDocument()
    expect(screen.getByTestId('ot-notmember-A-1')).toHaveTextContent('غير مشمول حالياً'); expect(screen.getByTestId('ot-pay-A-1')).toBeDisabled()
  })
})

describe('00353 — التطوير المركزية: قسم الساعات الإضافية المدفوعة في سياسة الموارد البشرية', () => {
  it('افتراضياً متوقف، الوحدة ساعات، قبل/بعد مفعّلان، الكتلة 30؛ التعديل يُرسل المفاتيح الخمسة', () => {
    render(<MemoryRouter><HrPolicyPage /></MemoryRouter>)
    expect((screen.getByTestId('p-pot') as HTMLSelectElement).value).toBe('false')
    expect((screen.getByTestId('p-pot-unit') as HTMLSelectElement).value).toBe('hours')
    expect((screen.getByTestId('p-pot-before') as HTMLSelectElement).value).toBe('true'); expect((screen.getByTestId('p-pot-after') as HTMLSelectElement).value).toBe('true')
    expect((screen.getByTestId('p-pot-block') as HTMLInputElement).value).toBe('30')
    expect(screen.getByTestId('p-pot-example')).toHaveTextContent('10 × 3,750 = 37,500')
    fireEvent.change(screen.getByTestId('p-pot'), { target: { value: 'true' } })
    fireEvent.change(screen.getByTestId('p-pot-unit'), { target: { value: 'minutes' } })
    fireEvent.change(screen.getByTestId('p-pot-before'), { target: { value: 'false' } })
    fireEvent.change(screen.getByTestId('p-pot-block'), { target: { value: '15' } })
    fireEvent.click(screen.getByTestId('policy-save'))
    expect(h.setPolicy).toHaveBeenCalledWith(expect.objectContaining({ paid_overtime_enabled: true, paid_overtime_unit: 'minutes', paid_overtime_before_shift: false, paid_overtime_min_block_minutes: 15 }))
  })
})

describe('00353 — كشف المالية: سطر «ساعات العمل الإضافي»', () => {
  const row = (o: Partial<PayrollSheetRow>): PayrollSheetRow => ({ export_id: 'x', export_version: 1, export_status: 'exported', exported_at: '2026-10-01', row_id: 'r', employee_id: 'e', employee_number: 'E-1', full_name: 'كرار', department_name: 'النظافة', branch_name: 'الكرخ', job_title: 'عامل', contract_type: 'monthly', working_days: 30, days_present: 30, days_late: 0, days_absent: 0, days_incomplete: 0, days_leave: 0, late_minutes: 0, early_minutes: 0, ops_deduction_amount: 0, ops_deduction_days: 0, ops_deduction_reasons: null, auto_deduction_minutes: 0, auto_deduction_days: 0, auto_deduction_amount: 0, overtime_minutes: 0, shortfall_minutes: 0, pay_type: 'monthly', base_salary: 900000, daily_rate: null, allowances_total: 0, fixed_deductions_total: 0, proposed_net: 900000, final_net: 900000, finance_note: null, payable_days: 30, gross_amount: 900000, deductions_total: 0, ...o } as PayrollSheetRow)
  it('Excel: العمود 20 = ساعات العمل الإضافي بين إجمالي الاستقطاعات والصافي المقترح، تحقق الصافي = max(0, L − S) + T، والمجاميع متسقة', async () => {
    expect(MAIN_HEADERS[MAIN_COL.overtime - 1]).toBe('ساعات العمل الإضافي'); expect(MAIN_HEADERS[MAIN_COL.deductions - 1]).toBe('إجمالي الاستقطاعات'); expect(MAIN_HEADERS[MAIN_COL.proposed - 1]).toBe('الصافي المقترح')
    const rows = [row({ overtime_amount: 15000, overtime_paid_minutes: 240, proposed_net: 915000, final_net: 915000 }), row({ employee_number: 'E-2', full_name: 'علي', employee_id: 'e2', row_id: 'r2' })]
    const wb = await buildPayrollWorkbook('2026-09-01', rows)
    const ws = wb.getWorksheet(1)!
    expect(ws.getRow(5).getCell(MAIN_COL.overtime).value).toBe(15000); expect(ws.getRow(5).getCell(MAIN_COL.proposed).value).toBe(915000)
    expect(String(ws.getRow(5).getCell(MAIN_COL.overtime).note)).toContain('4 ساعة عمل إضافي')
    expect((ws.getRow(5).getCell(MAIN_COL.verify).value as { formula: string }).formula).toBe('IF(ABS(MAX(0,L5-S5)+T5-U5)<=1,"✓","✗")')
    expect(ws.getRow(6).getCell(MAIN_COL.overtime).value).toBe(0)
    const t = sheetTotals(rows)
    expect(t.overtime).toBe(15000); expect(t.proposed).toBe(1815000); expect(totalsConsistent(t, rows.length)).toBe(true)
    expect(totalsConsistent({ ...t, overtime: 0 }, rows.length)).toBe(false)
  })
  it('شرح صف التحقق يذكر سطر الإضافي بلا ضريبة، وعنوان خلل OVERTIME_CHANGED معرَّف', () => {
    const rc = { pay_type: 'monthly', gross_expected: 900000, deductions_expected: 27000, net_expected: 888000, components: { salary_model: 'earned_days', base_salary: 900000, day_rate: 30000, payable_days: 30, days_in_month: 30, allowances: 0, fixed_deductions: 0, ops_amount: 0, ops_days_amount: 0, auto_amount: 0, advance: 0, rented_tax: 27000, rented_tax_pct: 3, overtime: 15000 }, issues: [] } as unknown as PayrollReconcileRow
    const text = explainRow(rc)
    expect(text).toContain('+ ساعات العمل الإضافي 15,000 (بلا ضريبة)'); expect(text).toContain('= 888,000')
    expect(RECONCILE_ISSUE_LABELS.OVERTIME_CHANGED).toContain('ساعات العمل الإضافي')
  })
})
