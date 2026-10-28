/** 00362 — بقع التوقف: الدوال المساعدة، لوحة الترتيب والنافذة، الطبقة، وزر التفعيل في الخريطة الحية */
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { GpsStopHotspot, GpsStopHotspotsResult } from '@sdk/gps-lvn.sdk'
import {
  clampHotspotWindow,
  formatAgo,
  formatPeakHour,
  formatStopDuration,
  hotspotRadiusPx,
  hotspotWindows,
  sortHotspots,
} from '@components/gps/stopHotspots'

const h = vi.hoisted(() => ({
  refresh: vi.fn(),
  flyTo: vi.fn(),
  circles: [] as Array<Record<string, unknown>>,
}))
vi.mock('leaflet', () => ({ default: { divIcon: vi.fn(() => ({})), latLngBounds: vi.fn((p: unknown) => p) } }))
vi.mock('react-leaflet', () => ({
  useMap: () => ({ flyTo: h.flyTo, getZoom: () => 12, fitBounds: vi.fn(), on: vi.fn(), off: vi.fn(), getCenter: () => ({ lat: 0, lng: 0 }), invalidateSize: vi.fn() }),
  MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Polygon: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Marker: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CircleMarker: ({ children, pathOptions, radius, eventHandlers }: { children: ReactNode; pathOptions: Record<string, unknown>; radius: number; eventHandlers?: { click?: () => void } }) => {
    h.circles.push({ ...pathOptions, radius })
    return <div data-testid="circle" onClick={() => eventHandlers?.click?.()}>{children}</div>
  },
}))
vi.mock('@portals/ops-room/pages/Gps/LandmarkIcon', () => ({ landmarkDivIcon: () => ({}) }))
vi.mock('@features/gps-lvn/hooks', () => ({
  useGpsStopHotspots: (hours: number, enabled: boolean) => ({ data: enabled ? result(hours) : undefined, isLoading: false }),
  useGpsStopHotspotSettings: (enabled = true) => ({ data: enabled ? { can_edit: true } : undefined }),
  useRefreshGpsStopHotspots: () => ({ mutate: h.refresh, isPending: false }),
  useGpsStopHotspotEvents: () => ({ data: [{ id: 1, db_number: '101', vehicle_name: 'كابسة', started_at: '2026-10-28T06:00:00Z', ended_at: '2026-10-28T06:10:00Z', duration_seconds: 600, address: null }], isLoading: false }),
}))
import StopHotspotsPanel from '@components/gps/StopHotspotsPanel'
import StopHotspotsLayer from '@components/gps/StopHotspotsLayer'
import GpsLiveMap from '@portals/ops-room/pages/Gps/GpsLiveMap'

const spot = (o: Partial<GpsStopHotspot>): GpsStopHotspot => ({
  id: '1:1', rank: 1, lat: 33.32, lng: 44.42, stops: 3, stops_24h: 2, vehicles: 2, total_seconds: 1200, avg_seconds: 400, max_seconds: 600,
  score: 1, level: 'high', first_at: '2026-10-27T09:00:00Z', last_at: '2026-10-28T12:00:00Z', active_now: false, peak_hour: 12, address: 'شارع فلسطين',
  top_vehicles: [{ vehicle_id: 'v1', db_number: '101', vehicle_name: 'كابسة 101', stops: 2, total_seconds: 840 }], ...o,
})
const result = (hours: number): GpsStopHotspotsResult => ({
  spots: [
    spot({}),
    spot({ id: '2:2', rank: 2, total_seconds: 500, stops: 5, vehicles: 1, score: 0.42, level: 'medium', last_at: '2026-10-28T13:00:00Z', address: 'الكرادة', active_now: true }),
    spot({ id: '3:3', rank: 3, total_seconds: 200, stops: 1, vehicles: 1, score: 0.17, level: 'low', address: null }),
  ],
  totals: { stops: 9, total_seconds: 1900, vehicles: 2, excluded: 4 },
  meta: { hours, max_days: 3, enabled: true, cluster_radius_m: 60, last_refresh_at: new Date().toISOString(), refresh_minutes: 30, generated_at: '', excluded_zone_ids: [], excluded_landmark_ids: [] },
})

