/** 00163: وحدة «الإجراءات» — طلب إنهاء خدمة ضمن النطاق (اختيار الهدف، النوع، آخر يوم، السبب، الإقرار) + طلباتي بالمسار والسحب + مهمة إنهاء خدمة في طلبات الموافقة. بلا بيانات مالية. */
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ create: vi.fn(), cancel: vi.fn(), decide: vi.fn() }))
const targets = [
  { target_kind: 'employee', employee_id: 'e-m4', worker_id: null, user_id: 'u-m4', full_name: 'مسؤول قسم 4', label: 'مسؤول قسم · قاطع الكرادة', scope: 'department_manager', employee_number: 'TR-M4' },
  { target_kind: 'employee', employee_id: 'e-c4', worker_id: null, user_id: 'u-c4', full_name: 'متعهد الجادرية', label: 'متعهد · الجادرية', scope: 'contractor', employee_number: 'TR-C4' },
  { target_kind: 'worker', employee_id: null, worker_id: 'w-1', user_id: null, full_name: 'عامل أول', label: 'عامل · متعهد الجادرية · الجادرية', scope: 'worker', employee_number: null },
]
const mine = [
  { id: 'q1', target_kind: 'worker', target_name: 'عامل أول', target_label: 'عامل · متعهد الجادرية', termination_type: 'dismissal', termination_type_label: 'فصل', last_day: '2026-10-01', reason: 'تغيّب متكرر', status: 'pending', current_step: 'العمليات الميدانية (حسب التسلسل)', chain_id: 'c1', created_at: '2026-10-01T06:00:00Z', decided_at: null, executed_at: null },
  { id: 'q2', target_kind: 'employee', target_name: 'متعهد الجادرية', target_label: 'متعهد · الجادرية', termination_type: 'contract_end', termination_type_label: 'انتهاء عقد', last_day: '2026-10-08', reason: 'انتهاء مدة التعاقد', status: 'executed', current_step: null, chain_id: 'c1', created_at: '2026-09-20T06:00:00Z', decided_at: 'x', executed_at: '2026-09-21T06:00:00Z' },
]
vi.mock('@features/sector-manager/hooks', () => ({
  useTerminationTargets: () => ({ data: targets, isLoading: false, isError: false }),
  useMyTerminationRequests: () => ({ data: mine, isLoading: false }),
  useCreateTerminationRequest: () => ({ mutate: h.create, isPending: false }),
  useCancelTerminationRequest: () => ({ mutate: h.cancel, isPending: false }),
  useApprovalTimeline: (kind?: string) => ({ data: kind ? [{ step_no: 1, step_label: 'العمليات الميدانية (حسب التسلسل)', status: 'pending', approvers: [], decided_by_name: null, decided_at: null, note: null }] : [], isLoading: false }),
  useMyApprovalTasks: () => ({ data: [{
    task_id: 't1', request_kind: 'termination', request_id: 'q1', step_no: 1, total_steps: 2, step_label: 'العمليات الميدانية (حسب التسلسل)', requester_user_id: 'u-sm', requester_name: 'مسؤول قاطع الكرادة', requester_role: 'admin_ops', requester_role_label: 'مسؤول قاطع',
    area_name: null, parent_sector: 'الكرادة', type_name: 'إنهاء خدمة', start_date: '2026-10-01', end_date: '2026-10-01', start_time: null, end_time: null, days: null, minutes: null, notes: 'تغيّب متكرر', attachment_path: null, created_at: '2026-10-01T06:00:00Z', previous_steps: [], items: null, ref_no: null,
    details: { target_name: 'عامل أول', target_label: 'عامل · متعهد الجادرية · الجادرية', target_kind: 'worker', type: 'dismissal', type_label: 'فصل', last_day: '2026-10-01' },
  }], isLoading: false }),
  useDecideApproval: () => ({ mutate: h.decide, isPending: false }),
}))
import ProceduresPage from '@portals/admin-ops/pages/Procedures/ProceduresPage'
import TeamRequestsPage from '@portals/admin-ops/pages/Requests/TeamRequestsPage'
const wrap = (el: React.ReactElement) => render(<MemoryRouter>{el}</MemoryRouter>)
const noFinance = () => { const t = document.body.textContent ?? ''; for (const w of ['راتب', 'دينار', 'مالي', 'IQD']) expect(t).not.toContain(w) }

