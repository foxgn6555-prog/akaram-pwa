/**
 * 00406 — سباق معاينة «تعديل جماعي»: إذا تغيّرت المسودة أثناء انتظار المعاينة،
 * يجب إهمال النتيجة المتأخرة ولا يُرسل إلا النطاق الذي عُوين فعلاً.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type * as SdkMod from '@sdk/attendance-edits.sdk'

const calls: Record<string, unknown[]> = {}
const rec = (k: string, v: unknown) => { (calls[k] ??= []).push(v) }
let resolvePreview: ((v: unknown) => void) | null = null
const previewFor = (day: string) => ({
  employees: 1, days: 1, items: 1, skipped: 0, minutes_to_fix: 0, scope_label: 'كرار يوسف', action_label: 'حضور كامل بأوقات الشفت',
  rows: [{ employee_id: 'e1', full_name: 'كرار يوسف', employee_number: 'AE-1', work_date: day, before: null, proposed: { status: 'auto', needs_approval: true, check_in: `${day}T13:00:00Z`, check_out: `${day}T19:00:00Z` }, proposed_status_label: 'حاضر', skipped: null }],
})

vi.mock('@sdk/attendance-edits.sdk', async (orig) => {
  const m = await orig<typeof SdkMod>()
  return {
    ...m,
    attendanceEdits: {
      ...m.attendanceEdits,
      preview: (d: { dates: string[] }) => { rec('preview', d); return new Promise((res) => { resolvePreview = () => res(previewFor(d.dates[0]!)) }) },
      create: (d: unknown, reason: string, mode: string) => { rec('create', { d, reason, mode }); return Promise.resolve({ id: 'N1', status: 'approved', via_chain: false, items: 1, minutes_fixed: 0 }) },
      list: () => Promise.resolve([]),
      searchEmployees: () => Promise.resolve([{ id: 'e1', full_name: 'كرار يوسف', employee_number: 'AE-1', department_name: 'الأشغال' }]),
      detail: () => Promise.resolve(null),
      stats: () => Promise.resolve(null),
    },
  }
})
vi.mock('@features/departments', () => ({ useDepartments: () => ({ data: [] }) }))
vi.mock('@features/branches', () => ({ useBranches: () => ({ data: [] }) }))
vi.mock('@stores/ui.store', () => ({ useUiStore: (sel: (s: { addToast: (t: unknown) => void }) => unknown) => sel({ addToast: (t) => rec('toast', t) }) }))

import { BulkEditPanel } from '@portals/ops-room/pages/Attendance/BulkEditPanel'

const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)

describe('00406 · سباق معاينة التعديل الجماعي', () => {
  it('تغيير التاريخ أثناء انتظار المعاينة يُهمل نتيجتها المتأخرة، والإرسال يطابق آخر معاينة فقط', async () => {
    wrap(<BulkEditPanel />)
    fireEvent.click(screen.getByTestId('ae-scope-employees'))
    fireEvent.click(await screen.findByTestId('ae-emp-e1'))
    fireEvent.change(screen.getByTestId('ae-from'), { target: { value: '2026-10-27' } })
    fireEvent.click(screen.getByTestId('ae-missing-out'))
    fireEvent.click(screen.getByTestId('ae-preview'))
    await waitFor(() => expect(calls.preview).toBeTruthy())
    // المستخدم يغيّر التاريخ قبل وصول نتيجة المعاينة
    fireEvent.change(screen.getByTestId('ae-from'), { target: { value: '2026-10-28' } })
    await act(async () => { resolvePreview?.(null) })
    // النتيجة القديمة (27) لا تظهر
    expect(screen.queryByTestId('ae-preview-box')).toBeNull()
    // معاينة جديدة للتاريخ الجديد، ثم إرسال يطابقها تماماً
    fireEvent.click(screen.getByTestId('ae-preview'))
    await waitFor(() => expect(calls.preview?.length).toBe(2))
    await act(async () => { resolvePreview?.(null) })
    await waitFor(() => expect(screen.getByTestId('ae-preview-box')).toBeInTheDocument())
    expect(screen.getByTestId('ae-preview-box').textContent).toContain('2026')
    fireEvent.change(screen.getByTestId('ae-reason'), { target: { value: 'حضور موثق بالكاميرا' } })
    fireEvent.click(screen.getByTestId('ae-submit-hr'))
    fireEvent.click(screen.getByTestId('ae-confirm-go'))
    await waitFor(() => expect(calls.create).toBeTruthy())
    expect(calls.create![0]).toMatchObject({ d: { scopeKind: 'employees', scopeIds: ['e1'], dates: ['2026-10-28'] }, mode: 'hr_request' })
  })
})
