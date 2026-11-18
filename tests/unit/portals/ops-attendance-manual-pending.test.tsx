/**
 * الحضور اليدوي — أثره في «الحضوريات» بغرفة العمليات:
 *   شريط الأيام المعلّقة (يمنع اعتماد الشهر) برابط لصفحة الكشف · بند «جاهزية الاعتماد» · شارة «يدوي» في الجدول
 *   · لا شريط عند الصفر/الفشل/الشهر المقفل · الملخص يتبع الشهر المعروض · محاولة اعتماد مرفوضة تُظهر عدد الأيام بالعربية.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({
  conf: null as unknown, exportStatus: null as unknown, attendance: [] as unknown[],
  pending: vi.fn(),
  confirmMonth: vi.fn(async () => ({ confirm_count: 1 })),
}))
const mut = (fn: (...a: never[]) => Promise<unknown>) => ({ mutate: (v: never) => void fn(v), mutateAsync: fn, isPending: false })
vi.mock('@features/branches', () => ({ useBranches: () => ({ data: [] }) }))
vi.mock('@features/departments', () => ({ useDepartments: () => ({ data: [] }) }))
vi.mock('@features/hr/hooks/useHr', () => ({
  useAttendance: () => ({ data: h.attendance, isLoading: false }), useEvaluateAttendance: () => mut(async () => 0), useEditAttendance: () => mut(async () => undefined), useResetAttendance: () => mut(async () => undefined),
  useDeductions: () => ({ data: [], isLoading: false }), useAddDeduction: () => mut(async () => 'd'), useDeleteDeduction: () => mut(async () => undefined), useWaiveDeduction: () => mut(async () => undefined),
  useAttendanceAudit: () => ({ data: [], isLoading: false }), useMonthExports: () => ({ data: [] }), useExportMonth: () => mut(async () => 'x'), usePayrollGate: () => ({ data: null }), useMonthExportStatus: () => ({ data: h.exportStatus }), useEvaluateMonth: () => mut(async () => 0),
  useHourBankMonth: () => ({ data: [] }), useAttendanceConfirmation: () => ({ data: h.conf }), useAttendanceGrid: () => ({ data: [], isLoading: false }),
  useConfirmAttendanceMonth: () => mut(h.confirmMonth), useReopenAttendanceMonth: () => mut(async () => ({})),
}))
vi.mock('@features/integrations', () => ({ useBiometricPunches: () => ({ data: [], isLoading: false }), usePushEmployeeToDevices: () => ({ mutate: vi.fn(), isPending: false }), useDevices: () => ({ data: [], isLoading: false }) }))
vi.mock('@sdk/attendance-manual.sdk', async (importOriginal) => {
  const m = await importOriginal<{ attendanceManual: object } & Record<string, unknown>>()
  return { ...m, attendanceManual: { ...m.attendanceManual, pendingSummary: h.pending } }
})

import OpsAttendancePage from '@portals/ops-room/pages/Attendance/OpsAttendancePage'

const month = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` })()
const openConf = { month, status: 'open', confirmed: false, confirmed_at: null, confirmed_by_name: null, confirm_count: 0, reopened_at: null, reopened_by_name: null, reopen_reason: null, pending_auto: 0, pending_days: [], deductions_after: 0, unevaluated_days: 0, employees: 2, locked: false, required: true, export: {}, snapshot: {}, can_export: false }
const summary = (total: number) => ({ month, total, items: total ? [{ activation_id: 'a1', portal: 'transfer-station', portal_label: 'المحطة التحويلية', days: 3, items: 5 }, { activation_id: 'a2', portal: 'hr', portal_label: 'الموارد البشرية', days: 1, items: 2 }] : [] })
const dayRow = (id: string, over: Record<string, unknown>) => ({
  id, employee_id: `e-${id}`, employee_number: `N${id}`, full_name: `موظف ${id}`, department_id: null, department_name: null, branch_id: null, branch_name: null, job_title: null, work_date: `${month.slice(0, 8)}01`,
  shift_name: null, expected_in: '08:00:00', expected_out: '16:00:00', check_in: '2026-11-01T05:00:00Z', check_out: '2026-11-01T13:00:00Z', late_minutes: 0, early_minutes: 0, worked_minutes: 480, is_rest_day: false,
  status: 'present', source: 'auto', edited_by: null, edited_at: null, edit_reason: null, required_minutes: 480, permit_minutes: 0, shortfall_minutes: 0, overtime_minutes: 0,
  proposed_deduction_minutes: 0, proposed_deduction_days: 0, deduction_reason: null, deduction_waived: false, waive_reason: null, ...over,
})

beforeEach(() => {
  h.conf = openConf; h.exportStatus = null; h.attendance = []
  h.pending.mockReset(); h.pending.mockResolvedValue(summary(0)); h.confirmMonth.mockClear()
})
afterEach(() => { vi.restoreAllMocks() })

const renderPage = () => render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)

describe('شريط الأيام المعلّقة للكشف اليدوي', () => {
  it('يظهر بالعدد وتفصيل البوابات، برابط إلى صفحة الكشف، ويمنح الاعتماد تحذيراً صريحاً', async () => {
    h.pending.mockResolvedValue(summary(4))
    renderPage()
    const banner = await screen.findByTestId('ops-manual-pending-banner')
    expect(banner).toHaveTextContent('4 يوم-موظف بانتظار كشف الحضور اليدوي')
    expect(banner).toHaveTextContent('المحطة التحويلية: 3 يوم · الموارد البشرية: 1 يوم')
    expect(banner).toHaveTextContent('تمنع اعتماد حضورية الشهر')
    expect(within(banner).getByTestId('ops-manual-pending-open')).toHaveAttribute('href', '/ops-room/manual-attendance')
    expect(screen.getByTestId('att-month-status')).toBeInTheDocument()   // قسم حالة الشهر يظهر ولو لم يكن الشهر معتمداً
    const confirm = screen.getByTestId('att-confirm-open')
    expect(confirm).toBeDisabled()
    expect(confirm).toHaveAttribute('title', expect.stringContaining('4 يوم-موظف بانتظار الكشف'))
    expect(h.pending).toHaveBeenCalledWith(month)
  })

  it('بند «جاهزية الاعتماد» الأول: غير جاهز، بعدد الأيام، ويُحتسب في «نقاط تحتاج مراجعة»', async () => {
    h.pending.mockResolvedValue(summary(4))
    renderPage()
    const item = await screen.findByTestId('att-ready-manual-sheets')
    expect(item).toHaveAttribute('data-ok', 'false')
    expect(item).toHaveTextContent('4 يوم-موظف بانتظار الكشف اليدوي')
    expect(item).toHaveTextContent('الاعتماد ممنوع حتى يكتمل الكشف')
    const list = screen.getByTestId('att-readiness').querySelectorAll('li')
    expect(list[0]).toBe(item)   // أول بند: أخطر ما يمنع الاعتماد
    expect(screen.getByTestId('att-readiness-state')).not.toHaveTextContent('جاهز للاعتماد')
    // زر «التفاصيل» يمرّر إلى الشريط ولا يفشل حتى حيث scrollIntoView غير متاح (jsdom)
    fireEvent.click(within(item).getByRole('button', { name: 'التفاصيل' }))
  })

  it('لا شريط ولا بند عند الصفر', async () => {
    renderPage()
    await waitFor(() => expect(h.pending).toHaveBeenCalled())
    expect(screen.queryByTestId('ops-manual-pending-banner')).toBeNull()
    expect(screen.queryByTestId('att-ready-manual-sheets')).toBeNull()
  })

  it('فشل الجلب (صلاحية/شبكة) ⇒ لا شريط ولا خطأ والصفحة تعمل', async () => {
    h.pending.mockRejectedValue(new Error('RLS'))
    renderPage()
    await waitFor(() => expect(h.pending).toHaveBeenCalled())
    expect(screen.queryByTestId('ops-manual-pending-banner')).toBeNull()
    expect(screen.getByTestId('ops-attendance')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('att-confirm-open')).toHaveAttribute('title', expect.stringContaining('تعذر التحقق')))
    expect(screen.getByTestId('att-confirm-open')).toBeDisabled() // fail closed: backend remains the authority, UI never offers a doomed confirmation
  })

  it('الشهر المقفل بعد اعتماد المالية: لا شريط (لا شيء يُكمَل فيه)', async () => {
    h.conf = { ...openConf, status: 'confirmed', confirmed: true, locked: true }
    h.pending.mockResolvedValue(summary(4))
    renderPage()
    await waitFor(() => expect(h.pending).toHaveBeenCalled())
    expect(await screen.findByTestId('att-locked-line')).toBeInTheDocument()
    expect(screen.queryByTestId('ops-manual-pending-banner')).toBeNull()
  })

  it('الملخص يتبع الشهر المعروض: التنقل إلى الشهر السابق يطلب ملخصه ويُسقط شريط الشهر السابق فوراً (لا يبقى رقم شهر آخر بانتظار الرد)', async () => {
    h.pending.mockImplementation((m: string) => (m === month ? Promise.resolve(summary(4)) : new Promise(() => undefined)))   // رد الشهر السابق لا يصل أبداً
    renderPage()
    await screen.findByTestId('ops-manual-pending-banner')
    fireEvent.click(screen.getByTestId('ops-prev-month'))
    const prev = new Date(month); prev.setMonth(prev.getMonth() - 1)
    const prevMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-01`
    await waitFor(() => expect(h.pending).toHaveBeenCalledWith(prevMonth))
    expect(screen.queryByTestId('ops-manual-pending-banner')).toBeNull()
    expect(screen.queryByTestId('att-ready-manual-sheets')).toBeNull()
  })
})

describe('جدول الحضور: شارة «يدوي»', () => {
  it('صف الكشف اليدوي ⇒ شارة «يدوي»، وتعديل غرفة العمليات ⇒ ✎ بلا شارة، والتلقائي ⇒ لا شيء', async () => {
    h.attendance = [
      dayRow('1', { source: 'manual', edit_reason: 'كشف حضور يدوي — المحطة التحويلية' }),
      dayRow('2', { source: 'manual', edit_reason: 'تصحيح بصمة ناقصة', status: 'late' }),
      dayRow('3', { source: 'auto' }),
    ]
    renderPage()
    const rows = await screen.findAllByTestId('att-status')
    expect(rows).toHaveLength(3)
    expect(within(rows[0]!).getByTestId('att-manual-sheet')).toHaveTextContent('يدوي')
    expect(within(rows[1]!).queryByTestId('att-manual-sheet')).toBeNull()
    expect(rows[1]).toHaveTextContent('✎')
    expect(within(rows[2]!).queryByTestId('att-manual-sheet')).toBeNull()
    expect(rows[2]).not.toHaveTextContent('✎')
    expect(screen.getAllByTestId('att-manual-sheet')).toHaveLength(1)
  })
})
