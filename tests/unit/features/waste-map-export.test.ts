/** 00385/00389 — المقارنة الشهرية، وصف الموقع الداخلي (بدل Nominatim)، التصدير (Excel/HTML) */
import { describe, expect, it } from 'vitest'
import type { GpsHotspot, GpsHotspotsMonthStats } from '@sdk/gps-hotspots.sdk'
import { compareMonths, daysByWeekday, deltaLabel, fmtDay, placeDescription, prevMonthOf } from '@features/gps-hotspots/hotspots.logic'
import { HOTSPOT_COLUMNS, buildHotspotsWorkbook, filtersLabel, hotspotRowValues, hotspotsReportHtml, sortedForExport } from '@features/gps-hotspots/export'

const spot = (p: Partial<GpsHotspot>): GpsHotspot => ({ id: 1, month: '2026-09-01', wh_id: 1, lat: 33.3, lng: 44.4, stops_count: 5, days_count: 4, vehicles_count: 2, total_minutes: 172, avg_minutes: 34, max_minutes: 90, light_count: 2, medium_count: 2, heavy_count: 1,
  dominant_class: 'medium', recurrence: 'recurring', first_at: null, last_at: null, sector_ids: [1], sector_names: ['الكرادة'], vehicles: [{ device: 'd-1', name: 'كابسة 1', db_number: '12', sector: 'الكرادة', stops: 3, minutes: 100 }], days: ['2026-09-04', '2026-09-11'], hours: Array.from({ length: 24 }, (_, i) => (i === 8 ? 3 : 0)), ...p })
const stats: GpsHotspotsMonthStats[] = [
  { month: '2026-09', spots: 120, stops: 900, total_minutes: 30000, multi_vehicle: 40, by_class: { heavy: 30, medium: 60, light: 30 }, by_recurrence: { once: 50, recurring: 50, frequent: 20 }, by_sector: [], updated_at: '' },
  { month: '2026-08', spots: 100, stops: 1000, total_minutes: 30000, multi_vehicle: 0, by_class: { heavy: 20, medium: 50, light: 30 }, by_recurrence: { once: 60, recurring: 30, frequent: 10 }, by_sector: [], updated_at: '' },
]

describe('waste-map 00385', () => {
  it('المقارنة مع الشهر السابق من الإحصاء الدائم: فروق ونِسب، وغياب السابق = غير متاح', () => {
    expect(prevMonthOf('2026-01')).toBe('2025-12'); expect(prevMonthOf('2026-09')).toBe('2026-08')
    const c = compareMonths(stats, '2026-09')
    expect(c.available).toBe(true); expect(c.previous).toBe('2026-08')
    expect(c.rows[0]).toMatchObject({ label: 'بقع', current: 120, previous: 100, delta: 20, pct: 20 })
    expect(deltaLabel(c.rows[0]!)).toBe('▲ +20 (+20%)')
    expect(deltaLabel(c.rows[1]!)).toBe('▼ -100 (-10%)')
    expect(deltaLabel(c.rows[2]!)).toBe('بلا تغيير')
    expect(c.rows[3]).toMatchObject({ current: 40, previous: 0, pct: null })
    expect(c.rows.find((r) => r.label === 'ثقيلة')).toMatchObject({ current: 30, previous: 20 })
    const none = compareMonths(stats, '2026-08'); expect(none.available).toBe(false); expect(deltaLabel(none.rows[0]!)).toBe('لا بيانات للشهر السابق')
  })
  it('أيام الأسبوع والتنسيق', () => {
    expect(daysByWeekday(['2026-09-04', '2026-09-11', '2026-09-07']).filter((d) => d.count)).toEqual([{ day: 'الاثنين', count: 1 }, { day: 'الجمعة', count: 2 }])
    expect(fmtDay('2026-09-04')).toBe('الجمعة 04/09')
  })
  it('Excel: ثلاث أوراق (البقع، الآليات، ملخص بالمقارنة) والصفوف مرتبة بالدقائق', async () => {
    const rows = [spot({ id: 1, total_minutes: 50 }), spot({ id: 2, total_minutes: 900, dominant_class: 'heavy' })]
    expect(sortedForExport(rows).map((r) => r.id)).toEqual([2, 1])
    expect(hotspotRowValues(rows[0]!, 0)).toHaveLength(HOTSPOT_COLUMNS.length)
    expect(hotspotRowValues(rows[0]!, 0)[13]).toBe('08:00')
    const wb = await buildHotspotsWorkbook(rows, '2026-09', 'الصنف: الكل', stats)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['البقع', 'الآليات لكل بقعة', 'ملخص'])
    expect(wb.getWorksheet('البقع')!.getRow(4).getCell(3).value).toBe('ثقيل')
    expect(wb.getWorksheet('الآليات لكل بقعة')!.rowCount).toBe(3)
    const sum = wb.getWorksheet('ملخص')!; const texts: string[] = []; sum.eachRow((r) => texts.push(String(r.getCell(1).value ?? '')))
    expect(texts.some((t) => t.includes('مقارنة أيلول 2026 مع آب 2026'))).toBe(true)
    expect(filtersLabel({ classes: ['heavy'], recurrence: ['frequent'], minVehicles: 2, sectorIds: [1], unlocated: false }, new Map([[1, 'الكرادة']]))).toBe('الصنف: ثقيل · التكرار: شبه يومي · الآليات: 2+ · القاطع: الكرادة')
    expect(filtersLabel({ classes: [], recurrence: [], minVehicles: 1, sectorIds: [1], unlocated: true }, new Map([[1, 'الكرادة']]))).toBe('الصنف: الكل · التكرار: الكل · الآليات: الكل · القاطع: الكرادة/غير محدد')
  })
  it('تقرير HTML مستقل: A4 أفقي، ألوان مطبوعة، المقارنة، وبلا نصوص خام', () => {
    const html = hotspotsReportHtml([spot({ sector_names: ['<x>'] })], '2026-09', 'الكل', stats, new Date('2026-10-30T08:00:00Z'))
    expect(html).toContain('size:A4 landscape'); expect(html).toContain('print-color-adjust:exact')
    expect(html).toContain('مقارنة مع آب 2026'); expect(html).toContain('&lt;x&gt;'); expect(html).not.toContain('<x>')
    expect(html).toContain('2 س 52 د')
    expect(hotspotsReportHtml([], '2026-08', 'الكل', stats)).toContain('لا تتوفر بيانات الشهر السابق')
  })

  // 00389-ج: وصف الموقع بلا أي نداء شبكة (سياسة CSP تحجب Nominatim ⇒ كان «غير متاح» دائمًا)
  it('وصف الموقع: الزون الجغرافي ثم قاطع الآلية ثم خارج القواطع — بلا شبكة', () => {
    expect(placeDescription(spot({ geo_zone_name: 'زون الرياض', geo_sector_name: 'الرياض' }))).toBe('زون الرياض · الرياض')
    expect(placeDescription(spot({ geo_sector_name: 'الرياض' }))).toBe('الرياض')
    expect(placeDescription(spot({ sector_names: ['الكرادة', 'الأعظمية'] }))).toBe('الكرادة، الأعظمية')
    expect(placeDescription(spot({ sector_names: [] }))).toBe('لم يُحدَّد القاطع')
  })
})
