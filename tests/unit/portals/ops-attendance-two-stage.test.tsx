/**
 * 00193 — وحدة الحضوريات بمرحلتين (غرفة العمليات):
 *   شريط المراحل · المرحلة 2 مقفلة قبل الاعتماد · حوار الاعتماد (ملخص + تحذيرات) → RPC → الانتقال للكشف المعتمد
 *   · الكشف المعتمد يعرض حاضر/غائب/مجاز فقط مع ملخص كل موظف مجمّعاً بالقسم · التصدير للمالية ممنوع مع تغييرات معلّقة
 *   · إعادة الفتح بسبب إلزامي وتنبيه التطوير · Excel: ورقة ملخص + ورقة لكل قسم (تفصيلي بالأوقات / معتمد بالحالات الثلاث)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({
  conf: null as unknown, grid: [] as unknown[], gridFilters: null as unknown, attendance: [] as unknown[], exportStatus: null as unknown,
  confirmMonth: vi.fn(async () => ({ confirm_count: 1 })), reopenMonth: vi.fn(async () => ({})), exportMonth: vi.fn(async () => 'x'),
}))
const mut = (fn: (...a: never[]) => Promise<unknown>) => ({ mutate: (v: never) => void fn(v), mutateAsync: fn, isPending: false })
vi.mock('@features/branches', () => ({ useBranches: () => ({ data: [{ id: 'b1', name: 'فرع بغداد' }] }) }))
vi.mock('@features/departments', () => ({ useDepartments: () => ({ data: [{ id: 'd1', name: 'النقل', parent_id: null }, { id: 'd2', name: 'الإدارة', parent_id: null }] }) }))
vi.mock('@features/hr/hooks/useHr', () => ({
  useAttendance: () => ({ data: h.attendance, isLoading: false }), useEvaluateAttendance: () => mut(async () => 0), useEditAttendance: () => mut(async () => undefined), useResetAttendance: () => mut(async () => undefined),
  useDeductions: () => ({ data: [], isLoading: false }), useAddDeduction: () => mut(async () => 'd'), useDeleteDeduction: () => mut(async () => undefined), useWaiveDeduction: () => mut(async () => undefined),
  useAttendanceAudit: () => ({ data: [], isLoading: false }), useMonthExports: () => ({ data: [] }), useExportMonth: () => mut(h.exportMonth), useMonthExportStatus: () => ({ data: h.exportStatus }), useEvaluateMonth: () => mut(async () => 0),
  useAttendanceConfirmation: () => ({ data: h.conf }), useAttendanceGrid: (f: unknown) => { h.gridFilters = f; return { data: h.grid, isLoading: false } },
  useConfirmAttendanceMonth: () => mut(h.confirmMonth), useReopenAttendanceMonth: () => mut(h.reopenMonth),
}))
vi.mock('@features/integrations', () => ({ useBiometricPunches: () => ({ data: [], isLoading: false }), usePushEmployeeToDevices: () => ({ mutate: vi.fn(), isPending: false }), useDevices: () => ({ data: [], isLoading: false }) }))

import OpsAttendancePage from '@portals/ops-room/pages/Attendance/OpsAttendancePage'
import { approvedKind, buildAttendanceApprovedWorkbook, buildAttendanceDetailedWorkbook, detailCellText } from '@features/hr/lib/attendanceExcel'
import type { AttendanceGridCell, AttendanceGridRow } from '@features/hr'

const cell = (d: string, s: AttendanceGridCell['s'], extra: Partial<AttendanceGridCell> = {}): AttendanceGridCell => ({ d, s, rest: s === 'rest', src: 'auto', in: null, out: null, w: 0, late: 0, early: 0, short: 0, ot: 0, permit: 0, pm: 0, pd: 0, waived: false, note: null, ...extra })
const row = (over: Partial<AttendanceGridRow>): AttendanceGridRow => ({
  employee_id: 'e1', employee_number: 'E100', full_name: 'أحمد علي', job_title: 'سائق', department_id: 'd1', department_name: 'النقل', branch_name: 'بغداد', contract_type: 'monthly',
  days: [
    cell('2026-09-01', 'present', { in: '08:02', out: '16:05', w: 483 }), cell('2026-09-02', 'late', { in: '08:45', out: '16:00', w: 435, late: 35, short: 45, pm: 120 }),
    cell('2026-09-03', 'incomplete', { in: '08:00' }), cell('2026-09-04', 'rest'), cell('2026-09-05', 'absent', { pd: 1 }), cell('2026-09-06', 'leave'), cell('2026-09-07', 'early_leave', { in: '08:00', out: '14:00', w: 360, early: 120, short: 120, src: 'manual', note: 'إذن شفوي' }),
  ],
  present_days: 1, late_days: 1, early_days: 1, incomplete_days: 1, absent_days: 1, leave_days: 1, rest_days: 1, unevaluated_days: 0,
  worked_minutes: 1278, late_minutes: 35, early_minutes: 120, shortfall_minutes: 165, overtime_minutes: 0, permit_minutes: 0, proposed_minutes: 120, proposed_days: 1, ...over,
})
const month = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` })()
const open = { month, status: 'open', confirmed: false, confirmed_at: null, confirmed_by_name: null, confirm_count: 0, reopened_at: null, reopened_by_name: null, reopen_reason: null, pending_auto: 0, pending_days: [], deductions_after: 0, unevaluated_days: 3, employees: 2, locked: false, required: true, export: {}, snapshot: {}, can_export: false }
const confirmed = { ...open, status: 'confirmed', confirmed: true, confirmed_at: '2026-10-01T08:00:00Z', confirmed_by_name: 'مدقق الحضور', confirm_count: 1, unevaluated_days: 0, can_export: true }

beforeEach(() => { h.conf = open; h.grid = [row({}), row({ employee_id: 'e2', employee_number: 'E200', full_name: 'سارة', department_id: 'd2', department_name: 'الإدارة', present_days: 1, late_days: 0, early_days: 0, incomplete_days: 0, absent_days: 0, leave_days: 0, rest_days: 0, worked_minutes: 480, late_minutes: 0, early_minutes: 0, shortfall_minutes: 0, proposed_minutes: 0, proposed_days: 0, days: [cell('2026-09-01', 'present', { in: '08:00', out: '16:00', w: 480 })] })]; h.attendance = []; h.exportStatus = null; vi.clearAllMocks() })

describe('00193 — الحضوريات بمرحلتين', () => {
  it('شريط المراحل: قبل الاعتماد المرحلة 1 نشطة والكشف المعتمد مقفل مع زر عودة؛ لا زر تصدير للمالية', () => {
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    expect(screen.getByTestId('att-stage-1')).toHaveAttribute('data-active', 'true')
    expect(screen.getByTestId('att-stage-3')).toHaveAttribute('data-done', 'false')
    fireEvent.click(screen.getByTestId('stage-approved'))
    expect(screen.getByTestId('att-approved-locked')).toHaveTextContent('غير متاح بعد')
    expect(screen.queryByTestId('ops-export-month')).toBeNull()
    fireEvent.click(screen.getByTestId('att-back-detailed'))
    expect(screen.getByTestId('att-confirm-open')).toBeInTheDocument()
  })
  it('حوار الاعتماد يعرض الملخص والتحذيرات (بصمات ناقصة/غير محتسب) ثم يستدعي ops_attendance_confirm وينتقل للكشف المعتمد', async () => {
    h.grid = [row({ unevaluated_days: 2 })]
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('att-confirm-open'))
    const dlg = screen.getByTestId('att-confirm-dialog')
    expect(within(dlg).getByTestId('cf-present')).toHaveTextContent('4')   // حاضر+متأخر+مبكر+ناقصة
    expect(within(dlg).getByTestId('cf-absent')).toHaveTextContent('1')
    expect(within(dlg).getByTestId('cf-warnings')).toHaveTextContent('1 بصمة ناقصة'); expect(within(dlg).getByTestId('cf-warnings')).toHaveTextContent('2 يوم غير محتسب')
    expect(dlg.textContent).toContain('التطوير المركزية')
    fireEvent.click(within(dlg).getByTestId('att-confirm-save'))
    await waitFor(() => expect(h.confirmMonth).toHaveBeenCalledWith(month))
    h.conf = confirmed
  })
  it('شبكة الشهر التفصيلية تعرض الأوقات والألوان وتعديل غرفة العمليات مجمّعة بالقسم', () => {
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('panel-grid'))
    const grid = screen.getByTestId('att-grid-detailed')
    expect(within(grid).getByTestId('grid-dept-النقل')).toBeInTheDocument(); expect(within(grid).getByTestId('grid-dept-الإدارة')).toBeInTheDocument()
    const r = within(grid).getByTestId('grid-row-E100')
    expect(within(r).getByTestId('cell-2026-09-01')).toHaveTextContent('08:02'); expect(within(r).getByTestId('cell-2026-09-01')).toHaveTextContent('16:05')
    expect(within(r).getByTestId('cell-2026-09-05')).toHaveTextContent('غ')
    expect(within(r).getByTestId('cell-2026-09-02')).toHaveAttribute('data-status', 'late')
    expect(within(r).getByTestId('grid-proposed-E100')).toHaveTextContent('1 يوم + 120 د')
    expect(grid.textContent).not.toMatch(/[\u0660-\u0669]/)
    expect(h.gridFilters).toEqual(expect.objectContaining({ month }))
  })
  it('بعد الاعتماد: المرحلة 1 مقفلة للتعديل (لافتة + زر معطّل)، والكشف المعتمد يعرض حاضر/غائب/مجاز فقط مع الملخص', () => {
    h.conf = confirmed
    h.attendance = [{ id: 'a1', employee_id: 'e1', employee_number: 'E100', full_name: 'أحمد', department_name: 'النقل', branch_name: null, work_date: '2026-09-05', shift_name: 'صباحي', expected_in: null, expected_out: null, check_in: null, check_out: null, late_minutes: 0, early_minutes: 0, worked_minutes: 0, is_rest_day: false, status: 'absent', source: 'auto', edited_by: null, edited_at: null, edit_reason: null, required_minutes: 480, permit_minutes: 0, shortfall_minutes: 480, overtime_minutes: 0, proposed_deduction_minutes: 0, proposed_deduction_days: 1, deduction_reason: 'غياب', deduction_waived: false, waive_reason: null }]
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    expect(screen.getByTestId('att-confirmed-banner')).toHaveTextContent('مدقق الحضور')
    expect(screen.getByTestId('ops-edit-E100-2026-09-05')).toBeDisabled()
    expect(screen.getByTestId('att-confirm-open')).toBeDisabled()
    fireEvent.click(screen.getByTestId('stage-approved'))
    const grid = screen.getByTestId('att-grid-approved')
    const r = within(grid).getByTestId('grid-row-E100')
    // كل الخلايا مختزلة: لا أوقات، لا «متأخر»، لا «ناقصة»
    expect(r.textContent).not.toMatch(/08:0|متأخر|ناقصة|مبكر/)
    expect(within(r).getByTestId('cell-2026-09-02')).toHaveAttribute('data-kind', 'present'); expect(within(r).getByTestId('cell-2026-09-02')).toHaveTextContent('حاضر')
    expect(within(r).getByTestId('cell-2026-09-03')).toHaveTextContent('حاضر')
    expect(within(r).getByTestId('cell-2026-09-05')).toHaveTextContent('غائب')
    expect(within(r).getByTestId('cell-2026-09-06')).toHaveTextContent('مجاز')
    expect(within(r).getByTestId('cell-2026-09-04')).toHaveTextContent('راحة')
    expect(within(r).getByTestId('grid-present-E100')).toHaveTextContent('4'); expect(within(r).getByTestId('grid-absent-E100')).toHaveTextContent('1'); expect(within(r).getByTestId('grid-leave-E100')).toHaveTextContent('1'); expect(within(r).getByTestId('grid-hours-E100')).toHaveTextContent('21:18')
    expect(screen.getByTestId('app-present')).toHaveTextContent('5'); expect(screen.getByTestId('app-hours')).toHaveTextContent('29:18')
    expect(screen.getByTestId('ops-export-month')).toBeEnabled()
  })
  it('تغييرات تلقائية معلّقة بعد الاعتماد: لافتة بالأسماء، زر التصدير معطّل، و«إعادة الاعتماد» تستدعي confirm', async () => {
    h.conf = { ...confirmed, pending_auto: 2, pending_days: [{ employee_id: 'e1', full_name: 'أحمد علي', work_date: '2026-09-12', would_be: 'present' }, { employee_id: 'e2', full_name: 'سارة', work_date: '2026-09-13', would_be: 'leave' }], can_export: false }
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('stage-approved'))
    expect(screen.getByTestId('att-pending-banner')).toHaveTextContent('2 يوم'); expect(screen.getByTestId('att-pending-banner')).toHaveTextContent('أحمد علي 09-12')
    expect(screen.getByTestId('ops-export-month')).toBeDisabled()
    fireEvent.click(screen.getByTestId('att-reconfirm'))
    await waitFor(() => expect(h.confirmMonth).toHaveBeenCalledWith(month))
  })
  it('إعادة الفتح: سبب إلزامي + تنبيه التطوير المركزية، ثم RPC بالشهر والسبب والعودة للمرحلة 1', async () => {
    h.conf = confirmed
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('stage-approved'))
    fireEvent.click(screen.getByTestId('att-reopen-open'))
    const dlg = screen.getByTestId('att-reopen-dialog')
    expect(within(dlg).getByTestId('it-notify-notice-reopen')).toHaveTextContent('التطوير المركزية')
    fireEvent.click(within(dlg).getByTestId('ro-save'))
    expect(within(dlg).getByTestId('ro-error')).toBeInTheDocument(); expect(h.reopenMonth).not.toHaveBeenCalled()
    fireEvent.change(within(dlg).getByTestId('ro-reason'), { target: { value: 'بصمة خروج متأخرة ليوم 12' } })
    fireEvent.click(within(dlg).getByTestId('ro-save'))
    await waitFor(() => expect(h.reopenMonth).toHaveBeenCalledWith({ month, reason: 'بصمة خروج متأخرة ليوم 12' }))
    await waitFor(() => expect(screen.getByTestId('att-confirm-open')).toBeInTheDocument())
  })
  it('الشهر المقفل باعتماد المالية: لا اعتماد ولا إعادة فتح، والكشف المعتمد متاح للقراءة والتصدير Excel', () => {
    h.conf = { ...confirmed, locked: true, can_export: false }
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    expect(screen.getByTestId('att-locked')).toBeInTheDocument()
    expect(screen.queryByTestId('att-confirm-open')).toBeNull()
    fireEvent.click(screen.getByTestId('stage-approved'))
    expect(screen.queryByTestId('att-reopen-open')).toBeNull()
    expect(screen.getByTestId('att-excel-approved')).toBeEnabled()
    expect(screen.getByTestId('ops-export-month')).toBeDisabled()
  })
})

describe('00193 — Excel الحضوريات (ورقة لكل قسم)', () => {
  const rows = [row({}), row({ employee_id: 'e2', employee_number: 'E200', full_name: 'سارة', department_name: 'الإدارة' }), row({ employee_id: 'e3', employee_number: 'E300', full_name: 'كريم', department_name: 'النقل' })]
  const meta = { month: '2026-09-01', branchLabel: 'كل الفروع', departmentLabel: 'كل الأقسام', confirmedBy: 'مدقق الحضور', confirmedAt: '2026-10-01T08:00:00Z' }
  it('اختزال الحالات: متأخر/مبكر/ناقصة = حاضر · إجازة/زمنية = مجاز · غائب = غائب', () => {
    expect(approvedKind('late')).toBe('present'); expect(approvedKind('incomplete')).toBe('present'); expect(approvedKind('early_leave')).toBe('present')
    expect(approvedKind('time_permit')).toBe('leave'); expect(approvedKind('absent')).toBe('absent'); expect(approvedKind('rest')).toBe('rest'); expect(approvedKind('pending')).toBe('none')
    expect(detailCellText(cell('x', 'present', { in: '08:02', out: '16:05' }))).toBe('08:02→16:05'); expect(detailCellText(cell('x', 'incomplete', { in: '08:00' }))).toBe('08:00→؟'); expect(detailCellText(cell('x', 'absent'))).toBe('غ')
  })
  it('التفصيلي: «الملخص» ثم ورقة لكل قسم مرتبة، الخلايا بالأوقات، وأعمدة المجاميع', async () => {
    const wb = await buildAttendanceDetailedWorkbook(rows, meta)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['الملخص', 'الإدارة', 'النقل'])
    const ws = wb.getWorksheet('النقل')!
    expect(ws.getCell('A1').value).toContain('النقل')
    expect(ws.getRow(4).getCell(2).value).toBe('الموظف')
    expect(ws.getRow(6).getCell(2).value).toBe('أحمد علي')
    expect(ws.getRow(6).getCell(5).value).toBe('08:02→16:05')
    expect(ws.getRow(6).getCell(9).value).toBe('غ')
    const totalsStart = 4 + 7
    expect(ws.getRow(6).getCell(totalsStart + 1).value).toBe(4)      // أيام الحضور
    expect(ws.getRow(6).getCell(totalsStart + 5).value).toBe(1)      // غياب
    expect(ws.getRow(6).getCell(totalsStart + 7).value).toBe('21:18') // ساعات
    expect(ws.getRow(6).getCell(totalsStart + 11).value).toBe('1 يوم + 120 د')
    expect(ws.getRow(7).getCell(2).value).toBe('كريم')
    const sum = wb.getWorksheet('الملخص')!
    expect(sum.getRow(5).getCell(2).value).toBe('الإدارة'); expect(sum.getRow(6).getCell(2).value).toBe('النقل'); expect(sum.getRow(6).getCell(3).value).toBe(2)
    expect(sum.getRow(7).getCell(2).value).toBe('الإجمالي'); expect(sum.getRow(7).getCell(3).value).toBe(3)
    expect(sum.getCell('A2').value).toContain('مدقق الحضور')
    expect(ws.views[0]?.rightToLeft).toBe(true)
  })
  it('المعتمد: الخلايا حاضر/غائب/مجاز/راحة فقط (لا أوقات) وأعمدة الحضور/الغياب/الإجازة/الساعات', async () => {
    const wb = await buildAttendanceApprovedWorkbook(rows, meta)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['الملخص', 'الإدارة', 'النقل'])
    const ws = wb.getWorksheet('النقل')!
    const r = ws.getRow(6)
    expect([5, 6, 7, 8, 9, 10, 11].map((c) => r.getCell(c).value)).toEqual(['حاضر', 'حاضر', 'حاضر', 'راحة', 'غائب', 'مجاز', 'حاضر'])
    expect([12, 13, 14, 15].map((c) => r.getCell(c).value)).toEqual([4, 1, 1, '21:18'])
    expect(String(ws.getCell('A2').value)).toContain('اعتمده مدقق الحضور')
    for (let c = 5; c <= 11; c++) expect(String(r.getCell(c).value)).not.toMatch(/\d\d:\d\d/)
  })
})
