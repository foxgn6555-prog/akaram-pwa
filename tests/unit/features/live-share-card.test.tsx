/** 00286 — بطاقة مشاركة الموقع + الهوك: الحالات (ممنوع/جاهز/نشط)، البدء يرسل نبضة، الرفض من الخادم يوقف، الاستئناف من العلم المحلي، النبضة الدورية */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const h = vi.hoisted(() => ({ status: vi.fn(), ping: vi.fn(), stop: vi.fn(), toast: vi.fn() }))
vi.mock('@sdk/live-tracking.sdk', () => ({ liveTracking: { status: h.status, ping: h.ping, stop: h.stop } }))
vi.mock('@stores/ui.store', () => ({ useUiStore: (sel: (s: { addToast: typeof h.toast }) => unknown) => sel({ addToast: h.toast }) }))
import { LiveShareCard } from '@features/live-tracking/LiveShareCard'
import { LIVE_SHARE_FLAG } from '@features/live-tracking/live-share.logic'

const later = (min: number) => new Date(Date.now() + min * 60_000).toISOString()
const base = { kind: 'manager', allowed: true, reason: null, shift_name: 'صباحي', shift_start: later(-60), shift_end: later(120), interval_minutes: 15, sectors: [1], area_names: 'الكرادة', zone_defined: true, active_session_id: null, session_started_at: null, last_seen_at: null, point_count: 0, last_in_zone: null }
const geo = { getCurrentPosition: vi.fn((s: PositionCallback) => s({ coords: { latitude: 33.3, longitude: 44.4, accuracy: 5 } } as GeolocationPosition)) }
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><LiveShareCard /></QueryClientProvider>)

beforeEach(() => {
  h.status.mockReset(); h.ping.mockReset(); h.stop.mockReset(); h.toast.mockReset(); geo.getCurrentPosition.mockClear()
  localStorage.removeItem(LIVE_SHARE_FLAG)
  Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true })
  h.ping.mockResolvedValue({ session_id: 's1', in_zone: true, zone_sector_id: 1, shift_end: base.shift_end, interval_minutes: 15, point_count: 1, recorded_at: new Date().toISOString() })
  h.stop.mockResolvedValue(true)
})
afterEach(() => vi.useRealTimers())

describe('LiveShareCard', () => {
  it('ممنوع (بلا شفت): نص السبب وزر البدء معطّل', async () => {
    h.status.mockResolvedValue({ ...base, allowed: false, reason: 'LIVE_NO_SHIFT' })
    mount()
    await screen.findByTestId('live-share-deny')
    expect(screen.getByTestId('live-share-deny')).toHaveTextContent('لا يوجد شفت مرتبط بحسابك')
    expect(screen.getByTestId('live-share-start')).toBeDisabled()
    expect(screen.getByTestId('live-share-card')).toHaveAttribute('data-state', 'denied')
  })
  it('خارج الشفت: يعرض أوقات الشفت ولا يسمح بالبدء', async () => {
    h.status.mockResolvedValue({ ...base, allowed: false, reason: 'LIVE_OUTSIDE_SHIFT' })
    mount()
    await screen.findByTestId('live-share-deny')
    expect(screen.getByTestId('live-share-deny')).toHaveTextContent('خارج وقت الشفت')
    expect(screen.getByTestId('live-share-start')).toBeDisabled()
  })
  it('جاهز ⇒ البدء يقرأ الموقع ويرسل نبضة ويحفظ العلم ويعرض «البث نشط»؛ الإيقاف يستدعي stop ويمسح العلم', async () => {
    h.status.mockResolvedValue(base)
    mount()
    const start = await screen.findByTestId('live-share-start')
    expect(screen.getByTestId('live-share-card')).toHaveAttribute('data-state', 'ready')
    expect(screen.getByTestId('live-share-card')).toHaveTextContent('كل 15 دقيقة')
    fireEvent.click(start)
    await waitFor(() => expect(h.ping).toHaveBeenCalledWith({ latitude: 33.3, longitude: 44.4, accuracy: 5 }))
    await screen.findByTestId('live-share-on-text')
    expect(screen.getByTestId('live-share-on-text')).toHaveTextContent('داخل زون عملك')
    expect(localStorage.getItem(LIVE_SHARE_FLAG)).toBe('1')
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }))
    fireEvent.click(screen.getByTestId('live-share-stop'))
    await waitFor(() => expect(h.stop).toHaveBeenCalled())
    expect(localStorage.getItem(LIVE_SHARE_FLAG)).toBeNull()
    await screen.findByTestId('live-share-start')
  })
  it('رفض الخادم (انتهى الشفت) أثناء النبضة يوقف المشاركة ويعرض الرسالة العربية', async () => {
    h.status.mockResolvedValue(base)
    h.ping.mockRejectedValueOnce(new Error('P0001: LIVE_OUTSIDE_SHIFT'))
    mount()
    fireEvent.click(await screen.findByTestId('live-share-start'))
    await screen.findByTestId('live-share-error')
    expect(screen.getByTestId('live-share-error')).toHaveTextContent('أثناء شفتك فقط')
    expect(localStorage.getItem(LIVE_SHARE_FLAG)).toBeNull()
    expect(screen.getByTestId('live-share-card')).toHaveAttribute('data-state', 'ready')
  })
  it('رفض إذن الموقع لا يفعّل المشاركة ويعرض الخطأ', async () => {
    h.status.mockResolvedValue(base)
    geo.getCurrentPosition.mockImplementationOnce((_s: PositionCallback, e?: PositionErrorCallback | null) => e?.({ code: 1 } as GeolocationPositionError))
    mount()
    fireEvent.click(await screen.findByTestId('live-share-start'))
    await screen.findByTestId('live-share-error')
    expect(h.ping).not.toHaveBeenCalled()
    expect(localStorage.getItem(LIVE_SHARE_FLAG)).toBeNull()
  })
  it('الاستئناف: العلم محفوظ وداخل الشفت ⇒ نبضة فورية عند الفتح ثم نبضة بعد الفاصل', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    localStorage.setItem(LIVE_SHARE_FLAG, '1')
    h.status.mockResolvedValue({ ...base, active_session_id: 's1', point_count: 3, last_seen_at: new Date().toISOString() })
    mount()
    await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
    await waitFor(() => expect(h.ping).toHaveBeenCalledTimes(1))
    await act(async () => { await vi.advanceTimersByTimeAsync(15 * 60_000 + 2500) })
    await waitFor(() => expect(h.ping).toHaveBeenCalledTimes(2))
  })
  it('الاستئناف خارج الشفت: العلم يُمسح ولا تُرسل نبضات', async () => {
    localStorage.setItem(LIVE_SHARE_FLAG, '1')
    h.status.mockResolvedValue({ ...base, allowed: false, reason: 'LIVE_OUTSIDE_SHIFT' })
    mount()
    await screen.findByTestId('live-share-deny')
    await waitFor(() => expect(localStorage.getItem(LIVE_SHARE_FLAG)).toBeNull())
    expect(h.ping).not.toHaveBeenCalled()
  })
})
