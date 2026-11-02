import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
const h = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }))
vi.mock('@sdk/hr.sdk', () => ({ hr: { missingPunchDraftGet: h.get, missingPunchDraftSave: h.save } }))
import { MissingPunchMonthDraft } from '@portals/ops-room/pages/Attendance/MissingPunchMonthDraft'
import { useMyPermissionsStore } from '@features/permissions/my-permissions'
const day = { employee_id: 'e1', employee_number: '9', full_name: 'موظف اختبار', department_name: null, branch_name: null, confirmed_days: 3, review_days: 1, excluded_leave_days: 0, excluded_review_days: 0, threshold_reached: 1, proposed_amount: 1500, dates: [{ date: '2026-10-01', classification: 'confirmed' }, { date: '2026-10-02', classification: 'review' }] }
const saved = { exists: true, month: '2026-10-01', finance_locked: false, id: 'd1', revision: 2, saved_at: '2026-11-02T10:00:00Z', threshold: 3, fixed_amount: 1500, total_employees: 1, total_confirmed_days: 3, total_review_days: 1, total_pending_days: 0, total_proposed_amount: 1500, rows: [day] }
function open(canSave = true) { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MissingPunchMonthDraft month="2026-10-01" canSave={canSave} /></QueryClientProvider>) }
describe('مسودة نهاية الشهر', () => {
  afterEach(() => useMyPermissionsStore.getState().reset())
  beforeEach(() => { vi.clearAllMocks(); h.get.mockResolvedValue({ exists: false, finance_locked: false, month: '2026-10-01' }); h.save.mockResolvedValue({ id: 'd1', revision: 1 }); vi.spyOn(window, 'confirm').mockReturnValue(true) })
  it('لا تحفظ دون تأكيد وتوضح الإرسال الآلي وعدم الخصم', async () => {
    open(); expect(await screen.findByText(/لا توجد مسودة محفوظة/)).toBeInTheDocument()
    expect(screen.getByText(/يُعاد احتسابها عند الإرسال الآلي للمعاون/)).toBeInTheDocument()
    vi.mocked(window.confirm).mockReturnValueOnce(false); fireEvent.click(screen.getByRole('button', { name: 'حفظ مسودة نهاية الشهر' }))
    expect(h.save).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'حفظ مسودة نهاية الشهر' }))
    await waitFor(() => expect(h.save).toHaveBeenCalledWith('2026-10-01'))
  })
  it('يعرض النسخة والتواريخ المحسوبة والملتبسة', async () => {
    h.get.mockResolvedValue(saved); open(); expect(await screen.findByText('موظف اختبار')).toBeInTheDocument()
    expect(screen.getByText(/2026-10-02/).parentElement).toHaveTextContent('للمراجعة')
    expect(screen.getByRole('button', { name: 'تحديث المسودة' })).toBeEnabled()
  })
  it('يعرض حالة الإرسال ويمنع تحديث النسخة المرسلة', async () => {
    h.get.mockResolvedValue({ ...saved, status: 'sent', sent_at: saved.saved_at }); open()
    expect(await screen.findByText(/أُرسل إلى المعاون للمراجعة/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'تحديث المسودة' })).toBeNull()
  })
  it('يعطل الحفظ للشهر غير الجاهز أو المقفل', async () => {
    open(false); expect(await screen.findByRole('button', { name: 'حفظ مسودة نهاية الشهر' })).toBeDisabled()
  })
  it('يحجب الزر عند منع صلاحية تعديل الحضور', async () => {
    useMyPermissionsStore.getState().set('ops', { 'ops-room.attendance': ['view'] })
    open(); expect(await screen.findByRole('button', { name: 'حفظ مسودة نهاية الشهر' })).toBeDisabled()
  })
  it('يعرض خطأ الحفظ دون ادعاء الإنشاء', async () => {
    h.save.mockRejectedValue(new Error('locked')); open(); await screen.findByText(/لا توجد مسودة محفوظة/)
    fireEvent.click(screen.getByRole('button', { name: 'حفظ مسودة نهاية الشهر' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذر حفظ المسودة')
    expect(screen.getByText(/لا توجد مسودة محفوظة/)).toBeInTheDocument()
  })
})
