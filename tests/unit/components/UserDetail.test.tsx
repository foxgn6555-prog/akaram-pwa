/** تفاصيل المستخدم — تعديل بيانات الموظف + إدارة الحساب (تعطيل/كلمة مرور/بريد) + الأدوار */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router'
import { z } from 'zod'

const mockNavigate = vi.fn()
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockSetRole = vi.fn()
const mockUpdateProfile = vi.fn()
const mockSetBanned = vi.fn()
const mockResetPass = vi.fn()
const mockUpdateEmail = vi.fn()

const { FIXTURE, SESSION } = vi.hoisted(() => ({
  FIXTURE: {
    id: 'u1', email: 'employee@akram.iq', created_at: '2026-01-01T00:00:00Z',
    last_sign_in_at: '2026-08-01T00:00:00Z', banned_until: null as string | null,
    roles: ['employee'] as string[],
    employee_id: 'e1' as string | null, employee_name: 'أحمد علي',
    employee_number: 'EMP-001', phone: '07701234567', job_title: 'موظف إداري',
    department_id: 'd1' as string | null, department_name: 'تقنية المعلومات',
  },
  SESSION: { value: 'admin-1' },
}))

vi.mock('@features/user-management', () => ({
  useUserFromList: (id?: string) => ({
    data: id === FIXTURE.id ? FIXTURE : undefined,
    isLoading: false,
  }),
  useSetUserRole: () => ({ mutate: mockSetRole, isPending: false }),
  useUpdateEmployeeProfile: () => ({ mutate: mockUpdateProfile, isPending: false }),
  useSetUserBanned: () => ({ mutate: mockSetBanned, isPending: false }),
  useResetUserPassword: () => ({ mutate: mockResetPass, isPending: false }),
  useUpdateUserEmail: () => ({ mutate: mockUpdateEmail, isPending: false }),
  updateProfileSchema: z.object({
    full_name: z.string().min(3, 'الاسم مطلوب'),
    phone: z.string().optional().or(z.literal('')),
    job_title: z.string().optional().or(z.literal('')),
    department_id: z.string().optional().or(z.literal('')),
    employee_number: z.string().optional().or(z.literal('')),
  }),
  ASSIGNABLE_ROLES: ['employee', 'hr_officer', 'super_admin'],
}))

vi.mock('@features/auth/hooks/useAuth', () => ({
  useAuth: () => ({
    data: { id: SESSION.value, email: 'admin@x.iq', fullName: 'مدير النظام', roles: ['it_admin'], primaryRole: 'it_admin' },
  }),
}))

vi.mock('@features/departments', () => ({
  useDepartments: () => ({ data: [{ id: 'd1', name: 'تقنية المعلومات' }] }),
}))

import UserDetail from '@portals/it/pages/UserManagement/UserDetail'

function renderPage(userId = 'u1') {
  return render(
    <MemoryRouter initialEntries={[`/it/user-management/${userId}`]}>
      <Routes>
        <Route path="/it/user-management/:userId" element={<UserDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('UserDetail — الإدارة الشاملة للمستخدم', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    SESSION.value = 'admin-1'
  })

  it('يعرض بطاقة المستخدم مع الحالة والقسم', () => {
    renderPage()
    const card = screen.getByTestId('user-card')
    expect(card).toHaveTextContent('أحمد علي')
    expect(card).toHaveTextContent('employee@akram.iq')
    expect(screen.getByTestId('user-active-badge')).toHaveTextContent('مفعّل')
    expect(card).toHaveTextContent('تقنية المعلومات')
  })

  it('نموذج التعديل معبأ مسبقاً ببيانات الموظف', () => {
    renderPage()
    expect(screen.getByLabelText('الاسم الكامل')).toHaveValue('أحمد علي')
    expect(screen.getByLabelText('رقم الهاتف')).toHaveValue('07701234567')
  })

  it('تعديل الاسم والحفظ يستدعي useUpdateEmployeeProfile', async () => {
    const user = userEvent.setup()
    renderPage()
    const save = screen.getByTestId('save-profile')
    expect(save).toBeDisabled() // لا تغييرات بعد
    const nameInput = screen.getByLabelText('الاسم الكامل')
    await user.clear(nameInput)
    await user.type(nameInput, 'أحمد علي حسن')
    await user.click(save)
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', full_name: 'أحمد علي حسن' }),
    )
  })

  it('تعطيل الحساب يمر بنافذة تأكيد ثم ينادي useSetUserBanned', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByTestId('toggle-ban'))
    expect(screen.getByTestId('ban-dialog-title')).toHaveTextContent('تعطيل هذا الحساب؟')
    await user.click(screen.getByTestId('confirm-ban'))
    expect(mockSetBanned).toHaveBeenCalledWith({ userId: 'u1', banned: true })
  })

  it('إعادة تعيين كلمة المرور: معطّل قبل 8 أحرف ثم يعمل بعد الكتابة', async () => {
    const user = userEvent.setup()
    renderPage()
    const btn = screen.getByTestId('reset-password-btn')
    expect(btn).toBeDisabled()
    await user.type(screen.getByTestId('new-password'), 'NewPass1')
    expect(btn).toBeEnabled()
    await user.click(btn)
    expect(mockResetPass).toHaveBeenCalledWith(
      { userId: 'u1', password: 'NewPass1' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('منح/سحب الأدوار يستدعي useSetUserRole', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByTestId('role-toggle-hr_officer'))
    expect(mockSetRole).toHaveBeenCalledWith({ userId: 'u1', role: 'hr_officer', grant: true })
    await user.click(screen.getByTestId('role-toggle-employee'))
    expect(mockSetRole).toHaveBeenCalledWith({ userId: 'u1', role: 'employee', grant: false })
  })

  it('حماية الذات: تنبيه + تعطيل عمليات الحساب والأدوار على الحساب الشخصي', () => {
    SESSION.value = 'u1' // نفس المستخدم
    renderPage()
    expect(screen.getByTestId('self-notice')).toBeInTheDocument()
    expect(screen.getByTestId('toggle-ban')).toBeDisabled()
    expect(screen.getByTestId('update-email-btn')).toBeDisabled()
    expect(screen.getByTestId('role-toggle-employee')).toBeDisabled()
  })
})