describe('بقع التوقف — الدوال المساعدة', () => {
  it('النوافذ تُقصّ حسب الحد الأقصى بالأيام', () => {
    expect(hotspotWindows(7).map((w) => w.hours)).toEqual([24, 72, 168])
    expect(hotspotWindows(3).map((w) => w.hours)).toEqual([24, 72])
    expect(hotspotWindows(1).map((w) => w.hours)).toEqual([24])
    expect(clampHotspotWindow(168, 3)).toBe(72)
    expect(clampHotspotWindow(24, 3)).toBe(24)
  })
  it('تنسيق المدد والساعات', () => {
    expect(formatStopDuration(40)).toBe('40 ث')
    expect(formatStopDuration(600)).toBe('10 د')
    expect(formatStopDuration(3600)).toBe('1 س')
    expect(formatStopDuration(12300)).toBe('3 س 25 د')
    expect(formatPeakHour(23)).toBe('23:00–00:00')
    expect(formatPeakHour(null)).toBe('—')
    const now = Date.parse('2026-10-28T12:00:00Z')
    expect(formatAgo('2026-10-28T11:55:00Z', now)).toBe('قبل 5 د')
    expect(formatAgo('2026-10-28T09:00:00Z', now)).toBe('قبل 3 س')
    expect(formatAgo('2026-10-26T12:00:00Z', now)).toBe('قبل 2 يوم')
  })
  it('حجم الدائرة يتبع الوزن، والفرز يعمل بكل المعايير', () => {
    expect(hotspotRadiusPx(0)).toBe(10)
    expect(hotspotRadiusPx(1)).toBe(32)
    const spots = result(24).spots
    expect(sortHotspots(spots, 'total').map((s) => s.rank)).toEqual([1, 2, 3])
    expect(sortHotspots(spots, 'stops').map((s) => s.rank)).toEqual([2, 1, 3])
    expect(sortHotspots(spots, 'vehicles').map((s) => s.rank)).toEqual([1, 2, 3])
    expect(sortHotspots(spots, 'recent').map((s) => s.rank)).toEqual([2, 1, 3])
  })
})

describe('بقع التوقف — اللوحة والطبقة', () => {
  it('اللوحة تعرض النوافذ المسموحة فقط، القائمة مرتّبة، والاختيار يستدعي onSelect', () => {
    const onHours = vi.fn(), onSelect = vi.fn()
    render(<StopHotspotsPanel data={result(24)} loading={false} hours={24} onHours={onHours} selectedId={null} onSelect={onSelect} canEdit={false} />)
    const group = screen.getByRole('group', { name: 'النافذة الزمنية' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['24 ساعة', '3 أيام'])
    fireEvent.click(within(group).getByText('3 أيام'))
    expect(onHours).toHaveBeenCalledWith(72)
    const items = within(screen.getByTestId('hotspots-list')).getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]!.textContent).toContain('شارع فلسطين')
    expect(items[0]!.textContent).toContain('20 د')
    expect(items[1]!.textContent).toContain('نشطة الآن')
    fireEvent.click(within(items[1]!).getByRole('button'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '2:2' }))
    // قراءة فقط: لا أزرار تحديث/إعدادات
    expect(screen.queryByTestId('hotspots-refresh-now')).toBeNull()
    expect(screen.getByText(/مستبعد 4/)).toBeTruthy()
  })
  it('فرز القائمة بعدد التوقفات، وأزرار التحديث/الإعدادات لمن يملك الصلاحية', () => {
    const open = vi.fn()
    render(<StopHotspotsPanel data={result(24)} loading={false} hours={24} onHours={vi.fn()} selectedId={null} onSelect={vi.fn()} canEdit onOpenSettings={open} />)
    fireEvent.change(screen.getByLabelText('ترتيب البقع'), { target: { value: 'stops' } })
    const items = within(screen.getByTestId('hotspots-list')).getAllByRole('listitem')
    expect(items[0]!.textContent).toContain('الكرادة')
    fireEvent.click(screen.getByTestId('hotspots-refresh-now'))
    expect(h.refresh).toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('hotspots-open-settings'))
    expect(open).toHaveBeenCalled()
  })
  it('الطبقة ترسم دائرة لكل بقعة بلون الكثافة وحجم الوزن، وتُظهر التفاصيل وآخر التوقفات', () => {
    h.circles.length = 0
    const onSelect = vi.fn()
    render(<StopHotspotsLayer spots={result(24).spots} hours={24} selectedId="2:2" onSelect={onSelect} />)
    expect(h.circles).toHaveLength(3)
    expect(h.circles[0]).toMatchObject({ fillColor: '#dc2626', radius: 32 })
    expect(h.circles[1]).toMatchObject({ fillColor: '#f59e0b', color: '#0f172a', dashArray: '4 3' })
    expect(h.circles[2]).toMatchObject({ fillColor: '#16a34a' })
    const popup = screen.getByTestId('hotspot-popup-1')
    expect(popup.textContent).toContain('20 د')
    expect(popup.textContent).toContain('DB 101')
    expect(popup.textContent).toContain('12:00–13:00')
    expect(within(popup).getByTestId('hotspot-events').textContent).toContain('10 د')
    fireEvent.click(screen.getAllByTestId('circle')[2]!)
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '3:3' }))
  })
  it('الخريطة الحية: الطبقة معطّلة افتراضياً وتظهر اللوحة والدوائر عند التفعيل', () => {
    h.circles.length = 0
    render(<GpsLiveMap rows={[]} zones={[]} landmarks={[]} />)
    expect(screen.queryByTestId('stop-hotspots-panel')).toBeNull()
    const toggle = screen.getByTestId('live-map-toggle-hotspots')
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(toggle)
    expect(screen.getByTestId('stop-hotspots-panel')).toBeTruthy()
    expect(toggle.textContent).toContain('(3)')
    expect(h.circles).toHaveLength(3)
    fireEvent.click(screen.getByText('عرض القائمة'))
    fireEvent.click(within(within(screen.getByTestId('hotspots-list')).getAllByRole('listitem')[0]!).getByRole('button'))
    expect(h.flyTo).toHaveBeenCalledWith([33.32, 44.42], 16, expect.anything())
  })
})
