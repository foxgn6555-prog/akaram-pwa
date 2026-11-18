/**
 * شريط مراحل كشف الرواتب (المالية): خطوة «قرار المدير المفوض والصرف» بعد اعتماد المالية —
 * لا طلب قبل الاعتماد ⇒ «يُنشأ تلقائياً» · بانتظار القرار/الصرف ⇒ نشطة · مصروف ⇒ مكتملة · مرفوض ⇒ حمراء بالإرشاد · رابط أمر الصرف.
 * ويُثبت الدمج في صفحة الرواتب نفسها (لا في الدالة وحدها).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({ sheet: [] as unknown[], gate: null as unknown, disb: undefined as unknown, enabledArgs: [] as unknown[], monthArgs: [] as unknown[] }))
const mut = (fn: (...a: never[]) => Promise<unknown>) => ({ mutate: (v: never) => void fn(v), mutateAsync: fn, isPending: false })
vi.mock('@features/branches', () => ({ useBranches: () => ({ data: [] }) }))
vi.mock('@features/departments', () => ({ useDepartments: () => ({ data: [] }) }))
vi.mock('@features/disbursements/hooks', () => ({ useEmployeePayrollRequest: (month: string, enabled?: boolean) => { h.monthArgs.push(month); h.enabledArgs.push(enabled); return { data: h.disb } } }))
vi.mock('@features/hr/hooks/useHr', () => ({
  useFinanceNotices: () => ({ data: [] }), useMarkNoticeDone: () => mut(async () => undefined),
  usePayrollSheet: () => ({ data: h.sheet, isLoading: false }), usePayrollReconcile: () => ({ data: [], isLoading: false }), usePayrollGate: () => ({ data: h.gate }),
  useMonthExportStatus: () => ({ data: { export_id: 'x', status: 'exported', changes_after: 0, deductions_after: 0, disclosure_deductions_after: 0, needs_reexport: false, unevaluated_days: 0, unevaluated_employees: 0 } }),
  useApprovePayroll: () => mut(async () => undefined), useAdjustPayroll: () => mut(async () => undefined), useEmployeeMonthDays: () => ({ data: [], isLoading: false }), useEmployeeMonthDeductions: () => ({ data: [], isLoading: false }),
  useHrEmployees: () => ({ data: [], isLoading: false }), useSalaryProfile: () => ({ data: null, isLoading: false }), useSetSalaryProfile: () => mut(async () => undefined),
}))
vi.mock('@sdk/hr.sdk', () => ({ hr: { listDeductions: async () => [], financeMissingPunchDraftExists: async () => false } }))
import PayrollOverview from '@portals/finance/pages/Payroll/PayrollOverview'

const row = (o: Record<string, unknown> = {}) => ({
  row_id: 'r1', employee_id: 'e1', employee_number: 'E-1', full_name: 'أحمد', branch_name: 'الكرخ', department_name: 'النقل', month: '2026-10-01', export_id: 'x1', export_version: 2, export_status: 'exported', exported_at: '2026-11-01T08:00:00Z',
  reviewed_at: '2026-11-02T08:00:00Z', contract_type: 'monthly', pay_type: 'monthly', working_days: 26, days_present: 26, days_late: 0, days_absent: 0, days_incomplete: 0, days_leave: 0, days_leave_paid: 0, days_leave_unpaid: 0, late_minutes: 0, early_minutes: 0,
  ops_deduction_amount: 0, ops_deduction_days: 0, ops_deduction_days_amount: 0, ops_deduction_reasons: null, auto_deduction_minutes: 0, auto_deduction_days: 0, auto_deduction_amount: 0, auto_absence_days: 0, auto_shortfall_days: 0, overtime_minutes: 0, shortfall_minutes: 0,
  base_salary: 1000000, daily_rate: 0, allowances_total: 0, fixed_deductions_total: 0, advance_installment: 0, scheduled_days: 26, unevaluated_days: 0, shift_minutes: 480, covered_days: 30, days_in_month: 30, proration_ratio: 1,
  gross_amount: 1000000, deductions_total: 0, proposed_net: 1000000, final_net: null, finance_note: null, job_title: null, ...o,
})
const req = (status: string, o: Record<string, unknown> = {}) => ({ id: 'd1', request_no: 'DSB-2026-0001', status, version: 1, ...o })

beforeEach(() => { h.sheet = [row()]; h.gate = { exported: true, visible: true }; h.disb = undefined; h.enabledArgs = []; h.monthArgs = [] })
const open = () => render(<MemoryRouter><PayrollOverview /></MemoryRouter>)
const step = () => screen.getByTestId('ps-step-disbursement')

describe('PayrollOverview — خطوة قرار المدير المفوض والصرف', () => {
  it('الخطوة السادسة موجودة بعد «اعتماد المالية»، ولا طلب بعد ⇒ «يُنشأ تلقائياً» (todo) ولا رابط', () => {
    open()
    const steps = within(screen.getByTestId('ps-pipeline')).getAllByRole('listitem').map((li) => li.getAttribute('data-testid'))
    expect(steps).toEqual(['ps-step-ops', 'ps-step-export', 'ps-step-deputy', 'ps-step-verify', 'ps-step-approve', 'ps-step-disbursement'])
    expect(step()).toHaveAttribute('data-state', 'todo'); expect(step()).toHaveTextContent('قرار المدير المفوض والصرف'); expect(step()).toHaveTextContent('يُنشأ تلقائياً عند اعتماد المالية')
    expect(screen.queryByTestId('ps-disbursement-link')).toBeNull()
  })
  it('الطلب يُجلب لشهر الكشف فقط حين يوجد كشف', () => {
    open()
    expect(h.monthArgs.at(-1)).toMatch(/^\d{4}-\d{2}-01$/); expect(h.enabledArgs.at(-1)).toBe(true)
    h.sheet = []; h.enabledArgs = []
    render(<MemoryRouter><PayrollOverview /></MemoryRouter>)
    expect(h.enabledArgs.at(-1)).toBe(false)
  })
  it.each([
    ['pending_approval', 'active', 'بانتظار قرار المدير المفوض'],
    ['approved', 'active', 'معتمد — بانتظار الصرف من القاصة'],
    ['paid', 'done', 'صُرف من القاصة'],
    ['rejected', 'bad', 'رفضه المدير المفوض — أعد الإرسال'],
  ])('طلب %s ⇒ حالة الخطوة %s والنص «%s» ورابط أمر الصرف', (status, state, text) => {
    h.disb = req(status)
    open()
    expect(step()).toHaveAttribute('data-state', state); expect(step()).toHaveTextContent('DSB-2026-0001'); expect(step()).toHaveTextContent(text)
    expect(screen.getByTestId('ps-disbursement-link')).toHaveAttribute('href', '/finance/disbursements/d1')
    expect(screen.getByTestId('ps-disbursement-link')).toHaveTextContent('فتح أمر الصرف')
  })
  it('الخطوات الخمس الأصلية لم تتغيّر ولا تحمل رابط أمر الصرف', () => {
    h.disb = req('approved')
    open()
    for (const k of ['ops', 'export', 'deputy', 'verify', 'approve']) expect(within(screen.getByTestId(`ps-step-${k}`)).queryByTestId('ps-disbursement-link')).toBeNull()
    expect(screen.getByTestId('ps-step-export')).toHaveTextContent('v2')
  })
})
