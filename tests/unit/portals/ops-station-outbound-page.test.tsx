/** اختبارات لوحة متابعة خروج آليات المحطة — غرفة العمليات (00331). */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({ rows: [] as unknown[], args: [] as unknown[], live: [] as unknown[], zones: [] as unknown[], dests: [] as unknown[] }))
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: ({ children }: { children: ReactNode }) => <div data-testid="so-marker">{children}</div>,
  Polygon: ({ children }: { children: ReactNode }) => <div data-testid="so-zone">{children}</div>,
  Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('leaflet', () => ({ default: { divIcon: () => ({}) } }))
vi.mock('@features/station-fleet/hooks', () => ({
  useStationOutbound: (...a: unknown[]) => { h.args = a; return { data: h.rows, isLoading: false } },
  useStationDestinations: () => ({ data: h.dests, isLoading: false }),
}))
vi.mock('@features/gps-lvn/hooks', () => ({
  useGpsLiveMap: () => ({ data: h.live, isLoading: false }),
  useGpsMapGeofences: () => ({ data: h.zones, isLoading: false }),
}))
import OpsStationOutboundPage from '@portals/ops-room/pages/StationFleet/OpsStationOutboundPage'

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date())
const row = (o: Record<string, unknown>) => ({
  id: 'r', source: 'saksat', exit_time: new Date(Date.now() - 20 * 60000).toISOString(), log_date: today, vehicle_id: 'v1', db_number: '101', vehicle_category: 'nasafa', category_label: 'نسافة',
  driver_kind: 'employee', driver_name: 'علي', destination_id: 'd1', destination_name: 'النهروان', tracking: 'gps', arrived_at: null, minutes_to_arrival: null, shift_name: 'صباحي', weight_tons: 10, status: 'en_route', ...o,
})

beforeEach(() => {
  h.rows = [
    row({ id: 'a', status: 'en_route' }),
    row({ id: 'b', status: 'arrived', arrived_at: new Date().toISOString(), minutes_to_arrival: 42, db_number: '102' }),
    row({ id: 'c', status: 'untracked', tracking: 'none', vehicle_id: 'v3', db_number: '202', category_label: 'ناقلة حاويات مكبسية', driver_kind: 'external', driver_name: 'حسن' }),
    row({ id: 'd', status: 'arrived', arrived_at: new Date().toISOString(), minutes_to_arrival: 58, db_number: '103' }),
  ]
  h.live = [{ device_id: 'dv', device_name: 'x', latitude: 33.3, longitude: 44.6, speed: 0, fix_time: new Date().toISOString(), garage_vehicle_id: 'v1', db_number: '101' }]
  h.zones = [{ id: 'z1', name: 'زون النهروان', source: 'platform', color: '#06b6d4', polygon: [{ lat: 33.29, lng: 44.59 }, { lat: 33.31, lng: 44.59 }, { lat: 33.31, lng: 44.61 }] }, { id: 'z9', name: 'أخرى', source: 'platform', color: '#000', polygon: [] }]
  h.dests = [{ id: 'd1', name: 'النهروان', geofence_id: 'z1', geofence_name: 'زون النهروان', has_zone: true, active: true, sort: 1 }]
})
const ui = () => render(<MemoryRouter><OpsStationOutboundPage /></MemoryRouter>)

describe('OpsStationOutboundPage (00331)', () => {
  it('الإحصاءات ومتوسط المدة والوضع المباشر لليوم', () => {
    ui()
    expect(h.args).toEqual([today, today, false, true])
    expect(screen.getByTestId('so-st-enroute')).toHaveTextContent('1')
    expect(screen.getByTestId('so-st-arrived')).toHaveTextContent('2')
    expect(screen.getByTestId('so-st-untracked')).toHaveTextContent('1')
    expect(screen.getByTestId('so-st-avg')).toHaveTextContent('50')
    expect(screen.getByTestId('so-live')).toBeInTheDocument()
    expect(screen.getByTestId('so-dur-a')).toHaveTextContent(/^(19|20|21)…$/)
    expect(screen.getByTestId('so-dur-b')).toHaveTextContent('42')
    expect(screen.getByTestId('so-row-c')).toHaveTextContent('بلا تتبع')
    expect(screen.getByTestId('so-row-c')).toHaveTextContent('متعهد')
  })

  it('الخريطة: زون الوجهة المرتبط فقط + علامة للآلية في الطريق التي لها موقع', () => {
    ui()
    expect(screen.getAllByTestId('so-zone')).toHaveLength(1)
    expect(screen.getAllByTestId('so-marker')).toHaveLength(1)
    expect(screen.queryByTestId('so-map-missing')).toBeNull()
    h.live = []
  })

  it('آلية في الطريق بلا موقع حديث تُعدّ', () => {
    h.live = []
    ui()
    expect(screen.getByTestId('so-map-missing')).toHaveTextContent('1')
  })

  it('فلتر الحالة والبحث؛ مدة سابقة تُلغي الوضع المباشر والخريطة', () => {
    ui()
    fireEvent.change(screen.getByTestId('so-status'), { target: { value: 'arrived' } })
    expect(screen.queryByTestId('so-row-a')).toBeNull()
    expect(screen.getByTestId('so-row-b')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('so-search'), { target: { value: '103' } })
    expect(screen.queryByTestId('so-row-b')).toBeNull()
    expect(screen.getByTestId('so-row-d')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('so-from'), { target: { value: '2026-10-01' } })
    expect(h.args[0]).toBe('2026-10-01')
    expect(h.args[3]).toBe(false)
    expect(screen.queryByTestId('so-live')).toBeNull()
    expect(screen.queryByTestId('so-map')).toBeNull()
  })
})