describe('الإجراءات — إنهاء الخدمة (00163)', () => {
  beforeEach(() => vi.clearAllMocks())
  it('يعرض الأهداف ضمن النطاق مجمّعة، ويبحث، ولا يُرسل قبل اختيار الهدف وسبب كافٍ وإقرار؛ ثم يُرسل بالقيم الصحيحة', () => {
    wrap(<ProceduresPage />)
    expect(screen.getByTestId('target-picker')).toHaveTextContent('3 ضمن نطاقك')
    expect(screen.getByTestId('target-picker')).toHaveTextContent('مسؤولو الأقسام · 1'); expect(screen.getByTestId('target-picker')).toHaveTextContent('عمال المتعهدين · 1')
    fireEvent.change(screen.getByTestId('target-search'), { target: { value: 'عامل' } })
    expect(screen.queryByTestId('target-e-m4')).toBeNull(); expect(screen.getByTestId('target-w-1')).toBeInTheDocument()
    expect(screen.getByTestId('termination-submit')).toBeDisabled()
    fireEvent.click(screen.getByTestId('target-w-1'))
    expect(screen.getByTestId('picked-target')).toHaveTextContent('عامل أول')
    fireEvent.change(screen.getByTestId('termination-type'), { target: { value: 'dismissal' } })
    fireEvent.change(screen.getByTestId('termination-last-day'), { target: { value: '2026-10-05' } })
    fireEvent.change(screen.getByTestId('termination-reason'), { target: { value: 'قص' } })
    fireEvent.click(screen.getByTestId('termination-confirm'))
    expect(screen.getByTestId('termination-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('termination-reason'), { target: { value: 'تغيّب متكرر بلا عذر' } })
    expect(screen.getByTestId('termination-submit')).toBeEnabled()
    fireEvent.click(screen.getByTestId('termination-submit'))
    expect(h.create).toHaveBeenCalledWith({ targetKind: 'worker', targetId: 'w-1', type: 'dismissal', lastDay: '2026-10-05', reason: 'تغيّب متكرر بلا عذر' }, expect.any(Object))
    noFinance()
  })
  it('طلباتي: الحالة والخطوة الحالية، السحب للمعلّق فقط، ومسار الموافقات عند الطلب', () => {
    wrap(<ProceduresPage />)
    fireEvent.click(screen.getByTestId('tab-mine'))
    expect(screen.getByTestId('req-status-q1')).toHaveTextContent('قيد الموافقة'); expect(screen.getByTestId('req-q1')).toHaveTextContent('الآن عند: العمليات الميدانية')
    expect(screen.getByTestId('req-status-q2')).toHaveTextContent('نُفّذ'); expect(screen.queryByTestId('req-cancel-q2')).toBeNull()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByTestId('req-cancel-q1'))
    expect(h.cancel).toHaveBeenCalledWith('q1')
    fireEvent.click(screen.getByTestId('req-path-q1'))
    expect(screen.getByTestId('req-timeline-q1')).toHaveTextContent('العمليات الميدانية')
  })
  it('طلبات الموافقة: مهمة إنهاء خدمة تعرض الهدف والنوع وآخر يوم والسبب، والرفض يحتاج سبباً', () => {
    wrap(<TeamRequestsPage />)
    const d = screen.getByTestId('task-termination-q1')
    expect(d).toHaveTextContent('عامل أول'); expect(d).toHaveTextContent('عامل · متعهد الجادرية'); expect(d).toHaveTextContent('آخر يوم عمل')
    expect(screen.getByTestId('task-q1')).toHaveTextContent('إنهاء خدمة · فصل'); expect(screen.getByTestId('task-q1')).toHaveTextContent('السبب: «تغيّب متكرر»')
    fireEvent.click(screen.getByTestId('approve-q1'))
    expect(h.decide).toHaveBeenCalledWith({ kind: 'termination', requestId: 'q1', approve: true })
    noFinance()
  })
})
