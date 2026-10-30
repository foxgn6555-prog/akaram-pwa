/** 00384 — صفحة خريطة النفايات: الشهر السابق افتراضياً، الخفيف مخفي، الفلاتر تحدّث العدّاد والقائمة، الوحدة في الشريط والصلاحيات، وملء الشاشة */
import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GpsHotspot, GpsHotspotsList } from '@sdk/gps-hotspots.sdk'

const h = vi.hoisted(() => ({ list: vi.fn(), stats: vi.fn(), excel: vi.fn(), pdf: vi.fn(), toasts: [] as unknown[] }))
vi.mock('@sdk/gps-hotspots.sdk', () => ({ gpsHotspots: { list: (f: unknown) => h.list(f), monthStats: () => h.stats() } }))
vi.mock('@features/gps-hotspots/geocode', () => ({ reverseGeocode: () => Promise.resolve('شارع الكرادة داخل — الكرادة') }))
vi.mock('@features/gps-hotspots/export', () => ({ downloadHotspotsExcel: (...a: unknown[]) => h.excel(...a), printHotspotsReport: (...a: unknown[]) => h.pdf(...a), filtersLabel: () => 'f' }))
vi.mock('@stores/ui.store', () => ({ useUiStore: (sel: (s: { addToast: (t: unknown) => void }) => unknown) => sel({ addToast: (t) => h.toasts.push(t) }) }))
vi.mock('@features/sector', () => ({ useSectors: () => ({ data: [{ id: 1, name: 'الكرادة' }, { id: 2, name: 'الأعظمية' }, { id: 3, name: 'المنصور' }] }) }))
import OpsWasteMapPage from '@portals/ops-room/pages/WasteMap/OpsWasteMapPage'
import { PORTAL_UNITS } from '@config/portals.config'
import { PORTALS } from '@lib/constants/portals.constants'
import { UNIT_ACTIONS } from '@config/permission-catalog'

const spot = (p: Partial<GpsHotspot>): GpsHotspot => ({ id: 1, month: '2026-09-01', wh_id: 1, lat: 33.3, lng: 44.4, stops_count: 5, days_count: 4, vehicles_count: 2, total_minutes: 172, avg_minutes: 34, max_minutes: 90, light_count: 2, medium_count: 2, heavy_count: 1,
  dominant_class: 'medium', recurrence: 'recurring', first_at: null, last_at: null, sector_ids: [1, 2], sector_names: ['الكرادة', 'الأعظمية'], vehicles: [], days: [], hours: [], ...p })
const data = (month: string): GpsHotspotsList => ({
  month, total: 3, sync: { month: `${month}-01`, rows_count: 3, thresholds: { class_light_max_min: 20, class_medium_max_min: 60, recur_mid_days: 3, recur_high_days: 10 }, synced_at: '2026-10-29T20:30:00Z' },
  months: [{ month: '2026-10', rows: 1, synced_at: '' }, { month: '2026-09', rows: 3, synced_at: '' }],
  rows: [spot({ id: 1 }), spot({ id: 2, dominant_class: 'light', recurrence: 'once', vehicles_count: 1, sector_ids: [1], sector_names: ['الكرادة'], total_minutes: 15 }), spot({ id: 3, dominant_class: 'heavy', recurrence: 'frequent', vehicles_count: 1, sector_ids: [3], sector_names: ['المنصور'], total_minutes: 900 })],
})
const wrap = (ui: ReactNode) => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider></MemoryRouter>)
beforeEach(() => { vi.useRealTimers(); h.toasts = []; h.excel.mockReset().mockResolvedValue(undefined); h.pdf.mockReset(); h.stats.mockReset().mockResolvedValue([{ month: '2026-09', spots: 3, stops: 18, total_minutes: 1087, multi_vehicle: 1, by_class: { heavy: 1, medium: 1, light: 1 }, by_recurrence: { once: 1, recurring: 1, frequent: 1 }, by_sector: [], updated_at: '' }, { month: '2026-08', spots: 2, stops: 10, total_minutes: 500, multi_vehicle: 1, by_class: { heavy: 1, medium: 1 }, by_recurrence: { once: 2 }, by_sector: [], updated_at: '' }]); h.list.mockReset(); h.list.mockImplementation((f: { month: string | null }) => Promise.resolve(data(f.month ?? '2026-10'))) })

