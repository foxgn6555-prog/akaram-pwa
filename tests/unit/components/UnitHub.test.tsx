/** صفحات الوحدات المركزية: أيقونات الصفحات تنقل + التقارير ظاهرة */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'

const mockNavigate = vi.fn()
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@features/user-management', () => ({
  useUsers: () => ({
    data: [
      { id: 'u1', email: 'a@x.iq', created_at: '2026-08-20T00:00:00Z', roles: ['employee'], employee_name: 'أحمد', employee_number: 'E1' },
      { id: 'u2', email: 's@x.iq', created_at: '2026-08-25T00:00:00Z', roles: ['hr_officer'], employee_name: 'سارة', employee_number: 'E2' },
      { id: 'u3', email: 'n@x.iq', created_at: '2026-08-26T00:00:00Z', roles: [], employee_name: null, employee_number: null },
    ],
    isLoading: false,
  }),
}))

vi.mock('@features/departments', () => ({
  useDepartments: () => ({ data: [{ id: 'd1' }, { id: 'd2' }] }),
}))

import UserManagementHub from '@portals/it/pages/UserManagement/UserManagementHub'

function renderHub() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UserManagementHub />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('صفحة وحدة إدارة المستخدمين (Hub)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
  })

  it('يعرض أيقونات صفحات الوحدة الثلاث', () => {
    renderHub()
    expect(screen.getByTestId('hub-card-list')).toHaveTextContent('المستخدمون')
    expect(screen.getByTestId('hub-card-create')).toHaveTextContent('إنشاء مستخدم')
    expect(screen.getByTestId('hub-card-departments')).toHaveTextContent('الهيكل التنظيمي')
  })

  it('الضغط على أيقونة ينقل لصفحتها', async () => {
    const user = userEvent.setup()
    renderHub()
    await user.click(screen.getByTestId('hub-card-create'))
    expect(mockNavigate).toHaveBeenCalledWith('/it/user-management/create')
    await user.click(screen.getByTestId('hub-card-list'))
    expect(mockNavigate).toHaveBeenCalledWith('/it/user-management/list')
  })

  it('يعرض تقارير الوحدة: العدد والأدوار وآخر الحسابات', () => {
    renderHub()
    const stats = screen.getByTestId('um-stats')
    expect(stats).toHaveTextContent('3')   // إجمالي
    expect(stats).toHaveTextContent('1')   // بلا أدوار
    expect(screen.getByTestId('um-roles')).toHaveTextContent('موظف')
    expect(screen.getByTestId('um-roles')).toHaveTextContent('موارد بشرية')
    expect(screen.getByTestId('um-recent')).toHaveTextContent('أحمد')
  })

  it('قسم التقارير موسوم بوضوح', () => {
    renderHub()
    expect(screen.getByText('تقارير وتفاصيل الوحدة')).toBeInTheDocument()
  })
})
