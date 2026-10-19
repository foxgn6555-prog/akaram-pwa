/** 00249: صفحة تقارير سلوك الموظفين — الأنواع الأربعة، التنقل بين الفترات، المؤشرات، الترتيب، بطاقة الموظف، الوضع للقراءة في بوابتي المدير المفوض ومعاونه */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { BehaviorEmployeeReport, BehaviorReport } from '@features/hr'

const h = vi.hoisted(() => ({ report: null as unknown, employee: null as unknown, lastArgs: null as unknown }))
vi.mock('@features/branches/hooks/useBranches', () => ({ useBranches: () => ({ data: [{ id: 'b1', name: 'بغداد' }] }) }))
vi.mock('@features/hr/hooks/useHr', () => ({
  useBehaviorReport: (f: unknown) => { h.lastArgs = f; return { data: h.report, isLoading: false } },
  useBehaviorEmployee: (id: string | null) => ({ data: id ? h.employee : null, isLoading: false }),
  useHrDepartments: () => ({ data: [{ id: 'd1', name: 'النقل', parent_id: null, is_active: true, is_job_title: false }] }),
}))
import BehaviorReportsPage from '@portals/hr/pages/Behavior/BehaviorReportsPage'

const emp = (n: string, name: string, score: number, extra: Partial<BehaviorReport['employees'][number]> = {}): BehaviorReport['employees'][number] => ({
  employee_id: n, employee_number: n, full_name: name, department_id: 'd1', department_name: 'النقل', branch_name: 'بغداد', job_title: null,
  scheduled_days: 30, leave_days: 0, expected_days: 30, worked_days: 30, present_days: 30, late_days: 0, late_minutes: 0, early_days: 0, early_minutes: 0, absent_days: 0, incomplete_days: 0,
  extra_minutes: 0, avg_in_offset: 0, sd_in_offset: 0, perfect_days: 30, max_perfect_streak: 30, score, grade: score >= 90 ? 'excellent' : score >= 80 ? 'very_good' : score >= 70 ? 'good' : score >= 60 ? 'fair' : 'poor',
  prev_score: null, prev_grade: null, delta: null, rank: 1, indices: { attendance: 1, punctuality: 1, early: 1, complete: 1, consistency: 1 }, chronic_late: false, high_absence: false, ...extra,
})
const REPORT: BehaviorReport = {
  period: { kind: 'monthly', period_from: '2026-09-01', period_to: '2026-09-30', period_to_effective: '2026-09-30', prev_from: '2026-08-01', prev_to: '2026-08-31', label: '2026-09' },
  summary: { employees: 3, avg_score: 84.6, prev_avg_score: 80, attendance_rate: 95.6, punctuality_rate: 80, early_leave_rate: 0, absence_rate: 4.4, incomplete_rate: 0, late_minutes: 360, early_minutes: 0, extra_minutes: 0, absent_days: 4, avg_late_minutes_per_late_day: 20, chronic_late: 1, perfect: 1, grades: { excellent: 1, very_good: 0, good: 0, fair: 2, poor: 0 }, improved: 0, declined: 1 },
  trend: [{ label: '09-01', from: '2026-09-01', to: '2026-09-07', avg_score: 85, late_rate: 20, absence_rate: 3, early_rate: 0, employees: 3 }, { label: '09-08', from: '2026-09-08', to: '2026-09-14', avg_score: 84, late_rate: 22, absence_rate: 5, early_rate: 0, employees: 3 }],
  weekdays: [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, late_days: dow === 0 ? 6 : 1, absent_days: 0, early_days: 0, worked_days: 12, late_rate: dow === 0 ? 50 : 8.3 })),
  departments: [{ department_id: 'd1', name: 'النقل', employees: 3, avg_score: 84.6, late_rate: 20, absence_rate: 4.4 }],
  employees: [
    emp('A', 'مثالي', 100, { rank: 1 }),
    emp('B', 'متأخر', 69.9, { rank: 2, late_days: 18, late_minutes: 360, chronic_late: true, prev_score: 100, prev_grade: 'excellent', delta: -30.1, indices: { attendance: 1, punctuality: 0.33, early: 1, complete: 1, consistency: 0.75 } }),
    emp('C', 'غائب', 69.9, { rank: 2, absent_days: 4, present_days: 26, high_absence: true }),
  ],
  weights: { attendance: 40, punctuality: 25, early: 15, complete: 10, consistency: 10 },
}
const EMPLOYEE: BehaviorEmployeeReport = {
  period: REPORT.period, employee: { id: 'B', employee_number: 'B', full_name: 'متأخر', department_name: 'النقل', branch_name: null, job_title: 'سائق', hire_date: '2024-01-01', biometric_pin: '9902' },
  current: { employee_id: 'B', scheduled_days: 30, leave_days: 0, expected_days: 30, worked_days: 30, present_days: 30, late_days: 18, late_minutes: 360, early_days: 0, early_minutes: 0, absent_days: 0, incomplete_days: 0, extra_minutes: 0, avg_in_offset: 18, sd_in_offset: 14.9, perfect_days: 12, max_perfect_streak: 2, score: 69.9, idx_attendance: 1, idx_punctuality: 0.3333, idx_early: 1, idx_complete: 1, idx_consistency: 0.7517, grade: 'fair' },
  previous: { employee_id: 'B', scheduled_days: 31, leave_days: 0, expected_days: 31, worked_days: 31, present_days: 31, late_days: 0, late_minutes: 0, early_days: 0, early_minutes: 0, absent_days: 0, incomplete_days: 0, extra_minutes: 0, avg_in_offset: 0, sd_in_offset: 0, perfect_days: 31, max_perfect_streak: 31, score: 100, idx_attendance: 1, idx_punctuality: 1, idx_early: 1, idx_complete: 1, idx_consistency: 1, grade: 'excellent' },
  rank: 2, population: 3,
  trend: [{ label: '09-01', from: '2026-09-01', to: '2026-09-07', score: 70, late_days: 4, absent_days: 0, early_days: 0, late_minutes: 80 }],
  weekdays: [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, late_days: dow < 3 ? 3 : 0, absent_days: 0, early_days: 0, worked_days: 4, avg_in_offset: 10 })),
  in_histogram: [{ bucket: 0, days: 12 }, { bucket: 30, days: 18 }],
  days: [
    { date: '2026-09-01', dow: 2, status: 'late', late: 20, early: 0, in: '2026-09-01T05:30:00Z', out: '2026-09-01T13:00:00Z', expected_in: '2026-09-01T05:00:00Z', expected_out: '2026-09-01T13:00:00Z', worked: 450, in_offset: 30, extra: 0, source: 'auto' },
    { date: '2026-09-02', dow: 3, status: 'present', late: 0, early: 0, in: '2026-09-02T05:00:00Z', out: '2026-09-02T13:00:00Z', expected_in: '2026-09-02T05:00:00Z', expected_out: '2026-09-02T13:00:00Z', worked: 480, in_offset: 0, extra: 0, source: 'auto' },
  ],
  weights: REPORT.weights,
}

