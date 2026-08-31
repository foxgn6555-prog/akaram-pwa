/**
 * هيدر الموبايل — البحث السريع:
 *  · زر أيقونة البحث يظهر على الموبايل ويفتح لوحة بحث بعرض كامل
 *  · الكتابة ترشّح صفحات البوابة
 *  · زر Escape يغلق اللوحة
 * (بوابة الموظف تُستخدم لأنها تملك وحدات بحث)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

vi.mock('@features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ data: { email: 'a@b.c', primaryRole: 'employee', fullName: 'موظف تجريبي' } }),
  useLogout: () => ({ mutateAsync: vi.fn(async () => {}) }),
}))
vi.mock('@features/auth/hooks/usePortalAccess', () => ({
  usePortalAccess: () => ({ data: { portals: [{ id: 'employee', path: '/employee' }] } }),
}))
vi.mock('@components/layout/Header/NotificationBell', () => ({
  NotificationBell: () => <button data-testid="bell" />,
}))

import { Header } from '@components/layout/Header/Header'

function setWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
}

function renderHeader(path = '/employee') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Header portal="employee" />
    </MemoryRouter>,
  )
}

beforeEach(() => setWidth(375))

describe('Header — بحث الموبايل', () => {
  it('زر أيقونة البحث ظاهر على الموبايل', () => {
    renderHeader()
    expect(screen.getByTestId('header-search-toggle')).toBeInTheDocument()
  })

  it('النقر يفتح لوحة بحث بعرض كامل', async () => {
    const user = userEvent.setup()
    renderHeader()
    expect(screen.queryByTestId('mobile-search-panel')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('header-search-toggle'))
    const panel = await screen.findByTestId('mobile-search-panel')
    expect(panel).toBeInTheDocument()
    // حقل إدخال
    expect(panel.querySelector('input')).toBeInTheDocument()
  })

  it('الكتابة ترشّح صفحات البوابة', async () => {
    const user = userEvent.setup()
    renderHeader()
    await user.click(screen.getByTestId('header-search-toggle'))
    const panel = await screen.findByTestId('mobile-search-panel')
    const input = panel.querySelector('input') as HTMLInputElement
    await user.type(input, 'طلبات')
    // صفحة "طلباتي" تظهر ضمن النتائج
    expect(panel).toHaveTextContent('طلباتي')
  })

  it('زر Escape يغلق اللوحة', async () => {
    const user = userEvent.setup()
    renderHeader()
    await user.click(screen.getByTestId('header-search-toggle'))
    await screen.findByTestId('mobile-search-panel')
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('mobile-search-panel')).not.toBeInTheDocument()
  })
})
