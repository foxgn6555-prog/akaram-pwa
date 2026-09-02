/** وحدة الحضورية — اسم الموظف + حاضر/غير حاضر + فلتر التاريخ */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { AttendanceRecord } from '@features/transfer-station/types'

const mockList = vi.fn()
const mockCreate = vi.fn().mockResolvedValue({ id: 'a1' })

vi.mock('@features/transfer-station', () => ({
  useAttendanceList: () => ({ data: mockList(), isLoading: false }),
  useCreateAttendance: () => ({ mutate: mockCreate, isPending: false }),
}))

import AttendancePage from '@portals/transfer-station/pages/Attendance/AttendancePage'

const REC: AttendanceRecord = {
  id: 'a1', employee_name: 'موظف اختبار', is_present: true, note: null,
  log_date: '2026-09-01', archived_at: null, archive_reason: null, created_at: null,
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AttendancePage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockList.mockReturnValue([REC])
})

describe('AttendancePage', () => {
  it('يعرض النموذج وفلتر التاريخ والجدول', () => {
    renderPage()
    expect(screen.getByTestId('attendance-page')).toBeInTheDocument()
    expect(screen.getByTestId('attendance-form')).toBeInTheDocument()
    expect(screen.getByTestId('attendance-filter-date')).toBeInTheDocument()
    expect(screen.getByText('موظف اختبار')).toBeInTheDocument()
    // «حاضر» تظهر في خيار التحكم وفي شارة الجدول — نكتفي بوجودها
    expect(screen.getAllByText('حاضر').length).toBeGreaterThan(0)
  })

  it('يرفض الحفظ دون اسم الموظف', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByTestId('attendance-submit'))
    expect(mockCreate).not.toHaveBeenCalled()
    expect(screen.getByText('اسم الموظف مطلوب (حرفان فأكثر)')).toBeInTheDocument()
  })

  it('يحفظ الموظف حاضراً أو غير حاضر', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByTestId('f-attendance-name'), 'موظف جديد')
    await user.selectOptions(screen.getByTestId('f-attendance-presence'), 'absent')
    await user.click(screen.getByTestId('attendance-submit'))
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ employee_name: 'موظف جديد', is_present: false }),
    )
  })
})