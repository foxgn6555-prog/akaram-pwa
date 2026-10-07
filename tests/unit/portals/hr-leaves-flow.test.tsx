/** 00144 واجهات: سياسة IT (شرائح + حفظ) · طلباتي (رصيد + طلب) · إجازات فريقي (موافقة/رفض المدير المباشر) · HR (أرصدة + نيابة) · غرفة العمليات (استقطاع مقترح + إلغاء بسبب) · المالية (عمود تلقائي) */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({
  policy: null as Record<string, unknown> | null,
  setPolicy: vi.fn(),
  saveType: vi.fn(),
  request: vi.fn(async () => 'new'),
  decide: vi.fn(async () => undefined),
  cancel: vi.fn(async () => undefined),
  waive: vi.fn(async () => undefined),
  setGrant: vi.fn(),
  adjust: vi.fn(),
  me: null as Record<string, unknown> | null,
  requests: [] as Array<Record<string, unknown>>,
  balance: { year: 2026, granted: 30, accrued: 30, carried: 0, adjusted: -2, used_leave_days: 4, used_permit_days: 0.333, permits_count: 1, overtime_days: 0.5, reversed: 0, remaining: 24.167, permits_per_leave_day: 3 },
  attendance: [] as Array<Record<string, unknown>>,
  sheet: [] as Array<Record<string, unknown>>,
}))
const POLICY = () => ({
  annual_leave_days_default: 30, balance_mode: 'annual_upfront', carry_over: true, carry_over_max_days: 30, permits_per_leave_day: 3, permit_max_minutes: 180, permits_max_per_month: null,
  grace_minutes_default: 15, deduction_basis: 'shortfall', absent_day_deduction_days: 1, incomplete_punch_as_absent: false, overtime_enabled: true, overtime_min_block_minutes: 30, overtime_minutes_per_leave_day: null,
  alert_late_days_per_month: 3, alert_shortfall_minutes_per_month: 120, alert_absent_days_per_month: 2, alert_balance_low_days: 2,
  deduction_tiers: [{ from: 1, to: 15, minutes: 0 }, { from: 16, to: 25, minutes: 20 }, { from: 26, to: 35, minutes: 60 }, { from: 36, to: null, day_fraction: 1 }],
})
const TYPES = [
  { id: 'annual', code: 'annual', name: 'إجازة اعتيادية', kind: 'leave', is_paid: true, consumes_balance: true, deduction_days_per_day: 1, requires_attachment: false, max_days_per_request: null, max_minutes: null, sort_order: 1, is_active: true },
  { id: 'sick', code: 'sick', name: 'مرضية', kind: 'leave', is_paid: true, consumes_balance: false, deduction_days_per_day: 1, requires_attachment: true, max_days_per_request: null, max_minutes: null, sort_order: 2, is_active: true },
  { id: 'unpaid', code: 'unpaid', name: 'بدون راتب', kind: 'leave', is_paid: false, consumes_balance: false, deduction_days_per_day: 1, requires_attachment: false, max_days_per_request: null, max_minutes: null, sort_order: 3, is_active: true },
  { id: 'permit', code: 'permit_paid', name: 'زمنية مدفوعة', kind: 'time_permit', is_paid: true, consumes_balance: true, deduction_days_per_day: 1, requires_attachment: false, max_days_per_request: null, max_minutes: null, sort_order: 4, is_active: true },
]
const REQ = (o: Record<string, unknown>) => ({
  id: 'r1', employee_id: 'e2', employee_number: 'E2', full_name: 'سارة', department_name: 'النقل', kind: 'leave', type_code: 'annual', type_name: 'إجازة اعتيادية', is_paid: true, consumes_balance: true,
  start_date: '2099-01-05', end_date: '2099-01-06', start_time: null, end_time: null, days: 2, minutes: 0, status: 'pending', notes: 'سفر', attachment_path: null, manager_id: 'e1', manager_name: 'أحمد',
  requested_by: 'u2', decided_at: null, decision_note: null, cancelled_reason: null, created_at: '2026-09-01T00:00:00Z', can_decide: true, ...o,
})
const mut = (fn: (...a: never[]) => unknown) => ({ mutate: (v: never, opts?: { onSuccess?: () => void }) => { fn(v); opts?.onSuccess?.() }, mutateAsync: fn, isPending: false })

