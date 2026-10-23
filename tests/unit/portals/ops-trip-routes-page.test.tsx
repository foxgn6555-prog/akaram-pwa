/** اختبارات صفحة مسارات الانطلاقيات — القائمة والفلاتر (00343). */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const h = vi.hoisted(() => ({ rows: [] as unknown[], summary: {} as Record<string, unknown>, total: 0, args: [] as unknown[], pull: vi.fn(), toasts: [] as unknown[], mapClick: null as null | ((e: { latlng: { lat: number; lng: number } }) => void) }))
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Polygon: () => <div data-testid="map-zone" />,
  Circle: ({ radius }: { radius: number }) => <div data-testid="map-circle" data-radius={radius} />,
  useMapEvents: (handlers: { click: (e: { latlng: { lat: number; lng: number } }) => void }) => { h.mapClick = handlers.click; return null },
}))
vi.mock('@features/gps-lvn/hooks', () => ({
  useTripRoutesList: (...a: unknown[]) => { h.args = a; return { data: { rows: h.rows, summary: h.summary, total: h.total, limit: 50, offset: 0 }, isLoading: false, isError: false, isFetching: false } },
  useTripRoutesFilterOptions: () => ({ data: {
    sectors: [{ id: 1, name: 'الكرادة' }, { id: 2, name: 'الزعفرانية' }],
    vehicles: [{ id: 'v1', name: 'كابسة', db_number: '101', plate_number: 'P1', sector_id: 1, has_gps: true }, { id: 'v2', name: 'شفل', db_number: '202', plate_number: 'P2', sector_id: 2, has_gps: false }],
    zones: [{ id: 'z1', name: 'زون الكراج', source: 'platform', color: '#0f0' }],
    landmarks: [{ id: 'l1', name: 'ورشة الصيانة', category: 'maintenance', lat: 33.3, lng: 44.4, color: '#f00' }],
    stations: [{ id: 's1', name: 'المحطة التحويلية', geofence_id: 'z2' }],
    shifts: ['morning', 'evening'],
  } }),
  useGpsMapGeofences: () => ({ data: [{ id: 'z1', name: 'زون', source: 'platform', color: '#0f0', polygon: [{ lat: 33.3, lng: 44.4 }, { lat: 33.31, lng: 44.4 }, { lat: 33.31, lng: 44.41 }] }] }),
  usePullTripRouteNow: () => ({ mutate: h.pull, isPending: false, variables: undefined }),
}))
vi.mock('@stores/ui.store', () => ({ useUiStore: (sel: (s: { addToast: (t: unknown) => void }) => unknown) => sel({ addToast: (t) => h.toasts.push(t) }) }))
import TripRoutesPage, { placeLabel, toRpcFilters } from '@portals/ops-room/pages/Gps/TripRoutesPage'

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad' }).format(new Date())
const row = (o: Record<string, unknown>) => ({
  departure_id: 'd1', vehicle_id: 'v1', vehicle_name: 'كابسة', db_number: '101', plate_number: 'P1', vehicle_category: null, driver_name: 'علي', shift: 'morning', sector_id: 1, sector_name: 'الكرادة',
  departed_at: `${today}T05:00:00.000Z`, returned_at: `${today}T07:00:00.000Z`, site_arrived_at: null, site_departed_at: null, status: 'complete', is_final: true, distance_m: 12345, moving_seconds: 3600, stopped_seconds: 1800,
  max_speed_kmh: 63.4, avg_speed_kmh: 20, stops_count: 3, gaps_count: 1, gap_seconds: 660, points_kept: 400, points_rejected: 2, first_fix: null, last_fix: null, pulled_at: `${today}T07:10:00.000Z`, next_pull_at: null,
  error_code: null, device_id: 'dv', legs_count: 2, last_destination: 'garage', last_leg_arrived: true, trip_seconds: 7200, from_lat: 33.3, from_lng: 44.4, from_address: 'الكراج المركزي', to_lat: 33.4, to_lng: 44.4, to_address: 'المحطة', ...o,
})
beforeEach(() => {
  h.pull.mockReset(); h.toasts = []; h.mapClick = null
  h.rows = [row({}), row({ departure_id: 'd2', returned_at: null, status: 'partial', is_final: false, db_number: '102', gaps_count: 0, legs_count: 0, site_arrived_at: null }), row({ departure_id: 'd3', status: 'no_device', points_kept: 0, distance_m: 0, stops_count: 0, gaps_count: 0, db_number: '202' })]
  h.summary = { total: 3, distance_m: 24690, stops: 6, gaps: 1, open: 1, complete: 1, partial: 1, no_device: 1, pending: 0, empty: 0, moving_seconds: 0, stopped_seconds: 0, max_speed_kmh: 63.4 }
  h.total = 3
})
const ui = () => render(<MemoryRouter><TripRoutesPage /></MemoryRouter>)

