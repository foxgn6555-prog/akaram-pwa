import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ flyTo: vi.fn(), fitBounds: vi.fn() }))
vi.mock('leaflet', () => ({
  default: { latLngBounds: vi.fn(() => ({})), divIcon: vi.fn(() => ({})) },
}))
vi.mock('react-leaflet', () => ({
  useMap: () => ({ flyTo: h.flyTo, fitBounds: h.fitBounds }),
  MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Polyline: () => null,
  Polygon: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Marker: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  CircleMarker: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
import GpsRouteMap from '@portals/ops-room/pages/Gps/GpsRouteMap'
const point = (minute: number, speed: number) => ({
  latitude: 33.3 + minute / 10000,
  longitude: 44.3 + minute / 10000,
  speed,
  course: 0,
  address: `نقطة ${minute}`,
  fix_time: new Date(Date.UTC(2026, 8, 10, 6, minute)).toISOString(),
  engine_status: 'on' as const,
  operational_status: speed > 1 ? ('moving' as const) : ('idle' as const),
  total_count: 5,
})
describe('خريطة محطات مسار GPS', () => {
  it('تعرض التوقف والانقطاع وتنقل الخريطة عند اختيار المحطة', () => {
    render(
      <GpsRouteMap
        points={[point(0, 0), point(1, 0), point(3, 20), point(20, 20), point(21, 20)]}
      />,
    )
    expect(screen.getByText('1 توقف')).toBeInTheDocument()
    expect(screen.getByText('1 انقطاع')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /توقف تشغيلي/ }))
    expect(h.flyTo).toHaveBeenCalledWith([33.3, 44.3], 17, { duration: 0.7 })
  })
  it('ينتقل إلى أقرب نقطة عند اختيار محطة خادمية', () => {
    render(<GpsRouteMap points={[point(0, 20), point(20, 20)]} focusAt={point(19, 0).fix_time} />)
    expect(h.flyTo).toHaveBeenCalledWith([33.302, 44.302], 17, { duration: 0.7 })
  })
  it('يربط الشريط الزمني بالسائق والشفت ويعرض الزونات', () => {
    render(
      <GpsRouteMap
        points={[point(0, 20), point(1, 20)]}
        zones={[
          {
            id: 'z1',
            name: 'زون الاختبار',
            source: 'platform',
            color: '#06b6d4',
            polygon: [
              { lat: 33.3, lng: 44.3 },
              { lat: 33.4, lng: 44.3 },
              { lat: 33.4, lng: 44.4 },
            ],
          },
        ]}
        zoneEvents={[
          {
            id: 1,
            event_type: 'enter',
            geofence_id: 'z1',
            geofence_name: 'زون الاختبار',
            occurred_at: point(1, 20).fix_time,
            latitude: 33.3001,
            longitude: 44.3001,
          },
        ]}
        shifts={[
          {
            assignment_id: 'a1',
            shift: 'morning',
            driver_name: 'سائق الشريط',
            sector_id: 1,
            area_name: 'الرياض',
            starts_at: point(0, 20).fix_time,
            ends_at: null,
            overlap_from: point(0, 20).fix_time,
            overlap_to: point(1, 20).fix_time,
            overlap_seconds: 60,
            is_departure_driver: true,
          },
        ]}
      />,
    )
    expect(screen.getAllByText('زون الاختبار').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /دخول.*زون الاختبار/ })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('الشريط الزمني لمسار GPS'), { target: { value: '1' } })
    expect(screen.getAllByText(/سائق الشريط · صباحي · الرياض/).length).toBeGreaterThan(0)
    expect(h.flyTo).toHaveBeenLastCalledWith([33.3001, 44.3001], 17, { duration: 0.7 })
  })
})
