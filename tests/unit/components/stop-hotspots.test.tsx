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
  normalizeHotspotHours,
  setShowLightSpots,
  recurrenceLabel,
  recurrenceStars,
  sortHotspots,
  typesSummary,
} from '@components/gps/stopHotspots'

const h = vi.hoisted(() => ({
  refresh: vi.fn(),
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
  useGpsStopPullStatus: () => ({ data: { devices: 12, caught_up: 9, never_pulled: 1, errors: 1, oldest_pulled_until: null, last_pull_at: new Date().toISOString(), points_total: 5000, last_error: 'LVN_TIMEOUT', pending_hours: 30.5, covered_hours: 41.5 } }),
  useGpsStopHotspotEvents: () => ({ data: [{ id: 1, db_number: '101', vehicle_name: 'كابسة', started_at: '2026-10-28T06:00:00Z', ended_at: '2026-10-28T06:10:00Z', duration_seconds: 600, address: null }], isLoading: false }),
}))
import StopHotspotsPanel from '@components/gps/StopHotspotsPanel'
import { hotspotMinutes } from '@sdk/gps-lvn.sdk'
import { stopHotspotsReportHtml } from '@components/gps/stopHotspotsReport'
import StopHotspotsLayer, { heatBlobHtml } from '@components/gps/StopHotspotsLayer'
import GpsLiveMap from '@portals/ops-room/pages/Gps/GpsLiveMap'

const spot = (o: Partial<GpsStopHotspot>): GpsStopHotspot => ({
  id: '1:1', rank: 1, lat: 33.32, lng: 44.42, stops: 3, stops_24h: 2, vehicles: 2, total_seconds: 1200, avg_seconds: 400, max_seconds: 600,
  days_active: 3, recurrence_tier: 3, recurring_vehicles: 1, top_recurring: { vehicle_id: 'v1', db_number: '101', vehicle_name: 'كابسة', stops: 4, days: 3, total_seconds: 900 },
  type_count: 2, unbound_vehicles: 0, types: [{ code: 'compactor_large', label: 'كابسة كبيرة', vehicles: 1, stops: 4, total_seconds: 900 }, { code: 'tipper', label: 'قلاب', vehicles: 1, stops: 1, total_seconds: 300 }],
  support_rank: 1, support_score: 1,
  class: 'long', median_seconds: 400, buckets: { light: { stops: 0, seconds: 0 }, loiter: { stops: 1, seconds: 400 }, long: { stops: 2, seconds: 800 }, over3h: { stops: 0, seconds: 0 } },
  score: 1, percentile: 1, share: 0.63, hourly: Array.from({ length: 24 }, (_, h) => (h === 12 ? 900 : h === 9 ? 300 : 0)), level: 'high', first_at: '2026-10-27T09:00:00Z', last_at: '2026-10-28T12:00:00Z', active_now: false, peak_hour: 12, address: 'شارع فلسطين',
  top_vehicles: [{ vehicle_id: 'v1', db_number: '101', vehicle_name: 'كابسة 101', stops: 2, total_seconds: 840 }], ...o,
})
const result = (hours: number): GpsStopHotspotsResult => ({
  spots: [
    spot({}),
    spot({ id: '2:2', rank: 2, total_seconds: 500, stops: 5, vehicles: 1, score: 0.78, percentile: 0.5, share: 0.26, level: 'medium', class: 'loiter', recurrence_tier: 0, type_count: 1, types: [{ code: 'tipper', label: 'قلاب', vehicles: 1, stops: 5, total_seconds: 500 }], support_rank: 2, support_score: 0.5, last_at: '2026-10-28T13:00:00Z', address: 'الكرادة', active_now: true }),
    spot({ id: '3:3', rank: 3, total_seconds: 200, stops: 1, vehicles: 1, score: 0.66, percentile: 0, share: 0.11, level: 'low', class: 'light', recurrence_tier: 1, type_count: 0, unbound_vehicles: 1, types: [], support_rank: 3, support_score: 0.2, address: null }),
  ],
  totals: { stops: 9, total_seconds: 1900, vehicles: 2, excluded: 4, multi_type_spots: 1, recurring_spots: 2 },
  meta: { hours, max_days: 3, enabled: true, cluster_radius_m: 60, last_refresh_at: new Date().toISOString(), refresh_minutes: 30, generated_at: '', excluded_zone_ids: [], excluded_landmark_ids: [] },
})

