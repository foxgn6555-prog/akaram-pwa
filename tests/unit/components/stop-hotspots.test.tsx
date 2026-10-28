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
  hotspotColor,
  hotspotRadiusPx,
  hotspotWindows,
  sortHotspots,
} from '@components/gps/stopHotspots'

const h = vi.hoisted(() => ({
  refresh: vi.fn(),
  autoPull: vi.fn(),
  pullNow: vi.fn(),
  flyTo: vi.fn(),
  circles: [] as Array<Record<string, unknown>>,
  icons: [] as string[],
}))
vi.mock('leaflet', () => ({ default: { divIcon: vi.fn((o: { html: string }) => { h.icons.push(o.html); return {} }), latLngBounds: vi.fn((p: unknown) => p) } }))
vi.mock('react-leaflet', () => ({
  useMap: () => ({ flyTo: h.flyTo, getZoom: () => 12, fitBounds: vi.fn(), on: vi.fn(), off: vi.fn(), getCenter: () => ({ lat: 0, lng: 0 }), invalidateSize: vi.fn() }),
  MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Polygon: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Marker: ({ children, eventHandlers }: { children?: ReactNode; eventHandlers?: { click?: () => void } }) => <div data-testid="marker" onClick={() => eventHandlers?.click?.()}>{children}</div>,
  Popup: ({ children, pane }: { children: ReactNode; pane?: string }) => <div data-pane={pane}>{children}</div>,
  Pane: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Tooltip: ({ children }: { children: ReactNode }) => <div data-testid="tip">{children}</div>,
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
  useGpsStopsAutoPull: (enabled: boolean) => { h.autoPull(enabled); return { running: false, batches: 0, inserted: 0, lastError: null, pullNow: h.pullNow } },
  useGpsStopPullStatus: () => ({ data: { devices: 12, caught_up: 9, never_pulled: 1, errors: 1, oldest_pulled_until: null, last_pull_at: new Date().toISOString(), points_total: 5000, last_error: 'LVN_TIMEOUT', pending_hours: 30.5 } }),
  useGpsStopHotspotEvents: () => ({ data: [{ id: 1, db_number: '101', vehicle_name: 'كابسة', started_at: '2026-10-28T06:00:00Z', ended_at: '2026-10-28T06:10:00Z', duration_seconds: 600, address: null }], isLoading: false }),
}))
import StopHotspotsPanel from '@components/gps/StopHotspotsPanel'
import StopHotspotsLayer, { heatBlobHtml } from '@components/gps/StopHotspotsLayer'
import GpsLiveMap from '@portals/ops-room/pages/Gps/GpsLiveMap'

