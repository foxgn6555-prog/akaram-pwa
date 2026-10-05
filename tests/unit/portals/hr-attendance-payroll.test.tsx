/**
 * صفحات نظام الحضور والرواتب (00142):
 *   HR: قائمة الموظفين (شارة راتب بلا أرقام) · ملف الموظف · الحضور (قراءة فقط) · اللوحة
 *   غرفة العمليات: الحضوريات — تعديل بسبب إلزامي، استقطاعات، تصدير الشهر وقفله
 *   المالية: كشف الشهر، تعديل بسبب، اعتماد، ملف الراتب، Excel
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'

const h = vi.hoisted(() => ({
  titles: [] as Array<{ id: string; name: string; code: string; department_id: string; department_name: string; drives_vehicles: boolean; is_active: boolean; employees_active: number }>,
  employees: [] as unknown[], attendance: [] as unknown[], attendanceFilters: null as unknown, exports: [] as unknown[], deductions: [] as unknown[], sheet: [] as unknown[],
  notices: [] as unknown[], profile: null as unknown, dashboard: null as unknown, unmatched: [] as unknown[], unmatchedFilters: null as unknown,
  edit: vi.fn(async () => undefined), reset: vi.fn(async () => undefined), addDed: vi.fn(async () => 'd'), exportMonth: vi.fn(async () => 'x'),
  adjust: vi.fn(async () => undefined), approve: vi.fn(async () => undefined), setSalary: vi.fn(async () => undefined), update: vi.fn(async () => undefined),
}))
const mut = (fn: (...a: never[]) => Promise<unknown>) => ({ mutate: (v: never) => void fn(v), mutateAsync: fn, isPending: false })

vi.mock('@features/branches', () => ({ useBranches: () => ({ data: [{ id: 'b1', name: 'فرع بغداد' }] }) }))
vi.mock('@features/departments', () => ({ useDepartments: () => ({ data: [{ id: 'd1', name: 'النقل', parent_id: null }, { id: 'd2', name: 'الورشة', parent_id: 'd1' }] }) }))
vi.mock('@features/hr/hooks/useHr', () => ({
  useHrShifts: () => ({ data: [{ id: 's1', name: 'صباحي', start_time: '08:00:00', end_time: '16:00:00', grace_minutes: 15, work_days: [0, 1, 2, 3, 4, 6], is_active: true }] }),
  useSaveShift: () => mut(async () => undefined), useShiftAssignments: () => ({ data: [{ id: 'a1', shift_id: 's1', effective_from: '2026-09-01', start_override: null, end_override: null, grace_override: null, note: null }] }),
  useAssignShift: () => mut(async () => 'a'),
  useHrEmployees: () => ({ data: h.employees, isLoading: false }), useHrEmployee: () => ({ data: h.employees[0], isLoading: false }),
  useCreateEmployee: () => mut(async () => 'e'), useUpdateEmployee: () => mut(h.update), useTerminateEmployee: () => mut(async () => undefined),
  useEmployeeDocuments: () => ({ data: [], isLoading: false }), useUploadDocument: () => mut(async () => undefined), useDeleteDocument: () => mut(async () => undefined),
  useHrLeaves: () => ({ data: [], isLoading: false }),
  useHrJobTitles: () => ({ data: h.titles ?? [], isLoading: false }),
  useAttendance: (f: unknown) => { h.attendanceFilters = f; return { data: h.attendance, isLoading: false } },
  useEvaluateAttendance: () => mut(async () => 0), useHrDashboard: () => ({ data: h.dashboard, isLoading: false }),
  useEditAttendance: () => mut(h.edit), useResetAttendance: () => mut(h.reset), useDeductions: () => ({ data: h.deductions, isLoading: false }),
  useAddDeduction: () => mut(h.addDed), useDeleteDeduction: () => mut(async () => undefined), useWaiveDeduction: () => mut(async () => undefined), useAttendanceAudit: () => ({ data: [{ id: 'l1', action: 'edit', reason: 'عطل جهاز', actor: 'u', before: { status: 'absent' }, after: { status: 'present' }, created_at: '2026-09-05T10:00:00Z' }], isLoading: false }),
  useMonthExports: () => ({ data: h.exports }), useExportRows: () => ({ data: [] }), useExportMonth: () => mut(h.exportMonth),
  usePayrollSheet: () => ({ data: h.sheet, isLoading: false }), useAdjustPayroll: () => mut(h.adjust), useApprovePayroll: () => mut(h.approve),
  useSalaryProfile: () => ({ data: h.profile, isLoading: false }), useSetSalary: () => mut(h.setSalary), useFinanceNotices: () => ({ data: h.notices, isLoading: false }), useMarkNoticeDone: () => mut(async () => undefined),
}))
const pushEmp = vi.fn()
vi.mock('@features/integrations', () => ({
  useBiometricPunches: (f: unknown) => { h.unmatchedFilters = f; return { data: h.unmatched, isLoading: false } },
  usePushEmployeeToDevices: () => ({ mutate: pushEmp, isPending: false }),
  useDevices: () => ({ data: [
    { id: 'dv1', serial_number: 'ZK-A', name: 'بصمة بغداد', branch_id: 'b1', is_active: true, mode: 'adms_push' },
    { id: 'dv2', serial_number: 'ZK-B', name: 'بصمة البصرة', branch_id: 'b2', is_active: true, mode: 'adms_push' },
    { id: 'dv3', serial_number: 'LAN-1', name: 'شبكة', branch_id: 'b1', is_active: true, mode: 'lan_pull' },
  ], isLoading: false }),
}))
vi.mock('@sdk/hr.sdk', async (orig) => ({ ...(await orig<Record<string, unknown>>()), hr: { signedUrl: async () => null } }))

import EmployeesList from '@portals/hr/pages/Employees/EmployeesList'
import EmployeeDetail from '@portals/hr/pages/Employees/EmployeeDetail'
import AttendanceLog from '@portals/hr/pages/Attendance/AttendanceLog'
import HRDashboard from '@portals/hr/pages/Dashboard/HRDashboard'
import OpsAttendancePage from '@portals/ops-room/pages/Attendance/OpsAttendancePage'
import PayrollOverview from '@portals/finance/pages/Payroll/PayrollOverview'
import { buildPayrollWorkbook } from '@features/hr/lib/payrollExcel'

const emp = { id: 'e1', employee_number: 'E100', full_name: 'أحمد علي حسن محمد', job_title: 'سائق', department_name: 'النقل', branch_name: 'فرع بغداد', shift_name: 'صباحي', contract_type: 'monthly', biometric_pin: '77', employment_status: 'active', salary_status: 'pending', department_id: 'd1', branch_id: 'b1', mother_name: 'فاطمة', gender: 'male', hire_date: '2026-01-01' }
const day = { id: 'r1', employee_id: 'e1', employee_number: 'E100', full_name: 'أحمد علي', department_name: 'النقل', branch_name: 'فرع بغداد', work_date: '2026-09-05', shift_name: 'صباحي', expected_in: '2026-09-05T05:00:00Z', expected_out: '2026-09-05T13:00:00Z', check_in: '2026-09-05T05:40:00Z', check_out: '2026-09-05T13:00:00Z', late_minutes: 25, early_minutes: 0, worked_minutes: 440, is_rest_day: false, status: 'late', source: 'auto', edit_reason: null }
const sheetRow = { row_id: 'pr1', export_id: 'x1', export_version: 1, export_status: 'exported', exported_at: '2026-10-01T08:00:00Z', employee_id: 'e1', employee_number: 'E100', full_name: 'أحمد علي', department_name: 'النقل', branch_name: 'بغداد', job_title: 'سائق', contract_type: 'monthly', pay_type: 'monthly', working_days: 26, days_present: 24, days_late: 3, days_absent: 1, days_incomplete: 0, days_leave: 1, late_minutes: 70, early_minutes: 0, ops_deduction_amount: 25000, ops_deduction_days: 0, ops_deduction_reasons: 'تأخر متكرر', base_salary: 800000, daily_rate: 0, allowances_total: 100000, fixed_deductions_total: 20000, proposed_net: 855000, final_net: null, finance_note: null }

beforeEach(() => { h.employees = [emp]; h.attendance = [day]; h.exports = []; h.deductions = []; h.sheet = [sheetRow]; h.notices = []; h.profile = null; h.unmatched = []; vi.clearAllMocks() })

describe('HR — بيانات الموظفين', () => {
  it('تعرض الموظف بشارة راتب «بانتظار المالية» بلا أي رقم، مع الفلاتر الخمسة ورابط الملف', () => {
    render(<MemoryRouter><EmployeesList /></MemoryRouter>)
    expect(screen.getByTestId('emp-row-E100')).toHaveTextContent('أحمد علي حسن محمد')
    expect(screen.getByTestId('salary-status')).toHaveTextContent('بانتظار المالية')
    expect(screen.getByTestId('emp-table').textContent).not.toMatch(/800|000|د\.ع/)
    for (const t of ['emp-search', 'emp-dept', 'emp-branch', 'emp-status', 'emp-shift']) expect(screen.getByTestId(t)).toBeInTheDocument()
    expect(screen.getByTestId('emp-link-E100')).toHaveAttribute('href', '/hr/employees/e1')
  })
  it('ملف الموظف: تبويبات خمسة، التعديل يرسل التغييرات فقط عبر hr_employee_update، والشفت الحالي في التاريخ', async () => {
    render(<MemoryRouter initialEntries={['/hr/employees/e1']}><Routes><Route path="/hr/employees/:employeeId" element={<EmployeeDetail />} /></Routes></MemoryRouter>)
    for (const t of ['data', 'docs', 'shift', 'attendance', 'leaves']) expect(screen.getByTestId(`etab-${t}`)).toBeInTheDocument()
    expect(screen.getByTestId('fld-mother_name')).toHaveTextContent('فاطمة')
    fireEvent.click(screen.getByTestId('edit-toggle'))
    fireEvent.change(screen.getByTestId('inp-phone'), { target: { value: '07901234567' } })
    fireEvent.click(screen.getByTestId('edit-save'))
    await waitFor(() => expect(h.update).toHaveBeenCalledWith({ id: 'e1', patch: { phone: '07901234567' } }))
    fireEvent.click(screen.getByTestId('etab-shift'))
    expect(screen.getByTestId('shift-hist-2026-09-01')).toHaveTextContent('صباحي')
    expect(screen.getByTestId('shift-hist-2026-09-01')).toHaveTextContent('الحالي')
    fireEvent.click(screen.getByTestId('etab-docs'))
    for (const t of ['photo', 'national_id_front', 'national_id_back', 'residence_front', 'residence_back', 'other']) expect(screen.getByTestId(`doc-slot-${t}`)).toBeInTheDocument()
  })
  it('00174: «إرسال إلى أجهزة البصمة» يرسل الموظف بمعرّفه ويعرض عدد الأجهزة؛ معطّل بلا رقم بصمة رقمي؛ مخفي للمنتهية خدمته', async () => {
    const { unmount } = render(<MemoryRouter initialEntries={['/hr/employees/e1']}><Routes><Route path="/hr/employees/:employeeId" element={<EmployeeDetail />} /></Routes></MemoryRouter>)
    const btn = screen.getByTestId('emp-push-devices')
    expect(btn).not.toBeDisabled()
    fireEvent.click(btn)
    // 00176: قائمة اختيار الأجهزة — أجهزة فرع الموظف (b1) محددة افتراضياً، وأجهزة غير ADMS لا تظهر
    expect(screen.getByTestId('emp-push-picker')).toBeInTheDocument()
    expect(screen.getByTestId('emp-push-dev-ZK-A')).toBeChecked()
    expect(screen.getByTestId('emp-push-dev-ZK-B')).not.toBeChecked()
    expect(screen.queryByTestId('emp-push-dev-LAN-1')).toBeNull()
    fireEvent.click(screen.getByTestId('emp-push-dev-ZK-B'))
    fireEvent.click(screen.getByTestId('emp-push-confirm'))
    expect(pushEmp).toHaveBeenCalledWith({ employeeId: 'e1', deviceIds: ['dv1', 'dv2'] }, expect.anything())
    pushEmp.mock.calls[0]![1].onSuccess(2)
    await waitFor(() => expect(screen.getByTestId('emp-push-msg')).toHaveTextContent('أُرسل إلى 2 جهاز'))
    unmount()
    h.employees = [{ ...emp, biometric_pin: 'AB-1' }]
    const r2 = render(<MemoryRouter initialEntries={['/hr/employees/e1']}><Routes><Route path="/hr/employees/:employeeId" element={<EmployeeDetail />} /></Routes></MemoryRouter>)
    expect(screen.getByTestId('emp-push-devices')).toBeDisabled()
    r2.unmount()
    h.employees = [{ ...emp, employment_status: 'terminated' }]
    render(<MemoryRouter initialEntries={['/hr/employees/e1']}><Routes><Route path="/hr/employees/:employeeId" element={<EmployeeDetail />} /></Routes></MemoryRouter>)
    expect(screen.queryByTestId('emp-push-devices')).toBeNull()
  })
  it('00153: المسمى يُختار من الهيكل (لا نص حر)، «بلا مسمى» يظهر تحذيراً، والحفظ يرسل job_title_id والقسم يُشتق', async () => {
    h.titles = [{ id: 't1', name: 'سائق كابسة', code: 'T1', department_id: 'd1', department_name: 'قسم الآليات', drives_vehicles: true, is_active: true, employees_active: 0 }]
    h.employees = [{ ...emp, job_title: null, job_title_id: null, is_driver: false }]
    render(<MemoryRouter initialEntries={['/hr/employees/e1']}><Routes><Route path="/hr/employees/:employeeId" element={<EmployeeDetail />} /></Routes></MemoryRouter>)
    expect(screen.getByTestId('no-title')).toHaveTextContent('بلا مسمى')
    fireEvent.click(screen.getByTestId('edit-toggle'))
    expect(screen.queryByTestId('inp-job_title')).toBeNull()
    fireEvent.change(screen.getByTestId('edit-title'), { target: { value: 't1' } })
    expect(screen.getByTestId('fld-department_id')).toHaveTextContent('يُشتق من المسمى')
    fireEvent.click(screen.getByTestId('edit-save'))
    await waitFor(() => expect(h.update).toHaveBeenCalledWith({ id: 'e1', patch: { job_title_id: 't1' } }))
  })
  it('00153: قائمة الموظفين تُعلّم «بلا مسمى» وتُظهر شارة السائق', () => {
    h.employees = [{ ...emp, job_title: null }, { ...emp, id: 'e2', employee_number: 'E200', full_name: 'حسن', job_title: 'سائق كابسة', is_driver: true }]
    render(<MemoryRouter><EmployeesList /></MemoryRouter>)
    expect(screen.getByTestId('emp-no-title-E100')).toBeInTheDocument()
    expect(screen.queryByTestId('emp-no-title-E200')).toBeNull()
    expect(screen.getByTestId('emp-row-E200')).toHaveTextContent('🚛')
  })
})

describe('HR — الحضور والانصراف (قراءة فقط)', () => {
  it('تعرض الصف بدقائق التأخير والحالة بلا أي زر تعديل، وتمرر الفلاتر إلى RPC', () => {
    render(<MemoryRouter><AttendanceLog /></MemoryRouter>)
    const row = screen.getByTestId('att-row-E100-2026-09-05')
    expect(row).toHaveTextContent('25د'); expect(within(row).getByTestId('att-status')).toHaveAttribute('data-status', 'late')
    expect(within(row).queryByText('تعديل')).toBeNull()
    fireEvent.change(screen.getByTestId('att-dept'), { target: { value: 'd2' } })
    expect(h.attendanceFilters).toMatchObject({ departmentId: 'd2' })
    fireEvent.click(screen.getByTestId('att-stat-absent'))
    expect(h.attendanceFilters).toMatchObject({ status: 'absent' })
  })
  it('البصمات غير المطابقة تظهر في لوحة خاصة (يوم × PIN) حتى بلا سجلات حضور، مع عدّاد ورابط الربط', () => {
    h.attendance = []
    h.unmatched = [
      { id: 'u1', device_serial: 'SFAA1', pin: '373', employee_id: null, punched_at: '2026-10-04T15:03:00Z', direction: 'in', person_name: null, method: 'adms_push', device_user_name: null },
      { id: 'u2', device_serial: 'SFAA1', pin: '373', employee_id: null, punched_at: '2026-10-04T15:40:00Z', direction: 'in', person_name: null, method: 'adms_push', device_user_name: 'كريم' },
      { id: 'u3', device_serial: 'SFAA1', pin: '12', employee_id: null, punched_at: '2026-10-03T05:00:00Z', direction: 'in', person_name: null, method: 'adms_push', device_user_name: null },
    ]
    render(<MemoryRouter><AttendanceLog /></MemoryRouter>)
    expect(h.unmatchedFilters).toMatchObject({ unmatchedOnly: true })
    expect(screen.getByTestId('unmatched-count')).toHaveTextContent('3')
    expect(screen.queryByTestId('unmatched-table')).toBeNull()
    fireEvent.click(screen.getByTestId('unmatched-toggle'))
    const rows = screen.getAllByTestId(/^unmatched-row-/)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('373'); expect(rows[0]).toHaveTextContent('كريم'); expect(rows[0]).toHaveTextContent('2')
    expect(within(rows[0]!).getByTestId('unmatched-link-373')).toHaveAttribute('href', '/hr/biometric')
    expect(screen.getByText('لا سجلات حضور في هذا النطاق')).toBeInTheDocument()
  })
  it('لا تظهر لوحة غير المطابقة عندما لا توجد بصمات غير مطابقة', () => {
    render(<MemoryRouter><AttendanceLog /></MemoryRouter>)
    expect(screen.queryByTestId('unmatched-panel')).toBeNull()
  })
  it('اللوحة تعرض البطاقات الحية (ملاك/تعيينات/إنهاءات/حضور اليوم/رواتب معلقة/بصمات غير مطابقة)', () => {
    h.dashboard = { employees_active: 40, employees_terminated: 3, hired_this_month: 2, terminated_this_month: 1, by_department: [{ name: 'النقل', count: 30 }], by_branch: [{ name: 'بغداد', count: 40 }], today: { present: 30, late: 5, absent: 3, incomplete: 2, leave: 0 }, leaves_today: 1, salary_pending: 4, unmatched_punches: 7, shifts: [{ name: 'صباحي', count: 40 }] }
    render(<MemoryRouter><HRDashboard /></MemoryRouter>)
    expect(screen.getByTestId('d-active')).toHaveTextContent('40'); expect(screen.getByTestId('d-hired')).toHaveTextContent('2'); expect(screen.getByTestId('d-terminated')).toHaveTextContent('1')
    expect(screen.getByTestId('d-late')).toHaveTextContent('5'); expect(screen.getByTestId('d-salary-pending')).toHaveTextContent('4'); expect(screen.getByTestId('d-unmatched')).toHaveTextContent('7')
    expect(screen.getByTestId('d-by-dept')).toHaveTextContent('النقل')
  })
})

describe('غرفة العمليات — الحضوريات', () => {
  it('لوحة غير المطابقة تظهر في حضوريات غرفة العمليات أيضاً', () => {
    h.unmatched = [{ id: 'u1', device_serial: 'SFAA1', pin: '373', employee_id: null, punched_at: '2026-10-04T15:03:00Z', direction: 'in', person_name: null, method: 'adms_push', device_user_name: null }]
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    expect(screen.getByTestId('unmatched-count')).toHaveTextContent('1')
  })
  it('التعديل يرفض بلا سبب ثم يرسل employeeId/date/الحالة/السبب', async () => {
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('ops-edit-E100-2026-09-05'))
    fireEvent.click(screen.getByTestId('e-save'))
    expect(screen.getByTestId('e-error')).toBeInTheDocument(); expect(h.edit).not.toHaveBeenCalled()
    fireEvent.change(screen.getByTestId('e-status'), { target: { value: 'present' } })
    fireEvent.change(screen.getByTestId('e-reason'), { target: { value: 'تأكيد من مسؤول القسم' } })
    fireEvent.click(screen.getByTestId('e-save'))
    await waitFor(() => expect(h.edit).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'e1', date: '2026-09-05', status: 'present', reason: 'تأكيد من مسؤول القسم' })))
  })
  it('الاستقطاع اليدوي بالأيام يرسل days والمبلغ صفراً مع السبب', async () => {
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('ops-deduct-E100'))
    fireEvent.change(screen.getByTestId('d-value'), { target: { value: '2' } })
    fireEvent.change(screen.getByTestId('d-reason'), { target: { value: 'غياب بلا عذر' } })
    fireEvent.click(screen.getByTestId('d-save'))
    await waitFor(() => expect(h.addDed).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'e1', amount: 0, days: 2, reason: 'غياب بلا عذر' })))
  })
  it('سجل التدقيق يعرض السبب والفرق قبل/بعد', () => {
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('ops-audit-E100-2026-09-05'))
    expect(screen.getByTestId('audit-list')).toHaveTextContent('عطل جهاز'); expect(screen.getByTestId('audit-list')).toHaveTextContent('status: absent → present')
  })
  it('تصدير الشهر يطلب تأكيداً ويستدعي ops_month_export؛ وبعد اعتماد المالية يُقفل الزر والتعديل', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { unmount } = render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('ops-export-month'))
    await waitFor(() => expect(h.exportMonth).toHaveBeenCalledTimes(1))
    unmount()
    const month = new Date(); const m = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-01`
    h.exports = [{ id: 'x', period_month: m, version: 2, status: 'approved', rows_count: 40, exported_at: '2026-10-01T00:00:00Z', approved_at: '2026-10-02T00:00:00Z' }]
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    expect(screen.getByTestId('ops-export-month')).toBeDisabled(); expect(screen.getByTestId('ops-export-month')).toHaveTextContent('مقفل')
    expect(screen.getByTestId('ops-edit-E100-2026-09-05')).toBeDisabled()
  })
})

describe('المالية — الرواتب', () => {
  it('كشف الشهر يعرض الأيام/الاستقطاعات/الصافي المقترح، والتعديل يتطلب سبباً، والاعتماد يستدعي approve بمعرّف التصدير', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<PayrollOverview />)
    const row = screen.getByTestId('ps-row-E100')
    expect(row).toHaveTextContent('24'); expect(row).toHaveTextContent('855'); expect(row).toHaveTextContent('25')
    fireEvent.click(screen.getByTestId('ps-edit-E100'))
    fireEvent.change(screen.getByTestId('adj-net'), { target: { value: '900000' } })
    fireEvent.click(screen.getByTestId('adj-save'))
    expect(h.adjust).not.toHaveBeenCalled()
    fireEvent.change(screen.getByTestId('adj-note'), { target: { value: 'مكافأة أداء' } })
    fireEvent.click(screen.getByTestId('adj-save'))
    await waitFor(() => expect(h.adjust).toHaveBeenCalledWith({ rowId: 'pr1', finalNet: 900000, note: 'مكافأة أداء' }))
    fireEvent.click(screen.getByTestId('ps-approve'))
    await waitFor(() => expect(h.approve).toHaveBeenCalledWith('x1'))
  })
  it('ملف الراتب: الشهري يتطلب أساسياً، واليومي يرسل daily وأصفاراً للأساسي مع المخصصات', async () => {
    render(<PayrollOverview />)
    fireEvent.click(screen.getByTestId('ftab-profiles'))
    fireEvent.click(screen.getByTestId('pr-emp-E100'))
    fireEvent.click(screen.getByTestId('sf-save'))
    expect(screen.getByTestId('sf-error')).toHaveTextContent('الأساسي'); expect(h.setSalary).not.toHaveBeenCalled()
    fireEvent.change(screen.getByTestId('sf-type'), { target: { value: 'daily' } })
    fireEvent.change(screen.getByTestId('sf-daily'), { target: { value: '30000' } })
    fireEvent.click(screen.getByTestId('sf-allow-add'))
    fireEvent.change(screen.getByTestId('sf-allow-k-0'), { target: { value: 'نقل' } }); fireEvent.change(screen.getByTestId('sf-allow-v-0'), { target: { value: '50000' } })
    fireEvent.click(screen.getByTestId('sf-save'))
    await waitFor(() => expect(h.setSalary).toHaveBeenCalledWith({ employeeId: 'e1', payType: 'daily', base: 0, daily: 30000, allowances: { نقل: 50000 }, fixedDeductions: {}, notes: '' }))
  })
  it('إشعارات HR: تسوية نهاية خدمة تعرض النوع وآخر يوم', () => {
    h.notices = [{ id: 'n1', employee_id: 'e1', kind: 'termination_settlement', payload: { type: 'dismissal', last_day: '2026-09-30', reason: 'مخالفة' }, is_done: false, created_at: '2026-09-20T00:00:00Z', employees: { full_name: 'أحمد', employee_number: 'E100', contract_type: 'monthly' } }]
    render(<PayrollOverview />)
    fireEvent.click(screen.getByTestId('ftab-notices'))
    expect(screen.getByTestId('notice-termination_settlement-E100')).toHaveTextContent('فصل'); expect(screen.getByTestId('notice-termination_settlement-E100')).toHaveTextContent('2026-09-30')
  })
  it('Excel: ورقة RTL بترويسة، صف لكل موظف، صف إجمالي بمعادلات، وعنوان يميز المعتمد', async () => {
    const wb = await buildPayrollWorkbook('2026-09-01', [sheetRow as never, { ...sheetRow, row_id: 'pr2', employee_number: 'E101', full_name: 'سارة', pay_type: 'daily', daily_rate: 30000, proposed_net: 720000, final_net: 700000, finance_note: 'سلفة' } as never])
    const ws = wb.worksheets[0]!
    expect(ws.views[0]).toMatchObject({ rightToLeft: true })
    expect(String(ws.getCell('A1').value)).toContain('مسودة')
    expect(ws.getRow(4).getCell(3).value).toBe('الاسم')
    expect(ws.getRow(5).getCell(3).value).toBe('أحمد علي'); expect(ws.getRow(5).getCell(24).value).toBe(855000)
    expect(ws.getRow(6).getCell(25).value).toBe(700000); expect(ws.getRow(6).getCell(7).value).toBe('أجر يومي')
    expect((ws.getRow(7).getCell(25).value as { formula: string }).formula).toBe('SUM(Y5:Y6)')
    const approvedWb = await buildPayrollWorkbook('2026-09-01', [{ ...sheetRow, export_status: 'approved' } as never])
    expect(String(approvedWb.worksheets[0]!.getCell('A1').value)).toContain('معتمد')
  })
})
