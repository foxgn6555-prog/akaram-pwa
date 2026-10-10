/**
 * 00206 — الراتب بنموذج «الأيام المستحقة» + واجهة تعريف الراتب الجديدة:
 *   محاكاة نقية تطابق معادلة قاعدة البيانات (500,000 ÷ 30 × 9 = 150,000 · ÷ 31 ⇒ 145,161) · نموذج التعريف (عدّادات، ترشيح، ملخص، محاكاة، حفظ/أخطاء)
 *   · معادلة الكشف في المالية تشرح النموذج · شرح صف التحقق · سياسة التطوير المركزية تعرض نموذج الراتب.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({ employees: [] as unknown[], profile: null as unknown, setSalary: vi.fn(async () => undefined), sheet: [] as unknown[], policy: {} as Record<string, unknown>, setPolicy: vi.fn(async () => ({})) }))
const mut = (fn: (...a: never[]) => Promise<unknown>) => ({ mutate: (v: never) => void fn(v), mutateAsync: fn, isPending: false })
vi.mock('@features/hr', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useHrEmployees: () => ({ data: h.employees, isLoading: false }), useSalaryProfile: () => ({ data: h.profile, isLoading: false }), useSetSalary: () => mut(h.setSalary),
  usePayrollSheet: () => ({ data: h.sheet, isLoading: false }), usePayrollReconcile: () => ({ data: [], isLoading: false }), useMonthExportStatus: () => ({ data: null }),
  useApprovePayroll: () => mut(async () => undefined), useAdjustPayroll: () => mut(async () => undefined), useEmployeeMonthDays: () => ({ data: [], isLoading: false }), useEmployeeMonthDeductions: () => ({ data: [], isLoading: false }),
  useFinanceNotices: () => ({ data: [] }), useMarkNoticeDone: () => mut(async () => undefined),
  useHrPolicy: () => ({ data: h.policy, isLoading: false }), useSetHrPolicy: () => mut(h.setPolicy), useLeaveTypes: () => ({ data: [], isLoading: false }), useSaveLeaveType: () => mut(async () => undefined),
}))
vi.mock('@sdk/hr.sdk', () => ({ hr: { listDeductions: async () => [] } }))

import { ProfilesTab, simulateEarned } from '@portals/finance/pages/Payroll/SalaryProfiles'
import PayrollOverview from '@portals/finance/pages/Payroll/PayrollOverview'
import HrPolicyPage from '@portals/it/pages/Integrations/HrPolicyPage'
import { explainRow } from '@features/hr/lib/payrollSheetModel'
import type { HrEmployeeRow, PayrollReconcileRow, PayrollSheetRow } from '@features/hr'

const emp = (o: Partial<HrEmployeeRow>): HrEmployeeRow => ({ id: 'e1', employee_number: 'EMP-0003', full_name: 'احمد عبد الواحد', job_title: 'فني', department_name: 'الأشغال والخدمات', branch_name: null, contract_type: 'monthly', hire_date: '2025-01-01', salary_status: 'pending', ...o } as HrEmployeeRow)
beforeEach(() => {
  h.employees = [emp({}), emp({ id: 'e2', employee_number: 'F-1', full_name: 'كرار يوسف', salary_status: 'defined' }), emp({ id: 'e3', employee_number: 'EMP-002', full_name: 'علي رعد', contract_type: 'daily', department_name: 'النظافة' })]
  h.profile = null; h.sheet = []; h.policy = { salary_model: 'earned_days', pay_rest_days: false, prorate_allowances: true, deduction_tiers: [{ from: 1, to: null, minutes: 0 }], overtime_enabled: false, overtime_min_block_minutes: 30, alert_late_days_per_month: 3, alert_shortfall_minutes_per_month: 120, alert_absent_days_per_month: 2, annual_leave_days_default: 21, permits_per_leave_day: 2, permit_max_minutes: 240, balance_mode: 'annual_upfront' }
  vi.clearAllMocks()
})

describe('simulateEarned (نقي — نفس معادلة قاعدة البيانات)', () => {
  it('500,000 ÷ 30 × 9 = 150,000 · ÷ 31 × 9 = 145,161.29 · ÷ 28 × 9 = 160,714.29', () => {
    expect(simulateEarned({ payType: 'monthly', base: 500000, daily: 0, allowances: 0, fixed: 0, daysInMonth: 30, present: 9, paidLeave: 0 }).baseDue).toBe(150000)
    expect(simulateEarned({ payType: 'monthly', base: 500000, daily: 0, allowances: 0, fixed: 0, daysInMonth: 31, present: 9, paidLeave: 0 }).baseDue).toBe(145161.29)
    expect(simulateEarned({ payType: 'monthly', base: 500000, daily: 0, allowances: 0, fixed: 0, daysInMonth: 28, present: 9, paidLeave: 0 }).baseDue).toBe(160714.29)
  })
  it('الإجازة المدفوعة تُضاف؛ المخصصات بنسبة الأيام المستحقة؛ الثابتة تُخصم؛ الشهر الكامل لا يتجاوز الأساسي؛ اليومي = أجر اليوم × الأيام', () => {
    const s = simulateEarned({ payType: 'monthly', base: 500000, daily: 0, allowances: 30000, fixed: 5000, daysInMonth: 30, present: 9, paidLeave: 2 })
    expect(s.payable).toBe(11); expect(s.baseDue).toBe(183333.33); expect(s.allow).toBe(11000); expect(s.net).toBe(189333.33)
    const f = simulateEarned({ payType: 'monthly', base: 500000, daily: 0, allowances: 30000, fixed: 0, daysInMonth: 30, present: 30, paidLeave: 0 })
    expect(f.baseDue).toBe(500000); expect(f.allow).toBe(30000); expect(f.gross).toBe(530000)
    const d = simulateEarned({ payType: 'daily', base: 0, daily: 25000, allowances: 10000, fixed: 0, daysInMonth: 31, present: 20, paidLeave: 1 })
    expect(d.baseDue).toBe(525000); expect(d.allow).toBe(10000); expect(d.net).toBe(535000)
    expect(simulateEarned({ payType: 'monthly', base: 100000, daily: 0, allowances: 0, fixed: 200000, daysInMonth: 30, present: 30, paidLeave: 0 }).net).toBe(0)
  })
})

describe('واجهة تعريف الراتب (ProfilesTab)', () => {
  it('عدّادات مُعرَّف/بانتظار، ترشيح، حالة فارغة ثم اختيار موظف يفتح النموذج برأس الموظف', () => {
    render(<ProfilesTab />)
    expect(screen.getByTestId('pr-count-defined').textContent).toBe('1')
    expect(screen.getByTestId('pr-count-pending').textContent).toBe('2')
    expect(screen.getByTestId('pr-empty')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('pr-filter-daily'))
    expect(within(screen.getByTestId('pr-list')).getAllByRole('button')).toHaveLength(1)
    fireEvent.click(screen.getByTestId('pr-only-pending'))
    expect(within(screen.getByTestId('pr-list')).getAllByRole('button')).toHaveLength(2)
    fireEvent.click(screen.getByTestId('pr-filter-all'))
    fireEvent.click(screen.getByTestId('pr-emp-EMP-0003'))
    const form = screen.getByTestId('salary-form')
    expect(within(form).getByText('احمد عبد الواحد')).toBeInTheDocument()
    expect(within(form).getByTestId('sf-status').textContent).toBe('بانتظار التعريف')
    expect(screen.queryByTestId('pr-empty')).toBeNull()
  })
  it('الشهري: الملخص والمحاكاة تتحدث مع الإدخال (500,000 · 9 أيام في شهر 30 ⇒ 150,000)؛ الحفظ يرسل القيم', async () => {
    render(<ProfilesTab />)
    fireEvent.click(screen.getByTestId('pr-emp-EMP-0003'))
    fireEvent.click(screen.getByTestId('sf-save'))
    expect(screen.getByTestId('sf-error')).toHaveTextContent('الأساسي'); expect(h.setSalary).not.toHaveBeenCalled()
    fireEvent.change(screen.getByTestId('sf-base'), { target: { value: '500000' } })
    fireEvent.change(screen.getByTestId('sf-sim-month'), { target: { value: '2026-09' } })   // 30 يوماً
    fireEvent.change(screen.getByTestId('sf-sim-present'), { target: { value: '9' } })
    fireEvent.change(screen.getByTestId('sf-sim-leave'), { target: { value: '0' } })
    expect(screen.getByTestId('sf-sim-formula').textContent).toContain('500,000 ÷ 30')
    expect(screen.getByTestId('sf-sim-net').textContent).toBe('150,000')
    fireEvent.change(screen.getByTestId('sf-sim-month'), { target: { value: '2026-10' } })   // 31 يوماً
    expect(screen.getByTestId('sf-sim-net').textContent).toBe('145,161')
    fireEvent.change(screen.getByTestId('sf-sim-leave'), { target: { value: '2' } })
    expect(screen.getByTestId('sf-sim-net').textContent).toBe('177,419')
    expect(screen.getByTestId('sf-full-net').textContent).toBe('500,000')
    // مخصصات باقتراح جاهز + استقطاع ثابت
    fireEvent.click(screen.getByTestId('sf-allow-suggest-نقل'))
    fireEvent.change(screen.getByTestId('sf-allow-v-0'), { target: { value: '31000' } })
    fireEvent.click(screen.getByTestId('sf-ded-add'))
    fireEvent.change(screen.getByTestId('sf-ded-k-0'), { target: { value: 'ضمان' } }); fireEvent.change(screen.getByTestId('sf-ded-v-0'), { target: { value: '5000' } })
    expect(screen.getByTestId('sf-full-net').textContent).toBe('526,000')
    expect(screen.getByTestId('sf-dirty')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('sf-save'))
    await vi.waitFor(() => expect(h.setSalary).toHaveBeenCalledWith({ employeeId: 'e1', payType: 'monthly', base: 500000, daily: 0, allowances: { نقل: 31000 }, fixedDeductions: { ضمان: 5000 }, notes: '' }))
  })
  it('اليومي: أجر اليوم مطلوب؛ المحاكاة = أجر اليوم × الأيام', async () => {
    render(<ProfilesTab />)
    fireEvent.click(screen.getByTestId('pr-emp-EMP-002'))
    expect((screen.getByTestId('sf-type') as HTMLSelectElement).value).toBe('daily')
    fireEvent.click(screen.getByTestId('sf-save'))
    expect(screen.getByTestId('sf-error')).toHaveTextContent('أجر اليوم')
    fireEvent.change(screen.getByTestId('sf-daily'), { target: { value: '25000' } })
    fireEvent.change(screen.getByTestId('sf-sim-present'), { target: { value: '20' } })
    fireEvent.change(screen.getByTestId('sf-sim-leave'), { target: { value: '0' } })
    expect(screen.getByTestId('sf-sim-net').textContent).toBe('500,000')
    fireEvent.click(screen.getByTestId('sf-save'))
    await vi.waitFor(() => expect(h.setSalary).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'e3', payType: 'daily', daily: 25000, base: 0 })))
  })
  it('ملف مُعرَّف: القيم تُحمَّل ولا «تعديلات غير محفوظة» حتى يتغير شيء', () => {
    h.profile = { employee_id: 'e2', status: 'defined', pay_type: 'monthly', base_salary: 750000, daily_rate: 0, allowances: { نقل: 50000 }, fixed_deductions: {}, currency: 'IQD', notes: 'ملاحظة', set_at: '2026-09-01T00:00:00Z' }
    render(<ProfilesTab />)
    fireEvent.click(screen.getByTestId('pr-emp-F-1'))
    expect((screen.getByTestId('sf-base') as HTMLInputElement).value).toBe('750000')
    expect((screen.getByTestId('sf-allow-v-0') as HTMLInputElement).value).toBe('50000')
    expect(screen.queryByTestId('sf-dirty')).toBeNull()
    expect(screen.getByTestId('sf-save').textContent).toContain('حفظ التعديلات')
    fireEvent.change(screen.getByTestId('sf-base'), { target: { value: '760000' } })
    expect(screen.getByTestId('sf-dirty')).toBeInTheDocument()
  })
})

describe('كشف المالية: معادلة نموذج الأيام المستحقة', () => {
  const row = (o: Partial<PayrollSheetRow>): PayrollSheetRow => ({
    export_id: 'x1', export_version: 1, export_status: 'exported', exported_at: '2026-10-01T08:00:00Z', row_id: 'r1', employee_id: 'e1', employee_number: 'E-1', full_name: 'أحمد', department_name: 'النقل', branch_name: 'الكرخ', job_title: null,
    contract_type: 'monthly', pay_type: 'monthly', working_days: 30, days_present: 9, days_late: 0, days_absent: 19, days_incomplete: 0, days_leave: 2, days_leave_paid: 2, days_leave_unpaid: 0, late_minutes: 0, early_minutes: 0,
    ops_deduction_amount: 0, ops_deduction_days: 0, ops_deduction_days_amount: 0, ops_deduction_reasons: null, auto_deduction_minutes: 0, auto_deduction_days: 0, auto_deduction_amount: 0, auto_absence_days: 19, auto_shortfall_days: 0, overtime_minutes: 0, shortfall_minutes: 0,
    base_salary: 500000, daily_rate: 0, allowances_total: 11000, fixed_deductions_total: 5000, advance_installment: 0, scheduled_days: 30, unevaluated_days: 0, shift_minutes: 480, covered_days: 30, days_in_month: 30, day_rate: 16666.6667, proration_ratio: 0.366667,
    payable_days: 11, gross_amount: 194333.33, deductions_total: 5000, proposed_net: 189333.33, final_net: null, finance_note: null, salary_model: 'earned_days', days_rest: 0, ...o,
  } as PayrollSheetRow)
  it('التفاصيل تشرح: 11 يوماً مستحقاً من 30 × أجر اليوم؛ الغياب غير مدفوع فلا يُخصم؛ شارة النموذج', () => {
    h.sheet = [row({})]
    render(<MemoryRouter><PayrollOverview /></MemoryRouter>)
    expect(screen.getByTestId('ps-payable-E-1').textContent).toBe('مستحق 11/30')
    fireEvent.click(screen.getByTestId('ps-days-E-1'))
    const f = screen.getByTestId('ps-formula')
    expect(within(f).getByTestId('ps-earned').textContent).toContain('11 يوم مستحق (حاضر 9 + إجازة مدفوعة 2) من 30')
    expect(within(f).getByTestId('ps-earned').textContent).toContain('19 يوم غياب غير مدفوع أصلاً')
    expect(within(f).getByTestId('ps-earned-badge')).toBeInTheDocument()
    expect(f.textContent).toContain('183,333.33')
    expect(screen.queryByTestId('ps-prorated')).toBeNull()
  })
  it('شرح صف التحقق يذكر الأيام المستحقة وأيام الشهر', () => {
    const rc = { pay_type: 'monthly', gross_expected: 194333.33, deductions_expected: 5000, net_expected: 189333.33, components: { salary_model: 'earned_days', base_salary: 500000, day_rate: 16666.6667, payable_days: 11, days_in_month: 30, allowances: 11000, fixed_deductions: 5000, ops_amount: 0, ops_days_amount: 0, auto_amount: 0, advance: 0 } } as unknown as PayrollReconcileRow
    const t = explainRow(rc)
    expect(t).toContain('÷ 30')
    expect(t).toContain('11 يوم مستحق')
    expect(t).toContain('189,333.33')
  })
})

describe('سياسة التطوير المركزية: نموذج الراتب', () => {
  it('يعرض نموذج الراتب وأيام الراحة؛ اختيار القديم يُظهر أساس أجر اليوم والشهر الجزئي', () => {
    render(<MemoryRouter><HrPolicyPage /></MemoryRouter>)
    expect((screen.getByTestId('p-salary-model') as HTMLSelectElement).value).toBe('earned_days')
    expect((screen.getByTestId('p-pay-rest') as HTMLSelectElement).value).toBe('false')
    expect(screen.queryByTestId('p-day-basis')).toBeNull()
    expect(screen.queryByTestId('p-prorate')).toBeNull()
    fireEvent.change(screen.getByTestId('p-salary-model'), { target: { value: 'full_minus_absence' } })
    expect(screen.getByTestId('p-day-basis')).toBeInTheDocument()
    expect(screen.getByTestId('p-prorate')).toBeInTheDocument()
  })
})
