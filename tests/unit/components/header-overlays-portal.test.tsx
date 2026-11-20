/**
 * انحدار 2026-11-20 — «أجهزتي وجلساتي» على الهاتف.
 *
 * العَرَض: الضغط على البند يخفي الشريط العلوي ولا يفتح اللوحة.
 * السبب: اللوحة كانت تُرسم داخل <header> الحامل لـ`backdrop-blur-md`، و`backdrop-filter`
 *         يجعل العنصر كتلةً حاوية لعناصر `position: fixed` التابعة له ⇒ `fixed bottom-0`
 *         صارت محسوبة على الهيدر (64px) لا على الشاشة.
 * الحماية: اللوحة وخلفية القائمة تُرسمان عبر portal في document.body، ولا توجد أي لوحة
 *         `fixed` داخل حاوية ذات `backdrop-filter`.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, useNavigate: () => vi.fn() }
})

vi.mock('@features/auth/hooks/usePortalAccess', () => ({
  usePortalAccess: () => ({ data: { needsSelector: false, portals: [] }, isLoading: false }),
}))

vi.mock('@features/auth/hooks/useMySessions', () => ({
  useMySessions: () => ({ data: [], isLoading: false }),
  useEndSession: () => ({ mutate: vi.fn(), isPending: false }),
  useEndOtherSessions: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateDeviceCode: () => ({ data: null, mutate: vi.fn(), isPending: false }),
}))

import { UserMenu } from '@components/layout/Header/UserMenu'
import { MyDevicesDialog } from '@components/layout/Header/MyDevicesDialog'

/** يحاكي الهيدر الحقيقي: `backdrop-blur-md` أنشأ كتلة الحاويات التي سبّبت العطل */
function renderInsideBlurredHeader() {
  return render(
    <MemoryRouter>
      <header data-testid="fake-header" style={{ backdropFilter: 'blur(8px)' }} className="relative z-[80]">
        <UserMenu fullName="موظف تجريبي" roleLabel="موظف" onLogout={() => {}} />
      </header>
    </MemoryRouter>,
  )
}

describe('لوحات الهيدر — لا تُحتجز داخل backdrop-filter', () => {
  it('«أجهزتي وجلساتي» تُرسم في body لا داخل الهيدر', async () => {
    const user = userEvent.setup()
    renderInsideBlurredHeader()

    await user.click(screen.getByLabelText('قائمة المستخدم'))
    await user.click(screen.getByTestId('user-menu-devices'))

    const dialog = screen.getByTestId('devices-dialog')
    expect(dialog.parentElement).toBe(document.body)
    expect(screen.getByTestId('fake-header').contains(dialog)).toBe(false)
    expect(screen.getByTestId('devices-backdrop').parentElement).toBe(document.body)
  })

  it('اللوحة طبقة عليا مع احترام شريط النظام السفلي', () => {
    render(<MyDevicesDialog open onClose={() => {}} />)
    const dialog = screen.getByTestId('devices-dialog')
    expect(dialog.className).toContain('z-[3000]')
    expect(dialog.className).toContain('safe-area-inset-bottom')
    expect(dialog.className).toContain('max-h-[85dvh]')
  })

  it('خلفية قائمة المستخدم في body فتغلق القائمة بالنقر خارجها', async () => {
    const user = userEvent.setup()
    renderInsideBlurredHeader()

    await user.click(screen.getByLabelText('قائمة المستخدم'))
    const backdrop = screen.getByTestId('user-menu-backdrop')
    expect(backdrop.parentElement).toBe(document.body)

    await user.click(backdrop)
    expect(screen.queryByTestId('user-menu-devices')).not.toBeInTheDocument()
  })

  it('لوحة القائمة فوق الخلفية (لا تُعتَّم): 3000 مقابل 2990 وفي body', async () => {
    const user = userEvent.setup()
    renderInsideBlurredHeader()

    await user.click(screen.getByLabelText('قائمة المستخدم'))

    const panel = screen.getByTestId('user-menu-panel')
    const backdrop = screen.getByTestId('user-menu-backdrop')
    expect(panel.parentElement).toBe(document.body)
    // الخلفية محصورة داخل AppShell الحامل لـ`isolate`، فإن نزلت عن z-30 داخل الهيدر
    // رسمت فوق اللوحة وجعلتها تبدو شبه شفافة — الحارس يثبّت الترتيب الصحيح
    expect(backdrop.className).toContain('z-[2990]')
    expect(panel.className).toContain('z-[3000]')
    expect(panel.className).toContain('bg-white')
  })

  it('النقر داخل اللوحة (بعد الـportal) لا يغلقها', async () => {
    const user = userEvent.setup()
    renderInsideBlurredHeader()

    await user.click(screen.getByLabelText('قائمة المستخدم'))
    const panel = screen.getByTestId('user-menu-panel')
    await user.click(panel)

    expect(screen.getByTestId('user-menu-devices')).toBeInTheDocument()
  })

  it('الهيدر الحقيقي لا يحتضن أي عنصر fixed (حارس بنيوي)', () => {
    renderInsideBlurredHeader()
    const header = screen.getByTestId('fake-header')
    // `fixed` داخل backdrop-filter يعني إحداثيات خاطئة — نمنعه بنيوياً
    expect(header.querySelector('.fixed')).toBeNull()
  })
})
