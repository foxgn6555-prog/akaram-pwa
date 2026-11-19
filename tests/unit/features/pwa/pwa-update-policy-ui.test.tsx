/** 00349 ج — الشريطان: «تحديث مطلوب» (بلا إغلاق) و«جاهز للعمل دون اتصال» */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OfflineReadyBanner, UpdateBanner } from '@features/pwa/PwaBanners'
import { pwaStore } from '@features/pwa/pwa.store'
import { PWA_PENDING_KEY, UPDATE_MAX_DISMISSALS } from '@features/pwa/update-policy'

beforeEach(() => { localStorage.clear(); pwaStore.reset() })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

const noopUpdate = vi.fn(async () => undefined)

describe('UpdateBanner — سياسة التأجيل', () => {
  it('الوضع العادي: زر إغلاق موجود', () => {
    act(() => pwaStore.setNeedRefresh(noopUpdate))
    render(<UpdateBanner />)
    expect(screen.getByTestId('pwa-update-banner').getAttribute('data-forced')).toBeNull()
    expect(screen.getByTestId('pwa-update-later')).toBeTruthy()
  })

  it('تحديث معلّق تجاوز حد التأجيل ⇒ مطلوب وبلا زر إغلاق', () => {
    localStorage.setItem(PWA_PENDING_KEY, JSON.stringify({ firstSeenAt: Date.now() - 1000, dismissals: UPDATE_MAX_DISMISSALS }))
    act(() => pwaStore.setNeedRefresh(noopUpdate))
    render(<UpdateBanner />)
    const banner = screen.getByTestId('pwa-update-banner')
    expect(banner.getAttribute('data-forced')).toBe('true')
    expect(screen.queryByTestId('pwa-update-later')).toBeNull()
    expect(banner.textContent).toContain('تحديث مطلوب')
  })

  it('تجاوز 24 ساعة منذ الظهور ⇒ مطلوب', () => {
    localStorage.setItem(PWA_PENDING_KEY, JSON.stringify({ firstSeenAt: Date.now() - 25 * 60 * 60 * 1000, dismissals: 0 }))
    act(() => pwaStore.setNeedRefresh(noopUpdate))
    render(<UpdateBanner />)
    expect(screen.getByTestId('pwa-update-banner').getAttribute('data-forced')).toBe('true')
  })

  it('«لاحقاً» يزيد العدّاد، وبعد الحد الثالث يبقى الشريط مطلوباً', () => {
    act(() => pwaStore.setNeedRefresh(noopUpdate))
    for (let i = 0; i < UPDATE_MAX_DISMISSALS; i++) act(() => pwaStore.dismissUpdate())
    const state = pwaStore.getState()
    expect(state.needRefresh).toBe(true)
    expect(state.updateForced).toBe(true)
  })

  it('«حدّث الآن» يطبّق التحديث ويصفّر سياسة التأجيل (الشريط يزول بإعادة التحميل)', async () => {
    act(() => pwaStore.setNeedRefresh(noopUpdate))
    render(<UpdateBanner />)
    await act(async () => { fireEvent.click(screen.getByTestId('pwa-update-now')) })
    expect(noopUpdate).toHaveBeenCalledWith(true)
    expect(localStorage.getItem(PWA_PENDING_KEY)).toBeNull()
  })

  it('setUpdatesApplied (التطبيق التلقائي) يطوي الشريط ويصفّر السجل', () => {
    act(() => pwaStore.setNeedRefresh(noopUpdate))
    act(() => pwaStore.setUpdatesApplied())
    expect(pwaStore.getState().needRefresh).toBe(false)
    expect(pwaStore.getState().updateForced).toBe(false)
    expect(localStorage.getItem(PWA_PENDING_KEY)).toBeNull()
  })
})

describe('OfflineReadyBanner', () => {
  it('لا يظهر افتراضياً', () => {
    render(<OfflineReadyBanner />)
    expect(screen.queryByTestId('pwa-offline-ready')).toBeNull()
  })

  it('يظهر عند جهوزية العمل دون اتصال ويُخفى بزر الإغلاق', () => {
    act(() => pwaStore.setOfflineReady())
    render(<OfflineReadyBanner />)
    expect(screen.getByTestId('pwa-offline-ready').textContent).toContain('جاهز للعمل دون اتصال')
    act(() => { fireEvent.click(screen.getByTestId('pwa-offline-ready-dismiss')) })
    expect(screen.queryByTestId('pwa-offline-ready')).toBeNull()
  })

  it('يُخفى تلقائياً بعد ست ثوانٍ', () => {
    vi.useFakeTimers()
    act(() => pwaStore.setOfflineReady())
    render(<OfflineReadyBanner />)
    expect(screen.getByTestId('pwa-offline-ready')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(6000) })
    expect(screen.queryByTestId('pwa-offline-ready')).toBeNull()
  })
})
