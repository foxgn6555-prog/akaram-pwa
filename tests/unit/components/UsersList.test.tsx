/** وحدة إدارة المستخدمين — صفحة القائمة: عرض + بحث + ربط الإنشاء */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const mockNavigate = vi.fn()
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockUsers = vi.fn()
vi.mock('@features/user-management', () => ({
  useUsers: (q?: string) => mockUsers(q),
}))

import UsersList from '@portals/it/pages/UserManagement/UsersList'

const FIXTURE = [
  {
    id: 'u1', email: 'employee@akram.iq', created_at: '2026-01-01T00:00:00Z',
    last_sign_in_at: '2026-08-01T00:00:00Z', roles: ['employee'],
    employee_name: 'أحمد علي', employee_number: 'EMP-001',
  },
  {
    id: 'u2', email: 'hr@akram.iq', created_at: '2026-01-02T00:00:00Z',
    last_sign_in_at: null, roles: ['hr_officer', 'employee'],
    employee_name: 'سارة كريم', employee_number: 'EMP-002',
  },
]

function renderPage() {
  return render(
    <MemoryRouter>
      <UsersList />
    </MemoryRouter>,
  )
}

describe('UsersList — وحدة إدارة المستخدمين', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUsers.mockReturnValue({ data: FIXTURE, isLoading: false, isError: false })
  })

  it('يعرض المستخدمين وأدوارهم وشارات الأدوار العربية', () => {
    renderPage()
    const table = screen.getByTestId('users-table')
    expect(table).toHaveTextContent('أحمد علي')
    expect(table).toHaveTextContent('سارة كريم')
    expect(table).toHaveTextContent('موظف')
    expect(table).toHaveTextContent('موارد بشرية')
    expect(screen.getByTestId('users-table')).toBeInTheDocument()
  })

  it('يعرض «لم يدخل بعد» لمن لم يسجل دخولاً', () => {
    renderPage()
    expect(screen.getByText('لم يدخل بعد')).toBeInTheDocument()
  })

  it('زر إنشاء مستخدم يوجّه لصفحة الإنشاء', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByTestId('create-user-btn'))
    expect(mockNavigate).toHaveBeenCalledWith('/it/user-management/create')
  })

  it('زر الأدوار يوجّه لتفاصيل المستخدم', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByTestId('manage-employee'))
    expect(mockNavigate).toHaveBeenCalledWith('/it/user-management/u1')
  })

  it('حالة الفراغ عند عدم وجود مستخدمين', () => {
    mockUsers.mockReturnValue({ data: [], isLoading: false, isError: false })
    renderPage()
    expect(screen.getByText('لا يوجد مستخدمون مطابقون')).toBeInTheDocument()
  })

  it('حالة الخطأ عند فشل الجلب', () => {
    mockUsers.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderPage()
    expect(screen.getByText('تعذر جلب المستخدمين')).toBeInTheDocument()
  })
})
