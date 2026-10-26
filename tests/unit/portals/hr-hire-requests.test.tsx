/** 00348 (B) — الموارد البشرية: «تعيينات معتمدة بانتظار الإكمال» — القائمة، فحص الرقم الوظيفي اليدوي، نموذج التوظيف معبّأً من الطلب، والحفظ عبر hire_request_complete (لا hr_employee_create). */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({
  complete: vi.fn(async (_v: { requestId: string; input: Record<string, unknown> }) => 'emp-1'),
  create: vi.fn(async () => 'should-not-be-called'),
  available: true,
}))
const approved = [{
  id: 'q1', full_name: 'كريم حسن', phone: '07801234567', job_title_id: 't1', job_title: 'وزّان', department_id: 'd1', department: 'ميزان المحطة', hire_date: '2026-11-05', contract_type: 'monthly', shift_id: 's1', shift_name: 'صباحي',
  source: 'station', source_label: 'المحطة التحويلية', requester_name: 'مسؤول المحطة', note: null, status: 'approved', created_at: '2026-10-20T06:00:00Z', decided_at: '2026-10-21T06:00:00Z', completed_at: null, employee_id: null, employee_number: null, days_waiting: 4,
}]
const completed = [{ ...approved[0], id: 'q0', full_name: 'سعد كاظم', status: 'completed', completed_at: '2026-10-22T06:00:00Z', employee_id: 'e0', employee_number: 'S-0100', days_waiting: 0 }]
vi.mock('@features/branches', () => ({ useBranches: () => ({ data: [{ id: 'b1', name: 'بغداد' }] }) }))
vi.mock('@features/departments', () => ({ useDepartments: () => ({ data: [
  { id: 'd1', name: 'ميزان المحطة', code: 'TSW', parent_id: null, is_active: true, is_job_title: false },
  { id: 't1', name: 'وزّان', code: 'T1', parent_id: 'd1', is_active: true, is_job_title: true, drives_vehicles: false },
] }) }))
vi.mock('@features/hr/hooks/useHr', () => ({
  useHrShifts: () => ({ data: [{ id: 's1', name: 'صباحي', start_time: '08:00', end_time: '16:00', grace_minutes: 15, work_days: [0, 1, 2, 3, 4], is_active: true }] }),
  useHrEmployees: () => ({ data: [], isLoading: false }),
  useCreateEmployee: () => ({ mutateAsync: h.create, isPending: false }),
  useCompleteHireRequest: () => ({ mutateAsync: h.complete, isPending: false }),
  useHrHireRequests: (status: string) => ({ data: status === 'approved' ? approved : completed, isLoading: false, error: null }),
  useEmployeeNumberAvailable: (n: string) => ({ data: n ? h.available : undefined, isLoading: false }),
  useSaveShift: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTerminateEmployee: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUploadDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEmployeeDocuments: () => ({ data: [], isLoading: false }),
  useDeleteDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useImportEmployees: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useHrJobTitles: () => ({ data: [{ id: 't1', name: 'وزّان', code: 'T1', department_id: 'd1', department_name: 'ميزان المحطة', drives_vehicles: false, is_active: true, employees_active: 0 }], isLoading: false }),
}))
import HireRequestsPage from '@portals/hr/pages/Recruitment/HireRequestsPage'

const wrap = () => render(<MemoryRouter><HireRequestsPage /></MemoryRouter>)

describe('HR — تعيينات معتمدة بانتظار الإكمال (00348 B)', () => {
  beforeEach(() => { h.complete.mockClear(); h.create.mockClear(); h.available = true })

  it('القائمة تعرض المعتمد مع الجهة والطالب ومدة الانتظار، والمكتمل برقمه في تبويبه', () => {
    wrap()
    expect(screen.getByTestId('exec-page-header')).toHaveTextContent('تعيينات معتمدة بانتظار الإكمال')
    expect(screen.getByTestId('hr-hire-waiting')).toHaveTextContent('1')
    const row = screen.getByTestId('hr-hire-req-q1')
    expect(row).toHaveTextContent('كريم حسن'); expect(row).toHaveTextContent('من المحطة التحويلية'); expect(row).toHaveTextContent('طلبه مسؤول المحطة')
    expect(screen.getByTestId('hr-hire-wait-q1')).toHaveTextContent('منذ 4 يوم')
    fireEvent.click(screen.getByText('المكتملة'))
    expect(screen.getByTestId('hr-hire-req-q0')).toHaveTextContent('S-0100')
    expect(screen.getByTestId('hr-hire-open-q0')).toHaveAttribute('href', '/hr/employees/e0')
  })

  it('الإكمال: النموذج معبّأ من الطلب، الرقم الوظيفي فارغ ويدوي مع فحص فوري، والحفظ يمرّ عبر hire_request_complete فقط', async () => {
    wrap()
    fireEvent.click(screen.getByTestId('hr-hire-complete-q1'))
    expect(screen.getByTestId('hr-hire-complete')).toBeInTheDocument()
    expect(screen.getByTestId('f-name')).toHaveValue('كريم حسن')
    expect(screen.getByTestId('f-title')).toHaveValue('t1')
    expect(screen.getByTestId('f-shift')).toHaveValue('s1')
    expect(screen.getByTestId('f-phone')).toHaveValue('07801234567')
    expect(screen.getByTestId('f-number')).toHaveValue('')   // يدوي — لا اقتراح
    expect(screen.getByTestId('hire-submit')).toHaveTextContent('حفظ وإنزال الموظف للنظام')
    // فحص الرقم
    fireEvent.change(screen.getByTestId('hr-hire-number-input'), { target: { value: 'S-0101' } })
    expect(screen.getByTestId('hr-hire-number-free')).toBeInTheDocument()
    h.available = false
    fireEvent.change(screen.getByTestId('hr-hire-number-input'), { target: { value: 'S-0100' } })
    expect(screen.getByTestId('hr-hire-number-taken')).toBeInTheDocument()
    // بلا رقم ⇒ رسالة؛ ثم الحفظ
    fireEvent.change(screen.getByTestId('f-branch'), { target: { value: 'b1' } })
    fireEvent.click(screen.getByTestId('hire-submit'))
    await waitFor(() => expect(screen.getByTestId('hire-error')).toHaveTextContent('الرقم الوظيفي مطلوب'))
    fireEvent.change(screen.getByTestId('f-number'), { target: { value: 'S-0101' } })
    fireEvent.click(screen.getByTestId('hire-submit'))
    await waitFor(() => expect(h.complete).toHaveBeenCalledTimes(1))
    const call = h.complete.mock.calls[0]?.[0]
    expect(call?.requestId).toBe('q1')
    expect(call?.input).toMatchObject({ employee_number: 'S-0101', full_name: 'كريم حسن', job_title_id: 't1', department_id: 'd1', shift_id: 's1', contract_type: 'monthly', hire_date: '2026-11-05' })
    expect(h.create).not.toHaveBeenCalled()
    expect(await screen.findByTestId('hire-success')).toHaveTextContent('أُبلغ مقدّم طلب التعيين')
    expect(screen.queryByTestId('hire-another')).toBeNull()
  })
})