vi.mock('@features/branches', () => ({ useBranches: () => ({ data: [] }) }))
vi.mock('@features/departments', () => ({ useDepartments: () => ({ data: [{ id: 'd1', name: 'النقل', parent_id: null }] }) }))
vi.mock('@sdk/hr.sdk', () => ({ hr: { uploadLeaveAttachment: vi.fn(async () => 'e2/leave-1.pdf'), signedUrl: vi.fn(async () => 'https://x') }, hrErrorMessage: (e: unknown) => String(e) }))
vi.mock('@features/integrations', () => ({ useBiometricPunches: () => ({ data: [], isLoading: false }) }))
vi.mock('@features/hr/hooks/useHr', () => ({
  useHrPolicy: () => ({ data: h.policy, isLoading: false }),
  useSetHrPolicy: () => mut(h.setPolicy),
  useLeaveTypes: () => ({ data: TYPES, isLoading: false }),
  useSaveLeaveType: () => mut(h.saveType),
  useMyEmployee: () => ({ data: h.me, isLoading: false }),
  useLeaveBalance: () => ({ data: h.balance, isLoading: false }),
  useLeaveLedger: () => ({ data: [{ id: 'l1', employee_id: 'e2', year: 2026, kind: 'grant', days: 30, leave_id: null, period_month: null, note: 'منحة', created_at: '2026-01-01T00:00:00Z' }, { id: 'l2', employee_id: 'e2', year: 2026, kind: 'permit', days: -0.333, leave_id: 'x', period_month: null, note: 'زمنية', created_at: '2026-02-01T00:00:00Z' }] }),
  useLeaveRequests: () => ({ data: h.requests, isLoading: false }),
  useRequestLeave: () => mut(h.request),
  useDecideLeave: () => mut(h.decide),
  useCancelLeave: () => mut(h.cancel),
  useHrAlerts: () => ({ data: [{ id: 'a1', employee_id: 'e2', employee_number: 'E2', full_name: 'سارة', department_name: 'النقل', manager_name: 'أحمد', period_month: '2026-08-01', kind: 'late_repeat', value: 4, threshold: 3, details: 'تأخر 4 أيام', acknowledged_at: null, created_at: '2026-09-01T00:00:00Z' }], isLoading: false }),
  useAckAlert: () => mut(vi.fn()),
  useLeavesDashboard: () => ({ data: { pending: 1, approved_today: 0, open_alerts: 1, permits_this_month: 2 } }),
  useHrEmployees: () => ({ data: [{ id: 'e2', employee_number: 'E2', full_name: 'سارة', biometric_pin: '7', employment_status: 'active' }, { id: 'e3', employee_number: 'E3', full_name: 'علي', biometric_pin: null, employment_status: 'active' }] }),
  useSetGrant: () => mut(h.setGrant),
  useAdjustBalance: () => mut(h.adjust),
  useHrLeaves: () => ({ data: [], isLoading: false }),
  // غرفة العمليات
  useAttendance: () => ({ data: h.attendance, isLoading: false }),
  useEvaluateAttendance: () => ({ mutate: vi.fn(), isPending: false }),
  useExportMonth: () => mut(vi.fn()),
  useMonthExports: () => ({ data: [] }), useMonthExportStatus: () => ({ data: null }), useAttendanceConfirmation: () => ({ data: null }), useAttendanceGrid: () => ({ data: [], isLoading: false }), useConfirmAttendanceMonth: () => mut(vi.fn()), useReopenAttendanceMonth: () => mut(vi.fn()), useEmployeeMonthDeductions: () => ({ data: [], isLoading: false }), useEvaluateMonth: () => ({ mutate: () => undefined, isPending: false }),
  useEditAttendance: () => mut(vi.fn()), useResetAttendance: () => mut(vi.fn()), useAttendanceAudit: () => ({ data: [] }),
  useDeductions: () => ({ data: [] }), useAddDeduction: () => mut(vi.fn()), useDeleteDeduction: () => mut(vi.fn()),
  useWaiveDeduction: () => mut(h.waive),
  useExportRows: () => ({ data: [] }),
  // المالية
  usePayrollSheet: () => ({ data: h.sheet, isLoading: false }),
  useAdjustPayroll: () => mut(vi.fn()), useApprovePayroll: () => mut(vi.fn()), useSalaryProfile: () => ({ data: null }), useSetSalary: () => mut(vi.fn()),
  useFinanceNotices: () => ({ data: [] }), useMarkNoticeDone: () => mut(vi.fn()),
}))

