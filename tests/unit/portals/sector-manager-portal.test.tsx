/** بوابة مسؤول القاطع (00160): الرئيسية، طلبات فريقي (سلسلة الموافقات)، التقارير، التبليغ — بلا بيانات مالية */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ decide: vi.fn(), send: vi.fn(), tasks: [] as Record<string, unknown>[], timeline: [] as Record<string, unknown>[] }))
const dash = {
  parent_sectors: [{ code: 'karrada', name: 'الكرادة' }], areas: 4, department_managers: 2, contractors: 3, areas_without_contractor: 1, workers: 40,
  present_today: 30, absent_today: 10, presence_proved: 2, out_of_zone: 1, vehicles_now: 5, pending_requests: 2, managers_on_leave: 0, notices_sent: 1, areas_detail: [],
}
const team = [{
  manager_user_id: 'm1', manager_name: 'مسؤول قسم الكرادة', manager_phone: '0772', shift: 'morning', parent_sector: 'karrada',
  areas: [{ id: 1, name: 'أرخيته', contractor_user_id: 'c1', contractor_name: 'متعهد أرخيته', checked_in: true, in_zone: false, workers: 10, present: 8, absent: 2 }, { id: 2, name: 'الرياض', contractor_user_id: null, contractor_name: null, checked_in: false, in_zone: null, workers: 0, present: 0, absent: 0 }],
  contractors: 1, workers: 10, present_today: 8, absent_today: 2, presence_proved: 1, out_of_zone: 1, vehicles_now: 2, on_leave_today: false,
}]
const task = {
  task_id: 't1', request_kind: 'leave', request_id: 'L1', step_no: 2, total_steps: 3, step_label: 'مسؤول قاطع (حسب التسلسل)', requester_user_id: 'c1', requester_name: 'متعهد أرخيته', requester_role: 'employee', requester_role_label: 'متعهد',
  area_name: 'أرخيته', parent_sector: 'الكرادة', type_name: 'إجازة اعتيادية', start_date: '2026-10-10', end_date: '2026-10-12', start_time: null, end_time: null, days: 3, minutes: 0, notes: 'ظرف عائلي', attachment_path: null, created_at: '2026-10-01T06:00:00Z',
  previous_steps: [{ step_no: 1, label: 'مسؤول قسم (حسب التسلسل)', status: 'approved', decided_by: 'مسؤول قسم الكرادة', decided_at: '2026-10-01T07:00:00Z', note: null }],
}
const reports = {
  from: '2026-09-02', to: '2026-10-01', days: 30, totals: { present: 300, absent: 50, presence_proofs: 55, out_of_zone: 3, trips: 120, manager_leaves: 1 },
  series: [{ d: '2026-09-30', present: 10, absent: 2, proofs: 2 }, { d: '2026-10-01', present: 11, absent: 1, proofs: 2 }],
  contractors: [{ user_id: 'c1', name: 'متعهد أرخيته', area: 'أرخيته', parent_sector: 'karrada', manager_name: 'مسؤول قسم الكرادة', shift: 'morning', workers: 10, present: 200, absent: 20, proof_days: 28, out_of_zone_days: 1 }],
  managers: [{ user_id: 'm1', name: 'مسؤول قسم الكرادة', shift: 'morning', parent_sector: 'karrada', areas: 'أرخيته، الرياض', contractors: 1, present: 200, absent: 20, trips: 60, leave_days: 2, permits: 1 }],
}
vi.mock('@features/sector-manager/hooks', () => ({
  useSectorManagerMe: () => ({ data: { user_id: 'sm', full_name: 'حسن مسؤول القاطع', parent_sectors: ['karrada'], parent_names: ['الكرادة'], areas: 4, department_managers: 2, contractors: 3, employee_id: 'e', has_employee: true }, isLoading: false }),
  useSectorDashboard: () => ({ data: dash, isLoading: false }),
  useSectorTeam: () => ({ data: team, isLoading: false }),
  useMyApprovalTasks: () => ({ data: h.tasks, isLoading: false }),
  useApprovalTimeline: (k?: string) => ({ data: k ? h.timeline : undefined }),
  useDecideApproval: () => ({ mutate: h.decide, isPending: false }),
  useSectorReports: () => ({ data: reports, isLoading: false }),
  useNotifyTargets: () => ({ data: [{ user_id: 'm1', full_name: 'مسؤول قسم الكرادة', parent_sector: 'karrada', areas: 'أرخيته، الرياض', shift: 'morning' }, { user_id: 'm2', full_name: 'مسؤول قسم ثانٍ', parent_sector: 'karrada', areas: 'الجادرية', shift: 'evening' }], isLoading: false }),
  useSectorNotices: () => ({ data: [{ id: 'n1', title: 'اجتماع', body: 'غداً 9', recipients_count: 2, recipient_names: 'أ، ب', created_at: '2026-10-01T05:00:00Z' }], isLoading: false }),
  useSendSectorNotice: () => ({ mutate: h.send, isPending: false }),
}))
import Dashboard from '@portals/admin-ops/pages/Dashboard/SectorManagerDashboard'
import Requests from '@portals/admin-ops/pages/Requests/TeamRequestsPage'
import Reports from '@portals/admin-ops/pages/Reports/SectorReportsPage'
import Notify from '@portals/admin-ops/pages/Notify/NotifyPage'
const wrap = (el: React.ReactElement) => render(<MemoryRouter>{el}</MemoryRouter>)

