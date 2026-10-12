/** 00208: صفحة «الطلبات» في بوابة الكراج — إجازات/زمنيات موظفي قسم الكراج، نيابةً عن موظف، بلا بيانات حساسة. */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const leavesSummary = vi.fn(); const employees = vi.fn(); const listLeaveRequests = vi.fn(); const cancelLeave = vi.fn(); const balance = vi.fn()
vi.mock('@sdk/central-garage.sdk', () => ({ centralGarage: { leavesSummary: () => leavesSummary(), employees: (...a: unknown[]) => employees(...a) } }))
vi.mock('@sdk/hr.sdk', () => ({
  hr: {
    listLeaveRequests: (...a: unknown[]) => listLeaveRequests(...a), cancelLeave: (...a: unknown[]) => cancelLeave(...a), decideLeave: vi.fn(),
    balance: (...a: unknown[]) => balance(...a), policy: () => Promise.resolve({ permit_max_minutes: 180 }),
    listLeaveTypes: () => Promise.resolve([{ id: 't1', code: 'annual', name: 'إجازة اعتيادية', kind: 'leave', is_paid: true, consumes_balance: true, requires_attachment: false, is_active: true }]),
    requestLeave: vi.fn(), signedUrl: vi.fn(),
  },
  hrErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}))

import GarageRequestsPage from '@portals/central-garage/pages/GarageRequestsPage'

const row = (o: Record<string, unknown>) => ({
  id: 'l1', employee_id: 'e1', employee_number: 'G-001', full_name: 'أحمد علي', department_name: 'الكراج المركزي', kind: 'leave', type_code: 'annual', type_name: 'إجازة اعتيادية', is_paid: true, consumes_balance: true,
  start_date: '2026-10-20', end_date: '2026-10-21', start_time: null, end_time: null, days: 2, minutes: 0, status: 'pending', notes: null, attachment_path: null,
  manager_id: 'm1', manager_name: 'مدير الكراج', requested_by: 'u-garage', decided_at: null, decision_note: null, cancelled_reason: null, created_at: '2026-10-12T08:00:00Z', can_decide: false, can_cancel: true, ...o,
})
const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)

describe('GarageRequestsPage (00208)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    leavesSummary.mockResolvedValue({ pending: 1, my_decisions: 0, on_leave_today: 0, permits_month: 2, scoped: true })
    employees.mockResolvedValue({ month: '2026-10-01', department: 'الكراج المركزي', scoped: true, summary: { total: 1, drivers: 1, active: 1, on_leave: 0, absent_today: 0, with_open_disclosures: 0 },
      rows: [{ id: 'e1', employee_number: 'G-001', full_name: 'أحمد علي', job_title: 'سائق', department: 'الكراج المركزي', is_driver: true, hire_date: '2025-01-01', employment_status: 'active', contract_type: 'monthly', phone: null, shift: null, vehicle: null, month: { present: 0, late: 0, absent: 0, leave: 0, working_days: 0 }, open_disclosures: 0, approved_disclosures_month: 0 }] })
    listLeaveRequests.mockResolvedValue([row({}), row({ id: 'l2', status: 'approved', can_cancel: false, start_date: '2026-09-01', end_date: '2026-09-01' })])
    cancelLeave.mockResolvedValue(undefined)
    balance.mockResolvedValue({ year: 2026, granted: 20, accrued: 20, used_leave_days: 2, permits_count: 1, used_permit_days: 0.333, remaining: 17.667, permits_per_leave_day: 3, overtime_days: 0, carried: 0, adjusted: 0 })
  })

  it('الرأس الموحد + نطاق garage + المعلّقة أولاً، وبلا رواتب', async () => {
    wrap(<GarageRequestsPage />)
    expect(await screen.findByTestId('exec-page-header')).toHaveTextContent('طلبات موظفي الكراج')
    await waitFor(() => expect(listLeaveRequests).toHaveBeenCalledWith(expect.objectContaining({ scope: 'garage' })))
    expect(await screen.findByTestId('gr-inbox-row-l1')).toHaveTextContent('أحمد علي')
    expect(screen.queryByTestId('gr-inbox-row-l2')).toBeNull()
    expect(screen.getByTestId('gr-inbox-cancel-l1')).toBeInTheDocument()   // أدخله الكراج ⇒ يلغيه
    expect(screen.queryByTestId('gr-inbox-approve-l1')).toBeNull()         // ليس المعتمد ⇒ لا موافقة
    expect(screen.getByTestId('garage-requests-page').innerHTML).not.toContain('راتب')
    fireEvent.click(screen.getByTestId('gr-tab-all'))
    expect(await screen.findByTestId('gr-all-row-l2')).toBeInTheDocument()
    expect(screen.queryByTestId('gr-all-cancel-l2')).toBeNull()            // معتمد ⇒ لا إلغاء من الكراج
  })

  it('نموذج «نيابة عن موظف» يعرض موظفي قسم الكراج فقط', async () => {
    wrap(<GarageRequestsPage />)
    await screen.findByTestId('gr-inbox-row-l1')
    fireEvent.click(screen.getByTestId('gr-on-behalf'))
    const sel = await screen.findByTestId('gr-behalf-emp')
    expect(sel).toHaveTextContent('أحمد علي · G-001 · سائق')
    fireEvent.change(sel, { target: { value: 'e1' } })
    expect(await screen.findByTestId('gr-behalf-form')).toBeInTheDocument()
    expect(await screen.findByTestId('gr-behalf-balance')).toBeInTheDocument()
  })

  it('رسالة واضحة عند حساب كراج بلا قسم', async () => {
    leavesSummary.mockRejectedValue(new Error('GARAGE_NO_DEPARTMENT')); listLeaveRequests.mockRejectedValue(new Error('GARAGE_NO_DEPARTMENT'))
    wrap(<GarageRequestsPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('غير مربوط بقسم')
  })
})
