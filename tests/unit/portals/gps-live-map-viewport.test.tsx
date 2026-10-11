/** 00212 — إطار الخريطة التشغيلية: الزونات أولاً، استبعاد الإحداثيات الشاذة، واستعادة الإطار بعد التحديث */
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ fitBounds: vi.fn(), on: vi.fn(), off: vi.fn(), invalidateSize: vi.fn(), getCenter: () => ({ lat: 33.3, lng: 44.4 }), getZoom: () => 13, container: { center: null as unknown, zoom: null as unknown } }))
vi.mock('leaflet', () => ({ default: { latLngBounds: vi.fn((pts: unknown) => pts), divIcon: vi.fn(() => ({})) } }))
vi.mock('react-leaflet', () => ({
  useMap: () => h,
  MapContainer: ({ children, center, zoom }: { children: ReactNode; center: unknown; zoom: unknown }) => { h.container = { center, zoom }; return <div>{children}</div> },
  TileLayer: () => null, Polygon: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Marker: ({ children }: { children?: ReactNode }) => <div>{children}</div>, Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@portals/ops-room/pages/Gps/LandmarkIcon', () => ({ landmarkDivIcon: () => ({}) }))
import GpsLiveMap, { collectPoints, isPlausiblePoint, readSavedView } from '@portals/ops-room/pages/Gps/GpsLiveMap'
import type { GpsLiveDevice, GpsMapGeofence } from '@sdk/gps-lvn.sdk'

const dev = (id: string, latitude: number, longitude: number) => ({ device_id: id, device_name: id, latitude, longitude, course: 0, speed_kph: 0, operational_status: 'moving', inside_zone: true, zone_name: null, vehicle_plate: null, driver_name: null, fix_time: null }) as unknown as GpsLiveDevice
const zone = (id: string, pts: Array<[number, number]>) => ({ id, name: id, source: 'platform', color: '#000', polygon: pts }) as unknown as GpsMapGeofence

describe('إطار الخريطة التشغيلية', () => {
  beforeEach(() => { sessionStorage.clear(); h.fitBounds.mockClear() })
  it('يستبعد (0,0) وما خارج العراق ويفضّل الزونات على الآليات', () => {
    expect(isPlausiblePoint(0, 0)).toBe(false); expect(isPlausiblePoint(1.2, 3.4)).toBe(false); expect(isPlausiblePoint(36.8, 10.1)).toBe(false); expect(isPlausiblePoint(33.3, 44.4)).toBe(true)
    const rows = [dev('a', 33.31, 44.36), dev('null-island', 0, 0), dev('tunis', 36.8, 10.1)]
    expect(collectPoints(rows, [])).toEqual([[33.31, 44.36]])
    expect(collectPoints(rows, [], [zone('z', [[33.2, 44.3], [33.25, 44.35]])])).toEqual([[33.2, 44.3], [33.25, 44.35]])
  })
  it('أول ملاءمة تستخدم الزونات فقط رغم وجود آليات شاذة، ولا تتكرر مع تحديثات المزامنة', () => {
    const zones = [zone('z', [[33.2, 44.3], [33.25, 44.35]])]
    const { rerender } = render(<GpsLiveMap rows={[dev('a', 33.31, 44.36), dev('x', 0, 0)]} zones={zones} landmarks={[]} />)
    expect(h.fitBounds).toHaveBeenCalledTimes(1)
    expect(h.fitBounds.mock.calls[0]![0]).toEqual([[33.2, 44.3], [33.25, 44.35]])
    rerender(<GpsLiveMap rows={[dev('a', 33.32, 44.37), dev('x', 0, 0), dev('y', 1, 1)]} zones={zones} landmarks={[]} />)
    rerender(<GpsLiveMap rows={[dev('a', 33.33, 44.38)]} zones={zones} landmarks={[]} />)
    expect(h.fitBounds).toHaveBeenCalledTimes(1)
  })
  it('وصول الزونات بعد الآليات يعيد الملاءمة مرة واحدة فقط إلى الزونات', () => {
    const { rerender } = render(<GpsLiveMap rows={[dev('a', 33.31, 44.36)]} zones={[]} landmarks={[]} />)
    expect(h.fitBounds).toHaveBeenCalledTimes(1)
    const zones = [zone('z', [[33.2, 44.3], [33.25, 44.35]])]
    rerender(<GpsLiveMap rows={[dev('a', 33.31, 44.36)]} zones={zones} landmarks={[]} />)
    expect(h.fitBounds).toHaveBeenCalledTimes(2)
    expect(h.fitBounds.mock.calls[1]![0]).toEqual([[33.2, 44.3], [33.25, 44.35]])
    rerender(<GpsLiveMap rows={[dev('a', 33.32, 44.36)]} zones={zones} landmarks={[]} />)
    expect(h.fitBounds).toHaveBeenCalledTimes(2)
  })
  it('بعد تحديث الصفحة يُستعاد آخر إطار محفوظ بدل الملاءمة التلقائية', () => {
    sessionStorage.setItem('gps-live-map:view', JSON.stringify({ lat: 33.4, lng: 44.5, zoom: 14 }))
    expect(readSavedView()).toEqual({ lat: 33.4, lng: 44.5, zoom: 14 })
    render(<GpsLiveMap rows={[dev('a', 33.31, 44.36)]} zones={[]} landmarks={[]} />)
    expect(h.container).toEqual({ center: [33.4, 44.5], zoom: 14 })
    expect(h.fitBounds).not.toHaveBeenCalled()
    expect(h.on).toHaveBeenCalledWith('moveend', expect.any(Function))
    sessionStorage.setItem('gps-live-map:view', JSON.stringify({ lat: 0, lng: 0, zoom: 2 }))
    expect(readSavedView()).toBeNull()
  })
})
