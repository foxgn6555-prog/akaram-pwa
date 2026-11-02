import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
const h = vi.hoisted(() => ({ list: vi.fn(), decide: vi.fn() }))
vi.mock('@sdk/hr.sdk', () => ({ hr: { deputyMissingPunchReviews: h.list, deputyMissingPunchReviewDecide: h.decide } }))
import { MissingPunchReviewPanel } from '@portals/deputy/pages/AttendanceEdits/MissingPunchReviewPanel'
const row = { id: 'r1', employee_id: 'e1', employee_number: '100', full_name: 'موظف اختبار', work_date: '2026-10-02', department_name: 'العمليات', branch_name: null, original_punch: '2026-10-02T05:00:00Z', later_punch: '2026-10-02T13:00:00Z', detected_by: 'real_arrival', evidence_hash: 'sig1', evidence: { leave: false, context: { count: 2 }, punches: [{ id: 'p1', at: '2026-10-02T05:00:00Z', device: 'S1', direction: 'unknown', method: 'manual', received_at: '2026-10-03T05:00:00Z' }] }, current_decision: null, last_decision: null, last_reason: null }
const data = { month: '2026-10-01', finance_locked: false, total: 1, rows: [row] }
function open() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MissingPunchReviewPanel month="2026-10-01" /></QueryClientProvider>) }
describe('مراجعة المعاون لدليل البصمة الناقصة', () => {
  beforeEach(() => { vi.clearAllMocks(); h.list.mockResolvedValue(data) })
  it('يشترط سبباً ويعرض الدليل ولا ينشئ خصماً', async () => {
    h.decide.mockResolvedValue(undefined); open()
    expect(await screen.findByText('موظف اختبار')).toBeInTheDocument()
    expect(screen.getByText(/ليس اعتماد كشف ولا ينشئ خصماً/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'مراجعة' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/تأخر وصول البصمة/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'حفظ قرار المراجعة' })).toBeDisabled()
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'القرار' }), { target: { value: 'confirmed' } })
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'راجعت جهاز البصمة والسجل' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ قرار المراجعة' }))
    await waitFor(() => expect(h.decide).toHaveBeenCalledWith('r1', 'confirmed', 'راجعت جهاز البصمة والسجل', 'sig1'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
  it('يحظر التعديل عند قفل المالية أو وجود إجازة ويعرض القرار السابق المتقادم', async () => {
    h.list.mockResolvedValue({ ...data, finance_locked: true, rows: [{ ...row, evidence: { ...row.evidence, leave: true }, last_decision: 'excluded', last_reason: 'سبب سابق' }] })
    open(); expect(await screen.findByText('موظف اختبار')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'مراجعة' })).toBeDisabled()
    expect(screen.getByText(/تغيّر الدليل بعد القرار السابق/)).toBeInTheDocument()
    expect(screen.getByText(/الشهر مقفل مالياً/)).toBeInTheDocument()
  })
  it('يعرض الخطأ بدلاً من الادعاء بالحفظ عند تغير الأدلة', async () => {
    h.decide.mockRejectedValue(new Error('stale')); open(); await screen.findByText('موظف اختبار')
    fireEvent.click(screen.getByRole('button', { name: 'مراجعة' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'تحققنا من الجهاز والسجل' } })
    fireEvent.click(screen.getByRole('button', { name: 'حفظ قرار المراجعة' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('قد تكون الأدلة تغيّرت')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
