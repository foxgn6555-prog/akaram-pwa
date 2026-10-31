import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AttendanceDayRow } from '@features/hr'
import type * as HrModule from '@features/hr'

const mocks = vi.hoisted(() => ({ edit: vi.fn(), reset: vi.fn(), options: vi.fn() }))
vi.mock('@features/hr', async (orig) => {
  const actual = await orig<typeof HrModule>()
  return { ...actual, useEditAttendance: () => ({ mutateAsync: mocks.edit, isPending: false }), useResetAttendance: () => ({ mutateAsync: mocks.reset, isPending: false }) }
})
vi.mock('@sdk/hr.sdk', () => ({ hr: { correctionOptions: mocks.options } }))
import { EditPanel } from '@portals/ops-room/pages/Attendance/OpsAttendancePage'

const row = { employee_id: 'emp', full_name: 'موظف', work_date: '2026-10-01', status: 'incomplete', check_in: '2026-10-01T13:30:12Z', check_out: null } as AttendanceDayRow
const renderPanel = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><EditPanel row={row} onClose={vi.fn()} /></QueryClientProvider>)

describe('تصحيح بصمة واحدة من الواجهة', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.edit.mockResolvedValue(undefined); mocks.options.mockResolvedValue({ count: 1, real: '2026-10-01T13:30:12Z', shift_start: '2026-10-01T13:00:00Z', shift_end: '2026-10-01T19:00:00Z', expected_out: '2026-10-01T19:00:00Z' }) })
  it('يقترح نهاية الشفت ويحتفظ بالثواني الأصلية ويطلب الحساب الآلي', async () => {
    renderPanel(); await screen.findByTestId('e-side-out'); expect(screen.getByTestId('e-save')).toBeDisabled(); fireEvent.click(screen.getByTestId('e-side-out')); expect(screen.getByTestId('e-time')).toHaveValue('22:00')
    fireEvent.change(screen.getByTestId('e-reason'), { target: { value: 'تعطل الجهاز' } })
    fireEvent.click(screen.getByTestId('e-save'))
    await waitFor(() => expect(mocks.edit).toHaveBeenCalledWith({ employeeId: 'emp', date: '2026-10-01', checkIn: '2026-10-01T13:30:12Z', checkOut: '2026-10-01T19:00:00.000Z', status: 'auto', reason: 'تعطل الجهاز' }))
    expect(screen.queryByTestId('e-status')).toBeNull()
  })
  it('يسمح بتحديد أن البصمة الموجودة خروج ويقترح بداية الشفت', async () => {
    renderPanel(); fireEvent.click(await screen.findByTestId('e-side-in'))
    expect(screen.getByTestId('e-time')).toHaveValue('16:00')
    fireEvent.change(screen.getByTestId('e-reason'), { target: { value: 'تعطل الدخول' } }); fireEvent.click(screen.getByTestId('e-save'))
    await waitFor(() => expect(mocks.edit).toHaveBeenCalledWith(expect.objectContaining({ checkIn: '2026-10-01T13:00:00.000Z', checkOut: '2026-10-01T13:30:12Z', status: 'auto' })))
  })
  it('خروج الشفت الليلي يُرسل في اليوم التالي', async () => {
    mocks.options.mockResolvedValue({ count: 1, real: '2026-10-01T19:15:00Z', shift_start: '2026-10-01T19:00:00Z', shift_end: '2026-10-02T03:00:00Z', expected_out: '2026-10-02T03:00:00Z' })
    renderPanel(); fireEvent.click(await screen.findByTestId('e-side-out')); expect(screen.getByTestId('e-time')).toHaveValue('06:00')
    fireEvent.change(screen.getByTestId('e-reason'), { target: { value: 'تعطل الجهاز' } }); fireEvent.click(screen.getByTestId('e-save'))
    await waitFor(() => expect(mocks.edit).toHaveBeenCalledWith(expect.objectContaining({ checkIn: '2026-10-01T19:15:00Z', checkOut: '2026-10-02T03:00:00.000Z' })))
  })
  it('إذا لم توجد بصمة أو تعذّر التحقق يمنع الحفظ المباشر', async () => {
    mocks.options.mockResolvedValue({ count: 0 }); renderPanel()
    expect(await screen.findByText(/لا توجد بصمة حقيقية/)).toBeInTheDocument(); expect(screen.getByTestId('e-save')).toBeDisabled()
  })
})
