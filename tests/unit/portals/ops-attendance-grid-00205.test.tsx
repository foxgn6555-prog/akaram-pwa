/**
 * 00205 — ترتيب وحدة الحضوريات في غرفة العمليات:
 * شبكة الشهر (شريط لون لكل حالة، تمييز اليوم والجمعة، خلايا قابلة للنقر تفتح سجل اليوم، ملخصات القسم كشارات)،
 * دليل الألوان بمربعات، شريط أدوات موحّد (الأقسام + الفلاتر) بلا مُنتقي شهر مكرر، وزر الاعتماد في رأس الصفحة.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { GridLegend, MonthGrid } from '@portals/ops-room/pages/Attendance/AttendanceStages'
import type { AttendanceGridCell, AttendanceGridRow } from '@features/hr'

const today = new Date().toISOString().slice(0, 10)
const ym = today.slice(0, 7)
const dim = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate()
const days = Array.from({ length: dim }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`)
const cell = (d: string, s: AttendanceGridCell['s'], o: Partial<AttendanceGridCell> = {}): AttendanceGridCell => ({ d, s, rest: false, src: 'auto', in: null, out: null, w: 0, late: 0, early: 0, short: 0, ot: 0, permit: 0, pm: 0, pd: 0, waived: false, note: null, ...o })
const row = (n: string, num: string, dept: string, f: (d: string, i: number) => AttendanceGridCell): AttendanceGridRow => ({
  employee_id: num, employee_number: num, full_name: n, job_title: 'فني', department_id: dept, department_name: dept, branch_name: null, contract_type: 'monthly', days: days.map(f),
  present_days: 3, late_days: 1, early_days: 0, incomplete_days: 0, absent_days: 2, leave_days: 1, rest_days: 0, worked_minutes: 500, shortfall_minutes: 10, overtime_minutes: 0, unevaluated_days: 0, proposed_days: 0, proposed_minutes: 15,
} as AttendanceGridRow)
const rows = [
  row('احمد عبد الواحد', 'E1', 'الأشغال', (d, i) => i === 0 ? cell(d, 'present', { in: '08:00', out: '16:00' }) : i === 1 ? cell(d, 'late', { in: '08:20', out: '16:00', late: 20, pm: 20, src: 'manual', note: 'بصمة يدوية' }) : i === 2 ? cell(d, 'absent') : i === 3 ? cell(d, 'early_leave', { in: '08:00', out: '14:00', pm: 30, waived: true }) : cell(d, 'future')),
  row('علي رعد', 'E2', 'النظافة', (d, i) => i < 2 ? cell(d, 'leave') : cell(d, 'future')),
]

describe('MonthGrid (تفصيلي)', () => {
  it('خلية الحالة: شريط لون + وقت الدخول/الخروج؛ «غائب» بكلمة كاملة؛ إطار التعديل اليدوي؛ نقطة الاستقطاع المقترح/المُلغى', () => {
    render(<MonthGrid rows={rows} mode="detailed" />)
    const r1 = screen.getByTestId('grid-row-E1')
    const c1 = within(r1).getByTestId(`cell-${days[0]}`)
    expect(c1.getAttribute('data-status')).toBe('present')
    expect(c1.textContent).toContain('08:00')
    expect(c1.textContent).toContain('16:00')
    const c2 = within(r1).getByTestId(`cell-btn-${days[1]}`)
    expect(c2.className).toContain('ring-amber-400')
    expect(within(c2).getByLabelText('استقطاع مقترح')).toBeInTheDocument()
    expect(within(r1).getByTestId(`cell-${days[2]}`).textContent).toBe('غائب')
    expect(within(within(r1).getByTestId(`cell-btn-${days[3]}`)).getByLabelText('استقطاع مُلغى')).toBeInTheDocument()
    // بلا onCellClick ⇒ الأزرار معطّلة (لا نقر عرضي)
    expect((within(r1).getByTestId(`cell-btn-${days[0]}`) as HTMLButtonElement).disabled).toBe(true)
  })
  it('النقر على يوم يستدعي onCellClick بالموظف والخلية؛ الأيام المستقبلية غير قابلة للنقر', () => {
    const onCell = vi.fn()
    render(<MonthGrid rows={rows} mode="detailed" onCellClick={onCell} />)
    const r1 = screen.getByTestId('grid-row-E1')
    fireEvent.click(within(r1).getByTestId(`cell-btn-${days[1]}`))
    expect(onCell).toHaveBeenCalledTimes(1)
    expect(onCell.mock.calls[0]![0].employee_number).toBe('E1')
    expect(onCell.mock.calls[0]![1].d).toBe(days[1])
    const fut = within(r1).getByTestId(`cell-btn-${days[days.length - 1]}`) as HTMLButtonElement
    expect(fut.disabled).toBe(true)
  })
  it('رأس الشبكة: عمود اليوم مميّز، الجمعة مظلّلة، عدّاد الموظفين/الأقسام، وملخص القسم كشارات', () => {
    render(<MonthGrid rows={rows} mode="detailed" />)
    expect(screen.getByTestId(`grid-day-${today}`).className).toContain('bg-brand-600')
    const fri = days.find((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 5)!
    expect(screen.getByTestId(`grid-day-${fri}`).className).toContain('bg-slate-700')
    expect(screen.getByText('2 موظفاً · 2 قسم')).toBeInTheDocument()
    const g = screen.getByTestId('grid-dept-الأشغال')
    expect(g.textContent).toContain('حضور')
    expect(g.textContent).toContain('غياب')
    expect(screen.getByText('أيام الشهر — انقر أي يوم لفتح سجله')).toBeInTheDocument()
    expect(screen.getByText('ملخص الشهر')).toBeInTheDocument()
    // الأحرف الأولى للموظف
    expect(within(screen.getByTestId('grid-row-E1')).getByText('اع')).toBeInTheDocument()
  })
  it('المعتمد: حاضر/غائب/مجاز فقط وأرقام الملخص', () => {
    render(<MonthGrid rows={rows} mode="approved" />)
    const r1 = screen.getByTestId('grid-row-E1')
    expect(within(r1).getByTestId(`cell-${days[1]}`).textContent).toBe('حاضر')
    expect(within(r1).getByTestId(`cell-${days[2]}`).textContent).toBe('غائب')
    expect(within(screen.getByTestId('grid-row-E2')).getByTestId(`cell-${days[0]}`).textContent).toBe('مجاز')
    expect(screen.getByTestId('grid-absent-E1').textContent).toBe('2')
    expect(screen.queryAllByText('08:00')).toHaveLength(0)
  })
})

describe('GridLegend', () => {
  it('دليل بمربعات ملوّنة يشمل التعديل اليدوي والاستقطاع المقترح/المُلغى واليوم', () => {
    render(<GridLegend mode="detailed" />)
    const l = screen.getByTestId('grid-legend-detailed')
    for (const t of ['حاضر (أول / آخر بصمة)', 'متأخر', 'خروج مبكر', 'بصمة ناقصة', 'غائب', 'إجازة / زمنية', 'راحة', '؟ غير محتسب', 'تعديل غرفة العمليات', 'استقطاع مقترح', 'استقطاع مُلغى بسبب', 'اليوم']) expect(l.textContent).toContain(t)
    render(<GridLegend mode="approved" />)
    expect(screen.getByTestId('grid-legend-approved').textContent).not.toContain('متأخر')
  })
})

// ── الصفحة: شريط أدوات موحّد + النقر على خلية الشبكة يفتح سجل اليوم ──
const h = vi.hoisted(() => ({ grid: [] as unknown[], attendance: [] as unknown[], mut: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(async () => undefined), isPending: false }) }))

vi.mock('@features/branches', () => ({ useBranches: () => ({ data: [] }) }))
vi.mock('@features/departments', () => ({ useDepartments: () => ({ data: [] }) }))
vi.mock('@features/hr/hooks/useHr', () => ({
  useAttendance: () => ({ data: h.attendance, isLoading: false }), useEvaluateAttendance: h.mut, useEditAttendance: h.mut, useResetAttendance: h.mut,
  useDeductions: () => ({ data: [], isLoading: false }), useAddDeduction: h.mut, useDeleteDeduction: h.mut, useWaiveDeduction: h.mut,
  useAttendanceAudit: () => ({ data: [], isLoading: false }), useMonthExports: () => ({ data: [] }), useExportMonth: h.mut, useMonthExportStatus: () => ({ data: null }), useEvaluateMonth: h.mut,
  useAttendanceConfirmation: () => ({ data: null }), useAttendanceGrid: () => ({ data: h.grid, isLoading: false }),
  useConfirmAttendanceMonth: h.mut, useReopenAttendanceMonth: h.mut,
}))
vi.mock('@features/integrations', () => ({ useBiometricPunches: () => ({ data: [], isLoading: false }), usePushEmployeeToDevices: h.mut, useDevices: () => ({ data: [], isLoading: false }) }))
vi.mock('@sdk/hr.sdk', () => ({ hr: { listDeductions: async () => [] } }))
import { MemoryRouter } from 'react-router'
import OpsAttendancePage from '@portals/ops-room/pages/Attendance/OpsAttendancePage'

describe('صفحة الحضوريات (00205)', () => {
  it('زر الاعتماد في رأس الصفحة؛ شريط أدوات واحد يضم الأقسام والفلاتر؛ لا مُنتقي شهر مكرر', () => {
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    const header = screen.getByRole('heading', { level: 1, name: 'الحضوريات' }).closest('header')!
    expect(within(header).getByTestId('att-confirm-open')).toBeInTheDocument()
    const tb = screen.getByTestId('ops-toolbar')
    expect(within(tb).getByTestId('panel-grid')).toBeInTheDocument()
    expect(within(tb).getByTestId('ops-filters')).toBeInTheDocument()
    expect(within(tb).getByTestId('ops-status')).toBeInTheDocument()
    expect(screen.getAllByTestId('att-month')).toHaveLength(1)
    // عرض الشهر: لا حقل تاريخ، بل شارة الشهر
    fireEvent.click(screen.getByTestId('mode-month'))
    expect(screen.queryByTestId('ops-day')).toBeNull()
    expect(screen.getByTestId('ops-month-label')).toBeInTheDocument()
    // شبكة الشهر: فلتر الحالة يختفي (لا معنى له) وتبقى الفلاتر الأخرى
    fireEvent.click(screen.getByTestId('panel-grid'))
    expect(screen.queryByTestId('ops-status')).toBeNull()
    expect(screen.getByTestId('ops-search')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('panel-deductions'))
    expect(screen.queryByTestId('ops-filters')).toBeNull()
  })
  it('النقر على خلية يوم في الشبكة ينتقل إلى سجلات ذلك اليوم لذلك الموظف', () => {
    h.grid = rows
    render(<MemoryRouter><OpsAttendancePage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('panel-grid'))
    fireEvent.click(within(screen.getByTestId('grid-row-E1')).getByTestId(`cell-btn-${days[1]}`))
    expect(screen.getByTestId('panel-rows')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('ops-day')).toHaveValue(days[1])
    expect(screen.getByTestId('ops-search')).toHaveValue('E1')
  })
})