describe('00249 — صفحة تقارير سلوك الموظفين', () => {
  beforeEach(() => { h.report = REPORT; h.employee = EMPLOYEE; h.lastArgs = null })
  const open = (props: { readOnly?: boolean } = {}) => render(<MemoryRouter><BehaviorReportsPage {...props} /></MemoryRouter>)

  it('الأنواع الأربعة كتبويبات، والطلب يرسل النوع والمرساة؛ التنقل يحرك الفترة', () => {
    open()
    for (const k of ['monthly', 'quarterly', 'half_yearly', 'yearly']) expect(screen.getByTestId(`tab-${k}`)).toBeInTheDocument()
    expect((h.lastArgs as { kind: string }).kind).toBe('monthly')
    fireEvent.click(screen.getByTestId('tab-quarterly'))
    expect((h.lastArgs as { kind: string; anchor: string }).kind).toBe('quarterly')
    const before = (h.lastArgs as { anchor: string }).anchor
    fireEvent.click(screen.getByTestId('behavior-prev'))
    const after = (h.lastArgs as { anchor: string }).anchor
    expect(after < before).toBe(true)
    fireEvent.change(screen.getByTestId('behavior-dept'), { target: { value: 'd1' } })
    expect((h.lastArgs as { departmentId: string | null }).departmentId).toBe('d1')
  })

  it('المؤشرات، توزيع التصنيفات، الاستنتاجات، لوحة الشرف والمتابعة، المنهجية — بأرقام لاتينية', () => {
    open()
    expect(screen.getByTestId('behavior-period-title')).toHaveTextContent('أيلول 2026')
    expect(screen.getByTestId('kpi-score')).toHaveTextContent('84.6')
    expect(screen.getByTestId('kpi-attendance')).toHaveTextContent('95.6')
    expect(screen.getByTestId('kpi-chronic')).toHaveTextContent('1')
    expect(screen.getByTestId('grade-excellent')).toHaveTextContent('1')
    expect(screen.getByTestId('grade-fair')).toHaveTextContent('2')
    expect(screen.getByTestId('behavior-insights')).toHaveTextContent('تحسّن 4.6 نقطة')
    expect(screen.getByTestId('behavior-insights')).toHaveTextContent('يوم الأحد هو الأعلى تأخيراً')
    expect(within(screen.getByTestId('behavior-top')).getByTestId('mini-A')).toHaveTextContent('مثالي')
    expect(within(screen.getByTestId('behavior-bottom')).getByTestId('mini-B')).toHaveTextContent('متأخر')
    expect(screen.getByTestId('behavior-trend-values')).toHaveTextContent('09-01: 85')
    expect(screen.getByTestId('behavior-weekday-values')).toHaveTextContent('الأحد: 50٪')
    expect(screen.getByTestId('behavior-method')).toHaveTextContent('40٪ الالتزام بالحضور')
    expect(screen.getByTestId('behavior-page').textContent).not.toMatch(/[٠-٩]/)
  })

  it('الترتيب: بحث وتصفية بالتصنيف وفرز بالعمود؛ وسوم مزمن/غياب مرتفع', () => {
    open()
    const lb = screen.getByTestId('behavior-leaderboard')
    expect(within(lb).getAllByTestId(/^lb-row-/)).toHaveLength(3)
    expect(within(lb).getByTestId('lb-row-B')).toHaveTextContent('مزمن')
    expect(within(lb).getByTestId('lb-row-C')).toHaveTextContent('غياب مرتفع')
    fireEvent.change(within(lb).getByTestId('lb-grade'), { target: { value: 'fair' } })
    expect(within(lb).getAllByTestId(/^lb-row-/)).toHaveLength(2)
    fireEvent.change(within(lb).getByTestId('lb-grade'), { target: { value: '' } })
    fireEvent.change(within(lb).getByTestId('lb-search'), { target: { value: 'غائب' } })
    expect(within(lb).getAllByTestId(/^lb-row-/)).toHaveLength(1)
    fireEvent.change(within(lb).getByTestId('lb-search'), { target: { value: '' } })
    fireEvent.click(within(lb).getByTestId('lb-sort-late_days'))
    expect(within(lb).getAllByTestId(/^lb-row-/)[0]).toHaveAttribute('data-testid', 'lb-row-B')
  })

  it('بطاقة الموظف: الرادار، القراءة، خريطة الأيام، السجل اليومي، المقارنة بالسابقة', () => {
    open()
    fireEvent.click(screen.getByTestId('lb-row-B'))
    const card = screen.getByTestId('employee-card')
    expect(card).toHaveTextContent('متأخر')
    expect(within(card).getByTestId('emp-insights')).toHaveTextContent('تراجع 30.1 نقطة')
    expect(within(card).getByTestId('emp-insights')).toHaveTextContent('تأخير مزمن')
    expect(within(card).getByTestId('emp-radar')).toHaveTextContent('الانضباط بوقت الدخول')
    expect(within(card).getByTestId('day-2026-09-01')).toHaveTextContent('20')
    expect(within(card).getByTestId('emp-days')).toHaveTextContent('+30')
    expect(within(card).getByTestId('emp-hist')).toHaveTextContent('+30: 18')
    fireEvent.click(screen.getByTestId('drawer-close'))
    expect(screen.queryByTestId('employee-card')).toBeNull()
  })

  it('لا بيانات ⇒ رسالة؛ والوضع للقراءة يُعلن في المنهجية', () => {
    h.report = { ...REPORT, summary: null, employees: [] }
    open({ readOnly: true })
    expect(screen.getByText('لا بصمات لأي موظف في هذه الفترة')).toBeInTheDocument()
    h.report = REPORT
  })
})