describe('OpsWasteMapPage (00384)', () => {
  it('الوحدة في شريط غرفة العمليات بصلاحية تصدير، ولا توجد في بوابة الموظف', () => {
    expect(PORTAL_UNITS[PORTALS.OPS_ROOM].find((u) => u.path === '/ops-room/waste-map')).toMatchObject({ labelKey: 'nav.ops_waste_map' })
    expect(UNIT_ACTIONS['ops-room.waste-map']).toEqual(['export'])
    expect(PORTAL_UNITS[PORTALS.EMPLOYEE].some((u) => u.path.includes('waste'))).toBe(false)
  })
  it('يطلب آخر شهر ثم يتحوّل إلى الشهر السابق؛ الخفيف مخفي افتراضياً؛ العدّاد والقائمة والحدود', async () => {
    vi.setSystemTime(new Date(2026, 9, 30))
    wrap(<OpsWasteMapPage />)
    await waitFor(() => expect(h.list).toHaveBeenCalledWith(expect.objectContaining({ month: '2026-09', classes: null })))
    expect((await screen.findByTestId('waste-map-counter')).textContent).toBe('2 بقعة معروضة من 3')
    expect((screen.getByTestId('waste-map-month') as HTMLSelectElement).value).toBe('2026-09')
    expect(screen.getByTestId('waste-filter-class-light').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByTestId('waste-map-list').textContent).toContain('المنصور'); expect(screen.getByTestId('waste-map-list').textContent).not.toContain('خفيف')
    expect(screen.queryByTestId('waste-list-2')).toBeNull()
    expect(screen.getByTestId('waste-map-filters').textContent).toContain('خفيف ≤ 20 د · متوسط ≤ 60 د')
    expect(screen.getByTestId('ops-waste-map-page').textContent).toContain('الشهر المعروض: أيلول 2026')
  })
  it('الفلاتر: إظهار الخفيف، تكرار، آليات متعددة، قاطع — ثم إعادة الضبط', async () => {
    vi.setSystemTime(new Date(2026, 9, 30))
    wrap(<OpsWasteMapPage />)
    await waitFor(() => expect((screen.getByTestId('waste-map-month') as HTMLSelectElement).value).toBe('2026-09'))
    await screen.findByTestId('waste-list-1')
    fireEvent.click(screen.getByTestId('waste-filter-class-light'))
    expect(screen.getByTestId('waste-map-counter').textContent).toBe('3 بقعة معروضة من 3')
    fireEvent.click(screen.getByTestId('waste-filter-rec-once')); fireEvent.click(screen.getByTestId('waste-filter-rec-recurring'))
    expect(screen.getByTestId('waste-map-counter').textContent).toBe('1 بقعة معروضة من 3'); expect(screen.getByTestId('waste-list-3')).toBeTruthy()
    fireEvent.click(screen.getByTestId('waste-filter-reset'))
    fireEvent.change(screen.getByTestId('waste-filter-vehicles'), { target: { value: '2' } })
    expect(screen.getByTestId('waste-map-counter').textContent).toBe('1 بقعة معروضة من 3'); expect(screen.getByTestId('waste-list-1')).toBeTruthy()
    fireEvent.click(screen.getByTestId('waste-filter-reset'))
    fireEvent.click(screen.getByTestId('waste-filter-sector-3'))
    expect(screen.getByTestId('waste-map-counter').textContent).toBe('1 بقعة معروضة من 3')
    fireEvent.click(screen.getByTestId('waste-filter-sector-1'))   // متعدد
    expect(screen.getByTestId('waste-map-counter').textContent).toBe('2 بقعة معروضة من 3')
    expect(h.list).toHaveBeenCalledTimes(2)   // الفلترة محلية — لا طلبات إضافية
  })
  it('تبديل الشهر يطلب من القاعدة؛ ملء الشاشة يفتح في body ويُغلق بـ Escape', async () => {
    vi.setSystemTime(new Date(2026, 9, 30))
    wrap(<OpsWasteMapPage />)
    await waitFor(() => expect((screen.getByTestId('waste-map-month') as HTMLSelectElement).value).toBe('2026-09'))
    fireEvent.change(screen.getByTestId('waste-map-month'), { target: { value: '2026-10' } })
    await waitFor(() => expect(h.list).toHaveBeenCalledWith(expect.objectContaining({ month: '2026-10' })))
    fireEvent.click(screen.getByTestId('waste-map-fullscreen'))
    expect(screen.getByTestId('waste-map').getAttribute('data-fullscreen')).toBe('1'); expect(screen.getByTestId('waste-map').parentElement).toBe(document.body)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByTestId('waste-map').getAttribute('data-fullscreen')).toBe('0')
  })
  it('فشل القراءة (موظف/خطأ) يعرض رسالة مترجمة', async () => {
    h.list.mockRejectedValue(new Error('GPS_FORBIDDEN'))
    wrap(<OpsWasteMapPage />)
    expect((await screen.findByTestId('waste-map-error')).textContent?.length).toBeGreaterThan(5)
  })
  it('00385: النقر على بقعة يفتح لوحة التفاصيل (آليات، ساعات، أيام، عنوان، خريطة مصغّرة) ويُغلقها ✕', async () => {
    vi.setSystemTime(new Date(2026, 9, 30))
    wrap(<OpsWasteMapPage />)
    await waitFor(() => expect((screen.getByTestId('waste-map-month') as HTMLSelectElement).value).toBe('2026-09'))
    fireEvent.click(await screen.findByTestId('waste-list-3'))
    const panel = await screen.findByTestId('hotspot-panel')
    expect(panel.textContent).toContain('ثقيل · شبه يومي'); expect(panel.textContent).toContain('المنصور')
    expect(screen.getByTestId('hotspot-mini-map')).toBeTruthy(); expect(screen.getByTestId('hotspot-hours').children).toHaveLength(24); expect(screen.getByTestId('hotspot-weekdays').children).toHaveLength(7)
    await waitFor(() => expect(screen.getByTestId('hotspot-panel-address').textContent).toContain('شارع الكرادة داخل'))
    expect(screen.queryByTestId('waste-map-list')).toBeNull()
    fireEvent.click(screen.getByTestId('hotspot-panel-close'))
    expect(screen.queryByTestId('hotspot-panel')).toBeNull(); expect(screen.getByTestId('waste-map-list')).toBeTruthy()
  })
  it('00385: المقارنة مع الشهر السابق تظهر من الإحصاء الدائم، والتصدير يمرّر البقع المفلترة والشهر', async () => {
    vi.setSystemTime(new Date(2026, 9, 30))
    wrap(<OpsWasteMapPage />)
    await waitFor(() => expect((screen.getByTestId('waste-map-month') as HTMLSelectElement).value).toBe('2026-09'))
    const cmp = await screen.findByTestId('waste-map-comparison')
    await waitFor(() => expect(cmp.textContent).toContain('▲ +1 (+50%)'))
    expect(cmp.textContent).toContain('مقارنة أيلول 2026 مع آب 2026')
    fireEvent.click(screen.getByTestId('waste-export-excel'))
    await waitFor(() => expect(h.excel).toHaveBeenCalled())
    expect((h.excel.mock.calls[0]![0] as unknown[]).length).toBe(2); expect(h.excel.mock.calls[0]![1]).toBe('2026-09')
    fireEvent.click(screen.getByTestId('waste-export-pdf'))
    expect(h.pdf).toHaveBeenCalledWith(expect.any(Array), '2026-09', 'f', expect.any(Array))
  })

  it('00387: المظهر — داكنة افتراضياً مع لوحة حرارية وعلامات، التبديل إلى «خريطة عادية»، إخفاء التوهّج/العلامات، وسقوط مزوّد الخلفية ينتقل للتالي', async () => {
    wrap(<OpsWasteMapPage />)
    const map = await screen.findByTestId('waste-map')
    await screen.findByTestId('waste-map-counter')
    expect(map.getAttribute('data-theme')).toBe('dark'); expect(map.getAttribute('data-tiles')).toBe('carto-dark')
    expect(screen.getByTestId('waste-map-legend-gradient')).toBeTruthy()
    expect(screen.getByTestId('waste-map-legend').textContent).toContain('كثافة التوقف')
    expect(document.getElementById('waste-map-style')?.textContent).toContain('waste-pulse')
    expect(screen.getByTestId('waste-heat-canvas')).toBeTruthy()
    await waitFor(() => expect(document.querySelectorAll('.waste-spot').length).toBeGreaterThan(0))
    fireEvent.click(screen.getByTestId('waste-map-heat'))
    expect(screen.queryByTestId('waste-heat-canvas')).toBeNull()
    fireEvent.click(screen.getByTestId('waste-map-markers'))
    expect(document.querySelectorAll('.waste-spot').length).toBe(0)
    fireEvent.click(screen.getByTestId('waste-map-theme'))
    expect(map.getAttribute('data-theme')).toBe('light'); expect(map.getAttribute('data-tiles')).toBe('osm'); expect(screen.getByTestId('waste-map-theme').textContent).toContain('ليلي')
    expect(localStorage.getItem('akaram.map-theme')).toBe('light')   // الاختيار محفوظ لكل الخرائط
    localStorage.removeItem('akaram.map-theme')
  })
})