describe('بقع التوقف — الدوال المساعدة', () => {
  it('النوافذ تُقصّ حسب الحد الأقصى بالأيام', () => {
    // 00372: نافذة واحدة = الاحتفاظ
    expect(hotspotWindows(3)).toEqual([{ hours: 72, label: '3 أيام' }])
    expect(hotspotWindows(7)).toEqual([{ hours: 168, label: '7 أيام' }])
    expect(hotspotWindows(1)).toEqual([{ hours: 24, label: 'يوم' }])
    expect(hotspotMinutes(72)).toBe(4320)
    expect(normalizeHotspotHours('24')).toBe(72)
    expect(normalizeHotspotHours(null)).toBe(72)
    expect(clampHotspotWindow(168, 3)).toBe(72)
    expect(clampHotspotWindow(24, 3)).toBe(72)
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
    // 00372: نافذة واحدة = الاحتفاظ (max_days = 3) ولا أزرار اختيار؛ النافذة المخالفة تُصحَّح تلقائياً إلى 72 س
    expect(screen.queryByRole('group', { name: 'النافذة الزمنية' })).toBeNull()
    expect(screen.getByTestId('hotspots-window').textContent).toContain('آخر 3 أيام')
    expect(onHours).toHaveBeenCalledWith(72)
    const items = within(screen.getByTestId('hotspots-list')).getAllByRole('listitem')
    expect(items).toHaveLength(2)   // 00373: الخفيفة مخفية افتراضياً
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
    const open = vi.fn(), onHours = vi.fn()
    render(<StopHotspotsPanel data={result(24)} loading={false} hours={24} onHours={onHours} selectedId={null} onSelect={vi.fn()} canEdit onOpenSettings={open} />)
    expect(onHours).toHaveBeenCalledWith(72)
    fireEvent.change(screen.getByLabelText('ترتيب البقع'), { target: { value: 'stops' } })
    const items = within(screen.getByTestId('hotspots-list')).getAllByRole('listitem')
    expect(items[0]!.textContent).toContain('الكرادة')
    fireEvent.click(screen.getByTestId('hotspots-refresh-now'))
    expect(h.refresh).toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('hotspots-open-settings'))
    expect(open).toHaveBeenCalled()
    // 00371: حالة السحب ظاهرة لكن لا زر سحب حتى لمن يملك الصلاحية (الخادم فقط)
    expect(screen.getByTestId('hotspots-pull-status').textContent).toContain('9/12 جهاز محدّث')
    expect(screen.getByTestId('hotspots-pull-status').textContent).toContain('مُغطّى 41.5/72 س')
    expect(screen.getByTestId('hotspots-pull-status').textContent).toContain('متبقٍ 30.5 س')
    expect(screen.queryByTestId('hotspots-pull-now')).toBeNull()
    // 00371: النقر على «5 د» يطلب نافذة 5 دقائق (1/12 ساعة)
  })
  it('القراءة فقط (النائب): لا زر سحب، لكن حالة السحب ظاهرة', () => {
    render(<StopHotspotsPanel data={result(24)} loading={false} hours={24} onHours={vi.fn()} selectedId={null} onSelect={vi.fn()} canEdit={false} />)
    expect(screen.queryByTestId('hotspots-pull-now')).toBeNull()
    expect(screen.getByTestId('hotspots-pull-status').textContent).toContain('أخطاء 1')
  })
  it('00365: تبديل النافذة يُظهر مؤشر التحديث مع إبقاء البيانات السابقة', () => {
    render(<StopHotspotsPanel data={result(24)} loading={false} fetching hours={72} onHours={vi.fn()} selectedId={null} onSelect={vi.fn()} canEdit={false} />)
    expect(screen.getByTestId('hotspots-fetching')).toBeTruthy()
    expect(within(screen.getByTestId('hotspots-list')).getAllByRole('listitem')).toHaveLength(2)   // 00373: الخفيفة مخفية افتراضياً
    expect(screen.getByTestId('hotspots-list').textContent).toContain('أطول 10 د')
  })
  it('00373: الخفيفة مخفية افتراضياً وزر الإظهار يعرضها في القائمة، والعدادات لكل صنف', () => {
    setShowLightSpots(false)
    render(<StopHotspotsPanel data={result(72)} loading={false} hours={72} onHours={vi.fn()} selectedId={null} onSelect={vi.fn()} canEdit={false} />)
    expect(within(screen.getByTestId('hotspots-list')).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByTestId('hotspots-classes').textContent).toContain('توقف طويل 1')
    expect(screen.getByTestId('hotspots-classes').textContent).toContain('تلكؤ / موقع نفايات 1')
    expect(screen.getByTestId('hotspots-toggle-light').textContent).toContain('إظهار خفيف / ازدحام 1')
    fireEvent.click(screen.getByTestId('hotspots-toggle-light'))
    expect(within(screen.getByTestId('hotspots-list')).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByTestId('hotspots-toggle-light').textContent).toContain('إخفاء')
    setShowLightSpots(false)
  })
  it('الطبقة ترسم بقعة حرارية لكل موقع بلون الكثافة وحجم الوزن بلا أرقام، مع نبض للنشطة وهالة للأولى، وتُظهر التفاصيل', () => {
    h.icons.length = 0
    const onSelect = vi.fn()
    setShowLightSpots(false)
    render(<StopHotspotsLayer spots={result(24).spots} hours={24} selectedId="2:2" onSelect={onSelect} />)
    // 00373: الخفيفة مخفية افتراضياً ⇒ بقعتان؛ اللون بحسب الصنف
    expect(h.icons).toHaveLength(2)
    expect(h.icons[0]).toContain('127,29,29')          // توقف طويل (أحمر غامق)
    expect(h.icons[0]).toContain('akh-crown')          // الأولى
    expect(h.icons[0]).toContain('width:83px')         // الوزن 1 ⇒ أكبر حجم
    expect(h.icons[1]).toContain('220,38,38')          // تلكؤ (أحمر)
    expect(h.icons[1]).toContain('akh-ring')           // نشطة الآن
    expect(h.icons[1]).toContain('akh-selected')
    expect(heatBlobHtml({ score: 0.5, percentile: 0, active_now: false, rank: 3, class: 'light' }, false).html).toContain('245,158,11')
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
    expect(within(popup).getByTestId('hotspot-class').textContent).toContain('توقف طويل')
    expect(popup.textContent).toContain('الوسيط 6 د 40 ث')
    expect(within(popup).getByTestId('hotspot-buckets').textContent).toContain('2 توقف')
    // 00374: التكرار والأنواع والدعم في النافذة + حلقة الأنواع المتعددة على البقعة
    const rec = within(popup).getByTestId('hotspot-recurrence').textContent
    expect(rec).toContain('تحتاج دعماً #1')
    expect(rec).toContain('⭐⭐⭐ عادة يومية')
    expect(rec).toContain('2 أنواع آليات')
    expect(rec).toContain('DB 101')
    expect(rec).toContain('كابسة كبيرة ×1 · قلاب ×1')
    expect(h.icons[0]).toContain('akh-multi')
    expect(h.icons[1]).not.toContain('akh-multi')
    expect(within(popup).getByTestId('hotspot-hourly').querySelectorAll('span[title]')).toHaveLength(24)
    expect(screen.getAllByTestId('tip')[0]!.textContent).toContain('شارع فلسطين')
    fireEvent.click(screen.getAllByTestId('marker')[1]!)
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '2:2' }))
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
    expect(screen.getAllByTestId('marker')).toHaveLength(2)   // 00373: الخفيفة مخفية افتراضياً
    fireEvent.click(screen.getByText('عرض القائمة'))
    fireEvent.click(within(within(screen.getByTestId('hotspots-list')).getAllByRole('listitem')[0]!).getByRole('button'))
    expect(h.flyTo).toHaveBeenCalledWith([33.32, 44.42], 16, expect.anything())
  })
})

