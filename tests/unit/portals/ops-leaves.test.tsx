/** 00239: وحدة «طلبات الإجازة» في غرفة العمليات — نيابةً عن أي موظف في الملاك، بحث حي، وسم «قُدِّم عبر غرفة العمليات»، لا اعتماد من غرفة العمليات. */
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { PORTAL_UNITS } from '@config/portals.config'
import { PORTALS } from '@lib/constants/portals.constants'

const opsLeavesSummary = vi.fn(); const lookup = vi.fn(); const listLeaveRequests = vi.fn(); const cancelLeave = vi.fn(); const balance = vi.fn()
// 00391: معاينة مسار الموافقة للموظف المختار (سلسلة قسم)
vi.mock('@features/sector-manager/hooks', () => ({ useApprovalDiagnose: (id: string) => ({ isLoading: false, isError: false, data: { employee: { id, full_name: 'كريم جاسم', employee_number: 'E-009', department_id: 'd1', department_name: 'النظافة', has_account: false, roles: [], manager_id: 'm1', manager_name: 'مدير القسم', manager_has_account: true },
  type: 'leave', subtype: null, chain: { id: 'c1', scope: 'department', requester_role: 'department', requester_label: 'موظفو القسم', subtype: null, department_id: 'd1', department_name: 'النظافة', include_children: true },
  steps: [{ step_no: 1, label: 'مسؤول قسم (حسب التسلسل)', mode: 'any', sla_days: null, escalate: 'none', condition: null, status: 'active', approvers: [{ user_id: 'm1', name: 'مدير القسم' }], delegates: [] }], active_steps: 1, department_path: [], checks: [], ok: true, fallback: 'chain', reason: null, hints: [] } }) }))
vi.mock('@sdk/hr.sdk', () => ({
  hr: {
    opsLeavesSummary: () => opsLeavesSummary(), opsLeaveEmployeeLookup: (...a: unknown[]) => lookup(...a),
    listLeaveRequests: (...a: unknown[]) => listLeaveRequests(...a), cancelLeave: (...a: unknown[]) => cancelLeave(...a), decideLeave: vi.fn(),
    balance: (...a: unknown[]) => balance(...a), policy: () => Promise.resolve({ permit_max_minutes: 180 }),
    listLeaveTypes: () => Promise.resolve([{ id: 't1', code: 'annual', name: 'إجازة اعتيادية', kind: 'leave', is_paid: true, consumes_balance: true, requires_attachment: false, is_active: true }]),
    requestLeave: vi.fn(), signedUrl: vi.fn(),
  },
  hrErrorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}))

import OpsLeavesPage from '@portals/ops-room/pages/Leaves/OpsLeavesPage'

const row = (o: Record<string, unknown>) => ({
  id: 'l1', employee_id: 'e1', employee_number: 'E-001', full_name: 'أحمد علي', department_name: 'النظافة', kind: 'leave', type_code: 'annual', type_name: 'إجازة اعتيادية', is_paid: true, consumes_balance: true,
  start_date: '2026-10-20', end_date: '2026-10-21', start_time: null, end_time: null, days: 2, minutes: 0, status: 'pending', notes: null, attachment_path: null,
  manager_id: 'm1', manager_name: 'مدير القسم', requested_by: 'u-ops', decided_at: null, decision_note: null, cancelled_reason: null, created_at: '2026-10-12T08:00:00Z', can_decide: false, can_cancel: true,
  requested_via: 'ops_room', requester_name: 'موظف العمليات', ...o,
})
const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)

