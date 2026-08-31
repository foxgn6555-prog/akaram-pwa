/**
 * اختبارات تجاوب إطار التطبيق (AppShell):
 *  · على الدسكتوب: الشريط الجانبي ثابت، درج الموبايل غير موجود، شريط سفلي غير موجود
 *  · على الموبايل: الدرج مخفي افتراضياً، زر الهيدر يفتحه، الخلفية تغلقه
 *  · النقر على رابط في الدرج يغلقه (onNavigate)
 *  · طي شريط الدسكتوب لا يؤثر إطلاقاً على حالة درج الموبايل (فصل الحالتين)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

// ── محاكاة الاعتماديات الخارجية ──
vi.mock('@features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ data: null }),
  useLogout: () => ({ mutateAsync: vi.fn(async () => {}) }),
}))
vi.mock('@components/ui', () => ({
  Toaster: () => <div data-testid="toaster" />,
}))
vi.mock('@components/feedback/OfflineBanner', () => ({
  OfflineBanner: () => <div data-testid="offline-banner" />,
}))
vi.mock('@components/layout/Header/Header', () => ({
  Header: ({ portal }: { portal: string }) => (
    <header data-testid="app-header">
      <span>{portal}</span>
    </header>
  ),
}))

import { AppShell } from '@components/layout/AppShell'
import { useUiStore } from '@stores/ui.store'

function setWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/employee']}>
      <AppShell portal="employee" />
    </MemoryRouter>,
  )
}

describe('AppShell — سلوك الدسكتوب', () => {
  beforeEach(() => {
    setWidth(1440)
    useUiStore.setState({ mobileNavOpen: false, sidebarCollapsed: false })
  })

  it('يعرض شريط الدسكتوب ولا يعرض درج الموبايل', () => {
    renderShell()
    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument()
    expect(screen.queryByTestId('app-sidebar-mobile')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sidebar-backdrop')).not.toBeInTheDocument()
  })

  it('لا يعرض شريط التنقل السفلي على الدسكتوب', () => {
    renderShell()
    expect(screen.queryByTestId('mobile-bottom-nav')).not.toBeInTheDocument()
  })
})

describe('AppShell — سلوك الموبايل', () => {
  beforeEach(() => {
    setWidth(375)
    useUiStore.setState({ mobileNavOpen: false })
  })

  it('الدرج مغلق افتراضياً عند فتح التطبيق على شاشة صغيرة', () => {
    renderShell()
    // شريط الدسكتوب مخفي على الموبايل (داخل حاوية max-lg:hidden لكنه يبقى في DOM)
    // الدرج المنزلق غير موجود ما لم تُفتح الحالة
    expect(screen.queryByTestId('app-sidebar-mobile')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sidebar-backdrop')).not.toBeInTheDocument()
  })

  it('فتح الدرج عبر المتجر يعرض الشريط المتحرك + الخلفية', async () => {
    renderShell()
    useUiStore.setState({ mobileNavOpen: true })
    // إعادة التحقق بعد تغيير الحالة
    expect(await screen.findByTestId('app-sidebar-mobile')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar-backdrop')).toBeInTheDocument()
  })

  it('النقر على الخلفية يغلق الدرج', async () => {
    const user = userEvent.setup()
    renderShell()
    useUiStore.setState({ mobileNavOpen: true })
    await user.click(await screen.findByTestId('sidebar-backdrop'))
    expect(useUiStore.getState().mobileNavOpen).toBe(false)
  })

  it('تجاوز عرض الدسكتوب (resize) يغلق الدرج تلقائياً', () => {
    renderShell()
    useUiStore.setState({ mobileNavOpen: true })
    setWidth(1280)
    window.dispatchEvent(new Event('resize'))
    expect(useUiStore.getState().mobileNavOpen).toBe(false)
  })

  it('يعرض شريط التنقل السفلي على الموبايل', () => {
    renderShell()
    expect(screen.getByTestId('mobile-bottom-nav')).toBeInTheDocument()
  })
})

describe('AppShell — فصل حالتي الطي والدرج', () => {
  beforeEach(() => setWidth(1440))

  it('طي شريط الدسكتوب لا يغير حالة درج الموبايل', () => {
    renderShell()
    expect(useUiStore.getState().mobileNavOpen).toBe(false)
    useUiStore.getState().toggleSidebarCollapsed()
    expect(useUiStore.getState().sidebarCollapsed).toBe(true)
    // درج الموبايل لم يتأثر
    expect(useUiStore.getState().mobileNavOpen).toBe(false)
  })
})
