/** 00389-ب — «من في الدوام الآن» (عدّادات، نسبة الحضور، فلتر الحالة، تصدير) + «تقرير الحضور الشهري» (الالتزام، الترتيب، التصدير، الطباعة) */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({ now: [] as unknown[], grid: [] as unknown[], gridArgs: null as unknown, nowArgs: [] as unknown[] }))
vi.mock('@features/branches', () => ({ useBranches: () => ({ data: [{ id: 'b1', name: 'الفرع الرئيسي' }] }) }))
vi.mock('@features/departments', () => ({ useDepartments: () => ({ data: [{ id: 'dep1', name: 'قسم النظافة' }] }) }))
vi.mock('@features/hr/hooks/useHr', () => ({
  useNowBoard: (...a: unknown[]) => { h.nowArgs = a; return { data: h.now, isLoading: false, dataUpdatedAt: Date.UTC(2026, 9, 30, 7, 5), isFetching: false } },
  useAttendanceGrid: (f: unknown) => { h.gridArgs = f; return { data: h.grid, isLoading: false } },
}))
vi.mock('@features/hr/lib/hrExcel', () => ({ exportToExcel: vi.fn(async () => undefined) }))
import NowBoardPage, { nowBoardSpec, presenceRatio } from '@portals/hr/pages/Attendance/NowBoardPage'
import MonthlyAttendanceReportPage, { compliancePct, monthLabel, scheduledDays, sortRows } from '@portals/hr/pages/Attendance/MonthlyAttendanceReportPage'
import { exportToExcel } from '@features/hr/lib/hrExcel'
import type { AttendanceGridRow, NowBoardRow } from '@features/hr/types'

const nb = (n: string, state: NowBoardRow['state'], extra: Partial<NowBoardRow> = {}): NowBoardRow => ({
  employee_id: n, employee_number: n, full_name: `موظف ${n}`, job_title: null, department_id: 'dep1', department_name: 'قسم النظافة', branch_name: 'الفرع الرئيسي',
  shift_name: 'صباحي', expected_in: '08:00:00', expected_out: '16:00:00', check_in: null, check_out: null, late_minutes: 0, state, leave_type: null, ...extra,
})
const gr = (n: string, p: Partial<AttendanceGridRow>): AttendanceGridRow => ({
  employee_id: n, employee_number: n, full_name: `موظف ${n}`, job_title: null, department_id: 'dep1', department_name: 'قسم النظافة', branch_name: null, contract_type: null, days: [],
  present_days: 20, late_days: 0, early_days: 0, incomplete_days: 0, absent_days: 0, leave_days: 0, rest_days: 4, unevaluated_days: 0,
  worked_minutes: 0, late_minutes: 0, early_minutes: 0, shortfall_minutes: 0, overtime_minutes: 0, permit_minutes: 0, proposed_minutes: 0, proposed_days: 0, ...p,
})

describe('00389-ب · من في الدوام الآن', () => {
  beforeEach(() => {
    h.now = [nb('E1', 'present', { check_in: '2026-10-30T05:01:00Z' }), nb('E2', 'late', { check_in: '2026-10-30T05:40:00Z', late_minutes: 40 }), nb('E3', 'missing'), nb('E4', 'leave', { leave_type: 'sick' }), nb('E5', 'upcoming', { expected_in: '14:00:00', expected_out: '22:00:00' }), nb('E6', 'absent')]
    vi.mocked(exportToExcel).mockClear()
  })
  it('نسبة الحضور = الحاضرون ÷ المطلوب حضورهم الآن (بلا قبل الدوام/الإجازة)', () => {
    expect(presenceRatio(h.now as NowBoardRow[])).toEqual({ present: 2, expected: 4, pct: 50 })
    expect(presenceRatio([])).toEqual({ present: 0, expected: 0, pct: 0 })
  })
  it('العدّادات والجدول والحالة بالعربية، وتصفية بالحالة من البطاقة ومن القائمة', () => {
    render(<MemoryRouter><NowBoardPage /></MemoryRouter>)
    expect(screen.getByTestId('now-ratio').textContent).toContain('50%')
    expect(screen.getByTestId('now-stat-missing').textContent).toContain('1')
    expect(screen.getAllByTestId(/^now-row-/)).toHaveLength(6)
    expect(screen.getByTestId('now-row-E2').textContent).toContain('حاضر متأخرًا')
    expect(screen.getByTestId('now-row-E2').textContent).toContain('40د')
    expect(screen.getByTestId('now-row-E4').textContent).toContain('في إجازة (sick)')
    fireEvent.click(screen.getByTestId('now-stat-missing'))
    expect(screen.getAllByTestId(/^now-row-/)).toHaveLength(1)
    expect(screen.getByTestId('now-count').textContent).toContain('1 موظف')
    fireEvent.change(screen.getByTestId('now-state'), { target: { value: 'late' } })
    expect(screen.getAllByTestId(/^now-row-/)).toHaveLength(1)
    expect(screen.getByTestId('now-row-E2')).toBeTruthy()
    fireEvent.change(screen.getByTestId('now-dept'), { target: { value: 'dep1' } })
    fireEvent.change(screen.getByTestId('now-search'), { target: { value: 'E2' } })
    expect(h.nowArgs).toEqual(['', 'dep1', 'E2'])
    fireEvent.click(screen.getByTestId('now-export'))
    expect(vi.mocked(exportToExcel).mock.calls[0]?.[0]).toMatchObject({ rows: [expect.objectContaining({ employee_number: 'E2' })] })
  })
  it('مواصفة التصدير: الأعمدة والقيم بأرقام لاتينية', () => {
    const spec = nowBoardSpec(h.now as NowBoardRow[], [])
    expect(spec.columns.map((c) => c.header)).toEqual(['الرقم الوظيفي', 'الاسم', 'القسم', 'الشفت', 'الدوام', 'الدخول', 'الخروج', 'التأخير (د)', 'الحالة'])
    expect(spec.columns[4]!.value(h.now[0] as never)).toBe('08:00–16:00')
    expect(spec.columns[7]!.value(h.now[1] as never)).toBe(40)
    expect(spec.columns[8]!.value(h.now[2] as never)).toBe('لم يحضر بعد')
  })
})