describe('OpsLeavesPage (00239)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    opsLeavesSummary.mockResolvedValue({ pending: 3, via_ops_pending: 1, via_ops_month: 4, on_leave_today: 2 })
    listLeaveRequests.mockResolvedValue([
      row({}),
      row({ id: 'l2', full_name: 'سارة حسن', employee_number: 'E-002', requested_via: 'self', requester_name: null, requested_by: 'u-emp', can_cancel: false }),
      row({ id: 'l3', status: 'approved', can_cancel: false }),
    ])
    lookup.mockResolvedValue([
      { id: 'e9', full_name: 'كريم جاسم', employee_number: 'E-009', job_title: 'عامل', department_name: 'النظافة', has_account: false, has_biometric: false, manager_name: 'مدير القسم' },
    ])
    cancelLeave.mockResolvedValue(undefined)
    balance.mockResolvedValue({ year: 2026, granted: 30, accrued: 30, used_leave_days: 0, permits_count: 0, used_permit_days: 0, remaining: 30, permits_per_leave_day: 3, overtime_days: 0, carried: 0, adjusted: 0 })
  })

  it('الوحدة مسجّلة في بوابة غرفة العمليات', () => {
    expect(PORTAL_UNITS[PORTALS.OPS_ROOM].some((u) => u.path === '/ops-room/leaves')).toBe(true)
  })

  it('الرأس + تبويب «قدّمتها غرفة العمليات» أولاً مع الوسم، ولا أزرار موافقة لغرفة العمليات', async () => {
    wrap(<OpsLeavesPage />)
    expect(await screen.findByTestId('exec-page-header')).toHaveTextContent('طلبات الإجازة')
    await waitFor(() => expect(listLeaveRequests).toHaveBeenCalledWith(expect.objectContaining({ scope: 'all' })))
    expect(await screen.findByTestId('ol-ops-row-l1')).toHaveTextContent('أحمد علي')
    expect(screen.getByTestId('via-l1')).toHaveTextContent('قُدِّم عبر غرفة العمليات · موظف العمليات')
    expect(screen.queryByTestId('ol-ops-row-l2')).toBeNull()                 // طلب ذاتي ⇒ ليس في تبويب غرفة العمليات
    expect(screen.getByTestId('ol-ops-cancel-l1')).toBeInTheDocument()       // أدخلته غرفة العمليات ومعلّق ⇒ إلغاء
    expect(screen.queryByTestId('ol-ops-approve-l1')).toBeNull()             // لا اعتماد من غرفة العمليات
    expect(screen.queryByTestId('ol-ops-cancel-l3')).toBeNull()              // معتمد ⇒ لا إلغاء
    fireEvent.click(screen.getByTestId('ol-tab-pending'))
    expect(await screen.findByTestId('ol-pending-row-l2')).toBeInTheDocument()
    expect(screen.queryByTestId('via-l2')).toBeNull()                        // الطلب الذاتي بلا وسم
    expect(screen.getByTestId('ops-leaves-page').innerHTML).not.toContain('راتب')
  })

  it('بحث حي عن أي موظف في الملاك (حتى بلا حساب/بصمة) ثم نموذج الطلب والرصيد', async () => {
    wrap(<OpsLeavesPage />)
    await screen.findByTestId('ol-ops-row-l1')
    fireEvent.click(screen.getByTestId('ol-on-behalf'))
    fireEvent.change(await screen.findByTestId('ol-emp-search'), { target: { value: 'كريم' } })
    const hit = await screen.findByTestId('ol-emp-E-009')
    expect(hit).toHaveTextContent('كريم جاسم'); expect(hit).toHaveTextContent('بلا حساب'); expect(hit).toHaveTextContent('بلا بصمة')
    await waitFor(() => expect(lookup).toHaveBeenCalledWith('كريم'))
    fireEvent.click(hit)
    expect(await screen.findByTestId('ol-picked')).toHaveTextContent('المدير المباشر: مدير القسم')
    expect(screen.getByTestId('ol-chain')).toHaveAttribute('data-ok', '1')
    expect(screen.getByTestId('ol-chain-scope')).toHaveTextContent('سلسلة قسم «النظافة»')
    expect(screen.getByTestId('ol-chain-step-1')).toHaveTextContent('مدير القسم')
    expect(await screen.findByTestId('ol-behalf-form')).toBeInTheDocument()
    expect(await screen.findByTestId('ol-behalf-balance')).toBeInTheDocument()
  })
})
