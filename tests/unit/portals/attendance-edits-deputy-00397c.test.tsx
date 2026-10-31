/**
 * 00397-ج — المعاون والمدير التنفيذي ومهمة الموافقة:
 *   · مهمة «تعديل حضور» في وحدة الموافقات تعرض النطاق والنوع والحجم والأيام، والموافقة تمرّ بنوع attendance_edit.
 *   · صفحة المعاون: المؤشرات، زر «تراجع» للمنفَّذ فقط بسبب إلزامي، وتبويب «تعديل مباشر» بلا زر «إرسال إلى HR».
 *   · صفحة المدير التنفيذي: قراءة فقط — لا تراجع ولا إنشاء.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type * as SdkMod from '@sdk/attendance-edits.sdk'

const h = vi.hoisted(() => ({ decide: vi.fn(), calls: {} as Record<string, unknown[]> }))
const rec = (k: string, v: unknown) => { (h.calls[k] ??= []).push(v) }

vi.mock('@features/sector-manager/hooks', () => ({
  useApprovalTimeline: () => ({ data: [], isLoading: false }),
  useMyApprovalTasks: () => ({ data: [{
    task_id: 't1', request_kind: 'attendance_edit', request_id: 'q1', step_no: 1, total_steps: 1, step_label: 'معاون المدير المفوض', requester_user_id: 'u-ops', requester_name: 'غرفة العمليات', requester_role: 'ops_room', requester_role_label: 'غرفة العمليات',
    area_name: null, parent_sector: null, type_name: 'تعديل حضور', start_date: '2026-10-27', end_date: '2026-10-28', start_time: null, end_time: null, days: null, minutes: null, notes: 'أيام تجربة البصمة', attachment_path: null, created_at: '2026-10-29T06:00:00Z', previous_steps: [], items: null, ref_no: null,
    details: { scope_label: 'قسم الأشغال وأقسامه الفرعية', scope_kind: 'department_tree', action: 'full_presence', action_label: 'حضور كامل بأوقات الشفت', payload: {}, employees: 2, days: 2, items: 4, dates: ['2026-10-27', '2026-10-28'], reason: 'أيام تجربة البصمة' },
  }], isLoading: false }),
  useDecideApproval: () => ({ mutate: h.decide, isPending: false }),
}))

const applied = {
  id: 'R1', mode: 'direct', mode_label: 'تعديل مباشر', status: 'applied', status_label: 'نُفّذ', scope_kind: 'department_tree', scope_label: 'قسم الأشغال وأقسامه الفرعية',
  dates: ['2026-10-27', '2026-10-28'], first_date: '2026-10-27', last_date: '2026-10-28', action: 'full_presence', action_label: 'حضور كامل بأوقات الشفت', payload: {},
  reason: 'أيام تجربة البصمة', requested_by: 'u-ops', requester_name: 'غرفة العمليات', requester_role: 'ops_room', chain_id: null, current_step: null, approved_at: null, rejected_note: null, hr_note: null,
  applied_by: 'u-ops', applied_by_name: 'غرفة العمليات', applied_at: '2026-10-29T06:00:00Z', reverted_by: null, reverted_by_name: null, reverted_at: null, revert_reason: null,
  employees_count: 2, days_count: 2, items_count: 4, minutes_fixed: 720, departments: 'الأشغال، شعبة النظافة', created_at: '2026-10-29T06:00:00Z', can_revert: true, can_cancel: false, can_hr_apply: false,
}
const rejected = { ...applied, id: 'R2', status: 'rejected', status_label: 'مرفوض', can_revert: false, minutes_fixed: 0, rejected_note: 'لا مبرر' }
const stats = { month: '2026-10', total: 5, direct: 3, by_request: 2, pending_approval: 1, awaiting_hr: 1, rejected: 1, reverted: 1, employees: 9, work_days: 20, minutes_fixed: 3100, by_action: { full_presence: 4, set_times: 1 }, top_requesters: [{ name: 'غرفة العمليات', n: 4 }] }

vi.mock('@sdk/attendance-edits.sdk', async (orig) => {
  const m = await orig<typeof SdkMod>()
  return { ...m, attendanceEdits: { ...m.attendanceEdits,
    list: (f: unknown) => { rec('list', f); return Promise.resolve([applied, rejected]) },
    detail: () => Promise.resolve({ ...applied, items: [], timeline: [] }),
    stats: (mo: unknown) => { rec('stats', mo); return Promise.resolve(stats) },
    revert: (id: string, reason: string) => { rec('revert', { id, reason }); return Promise.resolve({ id, reverted_items: 4 }) },
    searchEmployees: () => Promise.resolve([]),
  } }
})
vi.mock('@features/departments', () => ({ useDepartments: () => ({ data: [] }) }))
vi.mock('@features/branches', () => ({ useBranches: () => ({ data: [] }) }))
vi.mock('@stores/ui.store', () => ({ useUiStore: (sel: (s: { addToast: (t: unknown) => void }) => unknown) => sel({ addToast: (t) => rec('toast', t) }) }))

import TeamRequestsPage from '@portals/admin-ops/pages/Requests/TeamRequestsPage'
import DeputyAttendanceEditsPage from '@portals/deputy/pages/AttendanceEdits/DeputyAttendanceEditsPage'
import ExecAttendanceEditsPage from '@portals/executive/pages/AttendanceEdits/ExecAttendanceEditsPage'

const wrap = (ui: React.ReactElement) => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider></MemoryRouter>)

describe('00397-ج · مهمة «تعديل حضور» في الموافقات', () => {
  beforeEach(() => { vi.clearAllMocks(); for (const k of Object.keys(h.calls)) delete h.calls[k] })
  it('تعرض النطاق والنوع والحجم وتُحسب ضمن «تعديل حضور»، والموافقة تمرّ بنوع attendance_edit', () => {
    wrap(<TeamRequestsPage />)
    const d = screen.getByTestId('task-attedit-q1')
    expect(d).toHaveTextContent('قسم الأشغال وأقسامه الفرعية')
    expect(d).toHaveTextContent('حضور كامل بأوقات الشفت')
    expect(d).toHaveTextContent('2 موظف × 2 يوم = 4 يوم عمل')
    expect(d).toHaveTextContent('يصل الطلب إلى الموارد البشرية')
    expect(screen.getByTestId('exec-page-header')).toHaveTextContent('تعديل حضور')
    fireEvent.click(screen.getByTestId('approve-q1'))
    expect(h.decide).toHaveBeenCalledWith({ kind: 'attendance_edit', requestId: 'q1', approve: true })
  })
})

describe('00397-ج · صفحة المعاون', () => {
  beforeEach(() => { for (const k of Object.keys(h.calls)) delete h.calls[k] })
  it('المؤشرات الشهرية + زر التراجع للمنفَّذ فقط + التراجع بسبب إلزامي', async () => {
    wrap(<DeputyAttendanceEditsPage />)
    await waitFor(() => expect(screen.getByTestId('ae-row-R1')).toBeInTheDocument())
    expect(screen.getByTestId('ae-st-total')).toHaveTextContent('5')
    expect(screen.getByTestId('ae-st-total')).toHaveTextContent('3 مباشر · 2 بالطلب')
    expect(screen.getByTestId('ae-st-minutes')).toHaveTextContent('3100')
    expect(screen.getByTestId('ae-top-0')).toHaveTextContent('غرفة العمليات: 4')
    expect(screen.getByTestId('ae-revert-R1')).toBeInTheDocument()
    expect(screen.queryByTestId('ae-revert-R2')).toBeNull()
    fireEvent.click(screen.getByTestId('ae-revert-R1'))
    expect(screen.getByTestId('ae-revert-dialog-confirm')).toBeDisabled()
    fireEvent.change(screen.getByTestId('ae-revert-dialog-reason'), { target: { value: 'شمل موظفاً لم يكن على رأس العمل' } })
    fireEvent.click(screen.getByTestId('ae-revert-dialog-confirm'))
    await waitFor(() => expect(h.calls.revert).toBeTruthy())
    expect(h.calls.revert![0]).toEqual({ id: 'R1', reason: 'شمل موظفاً لم يكن على رأس العمل' })
    expect((h.calls.toast!.at(-1) as { message: string }).message).toContain('4 يوم عمل')
  })
  it('تبويب «تعديل مباشر» يعرض المعالج بلا زر «إرسال إلى الموارد البشرية»', async () => {
    wrap(<DeputyAttendanceEditsPage />)
    fireEvent.click(screen.getByTestId('ae-tab-direct'))
    expect(screen.getByTestId('ae-bulk-panel')).toBeInTheDocument()
    expect(screen.getByTestId('ae-scope-employees')).toBeInTheDocument()
    expect(screen.queryByTestId('ae-submit-hr')).toBeNull()
  })
})

describe('00397-ج · صفحة المدير التنفيذي (قراءة)', () => {
  it('المؤشرات والسجل بلا تراجع ولا إنشاء', async () => {
    wrap(<ExecAttendanceEditsPage />)
    await waitFor(() => expect(screen.getByTestId('ae-row-R1')).toBeInTheDocument())
    expect(screen.getByTestId('ae-st-employees')).toHaveTextContent('9')
    expect(screen.queryByTestId('ae-revert-R1')).toBeNull()
    expect(screen.queryByTestId('ae-bulk-panel')).toBeNull()
    expect(screen.queryByTestId('ae-tab-direct')).toBeNull()
  })
})