describe('بوابة مسؤول القاطع (00160)', () => {
  beforeEach(() => { vi.clearAllMocks(); h.tasks = [task]; h.timeline = [] })

  it('الرئيسية: قواطعي، المؤشرات، لافتة الطلبات المعلّقة، وحالة كل منطقة (متعهد/تواجد/خارج النطاق/بلا متعهد) — ولا كلمة مالية', () => {
    wrap(<Dashboard />)
    expect(screen.getByTestId('sm-parents')).toHaveTextContent('الكرادة')
    expect(screen.getByTestId('st-present')).toHaveTextContent('30'); expect(screen.getByTestId('st-absent')).toHaveTextContent('10')
    expect(screen.getByTestId('st-proved')).toHaveTextContent('2/3'); expect(screen.getByTestId('st-out')).toHaveTextContent('1'); expect(screen.getByTestId('st-vehicles')).toHaveTextContent('5')
    expect(screen.getByTestId('sm-pending-banner')).toHaveTextContent('2 طلب بانتظار قرارك')
    expect(screen.getByTestId('sm-attendance-ring')).toHaveTextContent('75%'); expect(screen.getByTestId('sm-attendance-ring')).toHaveTextContent('1 منطقة بلا متعهد')
    const row = screen.getByTestId('sm-team-m1')
    expect(row).toHaveTextContent('مسؤول قسم الكرادة'); expect(row).toHaveTextContent('أرخيته · متعهد أرخيته · خارج النطاق'); expect(row).toHaveTextContent('الرياض · بلا متعهد')
    const txt = document.body.textContent ?? ''
    for (const w of ['راتب', 'أجر', 'دينار', 'مالي', 'استقطاع']) expect(txt).not.toContain(w)
  })

  it('طلبات فريقي: بطاقة الطلب بخطوته والخطوات السابقة؛ الموافقة مباشرة؛ الرفض يتطلب سبباً؛ ومسار الطلب عند الطلب', async () => {
    h.timeline = [{ step_no: 1, step_label: 'مسؤول قسم (حسب التسلسل)', status: 'approved', approvers: [{ user_id: 'm1', name: 'مسؤول قسم الكرادة' }], decided_by_name: 'مسؤول قسم الكرادة', decided_at: 'x', note: null }, { step_no: 2, step_label: 'مسؤول قاطع (حسب التسلسل)', status: 'pending', approvers: [{ user_id: 'sm', name: 'حسن' }], decided_by_name: null, decided_at: null, note: null }, { step_no: 3, step_label: 'معاون المدير', status: 'waiting', approvers: [{ user_id: 'd', name: 'معاون' }], decided_by_name: null, decided_at: null, note: null }]
    wrap(<Requests />)
    const card = screen.getByTestId('task-L1')
    expect(card).toHaveTextContent('متعهد أرخيته'); expect(screen.getByTestId('task-step-L1')).toHaveTextContent('خطوة 2 من 3')
    expect(card).toHaveTextContent('إجازة اعتيادية'); expect(card).toHaveTextContent('(3 أيام)'); expect(card).toHaveTextContent('«ظرف عائلي»')
    expect(screen.getByTestId('task-prev-L1')).toHaveTextContent('1. مسؤول قسم (حسب التسلسل): موافقة — مسؤول قسم الكرادة')
    fireEvent.click(screen.getByTestId('reject-L1'))
    expect(screen.getByTestId('reject-confirm-L1')).toBeDisabled()
    fireEvent.change(screen.getByTestId('reject-reason-L1'), { target: { value: 'ضغط عمل' } })
    fireEvent.click(screen.getByTestId('reject-confirm-L1'))
    expect(h.decide).toHaveBeenCalledWith({ leaveId: 'L1', approve: false, note: 'ضغط عمل' }, expect.any(Object))
    fireEvent.click(screen.getByTestId('path-L1'))
    await waitFor(() => expect(screen.getByTestId('path-list-L1')).toHaveTextContent('3. معاون المدير — بانتظار دوره'))
  })
  it('طلبات فريقي: الموافقة تستدعي القرار بلا سبب؛ وبلا مهام تظهر حالة فارغة', () => {
    wrap(<Requests />)
    fireEvent.click(screen.getByTestId('approve-L1'))
    expect(h.decide).toHaveBeenCalledWith({ leaveId: 'L1', approve: true })
    h.tasks = []
    wrap(<Requests />)
    expect(screen.getByTestId('sm-requests-empty')).toBeInTheDocument()
  })

  it('التقارير: المؤشرات، الرسوم، تبويبا المتعهدين ومسؤولي الأقسام — بلا بيانات مالية', () => {
    wrap(<Reports />)
    expect(screen.getByTestId('rep-totals')).toHaveTextContent('300'); expect(screen.getByTestId('rep-totals')).toHaveTextContent('86%')
    expect(screen.getByTestId('chart-attendance')).toBeInTheDocument(); expect(screen.getByTestId('chart-proofs')).toBeInTheDocument()
    expect(screen.getByTestId('rep-c-c1')).toHaveTextContent('28/30')
    fireEvent.click(screen.getByTestId('tab-managers'))
    expect(screen.getByTestId('rep-m-m1')).toHaveTextContent('أرخيته، الرياض'); expect(screen.getByTestId('rep-m-m1')).toHaveTextContent('60')
    const txt = document.body.textContent ?? ''
    for (const w of ['راتب', 'أجر', 'دينار', 'مالي', 'استقطاع']) expect(txt).not.toContain(w)
  })

  it('التبليغ: عنوان ونص ≥3 أحرف، الكل افتراضياً أو مستلمون مختارون من مسؤولي أقسامه فقط، وسجل التبليغات', () => {
    wrap(<Notify />)
    expect(screen.getByTestId('notice-send')).toBeDisabled()
    fireEvent.change(screen.getByTestId('notice-title'), { target: { value: 'اجتماع طارئ' } })
    fireEvent.change(screen.getByTestId('notice-body'), { target: { value: 'غداً الساعة 9' } })
    expect(screen.getByTestId('notice-send')).toBeEnabled()
    fireEvent.click(screen.getByTestId('target-m2'))
    fireEvent.click(screen.getByTestId('notice-send'))
    expect(h.send).toHaveBeenCalledWith({ title: 'اجتماع طارئ', body: 'غداً الساعة 9', targets: ['m2'] }, expect.any(Object))
    expect(screen.getByTestId('notices-list')).toHaveTextContent('اجتماع')
  })
})
