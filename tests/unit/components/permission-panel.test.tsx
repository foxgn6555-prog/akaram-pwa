/** 00289 · لوحة الأذونات: طلب صريح، رفض ⇒ خطوات + تحقق مجدداً، اتصال غير آمن */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PermissionPanel } from '@components/ui/PermissionPanel/PermissionPanel'
import { DevicePermissionError } from '@lib/device-permissions'

const setPerm = (state: string) => Object.defineProperty(navigator, 'permissions', { value: { query: vi.fn().mockResolvedValue({ state, addEventListener: vi.fn(), removeEventListener: vi.fn() }) }, configurable: true })
const setGeo = (impl: (ok: PositionCallback, err: PositionErrorCallback) => void) => Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: impl }, configurable: true })
afterEach(() => { Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true }) })

describe('00289 · PermissionPanel', () => {
  it('ممنوح ⇒ لا تظهر', async () => {
    setPerm('granted'); setGeo(() => undefined)
    const { container } = render(<PermissionPanel kind="geolocation" />)
    await waitFor(() => expect(container.querySelector('[data-testid="perm-panel-geolocation"]')).toBeNull())
  })
  it('بانتظار الإذن ⇒ زر «السماح» يطلب الموقع فعلاً ويستدعي onGranted', async () => {
    setPerm('prompt'); const onGranted = vi.fn()
    setGeo((ok) => ok({ coords: { latitude: 1, longitude: 2, accuracy: 5 } } as GeolocationPosition))
    render(<PermissionPanel kind="geolocation" onGranted={onGranted} />)
    await waitFor(() => expect(screen.getByTestId('perm-state-geolocation')).toHaveTextContent('بانتظار إذنك'))
    fireEvent.click(screen.getByTestId('perm-request-geolocation'))
    await waitFor(() => expect(onGranted).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByTestId('perm-panel-geolocation')).toBeNull())   // تختفي بعد المنح
  })
  it('مرفوض ⇒ خطوات التفعيل + «تحقق مجدداً» يلتقط التفعيل', async () => {
    setPerm('denied'); const onGranted = vi.fn()
    render(<PermissionPanel kind="geolocation" lastError={new DevicePermissionError('geolocation', 'DENIED', 'x')} onGranted={onGranted} />)
    await waitFor(() => expect(screen.getByTestId('perm-state-geolocation')).toHaveTextContent('مرفوض'))
    expect(screen.getByTestId('perm-help-geolocation').querySelectorAll('li').length).toBeGreaterThanOrEqual(3)
    expect(screen.queryByTestId('perm-request-geolocation')).toBeNull()
    setPerm('granted')
    fireEvent.click(screen.getByTestId('perm-recheck-geolocation'))
    await waitFor(() => expect(onGranted).toHaveBeenCalled())
  })
  it('اتصال http غير آمن ⇒ شرح واضح بلا زر طلب', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true }); setPerm('prompt')
    render(<PermissionPanel kind="camera" />)
    await waitFor(() => expect(screen.getByTestId('perm-panel-camera')).toHaveAttribute('data-state', 'insecure'))
    expect(screen.getByTestId('perm-insecure')).toHaveTextContent('https')
    expect(screen.queryByTestId('perm-request-camera')).toBeNull()
  })
})
