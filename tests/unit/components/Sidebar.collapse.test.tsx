/**
 * طي/توسيع الشريط الجانبي:
 *  · مقبض الحافة (الانبثاق) وحده يبدّل العرض (w-72 ↔ w-20) — لا يوجد زر طي في التذييل.
 *  · درج الموبايل له زر إغلاق (×) يستدعي setMobileNav(false).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

vi.mock('@features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ data: null }),
  useLogout: () => ({ mutateAsync: vi.fn(async () => {}) }),
}))

import { Sidebar } from '@components/layout/Sidebar/Sidebar'
import { useUiStore } from '@stores/ui.store'

function renderDesktop() {
  return render(
    <MemoryRouter initialEntries={['/employee']}>
      <Sidebar portal="employee" variant="desktop" />
    </MemoryRouter>,
  )
}

function renderMobile() {
  return render(
    <MemoryRouter initialEntries={['/employee']}>
      <Sidebar portal="employee" variant="mobile" />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useUiStore.setState({ sidebarCollapsed: false, mobileNavOpen: true })
})

describe('طي شريط الدسكتوب', () => {
  it('لا يوجد زر طي في التذييل أسفل تسجيل الخروج (أُلغي)', () => {
    renderDesktop()
    expect(screen.queryByTestId('sidebar-collapse-footer')).not.toBeInTheDocument()
    expect(screen.queryByText('طي القائمة')).not.toBeInTheDocument()
  })

  it('مقبض الحافة (الانبثاق) يبدّل الطي والتوسيع', async () => {
    const user = userEvent.setup()
    renderDesktop()
    const aside = screen.getByTestId('app-sidebar')
    expect(aside.className).toContain('w-72')
    // كلاس العرض حصري: لا يجتمع w-72 مع w-20 أبداً (ترتيب CSS يُبطل أحدهما ويعطّل الطي بصرياً)
    expect(aside.className).not.toContain('w-20')

    await user.click(screen.getByTestId('sidebar-collapse'))
    expect(aside.className).toContain('w-20')
    expect(aside.className).not.toContain('w-72')
    // الحالة في المخزن تغيّرت فعلاً (الزر يعمل)
    expect(useUiStore.getState().sidebarCollapsed).toBe(true)

    await user.click(screen.getByTestId('sidebar-collapse'))
    expect(aside.className).toContain('w-72')
    expect(aside.className).not.toContain('w-20')
    expect(useUiStore.getState().sidebarCollapsed).toBe(false)
  })
})

describe('درج الموبايل', () => {
  it('يعرض زر إغلاق (×) ويغلق الدرج عند ضغطه', async () => {
    const user = userEvent.setup()
    renderMobile()
    const closeBtn = screen.getByTestId('sidebar-mobile-close')
    expect(closeBtn).toBeInTheDocument()
    await user.click(closeBtn)
    expect(useUiStore.getState().mobileNavOpen).toBe(false)
  })
})
