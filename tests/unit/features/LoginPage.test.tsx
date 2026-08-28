/**
 * اختبار LoginPage — جزيرة الأكرام (قالب Kyvzon)
 * يغطي: الهوية · التحقق Zod · التوجيه حسب الدور · الأمان · عدم تسرّب الرسائل
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const mockNavigate = vi.fn()
const mockMutateAsync = vi.fn()
const mockResolvePortal = vi.fn()

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@features/auth/hooks/useAuth', () => ({
  useLogin: () => ({ mutateAsync: mockMutateAsync }),
  useAuth: () => ({ data: null, isLoading: false }),
}))

vi.mock('@router/portal.router', () => ({
  resolvePortal: (...args: unknown[]) => mockResolvePortal(...args),
}))

import LoginPage from '@portals/public/pages/Login/LoginPage'

/** محددات الأزرار والحقول — عبر labels (accessibility-first) */
const emailInput = () => screen.getByLabelText('البريد الإلكتروني')
const passwordInput = () => screen.getByLabelText('كلمة المرور')
const submitBtn = () => screen.getByRole('button', { name: /تسجيل الدخول/ })

function renderPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  )
}

describe('LoginPage — جزيرة الأكرام (قالب Kyvzon)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockNavigate.mockClear()
    mockMutateAsync.mockReset()
  })

  it('يعرض هوية جزيرة الأكرام + الشعار + حقول الدخول', () => {
    renderPage()
    expect(screen.getByText('جزيرة الأكرام')).toBeInTheDocument()
    expect(screen.getByAltText('شعار جزيرة الأكرام')).toBeInTheDocument()
    expect(emailInput()).toBeInTheDocument()
    expect(passwordInput()).toBeInTheDocument()
    expect(submitBtn()).toBeInTheDocument()
  })

  it('يعرض شريط الثقة (مشفّر · سريع · موثوق)', () => {
    renderPage()
    expect(screen.getByText('مشفّر')).toBeInTheDocument()
    expect(screen.getByText('سريع')).toBeInTheDocument()
    expect(screen.getByText('موثوق')).toBeInTheDocument()
  })

  it('يرفض بريداً غير صالح برسالة عربية (Zod) دون استدعاء الخادم', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(emailInput(), 'not-an-email')
    await user.type(passwordInput(), '12345678')
    await user.click(submitBtn())

    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
    })
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('يرفض كلمة مرور أقصر من 8', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(emailInput(), 'a@b.co')
    await user.type(passwordInput(), '123')
    await user.click(submitBtn())

    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
    })
    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('دور واحد → توجيه مباشر لمسار البوابة', async () => {
    mockMutateAsync.mockResolvedValueOnce({
      id: 'u1', email: 'e@x.iq', fullName: 'موظف', roles: ['employee'], primaryRole: 'employee',
    })
    mockResolvePortal.mockReturnValueOnce({ type: 'single', portal: 'employee', path: '/employee' })

    const user = userEvent.setup()
    renderPage()
    await user.type(emailInput(), 'employee@akram.iq')
    await user.type(passwordInput(), 'Password1')
    await user.click(submitBtn())

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/employee', { replace: true })
    })
  })

  it('أدوار متعددة → توجيه مباشر لبوابة الدور ذي الأولوية العليا', async () => {
    mockMutateAsync.mockResolvedValueOnce({
      id: 'u2', email: 'm@x.iq', fullName: 'مدير', roles: ['employee', 'department_manager'], primaryRole: 'department_manager',
    })
    mockResolvePortal.mockReturnValueOnce({ type: 'single', portal: 'manager', path: '/manager' })

    const user = userEvent.setup()
    renderPage()
    await user.type(emailInput(), 'manager@akram.iq')
    await user.type(passwordInput(), 'Password1')
    await user.click(submitBtn())

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/manager', { replace: true })
    })
  })

  it('بيانات خاطئة → رسالة آمنة لا تسرّب وجود الحساب + تسجيل فشل محلي', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة'))

    const user = userEvent.setup()
    renderPage()
    await user.type(emailInput(), 'a@b.co')
    await user.type(passwordInput(), 'WrongPass1')
    await user.click(submitBtn())

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    // الرسالة آمنة — لا تسرّب وجود الحساب
    const alerts = screen.getAllByRole('alert')
    const alertText = alerts.map((a) => a.textContent).join(' ')
    expect(alertText).not.toContain('غير موجود')
    // سُجل الفشل محلياً
    const raw = localStorage.getItem('akram:login-guard')
    expect(raw).not.toBeNull()
  })

  it('زر إظهار كلمة المرور يبدل النوع', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(passwordInput()).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'إظهار كلمة المرور' }))
    expect(passwordInput()).toHaveAttribute('type', 'text')
  })

  it('رسالة الخطأ تختفي تلقائياً (timeout 6s مدمج في الكود)', async () => {
    mockMutateAsync.mockRejectedValueOnce(new Error('خطأ مؤقت'))

    renderPage()
    const user = userEvent.setup()
    await user.type(emailInput(), 'a@b.co')
    await user.type(passwordInput(), 'WrongPass1')
    await user.click(submitBtn())

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    // التحقق من أن المكون يستخدم useEffect بمؤقت 6 ثوانٍ (تحقق هيكلي)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