describe('00389-ب · تقرير الحضور الشهري', () => {
  beforeEach(() => {
    h.grid = [gr('A1', {}), gr('A2', { present_days: 15, late_days: 3, absent_days: 2, late_minutes: 95, leave_days: 1 }), gr('A3', { present_days: 10, absent_days: 6, incomplete_days: 2, unevaluated_days: 1 })]
    vi.mocked(exportToExcel).mockClear()
  })
  it('الحسابات: المطلوب والالتزام واسم الشهر والترتيب', () => {
    const r = h.grid[1] as AttendanceGridRow
    expect(scheduledDays(r)).toBe(20)
    expect(compliancePct(r)).toBe(90)
    expect(compliancePct(h.grid[2] as AttendanceGridRow)).toBe(56)
    expect(monthLabel('2026-10-01')).toBe('تشرين الأول 2026')
    expect(sortRows(h.grid as AttendanceGridRow[], 'absent').map((x) => x.employee_number)).toEqual(['A3', 'A2', 'A1'])
    expect(sortRows(h.grid as AttendanceGridRow[], 'late')[0]!.employee_number).toBe('A2')
    expect(sortRows(h.grid as AttendanceGridRow[], 'compliance')[0]!.employee_number).toBe('A3')
  })
  it('البطاقات والجدول والفلاتر والتصدير والطباعة', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    render(<MemoryRouter><MonthlyAttendanceReportPage /></MemoryRouter>)
    expect(screen.getByTestId('am-stat-emp').textContent).toContain('3')
    expect(screen.getByTestId('am-stat-absent').textContent).toContain('8')
    expect(screen.getByTestId('am-stat-late').textContent).toContain('1س 35د')
    expect(screen.getByTestId('am-stat-unevaluated').textContent).toContain('1')
    expect(screen.getByTestId('am-stat-compliance').textContent).toContain(`${Math.round((100 + 90 + 56) / 3)}%`)
    expect(screen.getByTestId('am-row-A2').textContent).toContain('90%')
    fireEvent.change(screen.getByTestId('am-month'), { target: { value: '2026-09' } })
    fireEvent.change(screen.getByTestId('am-branch'), { target: { value: 'b1' } })
    expect(h.gridArgs).toMatchObject({ month: '2026-09-01', branchId: 'b1', departmentId: null })
    fireEvent.change(screen.getByTestId('am-sort'), { target: { value: 'absent' } })
    expect(screen.getAllByTestId(/^am-row-/)[0]!.getAttribute('data-testid')).toBe('am-row-A3')
    fireEvent.click(screen.getByTestId('am-export'))
    const spec = vi.mocked(exportToExcel).mock.calls[0]?.[0] as { title: string; columns: Array<{ header: string }> }
    expect(spec.title).toContain('أيلول 2026')
    expect(spec.columns.map((c) => c.header)).toContain('الالتزام %')
    fireEvent.click(screen.getByTestId('am-print'))
    expect(print).toHaveBeenCalled()
    print.mockRestore()
  })
})
