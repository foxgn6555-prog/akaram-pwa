/** 00345 — تصدير مسار الانطلاقية: الملخص، Excel (5 أوراق)، KML، GPX، أسماء الملفات. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ excel: vi.fn(), blobs: [] as { name: string; type: string }[] }))
vi.mock('@lib/export/excel-report', () => ({ buildExcelReport: h.excel }))
vi.mock('@features/media/lib/design-export', () => ({ downloadBlob: (b: Blob, name: string) => h.blobs.push({ name, type: b.type }) }))
import { PRE_LEG_KEY, buildTripRouteGpx, buildTripRouteKml, downloadTripRouteGpx, downloadTripRouteKml, exportTripRouteExcel, filterTripRouteLegs, legKeyOf, summaryRows, tripFileBase } from '@features/gps-lvn/trip-route-export'
import type { TripRouteDetail } from '@sdk/gps-lvn.sdk'

const T0 = Date.parse('2026-10-20T05:00:00Z')
const d: TripRouteDetail = {
  departure_id: 'd1', status: 'complete', is_final: true, device_id: 'dv', range_from: new Date(T0).toISOString(), range_to: new Date(T0 + 3600000).toISOString(), points_source: 4, points_kept: 3, points_rejected: 1, points_returned: 3, downsample_step: 1,
  distance_m: 12345, moving_seconds: 3600, stopped_seconds: 1800, max_speed_kmh: 63.4, avg_speed_kmh: 12.3, stops_count: 1, gaps_count: 1, gap_seconds: 600, first_fix: new Date(T0).toISOString(), last_fix: new Date(T0 + 3600000).toISOString(), pulled_at: new Date(T0 + 4000000).toISOString(), next_pull_at: null, pull_count: 2, error_code: null,
  legs: [{ leg_id: 'L1', sequence_no: 1, origin_type: 'work_site', destination_type: 'transfer_station', departed_at: new Date(T0 + 600000).toISOString(), arrived_at: new Date(T0 + 1800000).toISOString(), points: 2, distance_m: 8000, moving_seconds: 1000, stopped_seconds: 200, max_speed_kmh: 63.4, avg_speed_kmh: 28.8, stops_count: 1, gaps_count: 0, first_fix: null, last_fix: null }],
  stops: [{ id: 5, seq: 1, leg_id: 'L1', started_at: new Date(T0 + 700000).toISOString(), ended_at: new Date(T0 + 1000000).toISOString(), duration_seconds: 300, lat: 33.32, lng: 44.42, address: 'الكرادة / شارع 62', address_source: 'lvn', geofence_id: 'z', geofence_name: 'زون <المحطة>' }],
  gaps: [{ seq: 1, leg_id: null, started_at: new Date(T0 + 100000).toISOString(), ended_at: new Date(T0 + 700000).toISOString(), seconds: 600, from_lat: 33.3, from_lng: 44.4, to_lat: 33.31, to_lng: 44.41 }],
  points: [
    { seq: 1, leg_id: null, t: new Date(T0).toISOString(), lat: 33.3, lng: 44.4, speed: 20, course: 90, address: 'الكراج', dist_m: 0, seconds: 0, state: 'moving' },
    { seq: 2, leg_id: 'L1', t: new Date(T0 + 700000).toISOString(), lat: 33.32, lng: 44.42, speed: 0, course: null, address: null, dist_m: 2900, seconds: 700, state: 'gap' },
    { seq: 3, leg_id: 'L1', t: new Date(T0 + 1800000).toISOString(), lat: 33.4, lng: 44.4, speed: 63.4, course: 10, address: null, dist_m: 9000, seconds: 1100, state: 'moving' },
  ],
  trip: { departure_id: 'd1', vehicle_id: 'v', vehicle_name: 'كابسة', db_number: '101', plate_number: 'P-1', vehicle_category: null, driver_name: 'علي حسن', shift: 'morning', sector_id: 1, sector_name: 'الكرادة', departed_at: new Date(T0 - 60000).toISOString(), site_arrived_at: new Date(T0 + 500000).toISOString(), site_departed_at: null, returned_at: new Date(T0 + 3700000).toISOString(), departed_by_name: 'ع', returned_by_name: 'ع', notes: null, device_name: 'جهاز 7', device_external_id: 'LVN-7' },
}
beforeEach(() => { h.excel.mockReset(); h.blobs = [] })

describe('trip-route-export (00345)', () => {
  it('الملخص يضم المركبة والسائق والجهاز والأوقات والمقاييس', () => {
    const rows = Object.fromEntries(summaryRows(d).map((r) => [r.metric, r.value]))
    expect(rows['المركبة']).toBe('كابسة (DB 101) · P-1')
    expect(rows['السائق']).toBe('علي حسن')
    expect(rows['القاطع / الشفت']).toBe('الكرادة / صباحي')
    expect(rows['جهاز GPS']).toBe('جهاز 7 (LVN-7)')
    expect(rows['المسافة المقطوعة (كم)']).toBe('12.35')
    expect(rows['زمن الحركة']).toBe('1 س 0 د')
    expect(rows['انقطاعات الإشارة']).toBe('1 (10 د)')
    expect(rows['السرعة القصوى / المتوسطة (كم/س)']).toBe('63 / 12')
    expect(rows['حالة المسار']).toBe('مكتمل (نهائي)')
    expect(rows['النقاط (محفوظة / مرفوضة بالتنظيف)']).toBe('3 / 1')
    expect(tripFileBase(d)).toBe('مسار-انطلاقية-DB101-2026-10-20')
  })
  it('Excel: ورقة ملخص + المراحل + التوقفات + الانقطاعات + النقاط بقالب المنصة', async () => {
    await exportTripRouteExcel(d)
    const o = h.excel.mock.calls[0]![0] as { sheetName: string; fileName: string; rows: { metric: string }[]; extraSheets: { sheetName: string; rows: Record<string, unknown>[]; columns: { header: string }[] }[] }
    expect(o.sheetName).toBe('الملخص'); expect(o.fileName).toBe('مسار-انطلاقية-DB101-2026-10-20.xlsx')
    expect(o.rows.length).toBeGreaterThan(10)
    expect(o.extraSheets.map((s) => s.sheetName)).toEqual(['المراحل', 'التوقفات', 'الانقطاعات', 'النقاط'])
    const legs = o.extraSheets[0]!.rows
    expect(legs[0]).toMatchObject({ n: 0, name: 'الكراج ← موقع العمل', pts: 1, gaps: 1 })
    expect(legs[1]).toMatchObject({ n: 1, name: 'موقع العمل ← المحطة التحويلية', km: 8, stops: 1, vmax: 63, pts: 2 })
    expect(o.extraSheets[1]!.rows[0]).toMatchObject({ seq: 1, leg: '1 · موقع العمل ← المحطة التحويلية', dur: '5 د', address: 'الكرادة / شارع 62', zone: 'زون <المحطة>', src: 'LVN', lat: 33.32 })
    expect(o.extraSheets[2]!.rows[0]).toMatchObject({ seq: 1, leg: '0 · الكراج ← موقع العمل', dur: '10 د' })
    const pts = o.extraSheets[3]!.rows
    expect(pts).toHaveLength(3)
    expect(pts[1]).toMatchObject({ seq: 2, state: 'بعد انقطاع', speed: 0, course: '', dist: 2900, secs: 700, address: '' })
    expect(o.extraSheets[3]!.columns.map((c) => c.header)).toContain('مسافة من السابقة (م)')
  })
  it('KML: خط المسار بإحداثيات lng,lat + توقفات مرقّمة + مراحل + بداية/نهاية، مع تهريب XML', () => {
    const k = buildTripRouteKml(d)
    expect(k).toContain('<coordinates>44.4,33.3,0 44.42,33.32,0 44.4,33.4,0</coordinates>')
    expect(k).toContain('<name>توقف 1 · 5 د</name>')
    expect(k).toContain('زون: زون &lt;المحطة&gt;')
    expect(k).toContain('<name>1 ↗ المحطة التحويلية</name>')
    expect(k).toContain('1 ✓ المحطة التحويلية')
    expect(k).toContain('<name>الانطلاق ')
    expect(k).toContain('<name>النهاية ')
    expect(k).toContain('المسافة المقطوعة (كم): 12.35')
    downloadTripRouteKml(d)
    expect(h.blobs[0]).toMatchObject({ name: 'مسار-انطلاقية-DB101-2026-10-20.kml', type: 'application/vnd.google-earth.kml+xml;charset=utf-8' })
  })
  it('GPX: trkpt بالوقت والسرعة والحالة + wpt للتوقفات', () => {
    const g = buildTripRouteGpx(d)
    expect(g).toContain('<trkpt lat="33.3" lon="44.4"><time>2026-10-20T05:00:00.000Z</time><course>90</course><extensions><speed_kmh>20</speed_kmh><state>moving</state></extensions></trkpt>')
    expect(g).toContain('<state>gap</state>')
    expect(g).toContain('<wpt lat="33.32" lon="44.42">')
    expect(g).toContain('<name>توقف 1 · 5 د</name>')
    downloadTripRouteGpx(d)
    expect(h.blobs[0]!.name).toBe('مسار-انطلاقية-DB101-2026-10-20.gpx')
    expect(g).toContain('<gpx version="1.1"')
  })
  it('بلا بيانات انطلاقية (trip غائب): لا انهيار وأسماء عامة', () => {
    const d2 = { ...d, trip: null, is_final: false }
    expect(summaryRows(d2)[0]!.value).toBe('—')
    expect(tripFileBase(d2)).toBe('مسار-انطلاقية-2026-10-20')
    expect(buildTripRouteKml(d2)).not.toContain('النهاية')
  })

  it('00378: filterTripRouteLegs يستبعد نقاط/توقفات/انقطاعات/مراحل المقاطع المخفية ويُعيد الكائن نفسه حين لا شيء مخفي', () => {
    expect(legKeyOf(null)).toBe(PRE_LEG_KEY); expect(legKeyOf('L1')).toBe('L1')
    expect(filterTripRouteLegs(d, new Set())).toBe(d)
    const noPre = filterTripRouteLegs(d, new Set([PRE_LEG_KEY]))
    expect(noPre.points.map((p) => p.seq)).toEqual([2, 3]); expect(noPre.gaps).toHaveLength(0); expect(noPre.stops).toHaveLength(1); expect(noPre.legs).toHaveLength(1)
    const noL1 = filterTripRouteLegs(d, new Set(['L1']))
    expect(noL1.points.map((p) => p.seq)).toEqual([1]); expect(noL1.gaps).toHaveLength(1); expect(noL1.stops).toHaveLength(0); expect(noL1.legs).toHaveLength(0)
    expect(noL1.distance_m).toBe(d.distance_m)   // الملخّص الإجمالي للرحلة لا يتغيّر
    expect(buildTripRouteKml(noL1)).not.toContain('<Folder><name>المراحل</name><Placemark')
  })
})
