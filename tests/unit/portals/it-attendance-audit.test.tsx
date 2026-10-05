/** صفحة «سجل تعديلات الحضور» في بوابة التطوير المركزية (00178) */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const rows = [
  { id: 'a1', employee_id: 'e1', employee_number: 'E100', full_name: 'أحمد علي', department_name: 'النقل', work_date: '2026-10-02', action: 'edit', before: { status: 'absent', check_in: null }, after: { status: 'late', check_in: '2026-10-02T05:40:00+00:00', late_minutes: 25 }, reason: 'بصمة الدخول لم تُسجَّل', actor: 'u1', actor_name: 'مدقق العمليات', created_at: '2026-10-05T07:30:00Z' },
  { id: 'a2', employee_id: 'e2', employee_number: 'E200', full_name: 'كرار يوسف', department_name: null, work_date: '2026-10-03', action: 'waive', before: { waived: false }, after: { waived: true }, reason: 'عذر مقبول', actor: 'u1', actor_name: 'مدقق العمليات', created_at: '2026-10-05T08:00:00Z' },
  { id: 'a3', employee_id: 'e1', employee_number: 'E100', full_name: 'أحمد علي', department_name: 'النقل', work_date: '2026-10-01', action: 'deduction_add', before: null, after: { days: 1 }, reason: 'غياب بلا عذر', actor: 'u1', actor_name: 'مدقق العمليات', created_at: '2026-10-05T09:00:00Z' },
]
vi.mock('@features/hr', () => ({ useAttendanceAuditNamed: () => ({ data: rows, isLoading: false, refetch: vi.fn(), isFetching: false }) }))
import AttendanceAuditPage from '@portals/it/pages/Integrations/biometric/AttendanceAuditPage'

describe('IT · سجل تعديلات الحضور', () => {
  it('يعرض العدادات والصفوف بأسماء الموظف والمدقّق والفرق المقروء بأرقام إنكليزية', () => {
    render(<MemoryRouter><AttendanceAuditPage /></MemoryRouter>)
    expect(screen.getByTestId('audit-k-edits')).toHaveTextContent('1')
    expect(screen.getByTestId('audit-k-waives')).toHaveTextContent('1')
    expect(screen.getByTestId('audit-k-deductions')).toHaveTextContent('1')
    const r1 = screen.getByTestId('audit-row-a1')
    expect(r1).toHaveTextContent('أحمد علي'); expect(r1).toHaveTextContent('مدقق العمليات'); expect(r1).toHaveTextContent('تعديل يوم حضور')
    expect(r1).toHaveTextContent('غائب'); expect(r1).toHaveTextContent('متأخر'); expect(r1).toHaveTextContent('08:40')
    expect(screen.getByTestId('audit-table').textContent).not.toMatch(/[\u0660-\u0669]/)
  })
  it('فلتر الإجراء والبحث يعملان', () => {
    render(<MemoryRouter><AttendanceAuditPage /></MemoryRouter>)
    fireEvent.change(screen.getByTestId('audit-action'), { target: { value: 'waive' } })
    expect(screen.queryByTestId('audit-row-a1')).toBeNull(); expect(screen.getByTestId('audit-row-a2')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('audit-action'), { target: { value: '' } })
    fireEvent.change(screen.getByTestId('audit-search'), { target: { value: 'E200' } })
    expect(screen.queryByTestId('audit-row-a1')).toBeNull(); expect(screen.getByTestId('audit-row-a2')).toBeInTheDocument()
  })
})
