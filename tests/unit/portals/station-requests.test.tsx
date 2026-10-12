/** 00212: صفحة «الطلبات» في بوابة المحطة التحويلية — نفس الصفحة المشتركة بعنوان المحطة؛ نيابة عن موظفي قسم المحطة فقط. */
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

import StationRequestsPage from '@portals/transfer-station/pages/Requests/StationRequestsPage'

const row = {
  id: 'l1', employee_id: 'e1', employee_number: 'S-001', full_name: 'موظف الميزان', department_name: 'المحطة التحويلية', kind: 'leave', type_code: 'annual', type_name: 'إجازة اعتيادية', is_paid: true, consumes_balance: true,
  start_date: '2026-10-20', end_date: '2026-10-21', start_time: null, end_time: null, days: 2, minutes: 0, status: 'pending', notes: null, attachment_path: null,
  manager_id: 'm1', manager_name: 'مسؤول المحطة', requested_by: 'u-station', decided_at: null, decision_note: null, cancelled_reason: null, created_at: '2026-10-12T08:00:00Z', can_decide: false, can_cancel: true,
}
const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><StationRequestsPage /></QueryClientProvider>)

describe('StationRequestsPage (00212)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    leavesSummary.mockResolvedValue({ pending: 1, my_decisions: 0, on_leave_today: 0, permits_month: 0, scoped: true })
    employees.mockResolvedValue({ month: '2026-10-01', department: 'المحطة التحويلية', scoped: true, summary: { total: 1, drivers: 0, active: 1, on_leave: 0, absent_today: 0, with_open_disclosures: 0 },
      rows: [{ id: 'e1', employee_number: 'S-001', full_name: 'موظف الميزان', job_title: 'وزّان', department: 'المحطة التحويلية', is_driver: false, hire_date: '2025-01-01', employment_status: 'active', contract_type: 'monthly', phone: null, shift: null, vehicle: null, month: { present: 0, late: 0, absent: 0, leave: 0, working_days: 0 }, open_disclosures: 0, approved_disclosures_month: 0 }] })
    listLeaveRequests.mockResolvedValue([row])
    balance.mockResolvedValue({ year: 2026, granted: 20, accrued: 20, used_leave_days: 0, permits_count: 0, used_permit_days: 0, remaining: 20, permits_per_leave_day: 3, overtime_days: 0, carried: 0 })
  })

  it('الرأس الموحد بعنوان المحطة، نفس نطاق القسم، ونموذج «نيابة عن موظف» من قسم المحطة فقط', async () => {
    wrap()
    expect(await screen.findByTestId('station-requests-page')).toBeInTheDocument()
    expect(screen.getByTestId('exec-page-header')).toHaveTextContent('طلبات موظفي المحطة')
    expect(screen.getByTestId('exec-page-header')).toHaveTextContent('قسم المحطة التحويلية')
    await waitFor(() => expect(listLeaveRequests).toHaveBeenCalledWith(expect.objectContaining({ scope: 'garage' })))
    expect(await screen.findByTestId('gr-inbox-row-l1')).toHaveTextContent('موظف الميزان')
    expect(screen.getByTestId('gr-inbox-cancel-l1')).toBeInTheDocument()
    expect(screen.getByTestId('station-requests-page').innerHTML).not.toContain('راتب')
    fireEvent.click(screen.getByTestId('gr-on-behalf'))
    expect(screen.getByTestId('gr-behalf-panel')).toHaveTextContent('الموظف (من قسم المحطة التحويلية)')
    const sel = await screen.findByTestId('gr-behalf-emp')
    expect(sel).toHaveTextContent('موظف الميزان · S-001')
  })

  it('رسالة واضحة عند حساب محطة بلا قسم', async () => {
    leavesSummary.mockRejectedValue(new Error('STATION_NO_DEPARTMENT')); listLeaveRequests.mockRejectedValue(new Error('STATION_NO_DEPARTMENT'))
    wrap()
    expect(await screen.findByRole('alert')).toHaveTextContent('قسم المحطة التحويلية')
  })
})
