/** 00348: مهمة «طلب تعيين موظف» في وحدة الموافقات المشتركة (TeamRequestsPage) — تعرض الاسم والمسمى والجهة والمباشرة والعقد بلا رقم وظيفي، والموافقة/الرفض بسبب عبر approval_decide_request. */
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ decide: vi.fn() }))
vi.mock('@features/sector-manager/hooks', () => ({
  useApprovalTimeline: () => ({ data: [], isLoading: false }),
  useMyApprovalTasks: () => ({ data: [{
    task_id: 't1', request_kind: 'hire', request_id: 'q1', step_no: 1, total_steps: 1, step_label: 'المدير المفوض (افتراضي — بلا سلسلة مضبوطة)', requester_user_id: 'u-g', requester_name: 'مسؤول الكراج', requester_role: 'central_garage_officer', requester_role_label: 'الكراج المركزي',
    area_name: null, parent_sector: null, type_name: 'تعيين موظف', start_date: '2026-11-01', end_date: '2026-11-01', start_time: null, end_time: null, days: null, minutes: null, notes: null, attachment_path: null, created_at: '2026-10-25T06:00:00Z', previous_steps: [], items: null, ref_no: null,
    details: { full_name: 'أحمد علي', phone: '07701234567', job_title: 'سائق شاحنة', department: 'سوّاق الكراج', hire_date: '2026-11-01', contract_type: 'daily', contract_label: 'يومي', shift_name: 'الصباحي', source: 'garage', source_label: 'الكراج المركزي' },
  }], isLoading: false }),
  useDecideApproval: () => ({ mutate: h.decide, isPending: false }),
}))
import TeamRequestsPage from '@portals/admin-ops/pages/Requests/TeamRequestsPage'

describe('طلب تعيين موظف في الموافقات (00348)', () => {
  beforeEach(() => vi.clearAllMocks())
  it('تعرض تفاصيل الطلب بلا رقم وظيفي ولا بيانات مالية، وتُحسب ضمن «تعيين موظف»', () => {
    render(<MemoryRouter><TeamRequestsPage /></MemoryRouter>)
    const d = screen.getByTestId('task-hire-q1')
    expect(d).toHaveTextContent('أحمد علي'); expect(d).toHaveTextContent('سائق شاحنة · سوّاق الكراج · الكراج المركزي')
    expect(d).toHaveTextContent('العقد: يومي'); expect(d).toHaveTextContent('الشفت: الصباحي'); expect(d).toHaveTextContent('المباشرة')
    expect(d).toHaveTextContent('بلا رقم وظيفي — تكتبه الموارد البشرية')
    expect(screen.getByTestId('exec-page-header')).toHaveTextContent('تعيين موظف')
    const t = document.body.textContent ?? ''
    for (const w of ['راتب', 'دينار', 'IQD']) expect(t).not.toContain(w)
  })
  it('الموافقة تمرّ بنوع hire، والرفض يحتاج سبباً', () => {
    render(<MemoryRouter><TeamRequestsPage /></MemoryRouter>)
    fireEvent.click(screen.getByTestId('approve-q1'))
    expect(h.decide).toHaveBeenCalledWith({ kind: 'hire', requestId: 'q1', approve: true })
    fireEvent.click(screen.getByTestId('reject-q1'))
    expect(screen.getByTestId('reject-confirm-q1')).toBeDisabled()
    fireEvent.change(screen.getByTestId('reject-reason-q1'), { target: { value: 'لا شاغر حالياً' } })
    fireEvent.click(screen.getByTestId('reject-confirm-q1'))
    expect(h.decide).toHaveBeenCalledWith({ kind: 'hire', requestId: 'q1', approve: false, note: 'لا شاغر حالياً' }, expect.anything())
  })
})
