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
  days: [] as unknown[], employees: [] as unknown[], attendance: [] as unknown[], attendanceFilters: null as unknown, exports: [] as unknown[], deductions: [] as unknown[], sheet: [] as unknown[],
  notices: [] as unknown[], profile: null as unknown, dashboard: null as unknown, unmatched: [] as unknown[], unmatchedFilters: null as unknown,
  exportStatus: null as unknown, monthDeductions: [] as unknown[],
  conf: null as unknown, grid: [] as unknown[], confirmMonth: vi.fn(async () => ({ confirm_count: 1 })), reopenMonth: vi.fn(async () => ({})),
  edit: vi.fn(async () => undefined), reset: vi.fn(async () => undefined), addDed: vi.fn(async () => 'd'), exportMonth: vi.fn(async () => 'x'),
  adjust: vi.fn(async () => undefined), approve: vi.fn(async () => undefined), evaluateMonth: vi.fn(async () => 30), setSalary: vi.fn(async () => undefined), update: vi.fn(async () => undefined),
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
  useMonthExportStatus: () => ({ data: h.exportStatus }),
  useAttendanceConfirmation: () => ({ data: h.conf }), useAttendanceGrid: () => ({ data: h.grid, isLoading: false }), useConfirmAttendanceMonth: () => mut(h.confirmMonth), useReopenAttendanceMonth: () => mut(h.reopenMonth), useEmployeeMonthDeductions: () => ({ data: h.monthDeductions ?? [], isLoading: false }), useEvaluateMonth: () => mut(h.evaluateMonth),
  usePayrollSheet: () => ({ data: h.sheet, isLoading: false }), useEmployeeMonthDays: () => ({ data: h.days ?? [], isLoading: false }), useAdjustPayroll: () => mut(h.adjust), useApprovePayroll: () => mut(h.approve),
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
vi.mock('@sdk/hr.sdk', async (orig) => ({ ...(await orig<Record<string, unknown>>()), hr: { signedUrl: async () => null, listDeductions: async () => [] } }))

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

