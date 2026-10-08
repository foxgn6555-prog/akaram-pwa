/**
 * 00198 — ترتيب مسار الحضورية (غرفة العمليات ← المالية):
 *   شريط مراحل واحد (لا تنقّل مكرر) · شريحة حالة الشهر · بطاقة «حالة الشهر» موحّدة · «جاهزية الاعتماد» بعناصر قابلة للنقر
 *   · بطاقة «التصدير إلى المالية» بحالة صريحة · المالية: شريط رحلة الكشف + «جاهزية الاعتماد» موحّدة + ملخص أساسي/ثانوي.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({ conf: null as unknown, attendance: [] as unknown[], exportStatus: null as unknown, exports: [] as unknown[], sheet: [] as unknown[], reconcile: [] as unknown[], evaluateMonth: vi.fn(async () => 0) }))
const mut = (fn: (...a: never[]) => Promise<unknown>) => ({ mutate: (v: never) => void fn(v), mutateAsync: fn, isPending: false })
vi.mock('@features/branches', () => ({ useBranches: () => ({ data: [] }) }))
vi.mock('@features/departments', () => ({ useDepartments: () => ({ data: [] }) }))
vi.mock('@features/hr/hooks/useHr', () => ({
  useAttendance: () => ({ data: h.attendance, isLoading: false }), useEvaluateAttendance: () => mut(async () => 0), useEditAttendance: () => mut(async () => undefined), useResetAttendance: () => mut(async () => undefined),
  useDeductions: () => ({ data: [], isLoading: false }), useAddDeduction: () => mut(async () => 'd'), useDeleteDeduction: () => mut(async () => undefined), useWaiveDeduction: () => mut(async () => undefined),
  useAttendanceAudit: () => ({ data: [], isLoading: false }), useMonthExports: () => ({ data: h.exports }), useExportMonth: () => mut(async () => 'x'), useMonthExportStatus: () => ({ data: h.exportStatus }), useEvaluateMonth: () => mut(h.evaluateMonth),
  useAttendanceConfirmation: () => ({ data: h.conf }), useAttendanceGrid: () => ({ data: [], isLoading: false }),
  useConfirmAttendanceMonth: () => mut(async () => ({})), useReopenAttendanceMonth: () => mut(async () => ({})),
  usePayrollSheet: () => ({ data: h.sheet, isLoading: false }), usePayrollReconcile: () => ({ data: h.reconcile, isLoading: false }),
  useApprovePayroll: () => mut(async () => undefined), useAdjustPayroll: () => mut(async () => undefined), useEmployeeMonthDays: () => ({ data: [], isLoading: false }), useEmployeeMonthDeductions: () => ({ data: [], isLoading: false }),
  useFinanceNotices: () => ({ data: [] }), useHrEmployees: () => ({ data: [], isLoading: false }), useMarkNoticeDone: () => mut(async () => undefined), useSalaryProfile: () => ({ data: null, isLoading: false }), useSetSalary: () => mut(async () => undefined),
}))
vi.mock('@features/integrations', () => ({ useBiometricPunches: () => ({ data: [], isLoading: false }), usePushEmployeeToDevices: () => ({ mutate: vi.fn(), isPending: false }), useDevices: () => ({ data: [], isLoading: false }) }))
vi.mock('@sdk/hr.sdk', () => ({ hr: { listDeductions: async () => [] } }))

import OpsAttendancePage from '@portals/ops-room/pages/Attendance/OpsAttendancePage'
import PayrollOverview from '@portals/finance/pages/Payroll/PayrollOverview'

const month = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` })()
const open = { month, status: 'open', confirmed: false, confirmed_at: null, confirmed_by_name: null, confirm_count: 0, reopened_at: null, reopened_by_name: null, reopen_reason: null, pending_auto: 0, pending_days: [], deductions_after: 0, unevaluated_days: 0, employees: 2, locked: false, required: true, export: {}, snapshot: {}, can_export: false }
const confirmed = { ...open, status: 'confirmed', confirmed: true, confirmed_at: '2026-10-01T08:00:00Z', confirmed_by_name: 'مدقق الحضور', confirm_count: 1, can_export: true }
const exported = { ...confirmed, export: { export_id: 'x', status: 'exported', version: 2 } }
const noStatus = { export_id: null, status: null, changes_after: 0, deductions_after: 0, disclosure_deductions_after: 0, needs_reexport: false, unevaluated_days: 0, unevaluated_employees: 0 }
const att = (over: Record<string, unknown>) => ({ id: 'a1', employee_id: 'e1', employee_number: 'E100', full_name: 'أحمد', department_name: 'النقل', branch_name: null, work_date: `${month.slice(0, 8)}05`, shift_name: 'صباحي', expected_in: null, expected_out: null, check_in: null, check_out: null, late_minutes: 0, early_minutes: 0, shortfall_minutes: 0, overtime_minutes: 0, permit_minutes: 0, worked_minutes: 0, status: 'incomplete', source: 'auto', edit_reason: null, proposed_deduction_minutes: 0, proposed_deduction_days: 0, deduction_waived: false, deduction_reason: null, waive_reason: null, ...over })

beforeEach(() => { h.conf = open; h.attendance = []; h.exportStatus = noStatus; h.exports = []; h.sheet = []; h.reconcile = []; vi.clearAllMocks() })

describe('00198 — غرفة العمليات: ترتيب صفحة الحضوريات', () => {
  it('تنقّل واحد فقط: شريط المراحل يحمل زرّي المرحلتين وخطواتهما الأربع؛ لا شريط تنقّل ثانٍ', () => {
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    const bar = screen.getByTestId('att-stage-bar')
    expect(within(bar).getByTestId('stage-detailed')).toHaveAttribute('aria-selected', 'true')
    expect(within(bar).getByTestId('stage-approved')).toHaveAttribute('aria-selected', 'false')
    for (const n of [1, 2, 3, 4]) expect(within(bar).getByTestId(`att-stage-${n}`)).toBeInTheDocument()
    expect(within(bar).getByTestId('att-stage-1')).toHaveAttribute('data-active', 'true')
    expect(screen.queryByRole('navigation', { name: 'المرحلة' })).toBeNull()
    expect(screen.getByTestId('att-month-state')).toHaveAttribute('data-state', 'open')
  })
  it('شريحة حالة الشهر تتبع الاعتماد/التصدير/القفل', () => {
    h.conf = confirmed
    const { unmount } = render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    expect(screen.getByTestId('att-month-state')).toHaveAttribute('data-state', 'confirmed'); unmount()
    h.conf = exported
    const r2 = render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    expect(screen.getByTestId('att-month-state')).toHaveAttribute('data-state', 'exported'); expect(screen.getByTestId('att-month-state')).toHaveTextContent('v2'); r2.unmount()
    h.conf = { ...exported, locked: true, export: { ...exported.export, status: 'approved' } }
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    expect(screen.getByTestId('att-month-state')).toHaveAttribute('data-state', 'locked')
    expect(screen.getByTestId('att-locked')).toBeInTheDocument()
  })
  it('جاهزية الاعتماد: عرض يوم واحد + بصمة ناقصة + استقطاع مقترح ⇒ 3 نقاط، وكل نقطة تنقل إلى مكانها', () => {
    h.attendance = [att({}), att({ id: 'a2', work_date: `${month.slice(0, 8)}06`, status: 'late', late_minutes: 30, proposed_deduction_minutes: 60 })]
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    const ready = screen.getByTestId('att-readiness')
    expect(screen.getByTestId('att-readiness-state')).toHaveTextContent('3 نقاط')
    expect(within(ready).getByTestId('att-ready-unevaluated')).toHaveAttribute('data-ok', 'true')
    expect(within(ready).getByTestId('att-ready-incomplete')).toHaveAttribute('data-ok', 'false')
    expect(within(ready).getByTestId('att-ready-proposed')).toHaveAttribute('data-ok', 'false')
    expect(within(ready).getByTestId('att-ready-scope')).toHaveAttribute('data-ok', 'false')
    fireEvent.click(within(within(ready).getByTestId('att-ready-scope')).getByRole('button'))
    expect(screen.getByTestId('att-ready-scope')).toHaveAttribute('data-ok', 'true')
    fireEvent.click(within(screen.getByTestId('att-ready-incomplete')).getByRole('button'))
    expect(screen.getByTestId('ops-status')).toHaveValue('incomplete')
    fireEvent.click(within(screen.getByTestId('att-ready-proposed')).getByRole('button'))
    expect(screen.getByTestId('panel-deductions')).toHaveClass('bg-white')
  })
  it('أيام غير محتسبة تظهر داخل بطاقة «حالة الشهر» الموحّدة وفي الجاهزية بزر احتساب', () => {
    h.exportStatus = { ...noStatus, unevaluated_days: 4, unevaluated_employees: 2 }
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    const card = screen.getByTestId('att-month-status')
    expect(within(card).getByTestId('ops-unevaluated-banner')).toHaveTextContent('4 يوم عمل غير محتسب')
    expect(screen.getByTestId('att-ready-unevaluated')).toHaveAttribute('data-ok', 'false')
    fireEvent.click(within(screen.getByTestId('att-ready-unevaluated')).getByRole('button'))
    expect(h.evaluateMonth).toHaveBeenCalledWith(month)
  })
  it('بعد الاعتماد: لافتة الاعتماد داخل بطاقة الحالة + زر الانتقال، والجاهزية تختفي (الشهر مجمّد)', () => {
    h.conf = confirmed
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    expect(within(screen.getByTestId('att-month-status')).getByTestId('att-confirmed-banner')).toHaveTextContent('مدقق الحضور')
    expect(screen.queryByTestId('att-readiness')).toBeNull()
    fireEvent.click(screen.getByTestId('att-go-approved'))
    expect(screen.getByTestId('stage-approved')).toHaveAttribute('aria-selected', 'true')
  })
  it('الكشف المعتمد: بطاقة «التصدير إلى المالية» بحالة صريحة (لم يُصدَّر / v2 بانتظار المالية / يلزم إعادة التصدير / مقفل)', () => {
    h.conf = confirmed
    const r1 = render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('stage-approved'))
    expect(screen.getByTestId('att-export-state')).toHaveTextContent('لم يُصدَّر بعد')
    expect(screen.getByTestId('ops-export-month')).toBeEnabled(); r1.unmount()

    h.conf = exported; h.exports = [{ id: 'x', period_month: month, version: 2, status: 'exported', rows_count: 12, exported_at: '2026-10-02T09:00:00Z', approved_at: null }]
    const r2 = render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('stage-approved'))
    expect(screen.getByTestId('att-export-state')).toHaveTextContent('v2 · بانتظار اعتماد المالية')
    expect(screen.getByTestId('att-export-card')).toHaveTextContent('12 موظفاً'); r2.unmount()

    h.exportStatus = { ...noStatus, export_id: 'x', status: 'exported', version: 2, changes_after: 3, needs_reexport: true }
    const r3 = render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('stage-approved'))
    expect(screen.getByTestId('att-export-state')).toHaveTextContent('يلزم إعادة التصدير')
    expect(within(screen.getByTestId('att-approved-status')).getByTestId('ops-reexport-banner')).toHaveTextContent('3 تغييرات'); r3.unmount()

    h.exportStatus = noStatus; h.exports = [{ id: 'x', period_month: month, version: 2, status: 'approved', rows_count: 12, exported_at: '2026-10-02T09:00:00Z', approved_at: '2026-10-03T09:00:00Z' }]
    h.conf = { ...exported, locked: true, export: { ...exported.export, status: 'approved' } }
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('stage-approved'))
    expect(screen.getByTestId('att-export-state')).toHaveTextContent('اعتمدته المالية')
    expect(screen.getByTestId('ops-export-month')).toBeDisabled()
    expect(screen.queryByTestId('att-reopen-open')).toBeNull()
  })
})

const base = { export_id: 'x1', export_version: 2, export_status: 'exported', exported_at: '2026-10-01T08:00:00Z', contract_type: 'monthly', pay_type: 'monthly', working_days: 26, days_present: 24, days_late: 1, days_absent: 1, days_incomplete: 0, days_leave: 1, days_leave_paid: 1, days_leave_unpaid: 0, payable_days: 25,
  ops_deduction_amount: 0, ops_deduction_days: 0, ops_deduction_days_amount: 0, ops_deduction_reasons: null, auto_deduction_minutes: 0, auto_deduction_days: 1, auto_deduction_amount: 20000, auto_absence_days: 1, auto_shortfall_days: 0, overtime_minutes: 0, shortfall_minutes: 0,
  daily_rate: 0, allowances_total: 0, fixed_deductions_total: 0, advance_installment: 0, scheduled_days: 26, unevaluated_days: 0, shift_minutes: 480, covered_days: 30, days_in_month: 30, proration_ratio: 1, final_net: null, finance_note: null, job_title: null,
  row_id: 'r1', employee_id: 'e1', employee_number: 'E-2', full_name: 'أحمد', branch_name: 'الكرخ', department_name: 'النقل', base_salary: 600000, gross_amount: 600000, deductions_total: 20000, proposed_net: 580000 }
const rcRow = { row_id: 'r1', employee_id: 'e1', employee_number: 'E-2', full_name: 'أحمد', department_name: 'النقل', branch_name: 'الكرخ', pay_type: 'monthly', gross_stored: 600000, gross_expected: 600000, deductions_stored: 20000, deductions_expected: 20000, net_stored: 580000, net_expected: 580000, final_net: null,
  components: { base_salary: 600000, allowances: 0, fixed_deductions: 0, ops_amount: 0, ops_days_amount: 0, auto_amount: 20000, auto_basis: 'salary', advance: 0, present: 24, absent: 1, leave: 1, proration_ratio: 1 }, live: { present: 24, absent: 1, leave: 1 }, issues: [], money_ok: true, attendance_ok: true, ok: true }

describe('00198 — المالية: رحلة الكشف وجاهزية الاعتماد', () => {
  it('كشف سليم: الشريط ✓✓✓ والاعتماد نشط، الجاهزية خضراء، الملخص 5 بطاقات أساسية + شريط ثانوي', () => {
    h.sheet = [base]; h.reconcile = [rcRow]
    render(<MemoryRouter><PayrollOverview /></MemoryRouter>)
    const pipe = screen.getByTestId('ps-pipeline')
    expect(within(pipe).getByTestId('ps-step-ops')).toHaveAttribute('data-state', 'done')
    expect(within(pipe).getByTestId('ps-step-export')).toHaveAttribute('data-state', 'done')
    expect(within(pipe).getByTestId('ps-step-export')).toHaveTextContent('v2')
    expect(within(pipe).getByTestId('ps-step-verify')).toHaveAttribute('data-state', 'done')
    expect(within(pipe).getByTestId('ps-step-approve')).toHaveAttribute('data-state', 'active')
    expect(within(pipe).getByTestId('ps-consistency')).toHaveTextContent('1 صف متطابق')
    expect(screen.getByTestId('ps-readiness-state')).toHaveTextContent('جاهز للاعتماد')
    expect(screen.getByTestId('ps-ready-line')).toBeInTheDocument()
    expect(screen.getByTestId('ps-approve')).toBeEnabled()
    const stats = screen.getByTestId('ps-stats')
    expect(within(stats).getByTestId('ps-final')).toHaveTextContent('580,000')
    expect(within(screen.getByTestId('ps-stats-secondary')).getByTestId('ps-auto')).toHaveTextContent('20,000')
    expect(within(screen.getByTestId('ps-stats-secondary')).getByTestId('ps-missing')).toHaveTextContent('0')
  })
  it('كشف موقوف: بلا ملف راتب + خلل حسابي ⇒ الشريط ✗ والجاهزية «الاعتماد موقوف» مع كلا السببين في بطاقة واحدة', () => {
    h.sheet = [base, { ...base, row_id: 'r6', employee_id: 'e6', employee_number: 'E-6', full_name: 'علي', pay_type: null, base_salary: null, gross_amount: null, deductions_total: null, proposed_net: null, auto_deduction_amount: 0, auto_deduction_days: 0 }]
    h.reconcile = [{ ...rcRow, money_ok: false, ok: false, issues: ['NET_MISMATCH'] }]
    render(<MemoryRouter><PayrollOverview /></MemoryRouter>)
    expect(screen.getByTestId('ps-step-verify')).toHaveAttribute('data-state', 'bad')
    expect(screen.getByTestId('ps-step-approve')).toHaveAttribute('data-state', 'bad')
    expect(screen.getByTestId('ps-readiness-state')).toHaveTextContent('الاعتماد موقوف')
    const card = screen.getByTestId('ps-readiness')
    expect(within(card).getByTestId('ps-missing-banner')).toHaveTextContent('علي (E-6)')
    expect(within(card).getByTestId('ps-reconcile-banner')).toHaveTextContent('1 صف')
    expect(screen.queryByTestId('ps-ready-line')).toBeNull()
    expect(screen.getByTestId('ps-approve')).toBeDisabled()
  })
  it('كشف قديم (تغييرات بعد التصدير): خطوة التصدير تحذير والجاهزية «مع تحذير» والاعتماد يبقى ممكناً', () => {
    h.sheet = [base]; h.reconcile = [rcRow]
    h.exportStatus = { export_id: 'x1', status: 'exported', version: 2, changes_after: 3, deductions_after: 0, disclosure_deductions_after: 0, needs_reexport: true }
    render(<MemoryRouter><PayrollOverview /></MemoryRouter>)
    expect(screen.getByTestId('ps-step-export')).toHaveAttribute('data-state', 'warn')
    expect(screen.getByTestId('ps-readiness-state')).toHaveTextContent('مع تحذير')
    expect(within(screen.getByTestId('ps-readiness')).getByTestId('ps-stale-banner')).toHaveTextContent('3 تغييرات')
    expect(screen.getByTestId('ps-approve')).toBeEnabled()
  })
  it('كشف معتمد ومقفل: الشريط كله ✓ ولا بطاقة جاهزية', () => {
    h.sheet = [{ ...base, export_status: 'approved', final_net: 580000 }]; h.reconcile = [rcRow]
    render(<MemoryRouter><PayrollOverview /></MemoryRouter>)
    expect(screen.getByTestId('ps-step-approve')).toHaveAttribute('data-state', 'done')
    expect(screen.getByTestId('ps-step-approve')).toHaveTextContent('معتمد ومقفل')
    expect(screen.queryByTestId('ps-readiness')).toBeNull()
    expect(screen.getByTestId('ps-approve')).toBeDisabled()
  })
})
