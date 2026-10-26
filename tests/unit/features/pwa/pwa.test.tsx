/** 00349 B — اختبارات التثبيت/التحديث: المخزن، الزر، الدليل، الشريطان */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstallAppButton } from '@features/pwa/InstallAppButton'
import { InstallBanner, UpdateBanner } from '@features/pwa/PwaBanners'
import {
  PWA_INSTALL_DISMISS_KEY, detectPlatform, dismissInstallBanner, installBannerDismissed, installPwaListeners,
  promptInstall, pwaStore, type BeforeInstallPromptEvent,
} from '@features/pwa/pwa.store'

function fakePromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted'): BeforeInstallPromptEvent {
  const e = new Event('beforeinstallprompt', { cancelable: true }) as BeforeInstallPromptEvent
  Object.assign(e, { prompt: vi.fn(async () => undefined), userChoice: Promise.resolve({ outcome, platform: 'web' }) })
  return e
}

beforeEach(() => { localStorage.clear(); pwaStore.reset() })
afterEach(() => { vi.restoreAllMocks() })

describe('pwa.store', () => {
  it('يلتقط beforeinstallprompt ويمنع شريط المتصفح التلقائي', () => {
    const off = installPwaListeners()
    const e = fakePromptEvent()
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
    expect(pwaStore.getState().deferredPrompt).toBe(e)
    off()
  })
  it('appinstalled ⇒ installed ويُلغى الحدث المحفوظ', () => {
    const off = installPwaListeners()
    window.dispatchEvent(fakePromptEvent())
    window.dispatchEvent(new Event('appinstalled'))
    expect(pwaStore.getState()).toMatchObject({ installed: true, deferredPrompt: null })
    off()
  })
  it('promptInstall: بلا حدث ⇒ unavailable؛ بقبول ⇒ accepted ويُستهلك الحدث', async () => {
    expect(await promptInstall()).toBe('unavailable')
    const e = fakePromptEvent('accepted')
    pwaStore.setDeferredPrompt(e)
    expect(await promptInstall()).toBe('accepted')
    expect(e.prompt).toHaveBeenCalledOnce()
    expect(pwaStore.getState()).toMatchObject({ installed: true, deferredPrompt: null })
  })
  it('كشف المنصة من وكيل المستخدم', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari')).toBe('ios')
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/120 Mobile')).toBe('android')
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0) Chrome/120')).toBe('other')
  })
  it('إغلاق شريط التثبيت يُخفيه 7 أيام فقط', () => {
    const t0 = 1_700_000_000_000
    expect(installBannerDismissed(t0)).toBe(false)
    dismissInstallBanner(t0)
    expect(localStorage.getItem(PWA_INSTALL_DISMISS_KEY)).toBe(String(t0))
    expect(installBannerDismissed(t0 + 6 * 86_400_000)).toBe(true)
    expect(installBannerDismissed(t0 + 8 * 86_400_000)).toBe(false)
  })
})

describe('InstallAppButton', () => {
  it('مع حدث محفوظ: النقر يعرض نافذة التثبيت الأصلية (وضع native)', async () => {
    const e = fakePromptEvent('accepted')
    pwaStore.setDeferredPrompt(e)
    const onInstalled = vi.fn()
    render(<InstallAppButton onInstalled={onInstalled} />)
    const btn = screen.getByTestId('pwa-install-button')
    expect(btn.dataset.mode).toBe('native')
    await act(async () => { fireEvent.click(btn) })
    expect(e.prompt).toHaveBeenCalledOnce()
    expect(onInstalled).toHaveBeenCalledOnce()
    expect(screen.queryByTestId('pwa-install-button')).toBeNull() // اختفى بعد التثبيت
  })
  it('iPhone بلا حدث: النقر يفتح دليل «مشاركة ← إضافة إلى الشاشة الرئيسية»', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari')
    render(<InstallAppButton />)
    const btn = screen.getByTestId('pwa-install-button')
    expect(btn.dataset.mode).toBe('ios')
    fireEvent.click(btn)
    const guide = screen.getByTestId('pwa-install-guide')
    expect(guide.dataset.platform).toBe('ios')
    expect(guide.textContent).toContain('إضافة إلى الشاشة الرئيسية')
    expect(guide.textContent).toContain('Safari')
    fireEvent.click(screen.getByText('فهمت'))
    expect(screen.queryByTestId('pwa-install-guide')).toBeNull()
  })
  it('متصفح آخر بلا حدث: دليل عام', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Windows NT 10.0) Firefox/120')
    render(<InstallAppButton />)
    fireEvent.click(screen.getByTestId('pwa-install-button'))
    expect(screen.getByTestId('pwa-install-guide').dataset.platform).toBe('other')
  })
  it('التطبيق مثبّت ⇒ لا زر', () => {
    pwaStore.markInstalled()
    render(<InstallAppButton />)
    expect(screen.queryByTestId('pwa-install-button')).toBeNull()
  })
})

describe('InstallBanner / UpdateBanner', () => {
  it('شريط التثبيت يظهر ثم يُخفى عند الإغلاق ويُحفظ الإغلاق', () => {
    render(<InstallBanner />)
    expect(screen.getByTestId('pwa-install-banner')).toBeTruthy()
    fireEvent.click(screen.getByTestId('pwa-install-dismiss'))
    expect(screen.queryByTestId('pwa-install-banner')).toBeNull()
    expect(installBannerDismissed()).toBe(true)
  })
  it('شريط التثبيت لا يظهر إن أُغلق سابقاً أو التطبيق مثبّت', () => {
    dismissInstallBanner()
    const { unmount } = render(<InstallBanner />)
    expect(screen.queryByTestId('pwa-install-banner')).toBeNull()
    unmount()
    localStorage.clear(); pwaStore.markInstalled()
    render(<InstallBanner />)
    expect(screen.queryByTestId('pwa-install-banner')).toBeNull()
  })
  it('شريط التحديث: لا يظهر افتراضياً؛ «حدّث الآن» يستدعي updateSW(true)؛ «لاحقاً» يخفيه', async () => {
    const { rerender } = render(<UpdateBanner />)
    expect(screen.queryByTestId('pwa-update-banner')).toBeNull()
    const updateSW = vi.fn(async () => undefined)
    act(() => pwaStore.setNeedRefresh(updateSW))
    rerender(<UpdateBanner />)
    expect(screen.getByTestId('pwa-update-banner')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByTestId('pwa-update-now')) })
    expect(updateSW).toHaveBeenCalledWith(true)
    act(() => { fireEvent.click(screen.getByTestId('pwa-update-later')) })
    expect(screen.queryByTestId('pwa-update-banner')).toBeNull()
  })
})