beforeEach(() => { h.employees = [emp]; h.attendance = [day]; h.exports = []; h.deductions = []; h.sheet = [sheetRow]; h.notices = []; h.profile = null; h.unmatched = []; h.exportStatus = null; h.monthDeductions = []; h.conf = null; h.grid = []; vi.clearAllMocks() })
/** 00193: حالة اعتماد الحضورية — معتمد وجاهز للتصدير */
const confirmedConf = { month: '2026-09-01', status: 'confirmed', confirmed: true, confirmed_at: '2026-10-01T08:00:00Z', confirmed_by_name: 'مدقق الحضور', confirm_count: 1, reopened_at: null, reopened_by_name: null, reopen_reason: null, pending_auto: 0, pending_days: [], deductions_after: 0, unevaluated_days: 0, employees: 1, locked: false, required: true, export: {}, snapshot: {}, can_export: true }

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
  it('00178: تنبيه تبليغ التطوير المركزية يظهر في لوحتي التعديل والاستقطاع', () => {
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('ops-edit-E100-2026-09-05'))
    expect(screen.getByTestId('it-notify-notice')).toHaveTextContent('سيتم تبليغ وحدة التطوير المركزية')
  })
  it('00178: أوقات التعديل تُعرض وتُحفظ بتوقيت بغداد بأرقام إنكليزية مهما كان توقيت المتصفح', async () => {
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('ops-edit-E100-2026-09-05'))
    // 05:40Z = 08:40 بغداد
    expect((screen.getByTestId('e-in') as HTMLInputElement).value).toBe('08:40')
    fireEvent.change(screen.getByTestId('e-out'), { target: { value: '15:52' } })
    fireEvent.change(screen.getByTestId('e-reason'), { target: { value: 'بصمة الخروج لم تُسجَّل' } })
    fireEvent.click(screen.getByTestId('e-save'))
    await waitFor(() => expect(h.edit).toHaveBeenCalledWith(expect.objectContaining({ checkIn: '2026-09-05T05:40:00.000Z', checkOut: '2026-09-05T12:52:00.000Z' })))
  })
  it('00178: الجدول يعرض الأوقات بأرقام إنكليزية (لا ٠-٩)', () => {
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    const row = screen.getByTestId('ops-edit-E100-2026-09-05').closest('tr') as HTMLElement
    expect(row.textContent).toMatch(/08:40/)
    expect(row.textContent).not.toMatch(/[\u0660-\u0669]/)
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
  it('تصدير الشهر (من الكشف المعتمد فقط) يطلب تأكيداً ويستدعي ops_month_export؛ وبعد اعتماد المالية يُقفل الزر والتعديل', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    h.conf = confirmedConf
    const { unmount } = render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    expect(screen.queryByTestId('ops-export-month')).toBeNull()   // لا زر تصدير في المرحلة 1
    fireEvent.click(screen.getByTestId('stage-approved'))
    fireEvent.click(screen.getByTestId('ops-export-month'))
    await waitFor(() => expect(h.exportMonth).toHaveBeenCalledTimes(1))
    unmount()
    h.conf = { ...confirmedConf, locked: true, can_export: false }
    const month = new Date(); const m = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-01`
    h.exports = [{ id: 'x', period_month: m, version: 2, status: 'approved', rows_count: 40, exported_at: '2026-10-01T00:00:00Z', approved_at: '2026-10-02T00:00:00Z' }]
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    expect(screen.getByTestId('ops-edit-E100-2026-09-05')).toBeDisabled()
    fireEvent.click(screen.getByTestId('stage-approved'))
    expect(screen.getByTestId('ops-export-month')).toBeDisabled(); expect(screen.getByTestId('ops-export-month')).toHaveTextContent('مقفل')
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
    await waitFor(() => expect(h.approve).toHaveBeenCalledWith({ exportId: 'x1', force: false }))
  })
  it('00179: الكشف مجمّع حسب القسم مع مجاميع فرعية مرتبة، و«الأيام» تفتح تفاصيل الموظف بتوقيت بغداد', () => {
    h.sheet = [sheetRow, { ...sheetRow, row_id: 'pr2', employee_id: 'e2', employee_number: 'E200', full_name: 'باسم كريم', department_name: 'الورشة', proposed_net: 500000 }, { ...sheetRow, row_id: 'pr3', employee_id: 'e3', employee_number: 'E300', full_name: 'آدم سعد', department_name: 'النقل', proposed_net: 600000 }]
    h.days = [{ work_date: '2026-09-05', shift_name: 'صباحي', check_in: '2026-09-05T05:40:00Z', check_out: '2026-09-05T13:00:00Z', late_minutes: 25, early_minutes: 0, worked_minutes: 440, is_rest_day: false, status: 'late', source: 'manual', edit_reason: 'عطل جهاز', permit_minutes: 0, shortfall_minutes: 40, overtime_minutes: 0, proposed_deduction_minutes: 120, proposed_deduction_days: 0, deduction_waived: false, waive_reason: null }]
    render(<MemoryRouter><PayrollOverview /></MemoryRouter>)
    const groups = screen.getAllByTestId(/^ps-group-/)
    expect(groups.map((g) => g.getAttribute('data-testid'))).toEqual(['ps-group-النقل', 'ps-group-الورشة'])
    const rowsInNaql = screen.getAllByTestId(/^ps-row-/).map((r) => r.getAttribute('data-testid'))
    expect(rowsInNaql.indexOf('ps-row-E100')).toBeLessThan(rowsInNaql.indexOf('ps-row-E300')) // 00184: داخل القسم بالرقم الوظيفي (E100 قبل E300) لا بالاسم
    expect(screen.getByTestId('ps-subtotal-النقل')).toHaveTextContent('1,455,000')
    fireEvent.click(screen.getByTestId('ps-days-E100'))
    const d = screen.getByTestId('ps-day-2026-09-05')
    expect(d).toHaveTextContent('08:40'); expect(d).toHaveTextContent('16:00'); expect(d).toHaveTextContent('متأخر'); expect(d).toHaveTextContent('تعديل يدوي: عطل جهاز'); expect(d).toHaveTextContent('2س 0د')
    expect(d.textContent).not.toMatch(/[\u0660-\u0669]/)
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
    expect(ws.getRow(5).getCell(3).value).toBe('أحمد علي'); expect(ws.getRow(5).getCell(33).value).toBe(855000)
    expect(ws.getRow(6).getCell(34).value).toBe(700000); expect(ws.getRow(6).getCell(7).value).toBe('أجر يومي')
    expect((ws.getRow(7).getCell(34).value as { formula: string }).formula).toBe('SUM(AH5:AH6)')
    const approvedWb = await buildPayrollWorkbook('2026-09-01', [{ ...sheetRow, export_status: 'approved' } as never])
    expect(String(approvedWb.worksheets[0]!.getCell('A1').value)).toContain('معتمد')
    // 00179: ورقة ملخص الأقسام
    const ds = wb.getWorksheet('ملخص الأقسام')!
    expect(ds).toBeTruthy(); expect(ds.getRow(2).getCell(1).value).toBe('القسم'); expect(ds.getRow(3).getCell(1).value).toBe('النقل')
  })
})

describe('00185 — سلامة سلسلة الكشوفات → الحضورية → المالية', () => {
  const stale = { export_id: 'x1', version: 1, status: 'exported', exported_at: '2026-10-01T08:00:00Z', changes_after: 3, deductions_after: 2, disclosure_deductions_after: 1, needs_reexport: true }
  it('الحضوريات: لافتة «يلزم إعادة التصدير» بزر فوري، واستقطاع الكشف المعتمد بلا زر حذف ومع رابط للكشف', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    h.exportStatus = stale
    h.conf = confirmedConf
    h.deductions = [
      { id: 'dd1', employee_id: 'e1', period_month: '2026-09-01', amount: 7000, days: 0, reason: 'كشف ك/2026/0003 — غياب (2026-09-05)', created_at: '2026-10-02T09:00:00Z', source_disclosure_id: 'disc-1', employees: { full_name: 'أحمد', employee_number: 'E100' }, disclosure: { ref_no: 'ك/2026/0003' } },
      { id: 'dd2', employee_id: 'e1', period_month: '2026-09-01', amount: 1000, days: 0, reason: 'يدوي', created_at: '2026-10-02T09:00:00Z', source_disclosure_id: null, employees: { full_name: 'أحمد', employee_number: 'E100' }, disclosure: null },
    ]
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('stage-approved'))
    const banner = screen.getByTestId('ops-reexport-banner')
    expect(banner).toHaveTextContent('3 تغييرات'); expect(banner).toHaveTextContent('2 استقطاعات'); expect(banner).toHaveTextContent('1 من كشوفات معتمدة')
    expect(banner.textContent).not.toMatch(/[\u0660-\u0669]/)
    fireEvent.click(screen.getByTestId('ops-reexport-now'))
    await waitFor(() => expect(h.exportMonth).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByTestId('stage-detailed'))
    fireEvent.click(screen.getByTestId('panel-deductions'))
    expect(screen.getByTestId('ded-locked-dd1')).toHaveTextContent('من كشف معتمد')
    expect(screen.queryByTestId('ded-del-dd1')).toBeNull()
    expect(screen.getByTestId('ded-src-dd1')).toHaveAttribute('href', '/ops-room/disclosures?tab=archive&id=disc-1')
    // 00193: الشهر معتمد ⇒ حتى اليدوي لا يُحذف قبل إعادة الفتح
    expect(screen.queryByTestId('ded-del-dd2')).toBeNull()
  })
  it('الحضوريات: لا لافتة عندما لا تغييرات بعد التصدير', () => {
    h.exportStatus = { ...stale, changes_after: 0, deductions_after: 0, disclosure_deductions_after: 0, needs_reexport: false }
    h.conf = confirmedConf
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('stage-approved'))
    expect(screen.queryByTestId('ops-reexport-banner')).toBeNull()
  })
  it('المالية: لافتة الكشف القديم، والاعتماد يطلب تأكيداً إضافياً ويمرّر force=true؛ ورفض التأكيد يمنع الاعتماد', async () => {
    h.exportStatus = stale
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { unmount } = render(<PayrollOverview />)
    expect(screen.getByTestId('ps-stale-banner')).toHaveTextContent('3 تغييرات')
    fireEvent.click(screen.getByTestId('ps-approve'))
    expect(confirm.mock.calls[0]![0]).toMatch(/غير مشمولة/)
    expect(h.approve).not.toHaveBeenCalled()
    unmount()
    confirm.mockReturnValue(true)
    render(<PayrollOverview />)
    fireEvent.click(screen.getByTestId('ps-approve'))
    await waitFor(() => expect(h.approve).toHaveBeenCalledWith({ exportId: 'x1', force: true }))
  })
  it('المالية: تفاصيل الموظف تعرض استقطاعات غرفة العمليات مع مرجع الكشف المعتمد', () => {
    h.monthDeductions = [{ id: 'md1', amount: 7000, days: 0, reason: 'كشف ك/2026/0003 — غياب', created_at: '2026-10-02T09:00:00Z', created_by_name: 'المدير المفوض', source_disclosure_id: 'disc-1', disclosure_ref: 'ك/2026/0003', disclosure_type: 'غياب', disclosure_date: '2026-09-05' }]
    render(<MemoryRouter><PayrollOverview /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('ps-days-E100'))
    const item = screen.getByTestId('ps-ded-item-md1')
    expect(item).toHaveTextContent('7,000'); expect(item).toHaveTextContent('كشف ك/2026/0003 · غياب · 2026-09-05'); expect(item).toHaveTextContent('المدير المفوض')
  })
  it('Excel: ورقة «تفاصيل الاستقطاعات» تميّز استقطاع الكشف المعتمد عن اليدوي وتجمع المبالغ', async () => {
    const deds = [
      { id: 'dd1', employee_id: 'e1', period_month: '2026-09-01', amount: 7000, days: 0, reason: 'كشف', created_at: '2026-10-02T09:00:00Z', source_disclosure_id: 'disc-1', employees: { full_name: 'أحمد', employee_number: 'E100' }, disclosure: { ref_no: 'ك/2026/0003' } },
      { id: 'dd2', employee_id: 'e2', period_month: '2026-09-01', amount: 1000, days: 0, reason: 'يدوي', created_at: '2026-10-02T09:00:00Z', source_disclosure_id: null, employees: { full_name: 'باسم', employee_number: 'E050' }, disclosure: null },
    ]
    const wb = await buildPayrollWorkbook('2026-09-01', [sheetRow as never], deds as never)
    const xs = wb.getWorksheet('تفاصيل الاستقطاعات')!
    expect(xs).toBeTruthy()
    expect(xs.getRow(3).getCell(2).value).toBe('E050'); expect(xs.getRow(3).getCell(8).value).toBe('يدوي (غرفة العمليات)')
    expect(xs.getRow(4).getCell(2).value).toBe('E100'); expect(xs.getRow(4).getCell(8).value).toBe('كشف معتمد'); expect(xs.getRow(4).getCell(9).value).toBe('ك/2026/0003')
    expect((xs.getRow(5).getCell(5).value as { formula: string }).formula).toBe('SUM(E3:E4)')
    const wb2 = await buildPayrollWorkbook('2026-09-01', [sheetRow as never])
    expect(wb2.getWorksheet('تفاصيل الاستقطاعات')).toBeUndefined()
  })
})

describe('00186 — اكتمال دورة الرواتب (سيناريو المستخدم: راتب 100,000 · حاضر 3 · صافٍ 90,000)', () => {
  const krar = { ...sheetRow, row_id: 'pk', employee_id: 'ek', employee_number: 'F-0000000001', full_name: 'كرار يوسف عبدعلي', department_name: 'الأشغال والخدمات', pay_type: 'monthly', base_salary: 100000, allowances_total: 0, fixed_deductions_total: 0,
    working_days: 5, days_present: 3, days_absent: 0, days_incomplete: 2, days_leave: 0, late_minutes: 1403, ops_deduction_amount: 0, ops_deduction_days: 0, auto_deduction_minutes: 0, auto_deduction_days: 3, auto_absence_days: 0, auto_shortfall_days: 3, auto_deduction_amount: 10000,
    gross_amount: 100000, deductions_total: 10000, proposed_net: 90000, final_net: null, scheduled_days: 30, unevaluated_days: 25, shift_minutes: 480 }
  it('المالية: الكشف غير المكتمل يُعلَّم بوضوح (25 يوم غير محتسب) ولافتة تحذير، والمعادلة تشرح الأرقام', () => {
    h.sheet = [krar]
    render(<MemoryRouter><PayrollOverview /></MemoryRouter>)
    expect(screen.getByTestId('ps-unevaluated-banner')).toHaveTextContent('25 يوم عمل غير محتسب')
    expect(screen.getByTestId('ps-days-count-F-0000000001')).toHaveTextContent('30 / 5'); expect(screen.getByTestId('ps-days-count-F-0000000001')).toHaveTextContent('25 غير محتسب')
    fireEvent.click(screen.getByTestId('ps-days-F-0000000001'))
    const f = screen.getByTestId('ps-formula')
    expect(f).toHaveTextContent('100,000 ÷ 30 = 3,333.33'); expect(f).toHaveTextContent('3 يوم'); expect(f).toHaveTextContent('= 90,000'); expect(f).toHaveTextContent('غير نهائي: 25 يوم غير محتسب')
    expect(f.textContent).not.toMatch(/[\u0660-\u0669]/)
  })
  it('المالية: الكشف المكتمل بعد إعادة التصدير — لا تحذير، غياب 25، والصافي الحقيقي', () => {
    h.sheet = [{ ...krar, working_days: 30, days_absent: 25, unevaluated_days: 0, auto_deduction_days: 28, auto_absence_days: 25, auto_deduction_amount: 93333.33, deductions_total: 93333.33, proposed_net: 6666.67 }]
    render(<MemoryRouter><PayrollOverview /></MemoryRouter>)
    expect(screen.queryByTestId('ps-unevaluated-banner')).toBeNull()
    expect(screen.getByTestId('ps-days-count-F-0000000001')).toHaveTextContent('30 / 30')
    expect(screen.getByTestId('ps-row-F-0000000001')).toHaveTextContent('6,667')
  })
  it('الحضوريات: لافتة الأيام غير المحتسبة بزر «احتساب الشهر كاملاً»', async () => {
    h.exportStatus = { export_id: null, status: null, changes_after: 0, deductions_after: 0, disclosure_deductions_after: 0, needs_reexport: false, unevaluated_days: 25, unevaluated_employees: 1 }
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    const b = screen.getByTestId('ops-unevaluated-banner')
    expect(b).toHaveTextContent('25 يوم عمل غير محتسب'); expect(b).toHaveTextContent('1 موظف')
    fireEvent.click(screen.getByTestId('ops-evaluate-month'))
    await waitFor(() => expect(h.evaluateMonth).toHaveBeenCalledTimes(1))
  })
  it('Excel: أعمدة «أيام مجدولة / محتسبة / غير محتسب» وتظليل غير المحتسب', async () => {
    const wb = await buildPayrollWorkbook('2026-09-01', [krar as never])
    const ws = wb.worksheets[0]!
    const headers = (ws.getRow(4).values as unknown[]).slice(1) as string[]
    const i = (h2: string) => headers.indexOf(h2) + 1
    expect(ws.getRow(5).getCell(i('أيام مجدولة')).value).toBe(30); expect(ws.getRow(5).getCell(i('أيام محتسبة')).value).toBe(5); expect(ws.getRow(5).getCell(i('غير محتسب')).value).toBe(25)
    expect(ws.getRow(5).getCell(i('غير محتسب')).fill).toMatchObject({ fgColor: { argb: 'FFFEE2E2' } })
    expect(ws.getRow(5).getCell(i('الصافي المقترح')).value).toBe(90000)
  })
})

describe('00187 — الشهر الجزئي بالنسبة والتناسب (سيناريو المستخدم: راتب 500,000 · تصدير بعد 5 أيام)', () => {
  const partial = { ...sheetRow, row_id: 'pp', employee_id: 'ep', employee_number: 'F-0000000002', full_name: 'مرتضى جزيرة', pay_type: 'monthly', base_salary: 500000, allowances_total: 0, fixed_deductions_total: 0,
    working_days: 5, scheduled_days: 5, unevaluated_days: 0, days_present: 2, days_absent: 3, days_late: 0, days_incomplete: 0, days_leave: 0, days_leave_paid: 0, days_leave_unpaid: 0, late_minutes: 0, shift_minutes: 480,
    ops_deduction_amount: 0, ops_deduction_days: 0, ops_deduction_days_amount: 0, auto_deduction_minutes: 0, auto_deduction_days: 3, auto_absence_days: 3, auto_shortfall_days: 0, auto_deduction_amount: 50000,
    period_from: '2026-10-01', period_to: '2026-10-05', covered_days: 5, days_in_month: 31, day_rate: 16666.6667, proration_ratio: 0.166667, auto_deduction_capped: false,
    gross_amount: 83333.33, deductions_total: 50000, proposed_net: 33333.33, final_net: null } as never
  it('المالية: شارة «مشمول 5/31» والمعادلة تُظهر الفترة المشمولة × أجر اليوم = 83,333 والصافي 33,333', () => {
    h.sheet = [partial]
    render(<MemoryRouter><PayrollOverview /></MemoryRouter>)
    expect(screen.getByTestId('ps-days-count-F-0000000002')).toHaveTextContent('مشمول 5/31')
    fireEvent.click(screen.getByTestId('ps-days-F-0000000002'))
    const f = screen.getByTestId('ps-formula')
    expect(f).toHaveTextContent('500,000 ÷ 30 = 16,666.67')
    expect(f).toHaveTextContent('الفترة المشمولة 5 من 31 يوم (2026-10-01 → 2026-10-05) × أجر اليوم 16,666.67 = 83,333.33')
    expect(screen.getByTestId('ps-prorated')).toBeInTheDocument()
    expect(f).toHaveTextContent('= 83,333'); expect(f).toHaveTextContent('− 50,000 = 33,333')
    expect(screen.queryByTestId('ps-auto-capped')).toBeNull()
    expect(f.textContent).not.toMatch(/[\u0660-\u0669]/)
  })
  it('المالية: الشهر المكتمل لا يُظهر شارة التناسب؛ والاستقطاع المقيّد بالسقف يُعلَّم', () => {
    h.sheet = [{ ...(partial as object), covered_days: 31, proration_ratio: 1, gross_amount: 500000, auto_deduction_capped: true, auto_deduction_amount: 25000, deductions_total: 25000, proposed_net: 475000 } as never]
    render(<MemoryRouter><PayrollOverview /></MemoryRouter>)
    expect(screen.getByTestId('ps-days-count-F-0000000002')).not.toHaveTextContent('مشمول')
    fireEvent.click(screen.getByTestId('ps-days-F-0000000002'))
    expect(screen.queryByTestId('ps-prorated')).toBeNull()
    expect(screen.getByTestId('ps-formula')).toHaveTextContent('الأساسي 500,000 (شهر مكتمل)')
    expect(screen.getByTestId('ps-auto-capped')).toBeInTheDocument()
  })
  it('00188: المعادلة تُعلن أن الاستقطاع التلقائي متوقف / بمبالغ ثابتة / أيامه مقيّدة بالسقف', () => {
    h.sheet = [{ ...(partial as object), auto_deduction_basis: 'disabled', auto_deduction_amount: 0, deductions_total: 0, proposed_net: 83333.33 } as never]
    const { unmount } = render(<MemoryRouter><PayrollOverview /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('ps-days-F-0000000002'))
    expect(screen.getByTestId('ps-auto-disabled')).toBeInTheDocument()
    unmount()
    h.sheet = [{ ...(partial as object), auto_deduction_basis: 'fixed', auto_deduction_days_capped: true } as never]
    render(<MemoryRouter><PayrollOverview /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('ps-days-F-0000000002'))
    expect(screen.getByTestId('ps-auto-fixed')).toBeInTheDocument(); expect(screen.getByTestId('ps-auto-days-capped')).toBeInTheDocument()
  })
  it('Excel: أعمدة «الفترة المشمولة / أيام مشمولة ÷ أيام الشهر / أجر اليوم» في آخر الورقة دون إزاحة الأعمدة القديمة', async () => {
    const wb = await buildPayrollWorkbook('2026-10-01', [partial])
    const ws = wb.worksheets[0]!
    const headers = (ws.getRow(4).values as unknown[]).slice(1) as string[]
    const i = (h2: string) => headers.indexOf(h2) + 1
    expect(i('الصافي المعتمد')).toBe(34)
    expect(ws.getRow(5).getCell(i('الفترة المشمولة')).value).toBe('2026-10-01 → 2026-10-05')
    expect(ws.getRow(5).getCell(i('أيام مشمولة / أيام الشهر')).value).toBe('5 / 31')
    expect(ws.getRow(5).getCell(i('أجر اليوم المحتسب')).value).toBe(16666.6667)
    expect(ws.getRow(5).getCell(i('الإجمالي')).value).toBe(83333.33)
  })
})