describe('00374 — التكرار وتعدّد الأنواع وتقرير الدعم', () => {
  it('الدوال: النجوم، ملخص الأنواع، الفرز بالدعم/التكرار/الأنواع', () => {
    expect(recurrenceStars(3)).toBe('⭐⭐⭐')
    expect(recurrenceStars(0)).toBe('')
    expect(recurrenceLabel(2)).toContain('5 مرات')
    expect(typesSummary({ types: [{ code: 'a', label: 'كابسة', vehicles: 2, stops: 3, total_seconds: 1 }], unbound_vehicles: 1 })).toBe('كابسة ×2 · غير مربوطة ×1')
    const spots = result(72).spots
    expect(sortHotspots(spots, 'support').map((s) => s.id)).toEqual(['1:1', '2:2', '3:3'])
    expect(sortHotspots(spots, 'recurrence').map((s) => s.id)).toEqual(['1:1', '3:3', '2:2'])
    expect(sortHotspots(spots, 'types').map((s) => s.id)).toEqual(['1:1', '2:2', '3:3'])
  })
  it('اللوحة: عدادات متعددة الأنواع/متكررة، النجوم والدعم في القائمة، وزر التقرير يفتح نافذة طباعة', () => {
    setShowLightSpots(false)
    const doc = { open: vi.fn(), write: vi.fn(), close: vi.fn() }
    const win = { document: doc, focus: vi.fn(), setTimeout: (fn: () => void) => fn(), print: vi.fn() }
    const open = vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window)
    render(<StopHotspotsPanel data={result(72)} loading={false} hours={72} onHours={vi.fn()} selectedId={null} onSelect={vi.fn()} canEdit={false} />)
    expect(screen.getByTestId('hotspots-insights').textContent).toContain('متعددة الأنواع1')
    expect(screen.getByTestId('hotspots-insights').textContent).toContain('متكررة ⭐2')
    const list = screen.getByTestId('hotspots-list').textContent
    expect(list).toContain('⭐⭐⭐ شارع فلسطين')
    expect(list).toContain('دعم #1')
    expect(list).toContain('2 أنواع')
    fireEvent.change(screen.getByLabelText('ترتيب البقع'), { target: { value: 'support' } })
    fireEvent.click(screen.getByTestId('hotspots-print-report'))
    expect(open).toHaveBeenCalled()
    const html = doc.write.mock.calls[0]![0] as string
    expect(html).toContain('الأماكن التي تحتاج دعماً')
    expect(html).toContain('شارع فلسطين')
    expect(html).toContain('كابسة كبيرة ×1 · قلاب ×1')
    expect(html).not.toContain('33.2500')   // الخفيفة غير مشمولة افتراضياً
    expect(win.print).toHaveBeenCalled()
    open.mockRestore()
  })
  it('تقرير HTML: مرتّب بالدعم، يحوي الإحصاءات والأصناف ومفتاح النجوم، ويشمل الخفيفة عند الطلب', () => {
    const html = stopHotspotsReportHtml(result(72), { includeLight: true, generatedAt: new Date('2026-10-29T06:00:00Z') })
    expect(html.indexOf('شارع فلسطين')).toBeLessThan(html.indexOf('الكرادة'))
    expect(html).toContain('⭐⭐⭐ عادة يومية')
    expect(html).toContain('توقف طويل')
    expect(html).toContain('عدد الصفوف: 3 من 3')
    expect(html).toContain('<td class="c">3</td>')   // أيام نشطة
    expect(html).toContain('29/10/2026')
    expect(stopHotspotsReportHtml(result(72)).toString()).toContain('عدد الصفوف: 2 من 2')
  })
})
