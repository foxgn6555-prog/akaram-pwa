/** 00286 — منطق مشاركة الموقع المباشر (نقي) */
import { describe, expect, it, vi } from 'vitest'
import { agoText, denyReasonOf, getFix, minutesLeft, nextPingDelayMs, readFlag, shouldPingNow, withinShift, writeFlag } from '@features/live-tracking/live-share.logic'

const T0 = Date.parse('2026-10-18T08:00:00Z')
describe('live-share.logic', () => {
  it('shouldPingNow: بلا نبضة سابقة ⇒ نعم؛ قبل الفاصل ⇒ لا؛ بعده ⇒ نعم', () => {
    expect(shouldPingNow(null, 15, T0)).toBe(true)
    expect(shouldPingNow(T0 - 14 * 60_000, 15, T0)).toBe(false)
    expect(shouldPingNow(T0 - 15 * 60_000, 15, T0)).toBe(true)
    expect(shouldPingNow(T0 - 61_000, 0, T0)).toBe(true) // فاصل 0 يُعامل كدقيقة
  })
  it('nextPingDelayMs: يحترم الفاصل ولا يتجاوز نهاية الشفت', () => {
    expect(nextPingDelayMs(null, 15, null, T0)).toBe(0)
    expect(nextPingDelayMs(T0 - 5 * 60_000, 15, null, T0)).toBe(10 * 60_000)
    expect(nextPingDelayMs(T0 - 5 * 60_000, 15, new Date(T0 + 3 * 60_000).toISOString(), T0)).toBe(3 * 60_000)
    expect(nextPingDelayMs(T0, 15, new Date(T0 - 1000).toISOString(), T0)).toBe(0)
  })
  it('withinShift / minutesLeft', () => {
    const st = { shift_start: new Date(T0 - 60_000).toISOString(), shift_end: new Date(T0 + 90_000).toISOString() }
    expect(withinShift(st, T0)).toBe(true)
    expect(withinShift(st, T0 + 90_000)).toBe(false)
    expect(withinShift(null, T0)).toBe(false)
    expect(minutesLeft(st.shift_end, T0)).toBe(2)
    expect(minutesLeft(st.shift_end, T0 + 10 * 60_000)).toBe(0)
  })
  it('denyReasonOf: يكتشف أكواد الرفض فقط', () => {
    expect(denyReasonOf(new Error('P0001: LIVE_OUTSIDE_SHIFT'))).toBe('LIVE_OUTSIDE_SHIFT')
    expect(denyReasonOf('LIVE_NO_SHIFT')).toBe('LIVE_NO_SHIFT')
    expect(denyReasonOf(new Error('LIVE_LOCATION_INVALID'))).toBeNull()
    expect(denyReasonOf(new TypeError('Failed to fetch'))).toBeNull()
  })
  it('agoText بأرقام إنكليزية', () => {
    expect(agoText(new Date(T0 - 20_000).toISOString(), T0)).toBe('الآن')
    expect(agoText(new Date(T0 - 7 * 60_000).toISOString(), T0)).toBe('منذ 7 د')
    expect(agoText(new Date(T0 - 125 * 60_000).toISOString(), T0)).toBe('منذ 2 س 5 د')
    expect(agoText(null, T0)).toBe('—')
  })
  it('العلم المحلي: كتابة/قراءة/إزالة وتحمّل تخزين معطّل', () => {
    const mem = new Map<string, string>()
    const st = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) }
    writeFlag(st, true); expect(readFlag(st)).toBe(true)
    writeFlag(st, false); expect(readFlag(st)).toBe(false)
    expect(readFlag(null)).toBe(false)
    const broken = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') }, removeItem: () => { throw new Error('x') } }
    expect(() => writeFlag(broken, true)).not.toThrow(); expect(readFlag(broken)).toBe(false)
  })
  it('getFix: نجاح، رفض الإذن، وعدم الدعم', async () => {
    const ok = { getCurrentPosition: vi.fn((s: PositionCallback) => s({ coords: { latitude: 33.3, longitude: 44.4, accuracy: 8 } } as GeolocationPosition)) } as unknown as Geolocation
    await expect(getFix(ok)).resolves.toEqual({ latitude: 33.3, longitude: 44.4, accuracy: 8 })
    const denied = { getCurrentPosition: vi.fn((_s: PositionCallback, e: PositionErrorCallback) => e({ code: 1 } as GeolocationPositionError)) } as unknown as Geolocation
    await expect(getFix(denied)).rejects.toThrow('رفضت إذن الموقع')
    await expect(getFix(undefined)).rejects.toThrow('لا يدعم')
  })
})
