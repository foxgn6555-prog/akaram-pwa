import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
const h = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('@sdk/hr.sdk', () => ({ hr: { missingPunchRegister: h.list } }))
import { MissingPunchRegisterPanel } from '@portals/ops-room/pages/Attendance/MissingPunchRegisterPanel'
const row = (id: string, patch = {}) => ({ employee_id: id, employee_number: id, full_name: `موظف ${id}`, work_date: '2026-10-05', department_name: null, branch_name: null, original_punch: '2026-10-05T05:00:00Z', missing_side: 'out', detected_by: 'manual_correction', correction_audit_id: 'audit', current_status: 'present', approved_leave: false, needs_review: false, ...patch })
function open() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MissingPunchRegisterPanel month="2026-10-01" /></QueryClientProvider>) }
describe('سجل البصمات الناقصة', () => {
  it('يعرض المصححة والمراجعة ويبيّن عدم وجود خصم مالي', async () => {
    h.list.mockResolvedValue({ month: '2026-10-01', automatic_capture_scheduled: true, total: 3, rows: [row('E1'), row('E2', { needs_review: true, correction_audit_id: null }), row('E3', { approved_leave: true })] })
    open()
    expect(await screen.findByText('صُحّحت يدوياً — خروج ناقص')).toBeInTheDocument()
    expect(screen.getByText('البصمات تحتاج مراجعة')).toBeInTheDocument()
    expect(screen.getByText('إجازة معتمدة — للمراجعة')).toBeInTheDocument()
    expect(screen.getByText(/لم يُفعّل حساب الغرامة أو الخصم/)).toBeInTheDocument()
    expect(screen.getByTestId('missing-register-total')).toHaveTextContent('3')
    expect(h.list).toHaveBeenCalledWith('2026-10-01', 100, 0)
  })
  it('يتنقل بين صفحات السجل دون إخفاء العدد الكلي', async () => {
    h.list.mockImplementation(async (_month: string, _limit: number, offset: number) => ({ month: '2026-10-01', automatic_capture_scheduled: true, total: 101, rows: [row(offset === 0 ? 'E1' : 'E101')] }))
    open()
    expect(await screen.findByText('موظف E1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }))
    await waitFor(() => expect(h.list).toHaveBeenCalledWith('2026-10-01', 100, 100))
    expect(await screen.findByText('موظف E101')).toBeInTheDocument()
  })
  it('ينبه إن كان الرصد التلقائي غير مجدول', async () => {
    h.list.mockResolvedValue({ month: '2026-10-01', automatic_capture_scheduled: false, total: 0, rows: [] })
    open()
    expect(await screen.findByText(/السجل التلقائي قد يكون غير مكتمل/)).toBeInTheDocument()
  })
  it('يعرض خطأ الشبكة بدلاً من اعتبار السجل فارغاً', async () => {
    h.list.mockRejectedValue(new Error('offline'))
    open()
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تحميل السجل')
    expect(screen.queryByText('لا توجد حالات مسجّلة لهذا الشهر.')).not.toBeInTheDocument()
  })
})