import HrPolicyPage from '@portals/it/pages/Integrations/HrPolicyPage'
import MyRequests from '@portals/employee/pages/Requests/MyRequests'
import TeamLeavesPage from '@portals/manager/pages/Leaves/TeamLeavesPage'
import Leaves from '@portals/hr/pages/Leaves/Leaves'
import OpsAttendancePage from '@portals/ops-room/pages/Attendance/OpsAttendancePage'
import PayrollOverview from '@portals/finance/pages/Payroll/PayrollOverview'

const ATT = (o: Record<string, unknown>) => ({
  id: 'a1', employee_id: 'e2', employee_number: 'E2', full_name: 'سارة', department_id: 'd1', department_name: 'النقل', branch_id: null, branch_name: null, job_title: null, work_date: '2026-09-02', shift_name: 'صباحي',
  expected_in: '2026-09-02T05:00:00Z', expected_out: '2026-09-02T13:00:00Z', check_in: '2026-09-02T05:30:00Z', check_out: '2026-09-02T13:00:00Z', late_minutes: 15, early_minutes: 0, worked_minutes: 450, is_rest_day: false, status: 'late', source: 'auto',
  edited_by: null, edited_at: null, edit_reason: null, required_minutes: 480, permit_minutes: 0, shortfall_minutes: 30, overtime_minutes: 0, proposed_deduction_minutes: 60, proposed_deduction_days: 0, deduction_reason: 'نقص 30 دقيقة عن ساعات الشفت', deduction_waived: false, waive_reason: null, ...o,
})

beforeEach(() => {
  h.policy = POLICY(); h.setPolicy.mockClear(); h.saveType.mockClear(); h.request.mockClear(); h.decide.mockClear(); h.cancel.mockClear(); h.waive.mockClear(); h.setGrant.mockClear(); h.adjust.mockClear()
  h.me = { id: 'e2', full_name: 'سارة', employee_number: 'E2', job_title: 'محاسبة', department_name: 'النقل', manager_id: 'e1', manager_name: 'أحمد', has_biometric: true, reports_count: 0 }
  h.requests = [REQ({})]
  h.attendance = [ATT({}), ATT({ id: 'a2', work_date: '2026-09-03', shortfall_minutes: 480, status: 'absent', check_in: null, check_out: null, worked_minutes: 0, proposed_deduction_minutes: 0, proposed_deduction_days: 1, deduction_reason: 'غياب', deduction_waived: true, waive_reason: 'إجازة شفهية موثقة' }), ATT({ id: 'a3', work_date: '2026-09-04', shortfall_minutes: 0, overtime_minutes: 90, late_minutes: 0, status: 'present', proposed_deduction_minutes: 0, proposed_deduction_days: 0, deduction_reason: null })]
  h.sheet = [{ export_id: 'x', export_version: 1, export_status: 'exported', exported_at: '2026-09-01T00:00:00Z', row_id: 'r1', id: 'r1', employee_id: 'e2', employee_number: 'E2', full_name: 'سارة', department_name: 'النقل', branch_name: null, job_title: null, contract_type: 'monthly', working_days: 26, days_present: 24, days_late: 2, days_absent: 1, days_incomplete: 0, days_leave: 1, late_minutes: 30, early_minutes: 0, ops_deduction_amount: 0, ops_deduction_days: 0, ops_deduction_reasons: null, auto_deduction_minutes: 60, auto_deduction_days: 1, auto_deduction_amount: 54000, overtime_minutes: 90, shortfall_minutes: 510, pay_type: 'monthly', base_salary: 1440000, daily_rate: 0, allowances_total: 0, fixed_deductions_total: 0, proposed_net: 1386000, final_net: 1386000, finance_note: null }]
})

