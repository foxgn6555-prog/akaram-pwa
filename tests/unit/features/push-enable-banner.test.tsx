/**
 * 00407 — لافتة تفعيل إشعارات الهاتف: تظهر فقط حين يكون الجهاز غير مشترك، وتفعّل بزر واحد.
 * السبب: ٠ اشتراك · ٠ إرسال على قاعدة الإنتاج رغم أن الإرسال نفسه صار مجدولًا.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  enabled: vi.fn(),
  enable: vi.fn(),
  support: { supported: true, permission: 'default', isIos: false, standalone: false } as Record<string, unknown>,
  toasts: [] as Array<{ type: string; message: string }>,
}))
vi.mock('@features/notifications/push.client', () => ({
  currentDevicePushEnabled: () => h.enabled(),
  enablePush: () => h.enable(),
  pushSupport: () => h.support,
}))
vi.mock('@stores/ui.store', () => ({ useUiStore: (sel: (s: { addToast: (t: unknown) => void }) => unknown) => sel({ addToast: (t) => h.toasts.push(t as { type: string; message: string }) }) }))
import { PushEnableBanner } from '@features/notifications/components/PushEnableBanner'

/** يحاكي وجود عامل خدمة مسجَّل (الحالة الطبيعية في النسخة المنشورة) */
const stubWorker = (present: boolean) => {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: present
      ? { ready: Promise.resolve({ pushManager: { getSubscription: () => Promise.resolve(null) } }), getRegistrations: () => Promise.resolve([{}]) }
      : { ready: new Promise(() => undefined), getRegistrations: () => Promise.resolve([]) },
  })
}

beforeEach(() => {
  stubWorker(true)
  h.toasts = []
  h.support = { supported: true, permission: 'default', isIos: false, standalone: false }
  h.enabled.mockReset().mockResolvedValue(false)
  h.enable.mockReset().mockResolvedValue(undefined)
})

describe('PushEnableBanner (00407)', () => {
  it('يظهر حين لا يكون الجهاز مشتركًا، ويختفي بعد التفعيل الناجح', async () => {
    render(<PushEnableBanner />)
    await screen.findByTestId('push-enable-banner')
    await userEvent.click(screen.getByTestId('push-enable-now'))
    await waitFor(() => expect(h.enable).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByTestId('push-enable-banner')).toBeNull())
    expect(h.toasts.at(-1)).toMatchObject({ type: 'success' })
  })

  it('لا يظهر إن كان الجهاز مشتركًا مسبقًا أو المتصفح لا يدعم Push', async () => {
    h.enabled.mockResolvedValue(true)
    const first = render(<PushEnableBanner />)
    await waitFor(() => expect(h.enabled).toHaveBeenCalled())
    expect(screen.queryByTestId('push-enable-banner')).toBeNull()
    first.unmount()
    h.enabled.mockResolvedValue(false)
    h.support = { supported: false, permission: 'default', isIos: false, standalone: false }
    render(<PushEnableBanner />)
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.queryByTestId('push-enable-banner')).toBeNull()
  })

  // 00407-ب: في وضع التطوير لا يُسجَّل عامل خدمة أصلًا (main.tsx) ⇒ لا زر سيفشل، بل توضيح صريح
  it('بلا عامل خدمة (وضع التطوير): توضيح صريح بلا زر تفعيل', async () => {
    stubWorker(false)
    render(<PushEnableBanner />)
    await screen.findByTestId('push-banner-no-worker', undefined, { timeout: 6000 })
    expect(screen.queryByTestId('push-enable-now')).toBeNull()
    expect(screen.getByTestId('push-banner-no-worker').textContent).toContain('وضع التطوير')
  }, 12000)

  it('الإذن المحظور: رسالة إرشادية بلا زر تفعيل', async () => {
    h.support = { supported: true, permission: 'denied', isIos: false, standalone: false }
    render(<PushEnableBanner />)
    await screen.findByTestId('push-banner-denied')
    expect(screen.queryByTestId('push-enable-now')).toBeNull()
  })

  it('iPhone بلا تثبيت: رسالة إضافة للشاشة الرئيسية لا خطأ تقني', async () => {
    h.support = { supported: true, permission: 'default', isIos: true, standalone: false }
    render(<PushEnableBanner />)
    await userEvent.click(await screen.findByTestId('push-enable-now'))
    await waitFor(() => expect(h.toasts.at(-1)?.message).toContain('الشاشة الرئيسية'))
    expect(h.enable).not.toHaveBeenCalled()
    expect(screen.getByTestId('push-enable-banner')).toBeTruthy()
  })
})