const spot = (o: Partial<GpsStopHotspot>): GpsStopHotspot => ({
  id: '1:1', rank: 1, lat: 33.32, lng: 44.42, stops: 3, stops_24h: 2, vehicles: 2, total_seconds: 1200, avg_seconds: 400, max_seconds: 600,
  score: 1, percentile: 1, share: 0.63, hourly: Array.from({ length: 24 }, (_, h) => (h === 12 ? 900 : h === 9 ? 300 : 0)), level: 'high', first_at: '2026-10-27T09:00:00Z', last_at: '2026-10-28T12:00:00Z', active_now: false, peak_hour: 12, address: 'شارع فلسطين',
  top_vehicles: [{ vehicle_id: 'v1', db_number: '101', vehicle_name: 'كابسة 101', stops: 2, total_seconds: 840 }], ...o,
})
const result = (hours: number): GpsStopHotspotsResult => ({
  spots: [
    spot({}),
    spot({ id: '2:2', rank: 2, total_seconds: 500, stops: 5, vehicles: 1, score: 0.78, percentile: 0.5, share: 0.26, level: 'medium', last_at: '2026-10-28T13:00:00Z', address: 'الكرادة', active_now: true }),
    spot({ id: '3:3', rank: 3, total_seconds: 200, stops: 1, vehicles: 1, score: 0.66, percentile: 0, share: 0.11, level: 'low', address: null }),
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
    expect(formatStopDuration(260)).toBe('4 د 20 ث')   // 00366: دقة بالثواني تحت 10 دقائق
    expect(formatStopDuration(120)).toBe('2 د')
    expect(formatStopDuration(7199)).toBe('2 س')
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
    // 00365: تدرج لوني متصل بالمئين — أخضر في الأدنى، أصفر في الوسط، أحمر في الأعلى
    expect(hotspotColor(0)).toBe('#16a34a')
    expect(hotspotColor(0.5)).toBe('#eab308')
    expect(hotspotColor(1)).toBe('#dc2626')
    expect(hotspotColor(0.25)).not.toBe(hotspotColor(0.4))
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
    // 00364: السحب التلقائي من LVN مفعّل لمن يملك الصلاحية، وحالة السحب ظاهرة، وزر السحب اليدوي
    expect(h.autoPull).toHaveBeenLastCalledWith(true)
    expect(screen.getByTestId('hotspots-pull-status').textContent).toContain('9/12 جهاز محدّث')
    expect(screen.getByTestId('hotspots-pull-status').textContent).toContain('متبقٍ 30.5 س')
    fireEvent.click(screen.getByTestId('hotspots-pull-now'))
    expect(h.pullNow).toHaveBeenCalled()
  })
  it('القراءة فقط (النائب): لا سحب تلقائي ولا زر سحب، لكن حالة السحب ظاهرة', () => {
    render(<StopHotspotsPanel data={result(24)} loading={false} hours={24} onHours={vi.fn()} selectedId={null} onSelect={vi.fn()} canEdit={false} />)
    expect(h.autoPull).toHaveBeenLastCalledWith(false)
    expect(screen.queryByTestId('hotspots-pull-now')).toBeNull()
    expect(screen.getByTestId('hotspots-pull-status').textContent).toContain('أخطاء 1')
  })
  it('00365: تبديل النافذة يُظهر مؤشر التحديث مع إبقاء البيانات السابقة', () => {
    render(<StopHotspotsPanel data={result(24)} loading={false} fetching hours={72} onHours={vi.fn()} selectedId={null} onSelect={vi.fn()} canEdit={false} />)
    expect(screen.getByTestId('hotspots-fetching')).toBeTruthy()
    expect(within(screen.getByTestId('hotspots-list')).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByTestId('hotspots-list').textContent).toContain('63%')
  })
  it('الطبقة ترسم بقعة حرارية لكل موقع بلون الكثافة وحجم الوزن بلا أرقام، مع نبض للنشطة وهالة للأولى، وتُظهر التفاصيل', () => {
    h.icons.length = 0
    const onSelect = vi.fn()
    render(<StopHotspotsLayer spots={result(24).spots} hours={24} selectedId="2:2" onSelect={onSelect} />)
    expect(h.icons).toHaveLength(3)
    expect(h.icons[0]).toContain('220,38,38')          // أحمر
    expect(h.icons[0]).toContain('akh-crown')          // الأولى
    expect(h.icons[0]).toContain('width:83px')         // الوزن 1 ⇒ أكبر حجم
    expect(h.icons[1]).toContain('234,179,8')           // أصفر (المئين 0.5)
    expect(h.icons[1]).toContain('akh-ring')           // نشطة الآن
    expect(h.icons[1]).toContain('akh-selected')
    expect(h.icons[2]).toContain('22,163,74')
    for (const html of h.icons) expect(html.replace(/[0-9.]+px|rgba?\([0-9,. ]+\)|[0-9]+%/g, '')).not.toMatch(/>\s*\d+\s*</)   // لا أرقام مرئية
    expect(heatBlobHtml({ score: 0, percentile: 0, active_now: false, rank: 5 }, false).size).toBe(26)
    expect(heatBlobHtml({ score: 0, percentile: 0, active_now: false, rank: 5 }, false).html).not.toContain('akh-crown')
    // 00366: نمط «حرارة فقط» — بلا نقطة/حلقة/تاج، الحجم والشدة من الإعدادات
    const heat = heatBlobHtml({ score: 1, percentile: 1, active_now: true, rank: 1 }, false, { map_style: 'heat', heat_intensity: 0.9, heat_size: 2 })
    expect(heat.size).toBe(Math.round(32 * 2.6 * 2))
    expect(heat.html).toContain('akh-heat')
    expect(heat.html).toContain('rgba(220,38,38,0.90)')
    for (const c of ['akh-core', 'akh-ring', 'akh-crown']) expect(heat.html).not.toContain(c)
    const popup = screen.getByTestId('hotspot-popup-1')
    expect(popup.parentElement!.getAttribute('data-pane')).toBe('popupPane')   // 00364: النافذة فوق طبقة البقع
    expect(popup.textContent).toContain('20 د')
    expect(popup.textContent).toContain('DB 101')
    expect(popup.textContent).toContain('12:00–13:00')
    expect(within(popup).getByTestId('hotspot-events').textContent).toContain('10 د')
    expect(popup.textContent).toContain('63%')
    expect(within(popup).getByTestId('hotspot-hourly').querySelectorAll('span[title]')).toHaveLength(24)
    expect(screen.getAllByTestId('tip')[0]!.textContent).toContain('شارع فلسطين')
    fireEvent.click(screen.getAllByTestId('marker')[2]!)
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '3:3' }))
  })
  it('الخريطة الحية: الطبقة معطّلة افتراضياً وتظهر اللوحة والدوائر عند التفعيل', () => {
    h.icons.length = 0
    render(<GpsLiveMap rows={[]} zones={[]} landmarks={[]} />)
    expect(screen.queryByTestId('stop-hotspots-panel')).toBeNull()
    const toggle = screen.getByTestId('live-map-toggle-hotspots')
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(toggle)
    expect(screen.getByTestId('stop-hotspots-panel')).toBeTruthy()
    expect(toggle.textContent).toContain('(3)')
    expect(screen.getAllByTestId('marker')).toHaveLength(3)
    fireEvent.click(screen.getByText('عرض القائمة'))
    fireEvent.click(within(within(screen.getByTestId('hotspots-list')).getAllByRole('listitem')[0]!).getByRole('button'))
    expect(h.flyTo).toHaveBeenCalledWith([33.32, 44.42], 16, expect.anything())
  })
})