describe('بوابة التطوير المركزية — سياسة الحضور والإجازات', () => {
  it('تعرض القيم، تتحقق من الشرائح حيّاً، وتحفظ السياسة كاملة عند الصلاحية', async () => {
    render(<HrPolicyPage />)
    expect(screen.getByTestId('p-annual')).toHaveValue(30)
    expect(screen.getByTestId('tiers-table').querySelectorAll('tbody tr')).toHaveLength(4)
    // معاينة: نقص 30 → 60 دقيقة
    fireEvent.change(screen.getByTestId('tier-sample'), { target: { value: '30' } })
    expect(screen.getByTestId('tier-preview')).toHaveTextContent('1س 0د')
    // فجوة → خطأ وزر الحفظ معطّل
    fireEvent.change(screen.getByTestId('tier-1-from'), { target: { value: '17' } })
    expect(screen.getByTestId('tiers-error')).toHaveTextContent('الدقيقة 16')
    expect(screen.getByTestId('policy-save')).toBeDisabled()
    fireEvent.change(screen.getByTestId('tier-1-from'), { target: { value: '16' } })
    expect(screen.queryByTestId('tiers-error')).toBeNull()
    // إضافة شريحة تُغلق الأخيرة وتفتح جديدة
    fireEvent.click(screen.getByTestId('tier-add'))
    expect(screen.getByTestId('tiers-table').querySelectorAll('tbody tr')).toHaveLength(5)
    expect(screen.queryByTestId('tiers-error')).toBeNull()
    fireEvent.change(screen.getByTestId('p-permits-per-day'), { target: { value: '4' } })
    fireEvent.change(screen.getByTestId('p-al-late'), { target: { value: '2' } })
    fireEvent.click(screen.getByTestId('policy-save'))
    await waitFor(() => expect(h.setPolicy).toHaveBeenCalledTimes(1))
    const sent = h.setPolicy.mock.calls[0]![0] as Record<string, unknown>
    expect(sent.permits_per_leave_day).toBe(4); expect(sent.alert_late_days_per_month).toBe(2)
    expect((sent.deduction_tiers as unknown[]).length).toBe(5)
  })
  it('00179: قسم محرك البصمة — نافذة الالتقاط والاحتساب التلقائي يُرسلان ضمن السياسة', async () => {
    render(<HrPolicyPage />)
    await screen.findByTestId('p-window')
    fireEvent.change(screen.getByTestId('p-window'), { target: { value: '3' } })
    fireEvent.change(screen.getByTestId('p-auto'), { target: { value: 'false' } })
    fireEvent.click(screen.getByTestId('policy-save'))
    await waitFor(() => expect(h.setPolicy).toHaveBeenCalled())
    const sent = h.setPolicy.mock.calls.at(-1)![0] as Record<string, unknown>
    expect(sent.punch_window_hours).toBe(3); expect(sent.auto_evaluate_enabled).toBe(false)
  })
  it('00187: قسم احتساب الراتب الشهري — أساس أجر اليوم، التناسب، سقف الاستقطاع التلقائي (نسبة مئوية → كسر)', async () => {
    render(<HrPolicyPage />)
    await screen.findByTestId('p-day-basis')
    fireEvent.change(screen.getByTestId('p-day-basis'), { target: { value: 'calendar_days' } })
    fireEvent.change(screen.getByTestId('p-prorate'), { target: { value: 'false' } })
    fireEvent.change(screen.getByTestId('p-prorate-allow'), { target: { value: 'false' } })
    fireEvent.change(screen.getByTestId('p-auto-cap'), { target: { value: '40' } })
    fireEvent.click(screen.getByTestId('policy-save'))
    await waitFor(() => expect(h.setPolicy).toHaveBeenCalled())
    const sent = h.setPolicy.mock.calls.at(-1)![0] as Record<string, unknown>
    expect(sent.salary_day_basis).toBe('calendar_days'); expect(sent.prorate_partial_month).toBe(false); expect(sent.prorate_allowances).toBe(false); expect(sent.auto_deduction_cap_ratio).toBe(0.4)
  })
  it('00188: قسم الاستقطاع التلقائي — إيقاف كلي، مفاتيح المكونات، المبالغ الثابتة تظهر عند اختيارها، وسقف الأيام', async () => {
    render(<HrPolicyPage />)
    await screen.findByTestId('p-auto-ded')
    expect(screen.queryByTestId('p-fixed-day')).toBeNull()
    fireEvent.change(screen.getByTestId('p-ded-mode'), { target: { value: 'fixed' } })
    fireEvent.change(screen.getByTestId('p-fixed-day'), { target: { value: '5000' } })
    fireEvent.change(screen.getByTestId('p-fixed-minute'), { target: { value: '50' } })
    fireEvent.change(screen.getByTestId('p-ded-shortfall'), { target: { value: 'false' } })
    fireEvent.change(screen.getByTestId('p-max-days'), { target: { value: '10' } })
    fireEvent.change(screen.getByTestId('p-require-confirm'), { target: { value: 'false' } })   // 00193
    fireEvent.change(screen.getByTestId('p-auto-ded'), { target: { value: 'false' } })
    expect(screen.getByTestId('p-ded-absence')).toBeDisabled()
    fireEvent.click(screen.getByTestId('policy-save'))
    await waitFor(() => expect(h.setPolicy).toHaveBeenCalled())
    const sent = h.setPolicy.mock.calls.at(-1)![0] as Record<string, unknown>
    expect(sent.auto_deduction_enabled).toBe(false); expect(sent.deduct_shortfall_enabled).toBe(false); expect(sent.auto_deduction_amount_mode).toBe('fixed')
    expect(sent.fixed_absent_day_amount).toBe(5000); expect(sent.fixed_shortfall_minute_amount).toBe(50); expect(sent.max_auto_deduction_days_per_month).toBe(10)
    expect(sent.require_attendance_confirmation).toBe(false)
  })
  it('أنواع الإجازات: الجدول + إنشاء نوع غير مدفوع بأيام استقطاع', () => {
    render(<HrPolicyPage />)
    expect(screen.getByTestId('lt-row-unpaid')).toHaveTextContent('تُستقطع')
    fireEvent.click(screen.getByTestId('lt-new'))
    expect(screen.getByTestId('lt-save')).toBeDisabled()
    fireEvent.change(screen.getByTestId('lt-name'), { target: { value: 'إجازة دراسية' } })
    fireEvent.change(screen.getByTestId('lt-code'), { target: { value: 'Study 1' } })
    expect(screen.getByTestId('lt-code')).toHaveValue('study1')
    fireEvent.change(screen.getByTestId('lt-paid'), { target: { value: 'false' } })
    fireEvent.change(screen.getByTestId('lt-ded'), { target: { value: '0.5' } })
    fireEvent.click(screen.getByTestId('lt-save'))
    expect(h.saveType).toHaveBeenCalledWith(expect.objectContaining({ code: 'study1', name: 'إجازة دراسية', is_paid: false, deduction_days_per_day: 0.5, kind: 'leave' }))
  })
})

