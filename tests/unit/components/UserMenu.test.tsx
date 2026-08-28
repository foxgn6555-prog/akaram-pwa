/** مبدّل البوابات في قائمة المستخدم — لأصحاب الصلاحيات المتعددة */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

const mockNavigate = vi.fn()
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockPortalAccess = vi.fn()
vi.mock('@features/auth/hooks/usePortalAccess', () => ({
  // الغلاف مطابق للـ hook الحقيقي: useQuery يرجع { data }
  usePortalAccess: () => ({ data: mockPortalAccess(), isLoading: false }),
}))

import { UserMenu } from '@components/layout/Header/UserMenu'

function renderMenu(
  props?: Partial<{ fullName: string; roleLabel: string; accountPath: string; settingsPath: string }>,
) {
  return render(
    <MemoryRouter>
      <UserMenu fullName="مدير النظام" roleLabel="مدير مفوض" onLogout={() => {}} {...props} />
    </MemoryRouter>,
  )
}

const MULTI_ACCESS = {
  needsSelector: true,
  portals: [
    { id: 'admin', path: '/admin', allowedRoles: ['super_admin'], colorVar: '' },
    { id: 'it', path: '/it', allowedRoles: ['super_admin'], colorVar: '' },
  ],
}

describe('UserMenu — مبدّل البوابات', () => {
  it('لا يظهر المبدّل لدور واحد', () => {
    mockPortalAccess.mockReturnValue({ needsSelector: false, portals: [] })
    renderMenu()
    await_userClick_open()
    expect(screen.queryByTestId('portal-switcher')).not.toBeInTheDocument()
  })

  // مساعد
  async function await_userClick_open() {
    const user = userEvent.setup()
    await user.click(screen.getByLabelText('قائمة المستخدم'))
  }

  it('يظهر المبدّل ويحدد قائمة البوابات المتاحة', async () => {
    mockPortalAccess.mockReturnValue(MULTI_ACCESS)
    renderMenu()
    await await_userClick_open()
    expect(screen.getByText('الانتقال بين البوابات')).toBeInTheDocument()
    expect(screen.getAllByText('مدير مفوض').length).toBeGreaterThan(0)
    expect(screen.getAllByText('التطوير المركزية').length).toBeGreaterThan(0)
  })

  it('الضغط على بوابة يوجّه إليها', async () => {
    mockPortalAccess.mockReturnValue(MULTI_ACCESS)
    renderMenu()
    await await_userClick_open()
    await userEvent.click(screen.getByTestId('switch-it'))
    expect(mockNavigate).toHaveBeenCalledWith('/it')
  })

  it('يعرض الاسم والدور', () => {
    mockPortalAccess.mockReturnValue({ needsSelector: false, portals: [] })
    renderMenu()
    expect(screen.getByText('مدير النظام')).toBeInTheDocument()
  })

  it('أزرار حسابي/الإعدادات تُخفى عند غياب مساراتها — والمبدّل يعمل بدلها', async () => {
    mockPortalAccess.mockReturnValue(MULTI_ACCESS)
    renderMenu()
    await await_userClick_open()
    expect(screen.queryByText('حسابي')).not.toBeInTheDocument()
    expect(screen.queryByText('الإعدادات')).not.toBeInTheDocument()
    expect(screen.getByTestId('portal-switcher')).toBeInTheDocument()
  })

  it('أزرار حسابي/الإعدادات تظهر عند تمرير مساراتها وتوجّه إليها', async () => {
    mockPortalAccess.mockReturnValue({ needsSelector: false, portals: [] })
    renderMenu({ accountPath: '/employee/profile', settingsPath: '/admin/settings' })
    await await_userClick_open()
    await userEvent.click(screen.getByText('حسابي'))
    expect(mockNavigate).toHaveBeenCalledWith('/employee/profile')
  })
})
