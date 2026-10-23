/** اختبارات خريطة مسار الانطلاقية (00344): الطبقات، التلوين بالسرعة، الأسهم، التوقفات، المراحل، التشغيل، المقارنة، السحب. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'

const h = vi.hoisted(() => ({ exp: { excel: vi.fn(), pdf: vi.fn(), kml: vi.fn(), gpx: vi.fn(), print: vi.fn(), capture: vi.fn(), fetch: vi.fn() }, detail: null as unknown, compare: null as unknown, ids: [] as unknown[], pull: vi.fn(), toasts: [] as unknown[], fly: [] as unknown[], fit: [] as unknown[], listRows: [] as unknown[], inv: [] as unknown[], invSave: vi.fn() }))
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div data-testid="map" className="leaflet-container">{children}</div>,
  TileLayer: () => null,
  Marker: ({ children, icon }: { children?: ReactNode; icon: { html: string } }) => <div data-testid="marker" data-html={icon.html}>{children}</div>,
  Polyline: ({ pathOptions }: { pathOptions: { color: string; dashArray?: string } }) => <div data-testid="polyline" data-color={pathOptions.color} data-dash={pathOptions.dashArray ?? ''} />,
  Polygon: () => <div data-testid="zone" />,
  Circle: ({ radius }: { radius: number }) => <div data-testid="heat" data-radius={radius} />,
  CircleMarker: ({ children }: { children: ReactNode }) => <div data-testid="point">{children}</div>,
  Popup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useMap: () => ({ fitBounds: (b: unknown) => h.fit.push(b), setView: () => undefined, flyTo: (t: unknown) => h.fly.push(t), getZoom: () => 13 }),
}))
vi.mock('leaflet', () => ({ default: { divIcon: (o: { html: string }) => ({ html: o.html }), latLngBounds: (p: unknown) => p } }))
vi.mock('@features/gps-lvn/hooks', () => ({
  useTripRoute: (id: string | null) => { h.ids.push(id); return !id ? { data: undefined, isLoading: false, isError: false } : id === 'cmp' ? { data: h.compare, isLoading: false, isError: false } : { data: h.detail, isLoading: false, isError: !h.detail } },
  useGpsMapGeofences: () => ({ data: [{ id: 'z1', name: 'زون', color: '#0f0', polygon: [{ lat: 33.3, lng: 44.4 }, { lat: 33.31, lng: 44.4 }, { lat: 33.31, lng: 44.41 }] }] }),
  usePullTripRouteNow: () => ({ mutate: h.pull, isPending: false }),
  useTripRoutesList: () => ({ data: { rows: h.listRows, total: h.listRows.length, summary: {} } }),
  useGpsTripInvestigations: () => ({ data: h.inv }),
  useGpsTripInvestigationSave: () => ({ mutate: h.invSave, isPending: false }),
}))
vi.mock('@features/gps-lvn/trip-route-export', () => ({
  exportTripRouteExcel: h.exp.excel, exportTripRoutePdf: h.exp.pdf, downloadTripRouteKml: h.exp.kml, downloadTripRouteGpx: h.exp.gpx, printTripRoute: h.exp.print, captureElementPng: h.exp.capture,
  tripTitle: () => 'DB 1 — كابسة · علي', summaryRows: () => [{ metric: 'المركبة', value: 'كابسة' }], fmtDateTime: (v: string | null) => v ?? '—', fmtTime: (v: string | null) => v ?? '—', fmtDur: (s: number) => `${s} ث`,
}))
vi.mock('@sdk/gps-lvn.sdk', () => ({ gpsLvn: { tripRoute: h.exp.fetch } }))
vi.mock('@stores/ui.store', () => ({ useUiStore: (sel: (s: { addToast: (t: unknown) => void }) => unknown) => sel({ addToast: (t) => h.toasts.push(t) }) }))
import TripRouteMapPage, { speedColor, stopRadius } from '@portals/ops-room/pages/Gps/TripRouteMapPage'

const T0 = Date.parse('2026-10-20T05:00:00Z')
const pt = (seq: number, o: Record<string, unknown> = {}) => ({ seq, leg_id: seq > 10 ? 'L1' : null, t: new Date(T0 + seq * 30000).toISOString(), lat: 33.3 + seq * 0.001, lng: 44.4, speed: seq < 5 ? 20 : seq < 8 ? 45 : seq < 10 ? 70 : 100, course: 0, address: seq === 1 ? 'الكراج' : null, dist_m: 111, seconds: 30, state: 'moving', ...o })
const detail = (o: Record<string, unknown> = {}) => ({
  departure_id: 'd1', status: 'partial', is_final: false, device_id: 'dv', range_from: new Date(T0).toISOString(), range_to: null, points_source: 22, points_kept: 20, points_rejected: 2, points_returned: 20, downsample_step: 1,
  distance_m: 2200, moving_seconds: 540, stopped_seconds: 60, max_speed_kmh: 100, avg_speed_kmh: 14.7, stops_count: 1, gaps_count: 1, gap_seconds: 600, first_fix: new Date(T0 + 30000).toISOString(), last_fix: new Date(T0 + 600000).toISOString(),
  pulled_at: new Date(T0 + 700000).toISOString(), next_pull_at: null, pull_count: 3, error_code: null,
  legs: [{ leg_id: 'L1', sequence_no: 1, origin_type: 'work_site', destination_type: 'transfer_station', departed_at: new Date(T0 + 330000).toISOString(), arrived_at: new Date(T0 + 600000).toISOString(), points: 10, distance_m: 1100, moving_seconds: 270, stopped_seconds: 0, max_speed_kmh: 100, avg_speed_kmh: 14, stops_count: 0, gaps_count: 1, first_fix: null, last_fix: null }],
  stops: [{ id: 1, seq: 1, leg_id: null, started_at: new Date(T0 + 150000).toISOString(), ended_at: new Date(T0 + 330000).toISOString(), duration_seconds: 180, lat: 33.305, lng: 44.4, address: 'الكرادة / شارع 62', address_source: 'lvn', geofence_id: 'z1', geofence_name: 'زون المحطة' }],
  gaps: [{ seq: 1, leg_id: 'L1', started_at: new Date(T0 + 400000).toISOString(), ended_at: new Date(T0 + 1000000).toISOString(), seconds: 600, from_lat: 33.31, from_lng: 44.4, to_lat: 33.312, to_lng: 44.4 }],
  points: Array.from({ length: 20 }, (_, i) => pt(i + 1, i + 1 === 12 ? { state: 'gap' } : i + 1 === 6 ? { state: 'stopped', speed: 0 } : {})),
  ...o,
})
beforeEach(() => { Object.values(h.exp).forEach((f) => f.mockReset()); h.exp.fetch.mockResolvedValue({ full: true }); h.exp.capture.mockResolvedValue('data:image/png;base64,MAP'); h.detail = detail(); h.compare = null; h.ids = []; h.pull.mockReset(); h.toasts = []; h.fly = []; h.fit = []; h.listRows = []; h.inv = []; h.invSave.mockReset() })
afterEach(() => vi.useRealTimers())
const ui = (search = '') => render(<MemoryRouter initialEntries={[`/ops-room/gps?view=trips&trip=d1${search ? `&${search.replace(/^\?/, '')}` : ''}`]}><Routes><Route path="/ops-room/gps" element={<TripRouteMapPage />} /></Routes></MemoryRouter>)

describe('TripRouteMapPage (00344)', () => {
  it('الملخص، الخط ملوّن بالسرعة مقطعاً مقطعاً مع الانقطاع متقطّعاً، والطبقات تُبدَّل', () => {
    ui()
    expect(screen.getByTestId('trm-summary').textContent).toContain('جارٍ (مفتوحة) · يُحدَّث · 2.2 كم · حركة 9د · توقف 1د · 1 توقف · 1 انقطاع (10د) · أقصى سرعة 100')
    // 19 مقطع سرعة + 1 خط انقطاع (طبقة الانقطاعات)
    const lines = screen.getAllByTestId('polyline')
    expect(lines).toHaveLength(20)
    const colors = lines.map((l) => l.getAttribute('data-color'))
    expect(colors).toContain('#16a34a'); expect(colors).toContain('#eab308'); expect(colors).toContain('#f97316'); expect(colors).toContain('#dc2626'); expect(colors).toContain('#94a3b8')
    expect(lines.filter((l) => l.getAttribute('data-dash') === '6 8')).toHaveLength(1)
    expect(h.fit).toHaveLength(1)
    // إيقاف تلوين السرعة ⇒ خط واحد (+ الانقطاع)
    fireEvent.click(screen.getByTestId('trm-layer-speed'))
    expect(screen.getAllByTestId('polyline')).toHaveLength(2)
    fireEvent.click(screen.getByTestId('trm-layer-gaps'))
    expect(screen.getAllByTestId('polyline')).toHaveLength(1)
    // الزونات
    expect(screen.getAllByTestId('zone')).toHaveLength(1)
    fireEvent.click(screen.getByTestId('trm-layer-zones'))
    expect(screen.queryAllByTestId('zone')).toHaveLength(0)
    // كل النقاط (مخفية افتراضياً) مع نافذة العنوان/الوقت/السرعة
    expect(screen.queryAllByTestId('point')).toHaveLength(0)
    fireEvent.click(screen.getByTestId('trm-layer-points'))
    const points = screen.getAllByTestId('point')
    expect(points).toHaveLength(20)
    expect(points[0]?.textContent).toContain('نقطة #1'); expect(points[0]?.textContent).toContain('الكراج'); expect(points[0]?.textContent).toContain('20 km/h')
    // الحرارة
    fireEvent.click(screen.getByTestId('trm-layer-heat'))
    expect(screen.getByTestId('heat').getAttribute('data-radius')).toBe(String(stopRadius(180)))
  })
  it('التوقفات المرقّمة بمدّتها وعنوانها، وأسهم الاتجاه، وعلامات المراحل', () => {
    ui()
    const markers = screen.getAllByTestId('marker')
    const htmls = markers.map((m) => m.getAttribute('data-html') ?? '')
    // توقف رقم 1
    const stop = markers.find((m) => (m.getAttribute('data-html') ?? '').includes('>1</div>') && (m.getAttribute('data-html') ?? '').includes('#dc2626'))
    expect(stop?.textContent).toContain('توقف #1 · 3د')
    expect(stop?.textContent).toContain('الكرادة / شارع 62')
    expect(stop?.textContent).toContain('داخل زون: زون المحطة')
    // أسهم: نقاط متحركة فقط
    expect(htmls.filter((x) => x.includes('➤')).length).toBeGreaterThan(10)
    // مراحل: انطلاق + بداية المقطع 1 + وصوله (نهائي لا — المسار غير نهائي فلا «النهاية»)
    expect(htmls.some((x) => x.includes('انطلاق'))).toBe(true)
    expect(htmls.some((x) => x.includes('1 ↗ المحطة التحويلية'))).toBe(true)
    expect(htmls.some((x) => x.includes('1 ✓ المحطة التحويلية'))).toBe(true)
    expect(htmls.some((x) => x.includes('النهاية'))).toBe(false)
    fireEvent.click(screen.getByTestId('trm-layer-arrows'))
    expect(screen.getAllByTestId('marker').map((m) => m.getAttribute('data-html') ?? '').filter((x) => x.includes('➤'))).toHaveLength(0)
    // القائمة الجانبية: المراحل والتوقفات؛ النقر على توقف يطير إليه
    expect(screen.getByTestId('trm-legs').textContent).toContain('1 · موقع العمل ← المحطة التحويلية')
    expect(screen.getByTestId('trm-legs').textContent).toContain('0 · الكراج ← موقع العمل')
    fireEvent.click(screen.getByTestId('trm-stop-1'))
    expect(h.fly).toEqual([[33.305, 44.4]])
    expect(screen.getByTestId('trm-gaps').textContent).toContain('10د')
  })
  it('تشغيل الزمن يحرّك علامة المركبة نقطة بعد نقطة حسب سرعة التشغيل', () => {
    vi.useFakeTimers()
    ui()
    expect(screen.getByTestId('trm-play-time').textContent).toBe('—')
    fireEvent.click(screen.getByTestId('trm-play-btn'))
    expect(screen.getByTestId('trm-play-time').textContent).toContain('20 km/h')
    // 30 ث حقيقية ÷ ×10 = 3 ث
    act(() => { vi.advanceTimersByTime(3100) })
    expect((screen.getByTestId('trm-play-range') as HTMLInputElement).value).toBe('1')
    fireEvent.change(screen.getByTestId('trm-play-speed'), { target: { value: '60' } })
    act(() => { vi.advanceTimersByTime(600) })
    expect((screen.getByTestId('trm-play-range') as HTMLInputElement).value).toBe('2')
    // إيقاف ثم سحب المؤشر يدوياً
    fireEvent.click(screen.getByTestId('trm-play-btn'))
    fireEvent.change(screen.getByTestId('trm-play-range'), { target: { value: '15' } })
    act(() => { vi.advanceTimersByTime(5000) })
    expect((screen.getByTestId('trm-play-range') as HTMLInputElement).value).toBe('15')
  })
  it('المقارنة: اختيار مسار آخر يضيفه إلى الرابط ويرسمه بنفسجياً مع صندوق الفرق، والإلغاء يزيله', () => {
    h.listRows = [{ departure_id: 'cmp', db_number: '7', driver_name: 'حسن', departed_at: new Date(T0).toISOString(), distance_m: 3000, stops_count: 2, points_kept: 5 }, { departure_id: 'd1', db_number: '1', driver_name: 'x', departed_at: new Date(T0).toISOString(), distance_m: 1, stops_count: 0, points_kept: 5 }, { departure_id: 'nop', db_number: '2', driver_name: 'y', departed_at: new Date(T0).toISOString(), distance_m: 1, stops_count: 0, points_kept: 0 }]
    h.compare = detail({ departure_id: 'cmp', distance_m: 3000, stops_count: 2, moving_seconds: 900, stopped_seconds: 0, points: Array.from({ length: 5 }, (_, i) => pt(i + 1, { lng: 44.5 })), stops: [{ id: 9, seq: 1, leg_id: null, started_at: new Date(T0).toISOString(), ended_at: new Date(T0 + 60000).toISOString(), duration_seconds: 60, lat: 33.3, lng: 44.5, address: null, address_source: null, geofence_id: null, geofence_name: null }] })
    ui()
    expect(screen.queryByTestId('trm-compare-box')).toBeNull()
    fireEvent.click(screen.getByTestId('trm-compare-toggle'))
    const picker = screen.getByTestId('trm-compare-picker')
    expect(picker.querySelectorAll('button')).toHaveLength(1)   // الحالية ومن بلا نقاط مستبعدتان
    fireEvent.click(screen.getByTestId('trm-cmp-cmp'))
    expect(h.ids).toContain('cmp')
    expect(screen.getByTestId('trm-compare-box').textContent).toContain('3.0 كم · 2 توقف')
    expect(screen.getByTestId('trm-compare-box').textContent).toContain('الفرق: -0.8 كم · -5 دقيقة')
    expect(screen.getAllByTestId('polyline').some((l) => l.getAttribute('data-color') === '#7c3aed')).toBe(true)
    expect(screen.getAllByTestId('marker').some((m) => (m.getAttribute('data-html') ?? '').includes('#7c3aed') && (m.getAttribute('data-html') ?? '').includes('>1</div>'))).toBe(true)
    fireEvent.click(screen.getByTestId('trm-compare-clear'))
    expect(screen.queryByTestId('trm-compare-box')).toBeNull()
  })
  it('«سحب الآن» يظهر لغير النهائي فقط؛ النهائي المكتمل بلا زر؛ بلا نقاط ⇒ حالة فارغة؛ ملء الشاشة', () => {
    const { unmount } = ui()
    fireEvent.click(screen.getByTestId('trm-pull'))
    expect(h.pull).toHaveBeenCalledWith('d1', expect.any(Object))
    fireEvent.click(screen.getByTestId('trm-full'))
    expect(screen.getByTestId('trip-route-map-page').className).toContain('fixed')
    unmount()
    h.detail = detail({ status: 'complete', is_final: true })
    const r2 = ui()
    expect(screen.queryByTestId('trm-pull')).toBeNull()
    expect(screen.getAllByTestId('marker').some((m) => (m.getAttribute('data-html') ?? '').includes('النهاية'))).toBe(true)
    r2.unmount()
    h.detail = detail({ status: 'no_device', points: [], stops: [], gaps: [], legs: [] })
    ui()
    expect(screen.queryByTestId('map')).toBeNull()
    expect(screen.getByText('لا نقاط لهذا المسار بعد')).toBeTruthy()
    expect(screen.queryByTestId('trm-play')).toBeNull()
  })
  it('speedColor/stopRadius', () => {
    expect([speedColor(0), speedColor(10), speedColor(45), speedColor(75), speedColor(120), speedColor(null)]).toEqual(['#94a3b8', '#16a34a', '#eab308', '#f97316', '#dc2626', '#94a3b8'])
    expect(stopRadius(60)).toBe(18); expect(stopRadius(36000)).toBe(60)
  })
  it('00345: قائمة التصدير — Excel يجلب كل النقاط، KML/GPX مباشرة، PDF/طباعة تلتقطان الخريطة وتضعانها في ورقة التقرير', async () => {
    ui()
    expect(screen.queryByTestId('trm-export-menu')).toBeNull()
    fireEvent.click(screen.getByTestId('trm-export-toggle'))
    expect(screen.getByTestId('trm-export-menu').querySelectorAll('button')).toHaveLength(5)
    fireEvent.click(screen.getByTestId('trm-export-excel'))
    await waitFor(() => expect(h.exp.excel).toHaveBeenCalledWith({ full: true }))
    expect(h.exp.fetch).toHaveBeenCalledWith('d1', 200000)
    expect(screen.queryByTestId('trm-export-menu')).toBeNull()
    fireEvent.click(screen.getByTestId('trm-export-toggle')); fireEvent.click(screen.getByTestId('trm-export-kml'))
    await waitFor(() => expect(h.exp.kml).toHaveBeenCalled())
    fireEvent.click(screen.getByTestId('trm-export-toggle')); fireEvent.click(screen.getByTestId('trm-export-gpx'))
    await waitFor(() => expect(h.exp.gpx).toHaveBeenCalled())
    // ورقة التقرير موجودة خارج الشاشة بلا صورة قبل الالتقاط
    expect(screen.getByTestId('trip-report-sheet')).toBeTruthy()
    expect(screen.queryByTestId('trip-report-map')).toBeNull()
    fireEvent.click(screen.getByTestId('trm-export-toggle')); fireEvent.click(screen.getByTestId('trm-export-pdf'))
    await waitFor(() => expect(h.exp.pdf).toHaveBeenCalled())
    expect(h.exp.pdf.mock.calls[0]![0]).toBe(screen.getByTestId('trip-report-sheet'))
    expect((screen.getByTestId('trip-report-map') as HTMLImageElement).getAttribute('src')).toBe('data:image/png;base64,MAP')
    expect(screen.getByTestId('trip-report-legs').textContent).toContain('موقع العمل ← المحطة التحويلية')
    expect(screen.getByTestId('trip-report-stops').textContent).toContain('الكرادة / شارع 62')
    fireEvent.click(screen.getByTestId('trm-export-toggle')); fireEvent.click(screen.getByTestId('trm-export-print'))
    await waitFor(() => expect(h.exp.print).toHaveBeenCalledWith(screen.getByTestId('trip-report-sheet'), 'تقرير مسار انطلاقية — DB 1 — كابسة · علي'))
    expect(h.toasts.filter((t) => (t as { type: string }).type === 'success')).toHaveLength(5)
    // فشل ⇒ رسالة خطأ
    h.exp.kml.mockImplementationOnce(() => { throw new Error('X') })
    fireEvent.click(screen.getByTestId('trm-export-toggle')); fireEvent.click(screen.getByTestId('trm-export-kml'))
    await waitFor(() => expect((h.toasts.at(-1) as { message: string }).message).toContain('تعذّر التصدير: X'))
    h.exp.print.mockImplementationOnce(() => { throw new Error('POPUP_BLOCKED') })
    fireEvent.click(screen.getByTestId('trm-export-toggle')); fireEvent.click(screen.getByTestId('trm-export-print'))
    await waitFor(() => expect((h.toasts.at(-1) as { message: string }).message).toContain('منع النافذة المنبثقة'))
  })
  it('00346: التحقيقات انتقلت إلى صفحة الخريطة — زر «تحقيق» بجانب كل توقف/انقطاع يفتح نافذة الحفظ، والقائمة تعرض التحقيقات القائمة', () => {
    h.detail = detail()
    h.inv = [{ id: 'i1', event_type: 'gap', event_at: new Date(T0 + 400000).toISOString(), note: 'انقطاع طويل قرب المحطة', status: 'open', assigned_to: null, created_by: 'u1', actor_name: 'مشرف', created_at: new Date(T0).toISOString(), updated_at: new Date(T0).toISOString() }]
    ui()
    expect(screen.getByTestId('trm-investigations')).toHaveTextContent('التحقيقات (1)')
    expect(screen.getByTestId('trm-inv-i1')).toHaveTextContent('انقطاع طويل قرب المحطة')
    // توقف بلا تحقيق ⇒ نافذة جديدة
    fireEvent.click(screen.getByTestId('trm-inv-stop-1'))
    const modal = screen.getByTestId('trm-inv-modal')
    expect(modal).toHaveTextContent('توقف #1')
    expect(screen.getByTestId('trm-inv-save')).toBeDisabled()
    fireEvent.change(screen.getByTestId('trm-inv-note'), { target: { value: 'لماذا توقفت هنا؟' } })
    fireEvent.change(screen.getByTestId('trm-inv-status'), { target: { value: 'in_review' } })
    fireEvent.click(screen.getByTestId('trm-inv-save'))
    expect(h.invSave).toHaveBeenCalledWith(expect.objectContaining({ id: undefined, departureId: 'd1', eventType: 'stop', eventAt: h.detail && (h.detail as { stops: { started_at: string }[] }).stops[0]!.started_at, note: 'لماذا توقفت هنا؟', status: 'in_review' }), expect.anything())
    // انقطاع له تحقيق قائم ⇒ تحديث بنفس المعرّف
    fireEvent.click(screen.getByTestId('trm-inv-gap-1'))
    expect(screen.getByTestId('trm-inv-save')).toHaveTextContent('تحديث')
    fireEvent.click(screen.getByTestId('trm-inv-save'))
    expect(h.invSave).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'i1', eventType: 'gap' }), expect.anything())
  })
})