describe('بوابة الموظف — طلباتي', () => {
  it('الرصيد الحي + طلب إجازة اعتيادية يُرسل بالحقول الصحيحة', async () => {
    render(<MyRequests />)
    expect(screen.getByTestId('my-manager')).toHaveTextContent('أحمد')
    expect(screen.getByTestId('my-balance-remaining')).toHaveTextContent('24.167')
    expect(screen.getByTestId('my-balance-permits')).toHaveTextContent('كل 3 زمنيات = يوم')
    expect(screen.getByTestId('my-form-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('my-form-type'), { target: { value: 'annual' } })
    fireEvent.change(screen.getByTestId('my-form-start'), { target: { value: '2099-02-01' } })
    fireEvent.change(screen.getByTestId('my-form-end'), { target: { value: '2099-02-03' } })
    expect(screen.getByTestId('my-form-summary')).toHaveTextContent('الأيام: 3'); expect(screen.getByTestId('my-form-summary')).toHaveTextContent('تخصم من الرصيد 3 يوم')
    fireEvent.change(screen.getByTestId('my-form-notes'), { target: { value: 'سفر' } })
    fireEvent.click(screen.getByTestId('my-form-submit'))
    await waitFor(() => expect(h.request).toHaveBeenCalledWith({ employeeId: 'e2', typeId: 'annual', start: '2099-02-01', end: '2099-02-03', startTime: null, endTime: null, notes: 'سفر', attachment: null }))
  })
  it('الزمنية: تتحقق من الحد الأقصى والوقت، وتخصم ثلث يوم؛ المرضية تتطلب مرفقاً؛ بلا مدير لا نموذج', () => {
    render(<MyRequests />)
    fireEvent.change(screen.getByTestId('my-form-type'), { target: { value: 'permit' } })
    fireEvent.change(screen.getByTestId('my-form-start-time'), { target: { value: '09:00' } })
    fireEvent.change(screen.getByTestId('my-form-end-time'), { target: { value: '13:00' } })
    expect(screen.getByTestId('my-form-summary')).toHaveTextContent('الحد الأقصى للزمنية 3س 0د')
    expect(screen.getByTestId('my-form-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('my-form-end-time'), { target: { value: '10:00' } })
    expect(screen.getByTestId('my-form-summary')).toHaveTextContent('تخصم من الرصيد 0.333 يوم')
    expect(screen.getByTestId('my-form-submit')).not.toBeDisabled()
    fireEvent.change(screen.getByTestId('my-form-type'), { target: { value: 'sick' } })
    expect(screen.getByTestId('my-form-summary')).toHaveTextContent('أرفق المستند')
    expect(screen.getByTestId('my-form-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('my-form-type'), { target: { value: 'unpaid' } })
    expect(screen.getByTestId('my-form-summary')).toHaveTextContent('غير مدفوعة — تُستقطع من الراتب')
  })
  it('طلباتي: إلغاء المعلّق بتأكيد، والمعتمد المستقبلي بسبب', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(window, 'prompt').mockReturnValue('تغيّرت الخطة')
    h.requests = [REQ({ can_decide: false }), REQ({ id: 'r2', status: 'approved', can_decide: false })]
    render(<MyRequests />)
    expect(screen.queryByTestId('my-req-approve-r1')).toBeNull() // الموظف لا يوافق لنفسه
    fireEvent.click(screen.getByTestId('my-req-cancel-r1'))
    await waitFor(() => expect(h.cancel).toHaveBeenCalledWith({ id: 'r1', reason: 'إلغاء من صاحب الطلب' }))
    fireEvent.click(screen.getByTestId('my-req-cancel-r2'))
    await waitFor(() => expect(h.cancel).toHaveBeenCalledWith({ id: 'r2', reason: 'تغيّرت الخطة' }))
  })
  it('بلا مدير مباشر: تنبيه مع بقاء النموذج (سلسلة الموافقات قد تغني عن المدير)', () => {
    h.me = { ...h.me!, manager_id: null, manager_name: null }
    render(<MyRequests />)
    expect(screen.getByTestId('my-no-manager')).toBeInTheDocument(); expect(screen.getByTestId('my-form')).toBeInTheDocument()   // 00160: النموذج يبقى — السلسلة قد تغني عن المدير المباشر
  })
})

describe('بوابة مدير القسم — إجازات فريقي', () => {
  it('صندوق الموافقات يعرض ما يحق له البتّ فيه فقط؛ الموافقة والرفض (بسبب إلزامي)', async () => {
    h.requests = [REQ({}), REQ({ id: 'r9', can_decide: false, full_name: 'موظف قسم آخر' })]
    render(<TeamLeavesPage />)
    expect(screen.getByTestId('tl-inbox-count')).toHaveTextContent('1')
    expect(screen.getByTestId('tl-inbox-table').querySelectorAll('tbody tr')).toHaveLength(1)
    const p = vi.spyOn(window, 'prompt').mockReturnValue('')
    fireEvent.click(screen.getByTestId('tl-inbox-reject-r1'))
    expect(h.decide).not.toHaveBeenCalled() // رفض بلا سبب لا يُرسل
    p.mockReturnValue('ضغط عمل')
    fireEvent.click(screen.getByTestId('tl-inbox-reject-r1'))
    await waitFor(() => expect(h.decide).toHaveBeenCalledWith({ id: 'r1', approve: false, note: 'ضغط عمل' }))
    p.mockReturnValue('موافق')
    fireEvent.click(screen.getByTestId('tl-inbox-approve-r1'))
    await waitFor(() => expect(h.decide).toHaveBeenCalledWith({ id: 'r1', approve: true, note: 'موافق' }))
  })
  it('تنبيهات الفريق وطلبات المدير نفسه', () => {
    render(<TeamLeavesPage />)
    fireEvent.click(screen.getByTestId('tl-tab-alerts'))
    expect(screen.getByTestId('tl-alerts-row-a1')).toHaveTextContent('تكرار تأخير'); expect(screen.getByTestId('tl-alerts-row-a1')).toHaveTextContent('4 / 3')
    fireEvent.click(screen.getByTestId('tl-tab-mine'))
    expect(screen.getByTestId('tl-balance-remaining')).toHaveTextContent('24.167')
    expect(screen.getByTestId('tl-form')).toBeInTheDocument()
  })
})

describe('بوابة HR — الإجازات والزمنيات', () => {
  it('لوحة + الطلبات + طلب نيابة عن موظف', async () => {
    h.requests = [REQ({ can_decide: false })] // الخادم يعيد can_decide=false لغير المدير المباشر
    render(<Leaves />)
    expect(screen.getByTestId('lv-dash-pending')).toHaveTextContent('1')
    expect(screen.getByTestId('lv-req-row-r1')).toHaveTextContent('أحمد') // المدير المباشر يظهر لـ HR
    expect(screen.queryByTestId('lv-req-approve-r1')).toBeNull() // HR لا يوافق (can_decide=false من الخادم)
    fireEvent.click(screen.getByTestId('lv-on-behalf'))
    fireEvent.change(screen.getByTestId('lv-behalf-emp'), { target: { value: 'e2' } })
    expect(screen.getByTestId('lv-behalf-balance-remaining')).toHaveTextContent('24.167')
    fireEvent.change(screen.getByTestId('lv-behalf-form-type'), { target: { value: 'annual' } })
    fireEvent.click(screen.getByTestId('lv-behalf-form-submit'))
    await waitFor(() => expect(h.request).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'e2', typeId: 'annual' })))
  })
  it('الأرصدة: تحديد المنحة السنوية، تسوية بسبب إلزامي، دفتر الحركات', () => {
    render(<Leaves />)
    fireEvent.click(screen.getByTestId('lv-tab-balances'))
    fireEvent.click(screen.getByTestId('bal-emp-E3'))
    expect(screen.getByText('بلا رقم بصمة — لا يُحتسب حضوره')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('bal-emp-E2'))
    expect(screen.getByTestId('bal-card-remaining')).toHaveTextContent('24.167')
    fireEvent.change(screen.getByTestId('bal-grant-days'), { target: { value: '35' } })
    fireEvent.click(screen.getByTestId('bal-grant-save'))
    expect(h.setGrant).toHaveBeenCalledWith({ employeeId: 'e2', year: new Date().getFullYear(), days: 35 })
    fireEvent.change(screen.getByTestId('bal-adj-days'), { target: { value: '-1' } })
    expect(screen.getByTestId('bal-adj-save')).toBeDisabled()
    fireEvent.change(screen.getByTestId('bal-adj-reason'), { target: { value: 'تصحيح خطأ' } })
    fireEvent.click(screen.getByTestId('bal-adj-save'))
    expect(h.adjust).toHaveBeenCalledWith({ employeeId: 'e2', year: new Date().getFullYear(), days: -1, reason: 'تصحيح خطأ' })
    expect(within(screen.getByTestId('bal-ledger')).getByTestId('ledger-permit')).toHaveTextContent('-0.333')
  })
  it('التنبيهات مع الإقرار', () => {
    render(<Leaves />)
    fireEvent.click(screen.getByTestId('lv-tab-alerts'))
    expect(screen.getByTestId('hr-alerts-row-a1')).toHaveTextContent('تأخر 4 أيام')
    expect(screen.getByTestId('hr-alerts-ack-a1')).toBeInTheDocument()
  })
})

describe('غرفة العمليات — الاستقطاع المقترح', () => {
  it('أعمدة النقص/الإضافي/المقترح + ملخص + إلغاء بسبب إلزامي', async () => {
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    expect(screen.getByTestId('ops-shortfall-E2-2026-09-02')).toHaveTextContent('30د')
    expect(screen.getByTestId('ops-proposed-E2-2026-09-02')).toHaveTextContent('1س 0د')
    expect(screen.getByTestId('ops-proposed-E2-2026-09-03')).toHaveTextContent('مُلغى: إجازة شفهية موثقة')
    expect(screen.getByTestId('ops-proposed-count')).toHaveTextContent('1')
    expect(screen.getByTestId('ops-proposed-waived')).toHaveTextContent('1')
    expect(screen.getByTestId('ops-proposed-days')).toHaveTextContent('0')
    const p = vi.spyOn(window, 'prompt').mockReturnValue('')
    fireEvent.click(screen.getByTestId('ops-waive-E2-2026-09-02'))
    expect(h.waive).not.toHaveBeenCalled()
    p.mockReturnValue('ظرف طارئ موثّق')
    fireEvent.click(screen.getByTestId('ops-waive-E2-2026-09-02'))
    await waitFor(() => expect(h.waive).toHaveBeenCalledWith({ employeeId: 'e2', date: '2026-09-02', waive: true, reason: 'ظرف طارئ موثّق' }))
    fireEvent.click(screen.getByTestId('ops-waive-E2-2026-09-03'))
    await waitFor(() => expect(h.waive).toHaveBeenCalledWith({ employeeId: 'e2', date: '2026-09-03', waive: false, reason: 'ظرف طارئ موثّق' }))
  })
})

describe('المالية — الاستقطاع التلقائي في الكشف', () => {
  it('عمود وبطاقة إجمالي', () => {
    render(<PayrollOverview />)
    expect(screen.getByTestId('ps-auto')).toHaveTextContent('54,000')
    expect(screen.getByTestId('ps-auto-E2')).toHaveTextContent('54,000'); expect(screen.getByTestId('ps-auto-E2')).toHaveTextContent('1 يوم + 60 د')
  })
})
