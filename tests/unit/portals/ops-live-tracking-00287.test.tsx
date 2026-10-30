/** 00287 · وحدة «البث المباشر» في غرفة العمليات: الخريطة + الزونات + الفلاتر + القائمة + التسجيل في الشريط الجانبي */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'
import { PORTAL_UNITS } from '@config/portals.config'
import { PORTALS } from '@lib/constants/portals.constants'
import sidebar from '../../../src/i18n/ar/sidebar.json'
import type { LiveMapRow, LiveZoneRow } from '@sdk/live-tracking.sdk'

vi.mock('react-leaflet', () => ({
  useMap: () => ({ flyTo: vi.fn() }),
  MapContainer: ({ children }: { children: ReactNode }) => <div data-testid="leaflet-map">{children}</div>,
  TileLayer: () => null,
  Marker: ({ children, icon, eventHandlers }: { children: ReactNode; icon: { options: { html: string } }; eventHandlers?: { click?: () => void } }) => (
    <div data-testid="live-marker" onClick={() => eventHandlers?.click?.()}>
      <span data-testid="live-marker-html" data-html={icon.options.html} />{children}
    </div>
  ),
  Polygon: ({ children }: { children: ReactNode }) => <div data-testid="live-zone">{children}</div>,
  Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('leaflet', () => ({ default: { divIcon: (o: unknown) => ({ options: o }) } }))
vi.mock('leaflet/dist/leaflet.css', () => ({}))

const mapCurrent = vi.fn(); const zonesFn = vi.fn()
vi.mock('@sdk/live-tracking.sdk', () => ({ liveTracking: { mapCurrent: (...a: unknown[]) => mapCurrent(...a), zones: () => zonesFn() } }))

import OpsLiveTrackingPage from '@portals/ops-room/pages/LiveTracking/OpsLiveTrackingPage'

const row = (p: Partial<LiveMapRow>): LiveMapRow => ({
  session_id: 's', user_id: 'u', kind: 'manager', full_name: 'أحمد', sectors: [1], area_names: 'الكرادة', shift_name: 'صباحي', shift_start: '08:00:00', shift_end: '16:00:00',
  started_at: new Date().toISOString(), last_seen_at: new Date().toISOString(), latitude: 33.3, longitude: 44.4, accuracy_m: 10, in_zone: true, point_count: 3, out_of_zone_count: 0, stale: false, ...p,
})
const zones: LiveZoneRow[] = [
  { id: 'z1', name: 'زون الكرادة', color: '#f00', polygon: [{ lat: 33, lng: 44 }, { lat: 33.1, lng: 44 }, { lat: 33.1, lng: 44.1 }], sector_id: 1, area_name: 'الكرادة', parent_sector: 'الرصافة', manager_ids: ['m1'], manager_names: 'سعد', contractor_id: 'c1', contractor_name: 'كريم' },
  { id: 'z2', name: 'زون الزعفرانية', color: null, polygon: [], sector_id: 2, area_name: 'الزعفرانية', parent_sector: 'الرصافة', manager_ids: [], manager_names: null, contractor_id: null, contractor_name: null },
]
const wrap = (ui: ReactNode) => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider></MemoryRouter>)

describe('00287 · البث المباشر — غرفة العمليات', () => {
  beforeEach(() => {
    mapCurrent.mockReset(); zonesFn.mockReset()
    mapCurrent.mockResolvedValue([row({ user_id: 'm1', full_name: 'سعد' }), row({ user_id: 'c1', kind: 'contractor', full_name: 'كريم', in_zone: false, area_names: 'الكرادة' })])
    zonesFn.mockResolvedValue(zones)
  })
  it('الوحدة مسجلة في شريط غرفة العمليات باسم «البث المباشر»', () => {
    const unit = PORTAL_UNITS[PORTALS.OPS_ROOM].find((u) => u.path === '/ops-room/live-tracking')
    expect(unit).toMatchObject({ labelKey: 'nav.ops_live_tracking', icon: 'map-pin' })
    expect(sidebar.nav.ops_live_tracking).toBe('البث المباشر')
  })
  it('ترسم الزونات والعلامات الملونة حسب النوع، والفلاتر تعمل', async () => {
    wrap(<OpsLiveTrackingPage />)
    await waitFor(() => expect(screen.getAllByTestId('live-marker')).toHaveLength(2))
    expect(screen.getAllByTestId('live-zone')).toHaveLength(2)
    expect(mapCurrent).toHaveBeenCalledWith(null)
    const htmls = screen.getAllByTestId('live-marker-html').map((e) => e.getAttribute('data-html') ?? '')
    // 00388-ب: لون النقطة = لون القسم (القسم 1 = أول لون في اللوحة)، والحلقة الحمراء خارج الزون
    expect(htmls.some((h) => h.includes('data-kind="manager"') && h.includes('data-sector="1"') && h.includes('--c:#3b82f6'))).toBe(true)
    expect(htmls.some((h) => h.includes('data-kind="contractor"') && h.includes('live-dot--out') && h.includes('#dc2626'))).toBe(true)
    expect(screen.getByTestId('live-map').getAttribute('data-map-theme')).toBe('light')
    fireEvent.click(screen.getByTestId('live-map-theme'))
    expect(screen.getByTestId('live-map').getAttribute('data-map-theme')).toBe('dark')
    expect(screen.getByTestId('live-map-legend').textContent).toContain('الكرادة')
    window.localStorage.removeItem('akaram.map-theme')
    fireEvent.click(screen.getByTestId('live-filter-contractor'))
    expect(screen.getAllByTestId('live-marker')).toHaveLength(1)
    expect(within(screen.getByTestId('live-people-list')).getByText('كريم')).toBeInTheDocument()
    expect(within(screen.getByTestId('live-people-list')).queryByText('سعد')).toBeNull()
    fireEvent.click(screen.getByTestId('live-filter-manager'))
    expect(within(screen.getByTestId('live-people-list')).getByText('سعد')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('live-filter-all'))
    fireEvent.change(screen.getByTestId('live-search'), { target: { value: 'كريم' } })
    expect(screen.getAllByTestId('live-marker')).toHaveLength(1)
  })
  it('القائمة تربط كل شخص بزونه وتُظهر داخل/خارج الزون؛ لوحة الزونات تُظهر المُسنَدين ومن يبث', async () => {
    wrap(<OpsLiveTrackingPage />)
    const list = await screen.findByTestId('live-people-list')
    await waitFor(() => expect(within(list).getByTestId('live-row-c1')).toBeInTheDocument())
    expect(within(list).getByTestId('live-row-c1').textContent).toContain('خارج الزون')
    expect(within(list).getByTestId('live-row-c1').textContent).toContain('زون الكرادة')
    expect(within(list).getByTestId('live-row-m1').textContent).toContain('داخل الزون')
    fireEvent.click(screen.getByTestId('live-row-m1'))
    expect(screen.getByTestId('live-row-m1')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByTestId('live-panel-zones'))
    const z1 = screen.getByTestId('live-zone-z1')
    expect(z1.textContent).toContain('2 / 2 يبث'); expect(z1.textContent).toContain('سعد'); expect(z1.textContent).toContain('كريم')
    expect(screen.getByTestId('live-zone-z2').textContent).toContain('0 / 0 يبث')
  })
  it('بدون بث: رسالة واضحة على الخريطة وزر التحديث يعيد الجلب', async () => {
    mapCurrent.mockResolvedValue([])
    wrap(<OpsLiveTrackingPage />)
    expect(await screen.findByTestId('live-map-empty')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('live-refresh'))
    await waitFor(() => expect(mapCurrent).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByTestId('live-toggle-zones'))
    expect(screen.queryAllByTestId('live-zone')).toHaveLength(0)
  })
})
