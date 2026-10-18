/** 00289 · طبقة أذونات الجهاز: تشخيص الموقع/الكاميرا، الخطوات حسب المنصة، الطلب الصريح */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DevicePermissionError, classifyCameraError, classifyGeoError, detectPlatform, permMessage, permissionHelp, queryPermissionState, requestCameraPermission, requestGeolocation } from '@lib/device-permissions'

const secure = (v: boolean) => Object.defineProperty(window, 'isSecureContext', { value: v, configurable: true })
afterEach(() => { secure(true); vi.restoreAllMocks() })

describe('00289 · أذونات الجهاز', () => {
  it('المنصة من user agent', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('ios')
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel) Chrome/120')).toBe('android')
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')).toBe('desktop')
  })
  it('تصنيف أخطاء الموقع: غير آمن / مرفوض / GPS معطّل / مهلة', () => {
    expect(classifyGeoError({ code: 1, message: 'Only secure origins are allowed' })).toBe('INSECURE')
    expect(classifyGeoError({ code: 1, message: 'User denied Geolocation' })).toBe('DENIED')
    expect(classifyGeoError({ code: 2, message: '' })).toBe('UNAVAILABLE')
    expect(classifyGeoError({ code: 3, message: '' })).toBe('TIMEOUT')
    secure(false); expect(classifyGeoError({ code: 1, message: '' })).toBe('INSECURE')
  })
  it('تصنيف أخطاء الكاميرا', () => {
    expect(classifyCameraError('NotAllowedError')).toBe('DENIED'); expect(classifyCameraError('NotFoundError')).toBe('NOT_FOUND'); expect(classifyCameraError('NotReadableError')).toBe('BUSY'); expect(classifyCameraError('X')).toBe('UNKNOWN')
    secure(false); expect(classifyCameraError('NotAllowedError')).toBe('INSECURE')
  })
  it('الرسائل العربية وخطوات التفعيل حسب المنصة', () => {
    expect(permMessage('geolocation', 'INSECURE')).toContain('http')
    expect(permMessage('camera', 'DENIED')).toContain('تحقق مجدداً')
    expect(permissionHelp('geolocation', 'ios')[0]).toContain('Safari')
    expect(permissionHelp('camera', 'android')[1]).toContain('الكاميرا')
    expect(permissionHelp('geolocation', 'desktop')).toHaveLength(3)
  })
  it('requestGeolocation: اتصال غير آمن يُرفض قبل أي طلب؛ الرفض يعطي DENIED؛ النجاح يعيد الإحداثيات', async () => {
    const geo = { getCurrentPosition: vi.fn() } as unknown as Geolocation
    secure(false)
    await expect(requestGeolocation(undefined, geo)).rejects.toMatchObject({ code: 'INSECURE' })
    expect(geo.getCurrentPosition).not.toHaveBeenCalled()
    secure(true)
    const denied = { getCurrentPosition: (_ok: PositionCallback, err: PositionErrorCallback) => err({ code: 1, message: 'denied' } as GeolocationPositionError) } as unknown as Geolocation
    await expect(requestGeolocation(undefined, denied)).rejects.toSatisfy((e: unknown) => e instanceof DevicePermissionError && e.code === 'DENIED' && e.kind === 'geolocation')
    const ok = { getCurrentPosition: (cb: PositionCallback) => cb({ coords: { latitude: 33.3, longitude: 44.4, accuracy: 8 } } as GeolocationPosition) } as unknown as Geolocation
    await expect(requestGeolocation(undefined, ok)).resolves.toEqual({ latitude: 33.3, longitude: 44.4, accuracy: 8 })
    await expect(requestGeolocation(undefined, undefined)).rejects.toMatchObject({ code: 'UNSUPPORTED' })
  })
  it('queryPermissionState: Permissions API / غير آمن / غير مدعوم', async () => {
    const nav = { geolocation: {}, mediaDevices: { getUserMedia: vi.fn() }, permissions: { query: vi.fn().mockResolvedValue({ state: 'prompt' }) } } as unknown as Navigator
    expect(await queryPermissionState('geolocation', nav)).toBe('prompt')
    expect(await queryPermissionState('camera', { geolocation: {}, permissions: nav.permissions } as unknown as Navigator)).toBe('unsupported')
    expect(await queryPermissionState('geolocation', { geolocation: {} } as unknown as Navigator)).toBe('unknown')
    secure(false); expect(await queryPermissionState('geolocation', nav)).toBe('insecure')
  })
  it('requestCameraPermission يطلب getUserMedia ويغلق المسار؛ الرفض ⇒ DENIED', async () => {
    const stop = vi.fn()
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) }, configurable: true })
    await requestCameraPermission('user')
    expect(stop).toHaveBeenCalled()
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' })) }, configurable: true })
    await expect(requestCameraPermission()).rejects.toMatchObject({ code: 'DENIED' })
  })
})
