/** صفحة إنشاء المستخدم: تحقق Zod + بناء الطلب الصحيح + تحذير الصلاحية العالية */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const mockNavigate = vi.fn()
const mockMutateAsync = vi.fn()

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@features/user-management', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    useCreateUser: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  }
})

vi.mock('@features/departments', () => ({
  useDepartments: () => ({
    data: [
      { id: 'd1', name: 'تقنية المعلومات', code: 'IT', parent_id: null, is_active: true },
    ],
  }),
}))

import CreateUser from '@portals/it/pages/UserManagement/CreateUser'

function renderPage() {
  return render(
    <MemoryRouter>
      <CreateUser />
    </MemoryRouter>,
  )
}

const FILL = async (): Promise<void> => {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('البريد الإلكتروني'), 'new@akram.iq')
  await user.type(screen.getByLabelText('الاسم الكامل'), 'علي حسن محمد')
  await user.type(screen.getByLabelText('كلمة المرور المبدئية'), 'Passw0rd1')
  await user.type(screen.getByLabelText('الرقم الوظيفي'), 'EMP-099')
}

describe('CreateUser — إنشاء مستخدم', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMutateAsync.mockResolvedValue({ user_id: 'uid-1' })
  })

  it('يرسل الحمولة الصحيحة عند اكتمال البيانات', async () => {
    renderPage()
    await FILL()
    await userEvent.click(screen.getByTestId('create-submit'))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@akram.iq',
          role: 'employee',
          employee_number: 'EMP-099',
        }),
      )
    })
  })

  it('يرفض كلمة مرور بلا أرقام — بلا اتصال', async () => {
    renderPage()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('البريد الإلكتروني'), 'new@akram.iq')
    await user.type(screen.getByLabelText('الاسم الكامل'), 'علي حسن')
    await user.type(screen.getByLabelText('كلمة المرور المبدئية'), 'Abcdefgh')
    await user.click(screen.getByTestId('create-submit'))

    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
    })
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('يظهر تحذير الصلاحية العالية عند اختيار الإدارة العليا', async () => {
    renderPage()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByTestId('create-role'), 'super_admin')
    expect(screen.getByRole('note')).toHaveTextContent('صلاحية مرتفعة')
  })

  it('لا تحذير للدور العادي', () => {
    renderPage()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})
