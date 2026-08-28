/** وحدة الهيكل التنظيمي: عرض + إنشاء قسم/قسم فرعي + تحقق */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockMutateAsync = vi.fn()
const mockDepartments = vi.fn()

vi.mock('@features/departments', () => ({
  useDepartments: () => mockDepartments(),
  useCreateDepartment: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}))

import DepartmentsPage from '@portals/it/pages/UserManagement/DepartmentsPage'

const FIXTURE = [
  { id: 'd1', name: 'تقنية المعلومات', code: 'IT', parent_id: null, is_active: true },
  { id: 'd2', name: 'شعبة الشبكات', code: 'IT-NET', parent_id: 'd1', is_active: true },
]

describe('DepartmentsPage — الهيكل التنظيمي', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMutateAsync.mockResolvedValue({ id: 'd9', name: 'x', code: 'X', parent_id: null, is_active: true })
    mockDepartments.mockReturnValue({ data: FIXTURE, isLoading: false })
  })

  it('يعرض الأقسام مع القسم الأب', () => {
    render(<DepartmentsPage />)
    const table = screen.getByTestId('departments-table')
    expect(table).toHaveTextContent('تقنية المعلومات')
    expect(table).toHaveTextContent('شعبة الشبكات')
    expect(table).toHaveTextContent('تقنية المعلومات') // كأب لشعبة الشبكات
  })

  it('إنشاء قسم رئيسي — يرسل البيانات والرمز', async () => {
    const user = userEvent.setup()
    render(<DepartmentsPage />)
    await user.click(screen.getByTestId('toggle-dept-form'))
    await user.type(screen.getByTestId('dept-name'), 'شعبة الصيانة')
    await user.type(screen.getByTestId('dept-code'), 'MAINT')
    await user.click(screen.getByTestId('dept-submit'))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        name: 'شعبة الصيانة',
        code: 'MAINT',
        parent_id: null,
      })
    })
  })

  it('إنشاء قسم فرعي — يرسل القسم الأب', async () => {
    const user = userEvent.setup()
    render(<DepartmentsPage />)
    await user.click(screen.getByTestId('toggle-dept-form'))
    await user.type(screen.getByTestId('dept-name'), 'وحدة الدعم')
    await user.type(screen.getByTestId('dept-code'), 'IT-SUP')
    await user.selectOptions(screen.getByTestId('dept-parent'), 'd1')
    await user.click(screen.getByTestId('dept-submit'))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ parent_id: 'd1' }),
      )
    })
  })

  it('يرفض رمزاً بحروف عربية — بلا إرسال', async () => {
    const user = userEvent.setup()
    render(<DepartmentsPage />)
    await user.click(screen.getByTestId('toggle-dept-form'))
    await user.type(screen.getByTestId('dept-name'), 'قسم عربي الرمز')
    await user.type(screen.getByTestId('dept-code'), 'عربي')
    await user.click(screen.getByTestId('dept-submit'))

    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
    })
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('حالة الفراغ عند لا أقسام', () => {
    mockDepartments.mockReturnValue({ data: [], isLoading: false })
    render(<DepartmentsPage />)
    expect(screen.getByText('لا أقسام بعد')).toBeInTheDocument()
  })
})