describe('TripRoutesPage (00343)', () => {
  it('يعرض الملخص والصفوف بالحالة والمسافة والتوقفات والانقطاع ومن←إلى', () => {
    ui()
    expect(screen.getByTestId('tr-st-total').textContent).toContain('3')
    expect(screen.getByTestId('tr-st-open').textContent).toContain('1')
    expect(screen.getByTestId('tr-st-km').textContent).toContain('25')
    expect(screen.getByTestId('tr-st-nodev').textContent).toContain('1')
    const r1 = screen.getByTestId('tr-row-d1')
    expect(r1.textContent).toContain('DB 101')
    expect(r1.textContent).toContain('12')
    expect(r1.textContent).toContain('2س 0د')
    expect(r1.textContent).toContain('1 (11د)')
    expect(r1.textContent).toContain('63 km/h')
    expect(r1.textContent).toContain('الكراج المركزي')
    expect(r1.textContent).toContain('2 مرحلة · وصلت الكراج')
    expect(screen.getByTestId('tr-status-d1').textContent).toBe('مكتمل')
    expect(screen.getByTestId('tr-status-d2').textContent).toBe('جارٍ (مفتوحة)')
    expect(screen.getByTestId('tr-row-d2').textContent).toContain('كراج ← موقع العمل')
    expect(screen.getByTestId('tr-status-d3').textContent).toBe('بلا جهاز')
    // المكتمل النهائي لا زر سحب؛ المفتوح له؛ بلا جهاز لا زر
    expect(screen.queryByTestId('tr-pull-d1')).toBeNull()
    expect(screen.getByTestId('tr-pull-d2')).toBeTruthy()
    expect(screen.queryByTestId('tr-pull-d3')).toBeNull()
  })
  it('الافتراضي: آخر 7 أيام حتى اليوم، تحديث تلقائي، والفلاتر تُرسل فقط عند «تطبيق» وبصيغة RPC النظيفة', () => {
    ui()
    const first = h.args[0] as Record<string, unknown>
    expect(first.date_to).toBe(today)
    expect(Object.keys(first).sort()).toEqual(['date_from', 'date_to'])
    expect(h.args[3]).toBe(true)
    expect(screen.getByTestId('tr-live')).toBeTruthy()
    fireEvent.change(screen.getByTestId('tr-f-sector'), { target: { value: '1' } })
    fireEvent.change(screen.getByTestId('tr-f-trip'), { target: { value: 'open' } })
    fireEvent.change(screen.getByTestId('tr-f-order'), { target: { value: 'distance_desc' } })
    fireEvent.change(screen.getByTestId('tr-f-search'), { target: { value: ' 101 ' } })
    // لم يُطبَّق بعد
    expect((h.args[0] as Record<string, unknown>).sector_id).toBeUndefined()
    fireEvent.click(screen.getByTestId('tr-apply'))
    const f = h.args[0] as Record<string, unknown>
    expect(f).toMatchObject({ sector_id: 1, trip: 'open', order: 'distance_desc', search: '101' })
    expect(screen.getByTestId('tr-active-count').textContent).toBe('4 فلتر فعّال')
    // المركبات تُصفّى بالقاطع المختار
    const vehicleOptions = Array.from((screen.getByTestId('tr-f-vehicle') as HTMLSelectElement).options).map((o) => o.text)
    expect(vehicleOptions).toEqual(['الكل', 'DB 101 — كابسة'])
    fireEvent.click(screen.getByTestId('tr-reset'))
    expect(Object.keys(h.args[0] as object).sort()).toEqual(['date_from', 'date_to'])
  })
  it('فلاتر المكان: زون من، وجهة محطة إلى، معلم بنصف قطر، ودائرة تُحدَّد بالنقر على الخريطة', () => {
    ui()
    fireEvent.change(screen.getByTestId('tr-f-fromplace-kind'), { target: { value: 'zone' } })
    fireEvent.change(screen.getByTestId('tr-f-fromplace-id'), { target: { value: 'z1' } })
    expect(screen.getByTestId('tr-f-fromplace-label').textContent).toBe('زون الكراج')
    fireEvent.change(screen.getByTestId('tr-f-toplace-kind'), { target: { value: 'station' } })
    fireEvent.change(screen.getByTestId('tr-f-toplace-id'), { target: { value: 's1' } })
    fireEvent.change(screen.getByTestId('tr-f-viaplace-kind'), { target: { value: 'circle' } })
    expect(screen.getByTestId('tr-f-viaplace-label').textContent).toBe('انقر على الخريطة لتحديد المركز')
    expect(screen.getByTestId('tr-f-viaplace-map')).toBeTruthy()
    // قبل النقر: الدائرة غير مكتملة ⇒ لا تُرسل
    fireEvent.click(screen.getByTestId('tr-apply'))
    let f = h.args[0] as Record<string, unknown>
    expect(f.from_place).toEqual({ kind: 'zone', id: 'z1', lat: undefined, lng: undefined, radius_m: undefined })
    expect(f.to_place).toMatchObject({ kind: 'station', id: 's1' })
    expect(f.via_place).toBeUndefined()
    act(() => h.mapClick?.({ latlng: { lat: 33.3456789, lng: 44.4 } }))
    fireEvent.change(screen.getByTestId('tr-f-viaplace-radius'), { target: { value: '500' } })
    expect(screen.getByTestId('map-circle').getAttribute('data-radius')).toBe('500')
    expect(screen.getByTestId('tr-f-viaplace-label').textContent).toBe('دائرة 500 م عند 33.3457, 44.4000')
    fireEvent.click(screen.getByTestId('tr-apply'))
    f = h.args[0] as Record<string, unknown>
    expect(f.via_place).toEqual({ kind: 'circle', id: undefined, lat: 33.345679, lng: 44.4, radius_m: 500 })
    // معلم بنصف قطر افتراضي 200
    fireEvent.change(screen.getByTestId('tr-f-toplace-kind'), { target: { value: 'landmark' } })
    fireEvent.change(screen.getByTestId('tr-f-toplace-id'), { target: { value: 'l1' } })
    expect(screen.getByTestId('tr-f-toplace-label').textContent).toBe('ورشة الصيانة')
    fireEvent.click(screen.getByTestId('tr-apply'))
    expect((h.args[0] as Record<string, unknown>).to_place).toMatchObject({ kind: 'landmark', id: 'l1', radius_m: 200 })
    // «أي مكان» يلغي
    fireEvent.change(screen.getByTestId('tr-f-fromplace-kind'), { target: { value: '' } })
    fireEvent.click(screen.getByTestId('tr-apply'))
    expect((h.args[0] as Record<string, unknown>).from_place).toBeUndefined()
  })
  it('الفلاتر الإضافية والترقيم', () => {
    h.total = 120
    ui()
    expect(screen.queryByTestId('tr-more')).toBeNull()
    fireEvent.click(screen.getByTestId('tr-more-toggle'))
    fireEvent.change(screen.getByTestId('tr-f-gaps'), { target: { value: '1' } })
    fireEvent.change(screen.getByTestId('tr-f-minstops'), { target: { value: '2' } })
    fireEvent.change(screen.getByTestId('tr-f-minkm'), { target: { value: '5' } })
    fireEvent.change(screen.getByTestId('tr-f-shift'), { target: { value: 'evening' } })
    fireEvent.change(screen.getByTestId('tr-f-driver'), { target: { value: 'علي' } })
    fireEvent.click(screen.getByTestId('tr-apply'))
    expect(h.args[0]).toMatchObject({ has_gaps: true, min_stops: 2, min_km: 5, shift: 'evening', driver: 'علي' })
    expect(screen.getByTestId('tr-pager').textContent).toContain('1 / 3')
    expect((screen.getByTestId('tr-prev') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByTestId('tr-next'))
    expect(h.args[2]).toBe(50)
    expect(screen.getByTestId('tr-pager').textContent).toContain('2 / 3')
    // تغيير الفلاتر يعيد إلى الصفحة الأولى
    fireEvent.click(screen.getByTestId('tr-apply'))
    expect(h.args[2]).toBe(0)
  })
  it('«سحب الآن» يستدعي الدالة ويُظهر نتيجة أو رمز الخطأ المترجم', async () => {
    ui()
    fireEvent.click(screen.getByTestId('tr-pull-d2'))
    expect(h.pull).toHaveBeenCalledWith('d2', expect.any(Object))
    const opts = h.pull.mock.calls[0]?.[1] as { onSuccess: (r: unknown) => void; onError: (e: unknown) => void }
    opts.onSuccess({ ok: true, points: 88, final: false })
    opts.onError(Object.assign(new Error('TRIP_ROUTE_NO_DEVICE'), { code: 'TRIP_ROUTE_NO_DEVICE' }))
    await waitFor(() => expect(h.toasts).toHaveLength(2))
    expect((h.toasts[0] as { message: string }).message).toContain('88 نقطة')
    expect((h.toasts[1] as { message: string }).message).toContain('بلا جهاز GPS')
  })
  it('toRpcFilters/placeLabel: ينظّف الفارغ ويحذف الدائرة غير المكتملة والمكان بلا معرّف', () => {
    expect(toRpcFilters({ date_from: '', search: '  ', sector_id: null, has_gaps: null, order: 'departed_desc', from_place: { kind: 'zone' }, via_place: { kind: 'circle', radius_m: 300 } })).toEqual({})
    expect(toRpcFilters({ has_gaps: false, order: 'stops_desc', to_place: { kind: 'circle', lat: 1, lng: 2, radius_m: 50, label: 'x' } })).toEqual({ has_gaps: false, order: 'stops_desc', to_place: { kind: 'circle', id: undefined, lat: 1, lng: 2, radius_m: 50 } })
    expect(placeLabel(null)).toBe('')
    expect(placeLabel({ kind: 'zone', id: 'zz' }, undefined)).toBe('')
  })
})
