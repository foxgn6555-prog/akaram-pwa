import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
const h = vi.hoisted(() => ({ preview: vi.fn(), draft: vi.fn() }))
vi.mock('@sdk/hr.sdk', () => ({ hr: { missingPunchMonthPreview: h.preview, missingPunchDraftGet: h.draft } }))
import { MissingPunchMonthPreview } from '@portals/ops-room/pages/Attendance/MissingPunchMonthPreview'
const row = { employee_id: 'e1', employee_number: 'MP-9', full_name: 'موظف اختبار', department_name: 'العمليات', branch_name: null,
  confirmed_days: 9, review_days: 1, excluded_leave_days: 1, pending_days: 0, current_unrecorded_days: 1, threshold_reached: 3, proposed_amount: 4500,
  dates: [{ date: '2026-10-01', classification: 'confirmed', source: 'audit_backfill' }, { date: '2026-10-15', classification: 'review', source: 'real_arrival' }, { date: '2026-10-20', classification: 'leave', source: 'daily_snapshot' }] }
const result = { month: '2026-10-01', month_ended: true, finance_locked: false, settings_configured: true, threshold: 3, fixed_amount: 1500, total_employees: 1, total_confirmed_days: 9, total_review_days: 1, total_pending_days: 0, total_proposed_amount: 4500, rows: [row] }
function open() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MissingPunchMonthPreview month="2026-10-01" /></QueryClientProvider>) }
describe('معاينة شهر البصمة الناقصة', () => {
  beforeEach(() => { vi.clearAllMocks(); h.draft.mockResolvedValue({ month: '2026-10-01', exists: false, finance_locked: false }) })
  it('لا تحمل البيانات حتى الطلب، وتعرض الحد المتكرر والمرشحين دون اعتماد أو خصم', async () => {
    h.preview.mockResolvedValue(result)
    open()
    expect(h.preview).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'عرض المعاينة' }))
    expect(await screen.findByText('موظف اختبار')).toBeInTheDocument()
    expect(h.preview).toHaveBeenCalledWith('2026-10-01', 100, 0)
    expect(screen.getByText(/وليست كشفاً مرسلاً أو غرامة معتمدة/)).toBeInTheDocument()
    const tr = screen.getByText('موظف اختبار').closest('tr') as HTMLElement
    expect(within(tr).getByText('9')).toBeInTheDocument()
    expect(within(tr).getByText('3')).toBeInTheDocument()
    expect(within(tr).getByText('4,500')).toBeInTheDocument()
    expect(within(tr).getByText(/للمراجعة/)).toHaveTextContent('2026-10-15')
    expect(within(tr).getByText(/إجازة مستبعدة/)).toHaveTextContent('2026-10-20')
    expect(within(tr).getByText(/غير ملتقطة/)).toBeInTheDocument()
  })
  it('ينبه الإعداد غير المضبوط والشهر الجاري والمقفل والشفت الجاري', async () => {
    h.preview.mockResolvedValue({ ...result, month_ended: false, finance_locked: true, settings_configured: false, threshold: null, fixed_amount: null, total_proposed_amount: null, total_pending_days: 1, rows: [] })
    open(); fireEvent.click(screen.getByRole('button', { name: 'عرض المعاينة' }))
    expect(await screen.findByText(/لم يُضبط الحد والمبلغ/)).toBeInTheDocument()
    expect(screen.getByText(/الشهر لم ينتهِ/)).toBeInTheDocument()
    expect(screen.getByText(/الشهر مقفول مالياً/)).toBeInTheDocument()
    expect(screen.getByText(/توجد شفتات لم تنتهِ/)).toBeInTheDocument()
  })
  it('لا يخلط خطأ الشبكة مع سجل فارغ', async () => {
    h.preview.mockRejectedValue(new Error('offline'))
    open(); fireEvent.click(screen.getByRole('button', { name: 'عرض المعاينة' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تحميل المعاينة')
    expect(screen.queryByText(/لا توجد أدلة مسجلة/)).not.toBeInTheDocument()
  })
  it('يستعرض الصفحات ويُبقي العدد الإجمالي', async () => {
    h.preview.mockImplementation(async (_month: string, _limit: number, offset: number) => ({ ...result, total_employees: 101, rows: [{ ...row, employee_id: `e${offset}`, full_name: `موظف ${offset}` }] }))
    open(); fireEvent.click(screen.getByRole('button', { name: 'عرض المعاينة' }))
    expect(await screen.findByText('موظف 0')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }))
    await waitFor(() => expect(h.preview).toHaveBeenCalledWith('2026-10-01', 100, 100))
    expect(await screen.findByText('موظف 100')).toBeInTheDocument()
  })
})
