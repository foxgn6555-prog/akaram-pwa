import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
const h = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@sdk/hr.sdk', () => ({ hr: { deputyMissingPunchReport: h.get } }))
import { MissingPunchReportPanel } from '@portals/deputy/pages/AttendanceEdits/MissingPunchReportPanel'
const row = { employee_id: 'e1', employee_number: '9', full_name: 'موظف اختبار', department_name: null, branch_name: null, confirmed_days: 3, review_days: 1, pending_days: 0, excluded_leave_days: 0, excluded_review_days: 0, threshold_reached: 1, proposed_amount: 1500, dates: [{ date: '2026-10-01', classification: 'confirmed' }, { date: '2026-10-02', classification: 'review' }] }
const report = { exists: true, month: '2026-10-01', finance_locked: false, id: 'd1', revision: 2, sent_at: '2026-11-02T10:00:00Z', automatic_send_scheduled: true, results_changed: false, threshold: 3, fixed_amount: 1500, total_employees: 101, total_confirmed_days: 3, total_review_days: 1, total_pending_days: 0, total_proposed_amount: 1500, rows: [row] }
const open = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MissingPunchReportPanel month="2026-10-01" /></QueryClientProvider>)
describe('وارد كشف البصمات الناقصة للمعاون', () => {
  beforeEach(() => { vi.clearAllMocks(); h.get.mockResolvedValue(report) })
  it('يعرض اللقطة والتحذير ولا يعرض اعتماداً أو خصماً', async () => {
    open(); expect(await screen.findByText('موظف اختبار')).toBeInTheDocument()
    expect(screen.getByText(/الكشف المرسل للمراجعة فقط/)).toHaveTextContent('ليس اعتماداً ولا خصماً')
    expect(screen.getByText(/2026-10-02/).parentElement).toHaveTextContent('للمراجعة')
    expect(screen.queryByRole('button', { name: /اعتماد/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }))
    await waitFor(() => expect(h.get).toHaveBeenCalledWith('2026-10-01', 100, 100))
  })
  it('يحذر عند تغير النتائج أو غياب الجدولة', async () => {
    h.get.mockResolvedValue({ ...report, results_changed: true, automatic_send_scheduled: false })
    open(); expect(await screen.findByText(/تغيّرت نتائج الحساب/)).toBeInTheDocument()
    expect(screen.getByText(/جدولة إرسال الكشف غير مفعّلة/)).toBeInTheDocument()
  })
  it('يوضح عدم وصول كشف ولا يدعي نجاح الإرسال', async () => {
    h.get.mockResolvedValue({ month: '2026-10-01', exists: false, finance_locked: false, automatic_send_scheduled: true })
    open(); expect(await screen.findByText(/لم يصل كشف لهذا الشهر/)).toBeInTheDocument()
  })
  it('يظهر خطأ عند تعذر التحميل', async () => {
    h.get.mockRejectedValue(new Error('network')); open(); expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تحميل الكشف')
  })
})
