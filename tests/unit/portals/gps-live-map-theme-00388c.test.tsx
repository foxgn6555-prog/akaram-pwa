/** 00388-ج — خريطة المركبات الحية: مركبات متوهّجة بسهم اتجاه + وضع نهاري/ليلي موحّد */
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ icons: [] as Array<{ html: string }> }))
vi.mock('leaflet', () => ({ default: { latLngBounds: vi.fn((pts: unknown) => pts), divIcon: vi.fn((o: { html: string }) => { h.icons.push(o); return o }) } }))
vi.mock('react-leaflet', () => ({
  useMap: () => ({ fitBounds: vi.fn(), on: vi.fn(), off: vi.fn(), invalidateSize: vi.fn(), getCenter: () => ({ lat: 33.3, lng: 44.4 }), getZoom: () => 13 }),
  MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TileLayer: ({ url }: { url: string }) => <i data-testid="tile" data-url={url} />, Polygon: () => null,
  Marker: ({ children }: { children?: ReactNode }) => <div data-testid="marker">{children}</div>, Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@portals/ops-room/pages/Gps/LandmarkIcon', () => ({ landmarkDivIcon: () => ({}) }))
import GpsLiveMap, { arrowIcon } from '@portals/ops-room/pages/Gps/GpsLiveMap'
import type { GpsLiveDevice } from '@sdk/gps-lvn.sdk'

const dev = (id: string, status: string, course: number) => ({ device_id: id, device_name: id, latitude: 33.3, longitude: 44.4, course, speed: 20, operational_status: status, departure_id: null, assigned_zone_count: 0 }) as unknown as GpsLiveDevice

describe('00388-ج · مركبات متوهّجة ووضع ليلي', () => {
  afterEach(() => { window.localStorage.removeItem('akaram.map-theme') })
  it('أيقونة السهم تدور بالاتجاه، وتحمل هالة نابضة للمتحركة فقط، بلون الحالة', () => {
    const moving = arrowIcon('#16a34a', 94, false, true) as unknown as { html: string }
    expect(moving.html).toContain('rotate(90deg)')
    expect(moving.html).toContain('gps-arrow--moving')
    expect(moving.html).toContain('--c:#16a34a')
    const parked = arrowIcon('#eab308', 0, true, false) as unknown as { html: string }
    expect(parked.html).not.toContain('gps-arrow--moving')
    expect(parked.html).toContain('width="30"')   // ضمن انطلاقة ⇒ أكبر
    expect(arrowIcon('#16a34a', 94, false, true)).toBe(moving)   // مخبّأة
  })
  it('الافتراضي نهاري؛ الزر يبدّل إلى ليلي ويغيّر بلاطات الخلفية ويحفظ الاختيار', () => {
    render(<GpsLiveMap rows={[dev('a', 'moving', 10), dev('b', 'parked', 0)]} zones={[]} landmarks={[]} />)
    const root = screen.getByTestId('gps-live-map')
    expect(root.getAttribute('data-map-theme')).toBe('light')
    expect(screen.getByTestId('tile').getAttribute('data-url')).toContain('openstreetmap')
    fireEvent.click(screen.getByTestId('gps-live-map-theme'))
    expect(root.getAttribute('data-map-theme')).toBe('dark')
    expect(screen.getByTestId('tile').getAttribute('data-url')).toContain('dark')
    expect(window.localStorage.getItem('akaram.map-theme')).toBe('dark')
    expect(screen.getAllByTestId('marker')).toHaveLength(2)
  })
})
