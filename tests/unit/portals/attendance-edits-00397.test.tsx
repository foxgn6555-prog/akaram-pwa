/**
 * 00397-ب — واجهة «طلب تعديل بيانات الحضور»:
 *   · غرفة العمليات: نطاق «قسم وفروعه» × مدى أيام (مع استثناء يوم) × «حضور كامل» ⇒ معاينة بأرقامها ⇒ السبب ⇒ تنفيذ مباشر / إرسال إلى HR بالمعاملات الصحيحة.
 *   · الموارد البشرية: طابور «بانتظار اعتمادي» ⇒ تعديل بند / استبعاد بند ⇒ «اعتماد وتنفيذ».
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as SdkMod from '@sdk/attendance-edits.sdk'
import type * as HrMod from '@features/hr'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const calls: Record<string, unknown[]> = {}
const rec = (k: string, v: unknown) => { (calls[k] ??= []).push(v) }

const preview = {
  employees: 2, days: 2, items: 4, skipped: 0, minutes_to_fix: 720, scope_label: 'قسم الأشغال وأقسامه الفرعية', action_label: 'حضور كامل بأوقات الشفت',
  rows: [
    { employee_id: 'e1', full_name: 'كرار يوسف', employee_number: 'AE-1', work_date: '2026-10-27', before: { status: 'early_leave', status_label: 'خروج مبكر', check_in: '2026-10-27T12:53:00Z', check_out: '2026-10-27T13:00:00Z', late_minutes: 0, early_minutes: 360 }, proposed: { status: 'present', check_in: '2026-10-27T13:00:00Z', check_out: '2026-10-27T19:00:00Z' }, proposed_status_label: 'حاضر', skipped: null },
  ],
}
const row = {
  id: 'R1', mode: 'hr_request', mode_label: 'بطلب إلى الموارد البشرية', status: 'approved', status_label: 'لدى الموارد البشرية', scope_kind: 'employees', scope_label: 'كرار يوسف',
  dates: ['2026-10-27', '2026-10-28'], first_date: '2026-10-27', last_date: '2026-10-28', action: 'set_times', action_label: 'تحديد أوقات الدخول/الخروج', payload: { check_in: '16:05', check_out: '22:00' },
  reason: 'تصحيح أوقات بعد مراجعة الكاميرا', requested_by: 'u1', requester_name: 'غرفة العمليات', requester_role: 'ops_room', chain_id: null, current_step: null, approved_at: '2026-10-29T08:00:00Z', rejected_note: null, hr_note: null,
  applied_by: null, applied_by_name: null, applied_at: null, reverted_by: null, reverted_by_name: null, reverted_at: null, revert_reason: null,
  employees_count: 1, days_count: 2, items_count: 2, minutes_fixed: 0, departments: 'قسم آخر', created_at: '2026-10-29T07:00:00Z', can_revert: false, can_cancel: false, can_hr_apply: true,
}
const detail = {
  ...row,
  items: [
    { id: 'I1', employee_id: 'e3', full_name: 'كرار يوسف', employee_number: 'AE-1', department_name: 'قسم آخر', work_date: '2026-10-27', before: { status: 'late', status_label: 'متأخر', check_in: '2026-10-27T13:30:00Z', check_out: '2026-10-27T17:00:00Z', late_minutes: 20, early_minutes: 120, worked_minutes: 210 }, proposed: { status: 'auto', status_label: 'auto', check_in: '2026-10-27T13:05:00Z', check_out: '2026-10-27T19:00:00Z' }, after: null, applied: false, skipped_reason: null, hr_edited: false, hr_edited_by_name: null },
    { id: 'I2', employee_id: 'e3', full_name: 'كرار يوسف', employee_number: 'AE-1', department_name: 'قسم آخر', work_date: '2026-10-28', before: null, proposed: { status: 'auto', status_label: 'auto', check_in: '2026-10-28T13:05:00Z', check_out: '2026-10-28T19:00:00Z' }, after: null, applied: false, skipped_reason: null, hr_edited: false, hr_edited_by_name: null },
  ],
  timeline: [],
}

vi.mock('@sdk/client', () => ({
  supabase: { rpc: (fn: string, args: unknown) => { rec(fn, args); return Promise.resolve({ data: fn === 'attendance_edit_hr_apply' ? { id: 'R1', status: 'applied', items: 1, minutes_fixed: 140 } : null, error: null }) } },
  sdkGuard: async (p: Promise<{ data: unknown; error: unknown }>) => { const r = await p; return r.data ?? {} },
  sdkVoid: async (p: Promise<unknown>) => { await p },
}))
vi.mock('@sdk/attendance-edits.sdk', async (orig) => {
  const m = await orig<typeof SdkMod>()
  return {
    ...m,
    attendanceEdits: {
      ...m.attendanceEdits,
      preview: (d: unknown) => { rec('preview', d); return Promise.resolve(preview) },
      create: (d: unknown, reason: string, mode: string) => { rec('create', { d, reason, mode }); return Promise.resolve({ id: 'N1', status: mode === 'direct' ? 'applied' : 'approved', via_chain: false, items: 4, minutes_fixed: 720 }) },
      list: (f: unknown) => { rec('list', f); return Promise.resolve([row]) },
      detail: () => Promise.resolve(detail),
      stats: () => Promise.resolve({ month: '2026-10', total: 3, direct: 2, by_request: 1, pending_approval: 1, awaiting_hr: 1, rejected: 0, reverted: 0, employees: 3, work_days: 5, minutes_fixed: 500, by_action: {}, top_requesters: [] }),
      hrUpdateItem: (itemId: string, status: string, checkIn: string | null, checkOut: string | null) => { rec('hrUpdateItem', { itemId, status, checkIn, checkOut }); return Promise.resolve() },
      hrSkipItem: (itemId: string, reason: string) => { rec('hrSkipItem', { itemId, reason }); return Promise.resolve() },
      hrApply: (id: string, note: string | null) => { rec('hrApply', { id, note }); return Promise.resolve({ id, status: 'applied', items: 1, minutes_fixed: 140 }) },
    },
  }
})
vi.mock('@features/departments', () => ({ useDepartments: () => ({ data: [{ id: 'd1', name: 'الأشغال', code: 'A', parent_id: null, is_active: true }, { id: 'd2', name: 'شعبة النظافة', code: 'B', parent_id: 'd1', is_active: true }] }) }))
vi.mock('@features/branches', () => ({ useBranches: () => ({ data: [{ id: 'b1', name: 'فرع 1' }] }) }))
vi.mock('@features/hr', async (orig) => {
  const m = await orig<typeof HrMod>()
  return { ...m, useHrEmployees: () => ({ data: [{ id: 'e1', full_name: 'كرار يوسف', employee_number: 'AE-1' }], isLoading: false }) }
})
vi.mock('@features/permissions/my-permissions', () => ({ useCanCall: () => ({ allowed: true, title: undefined }) }))
vi.mock('@stores/ui.store', () => ({ useUiStore: (sel: (s: { addToast: (t: unknown) => void }) => unknown) => sel({ addToast: (t) => rec('toast', t) }) }))

import { BulkEditPanel } from '@portals/ops-room/pages/Attendance/BulkEditPanel'
import AttendanceEditsPage from '@portals/hr/pages/AttendanceEdits/AttendanceEditsPage'

const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)

describe('00397-ب · غرفة العمليات — تعديل جماعي', () => {
  beforeEach(() => { for (const k of Object.keys(calls)) delete calls[k] })

  it('نطاق قسم وفروعه × 3 أيام مع استثناء يوم × حضور كامل ⇒ معاينة بأرقامها ⇒ تنفيذ مباشر بالمعاملات الصحيحة', async () => {
    wrap(<BulkEditPanel />)
    // النطاق الافتراضي: قسم وأقسامه الفرعية
    expect(screen.getByTestId('ae-scope-department_tree')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(screen.getByTestId('ae-department'), { target: { value: 'd1' } })
    // الأيام: 3 أيام ثم استثناء الأوسط
    fireEvent.change(screen.getByTestId('ae-from'), { target: { value: '2026-10-26' } })
    fireEvent.change(screen.getByTestId('ae-to'), { target: { value: '2026-10-28' } })
    expect(screen.getByTestId('ae-days-count')).toHaveTextContent('3')
    fireEvent.click(screen.getByTestId('ae-day-2026-10-27'))
    expect(screen.getByTestId('ae-days-count')).toHaveTextContent('2')
    // المعاينة
    fireEvent.click(screen.getByTestId('ae-preview'))
    await waitFor(() => expect(screen.getByTestId('ae-preview-box')).toBeInTheDocument())
    expect(calls.preview![0]).toEqual({ scopeKind: 'department_tree', scopeIds: ['d1'], dates: ['2026-10-26', '2026-10-28'], action: 'full_presence', payload: {} })
    expect(screen.getByTestId('ae-pv-emps')).toHaveTextContent('2')
    expect(screen.getByTestId('ae-pv-items')).toHaveTextContent('4')
    expect(screen.getByTestId('ae-pv-minutes')).toHaveTextContent('720')
    // الأزرار معطّلة بلا سبب كافٍ
    expect(screen.getByTestId('ae-submit-direct')).toBeDisabled()
    fireEvent.change(screen.getByTestId('ae-reason'), { target: { value: 'أيام تجربة البصمة الجديدة' } })
    expect(screen.getByTestId('ae-submit-direct')).toBeEnabled()
    fireEvent.click(screen.getByTestId('ae-submit-direct'))
    expect(screen.getByTestId('ae-confirm')).toHaveTextContent('تأكيد التنفيذ المباشر')
    fireEvent.click(screen.getByTestId('ae-confirm-go'))
    await waitFor(() => expect(calls.create).toBeTruthy())
    expect(calls.create![0]).toEqual({ d: { scopeKind: 'department_tree', scopeIds: ['d1'], dates: ['2026-10-26', '2026-10-28'], action: 'full_presence', payload: {} }, reason: 'أيام تجربة البصمة الجديدة', mode: 'direct' })
    await waitFor(() => expect(screen.queryByTestId('ae-preview-box')).toBeNull())
    expect((calls.toast![0] as { message: string }).message).toContain('نُفّذ التعديل')
  })

  it('موظفون محددون × تحديد أوقات ⇒ الحمولة تحمل الأوقات، والإرسال إلى الموارد البشرية بوضع hr_request؛ تغيير أي مدخل يُلغي المعاينة', async () => {
    wrap(<BulkEditPanel />)
    fireEvent.click(screen.getByTestId('ae-scope-employees'))
    fireEvent.click(screen.getByTestId('ae-emp-e1'))
    expect(screen.getByTestId('ae-emp-count')).toHaveTextContent('1')
    fireEvent.change(screen.getByTestId('ae-from'), { target: { value: '2026-10-27' } })
    fireEvent.click(screen.getByTestId('ae-action-set_times'))
    expect(screen.getByTestId('ae-preview')).toBeDisabled()   // لا أوقات بعد
    fireEvent.change(screen.getByTestId('ae-cin'), { target: { value: '16:05' } })
    fireEvent.change(screen.getByTestId('ae-cout'), { target: { value: '22:00' } })
    fireEvent.click(screen.getByTestId('ae-preview'))
    await waitFor(() => expect(screen.getByTestId('ae-preview-box')).toBeInTheDocument())
    expect(calls.preview![0]).toMatchObject({ scopeKind: 'employees', scopeIds: ['e1'], dates: ['2026-10-27'], action: 'set_times', payload: { check_in: '16:05', check_out: '22:00' } })
    fireEvent.change(screen.getByTestId('ae-reason'), { target: { value: 'مراجعة كاميرا الدوام' } })
    fireEvent.click(screen.getByTestId('ae-submit-hr'))
    expect(screen.getByTestId('ae-confirm')).toHaveTextContent('الموارد البشرية')
    fireEvent.click(screen.getByTestId('ae-confirm-go'))
    await waitFor(() => expect(calls.create).toBeTruthy())
    expect((calls.create![0] as { mode: string }).mode).toBe('hr_request')
    // معاينة جديدة ثم تغيير الوقت ⇒ تختفي المعاينة (يجب إعادة المعاينة قبل التنفيذ)
    fireEvent.click(screen.getByTestId('ae-emp-e1'))
    fireEvent.click(screen.getByTestId('ae-preview'))
    await waitFor(() => expect(screen.getByTestId('ae-preview-box')).toBeInTheDocument())
    fireEvent.change(screen.getByTestId('ae-cout'), { target: { value: '21:00' } })
    expect(screen.queryByTestId('ae-preview-box')).toBeNull()
  })

  it('السجل أسفل الصفحة يعرض الطلبات مع الحالة والوضع والحجم', async () => {
    wrap(<BulkEditPanel />)
    await waitFor(() => expect(screen.getByTestId('ae-row-R1')).toBeInTheDocument())
    const r = within(screen.getByTestId('ae-row-R1'))
    expect(r.getByTestId('ae-status-approved')).toHaveTextContent('لدى الموارد البشرية')
    expect(r.getByText('كرار يوسف')).toBeInTheDocument()
    expect(screen.getByTestId('ae-row-R1')).toHaveTextContent('1 × 2 = 2')
  })
})

describe('00397-ب · الموارد البشرية — طلبات تعديل الحضور', () => {
  beforeEach(() => { for (const k of Object.keys(calls)) delete calls[k] })

  it('الطابور يعرض الطلب المعتمد؛ المراجعة تفتح البنود مع قبل/المقترح؛ تعديل بند يرسل الحالة والأوقات ببغداد؛ الاستبعاد بسبب؛ الاعتماد ينفّذ', async () => {
    wrap(<AttendanceEditsPage />)
    await waitFor(() => expect(screen.getByTestId('ae-review-R1')).toBeInTheDocument())
    expect(screen.getByTestId('ae-st-queue')).toHaveTextContent('1')
    expect((calls.list![0] as { status: string; mode: string })).toMatchObject({ status: 'approved', mode: 'hr_request' })
    fireEvent.click(screen.getByTestId('ae-review-R1'))
    await waitFor(() => expect(screen.getByTestId('ae-items-table')).toBeInTheDocument())
    expect(screen.getByTestId('ae-item-I1')).toHaveTextContent('متأخر')
    expect(screen.getByTestId('ae-item-I1')).toHaveTextContent('تُشتق من الأوقات')
    expect(screen.getByTestId('ae-item-I2')).toHaveTextContent('لا صف')
    // تعديل البند الأول إلى «حاضر» 16:00–22:00
    fireEvent.click(screen.getByTestId('ae-item-edit-I1'))
    fireEvent.change(screen.getByTestId('ae-item-status'), { target: { value: 'present' } })
    fireEvent.change(screen.getByTestId('ae-item-cin'), { target: { value: '16:00' } })
    fireEvent.change(screen.getByTestId('ae-item-cout'), { target: { value: '22:00' } })
    fireEvent.click(screen.getByTestId('ae-item-save'))
    await waitFor(() => expect(calls.hrUpdateItem).toBeTruthy())
    expect(calls.hrUpdateItem![0]).toEqual({ itemId: 'I1', status: 'present', checkIn: '2026-10-27T13:00:00.000Z', checkOut: '2026-10-27T19:00:00.000Z' })
    // استبعاد البند الثاني
    fireEvent.click(screen.getByTestId('ae-item-skip-I2'))
    fireEvent.change(screen.getByTestId('ae-skip-dialog-reason'), { target: { value: 'لم يكن على رأس العمل' } })
    fireEvent.click(screen.getByTestId('ae-skip-dialog-confirm'))
    await waitFor(() => expect(calls.hrSkipItem).toBeTruthy())
    expect(calls.hrSkipItem![0]).toEqual({ itemId: 'I2', reason: 'لم يكن على رأس العمل' })
    // الاعتماد
    fireEvent.click(screen.getByTestId('ae-hr-apply'))
    fireEvent.change(screen.getByTestId('ae-apply-note'), { target: { value: 'رُوجعت الكاميرا' } })
    fireEvent.click(screen.getByTestId('ae-apply-confirm'))
    await waitFor(() => expect(calls.hrApply).toBeTruthy())
    expect(calls.hrApply![0]).toEqual({ id: 'R1', note: 'رُوجعت الكاميرا' })
    expect((calls.toast!.at(-1) as { message: string }).message).toContain('اعتُمد ونُفّذ')
  })

  it('تبويب السجل يستدعي القائمة بالفلاتر', async () => {
    wrap(<AttendanceEditsPage />)
    fireEvent.click(screen.getByTestId('ae-tab-log'))
    fireEvent.change(screen.getByTestId('ae-f-mode'), { target: { value: 'direct' } })
    fireEvent.change(screen.getByTestId('ae-f-search'), { target: { value: 'كرار' } })
    await waitFor(() => expect(calls.list!.some((f) => (f as { mode: string; search: string }).mode === 'direct' && (f as { search: string }).search === 'كرار')).toBe(true))
  })
})
