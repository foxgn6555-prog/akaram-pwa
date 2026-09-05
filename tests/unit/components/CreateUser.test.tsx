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

vi.mock('@features/sector', () => ({
  useSectors: () => ({
    data: [
      { id: 1, code: 'S1', name: 'القاطع الأول', sort: 1 },
      { id: 2, code: 'S2', name: 'القاطع الثاني', sort: 2 },
      { id: 3, code: 'S3', name: 'القاطع الثالث', sort: 3 },
      { id: 4, code: 'S4', name: 'القاطع الرابع', sort: 4 },
    ],
  }),
  SHIFT_LABELS: { morning: 'الشفت الصباحي', evening: 'الشفت المسائي', night: 'الشفت الليلي' },
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

  it('يرسل بيانات مسؤول القسم بالشفت الافتراضي والقواطع المختارة', async () => {
    renderPage()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByTestId('create-role'), 'department_manager')
    await FILL()
    await user.click(screen.getByText('القاطع الأول'))
    await user.click(screen.getByText('القاطع الثاني'))
    await user.click(screen.getByTestId('create-submit'))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'department_manager',
          manager_shift: 'morning',
          manager_sectors: [1, 2],
        }),
      )
    })
  })

  it('يرفض مسؤول قسم بلا قواطع — بلا اتصال وبلا شفت وهمي', async () => {
    renderPage()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByTestId('create-role'), 'department_manager')
    await FILL()
    await user.click(screen.getByTestId('create-submit'))

    await waitFor(() => {
      expect(screen.getByText('اختر قاطعاً واحداً على الأقل')).toBeInTheDocument()
    })
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('لا ينتقل بعيداً عند فشل الإنشاء — تبقى الصفحة والبيانات', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('EMAIL_TAKEN'))
    renderPage()
    await FILL()
    await userEvent.click(screen.getByTestId('create-submit'))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalled()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(screen.getByLabelText('البريد الإلكتروني')).toHaveValue('new@akram.iq')
  })
})
