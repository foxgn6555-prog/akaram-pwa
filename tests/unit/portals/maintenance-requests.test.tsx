/** 00223: صفحة «الطلبات» في بوابة الصيانة — نفس الصفحة المشتركة بعنوان الصيانة؛ نيابة عن موظفي قسم الصيانة فقط. */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const leavesSummary = vi.fn(); const employees = vi.fn(); const listLeaveRequests = vi.fn(); const balance = vi.fn()
vi.mock('@sdk/central-garage.sdk', () => ({ centralGarage: { leavesSummary: () => leavesSummary(), employees: (...a: unknown[]) => employees(...a) } }))
vi.mock('@sdk/hr.sdk', () => ({
  hr: {
    listLeaveRequests: (...a: unknown[]) => listLeaveRequests(...a), cancelLeave: vi.fn(), decideLeave: vi.fn(),
    balance: (...a: unknown[]) => balance(...a), policy: () => Promise.resolve({ permit_max_minutes: 180 }),
    listLeaveTypes: () => Promise.resolve([{ id: 't1', code: 'annual', name: 'إجازة اعتيادية', kind: 'leave', is_paid: true, consumes_balance: true, requires_attachment: false, is_active: true }]),
    requestLeave: vi.fn(), signedUrl: vi.fn(),
  },
  hrErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}))

import MaintenanceRequestsPage from '@portals/maintenance/pages/Requests/MaintenanceRequestsPage'

const row = {
  id: 'l1', employee_id: 'e1', employee_number: 'M-001', full_name: 'فني الورشة', department_name: 'الصيانة', kind: 'leave', type_code: 'annual', type_name: 'إجازة اعتيادية', is_paid: true, consumes_balance: true,
  start_date: '2026-10-20', end_date: '2026-10-21', start_time: null, end_time: null, days: 2, minutes: 0, status: 'pending', notes: null, attachment_path: null,
  manager_id: 'm1', manager_name: 'مسؤول الصيانة', requested_by: 'u-maint', decided_at: null, decision_note: null, cancelled_reason: null, created_at: '2026-10-12T08:00:00Z', can_decide: false, can_cancel: true,
}
const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MaintenanceRequestsPage /></QueryClientProvider>)

describe('MaintenanceRequestsPage (00223)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    leavesSummary.mockResolvedValue({ pending: 1, my_decisions: 0, on_leave_today: 0, permits_month: 0, scoped: true })
    employees.mockResolvedValue({ month: '2026-10-01', department: 'الصيانة', scoped: true, summary: { total: 1, drivers: 0, active: 1, on_leave: 0, absent_today: 0, with_open_disclosures: 0 },
      rows: [{ id: 'e1', employee_number: 'M-001', full_name: 'فني الورشة', job_title: 'فني صيانة', department: 'الصيانة', is_driver: false, hire_date: '2025-01-01', employment_status: 'active', contract_type: 'monthly', phone: null, shift: null, vehicle: null, month: { present: 0, late: 0, absent: 0, leave: 0, working_days: 0 }, open_disclosures: 0, approved_disclosures_month: 0 }] })
    listLeaveRequests.mockResolvedValue([row])
    balance.mockResolvedValue({ year: 2026, granted: 20, accrued: 20, used_leave_days: 0, permits_count: 0, used_permit_days: 0, remaining: 20, permits_per_leave_day: 3, overtime_days: 0, carried: 0 })
  })

  it('الرأس الموحد بعنوان الصيانة، نفس نطاق القسم، ونموذج «نيابة عن موظف» من قسم الصيانة فقط', async () => {
    wrap()
    expect(await screen.findByTestId('maintenance-requests-page')).toBeInTheDocument()
    expect(screen.getByTestId('exec-page-header')).toHaveTextContent('طلبات موظفي الصيانة')
    expect(screen.getByTestId('exec-page-header')).toHaveTextContent('قسم الصيانة')
    await waitFor(() => expect(listLeaveRequests).toHaveBeenCalledWith(expect.objectContaining({ scope: 'garage' })))
    expect(await screen.findByTestId('gr-inbox-row-l1')).toHaveTextContent('فني الورشة')
    expect(screen.getByTestId('gr-inbox-cancel-l1')).toBeInTheDocument()
    expect(screen.getByTestId('maintenance-requests-page').innerHTML).not.toContain('راتب')
    fireEvent.click(screen.getByTestId('gr-on-behalf'))
    expect(screen.getByTestId('gr-behalf-panel')).toHaveTextContent('الموظف (من قسم الصيانة)')
    const sel = await screen.findByTestId('gr-behalf-emp')
    expect(sel).toHaveTextContent('فني الورشة · M-001')
  })

  it('رسالة واضحة عند حساب صيانة بلا قسم', async () => {
    leavesSummary.mockRejectedValue(new Error('MAINTENANCE_NO_DEPARTMENT')); listLeaveRequests.mockRejectedValue(new Error('MAINTENANCE_NO_DEPARTMENT'))
    wrap()
    expect(await screen.findByRole('alert')).toHaveTextContent('قسم الصيانة')
  })
})
