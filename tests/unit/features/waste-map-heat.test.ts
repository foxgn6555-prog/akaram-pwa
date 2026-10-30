/** 00387 — محرّك التوهّج الحراري: الأوزان، أنصاف الأقطار، اللوحة، التلوين، أيقونة السلة، وسلسلة الخلفيات */
import { describe, expect, it } from 'vitest'
import type { GpsHotspot } from '@sdk/gps-hotspots.sdk'
import { HEAT_STOPS, buildHeatPalette, colorizeHeat, heatCoreAlpha, heatRadiusMeters, heatWeight, isLandmarkSpot, metersToPixels } from '@features/gps-hotspots/heat'
import { DARK_TILES, LIGHT_TILES, spotIcon } from '@features/gps-hotspots/WasteMap'

const spot = (o: Partial<GpsHotspot>): GpsHotspot => ({ id: 1, month: '2026-09-01', wh_id: 1, lat: 33.3, lng: 44.4, stops_count: 5, days_count: 3, vehicles_count: 1, total_minutes: 120, avg_minutes: 24, max_minutes: 40, light_count: 0, medium_count: 5, heavy_count: 0, dominant_class: 'medium', recurrence: 'once', hours: [], days: [], sector_ids: [], sector_names: [], ...o } as GpsHotspot)

describe('heat engine (00387)', () => {
  it('الوزن يتدرّج بالدقائق والأيام والتكرار والصنف ويبقى ضمن 0.15..1', () => {
    const light = heatWeight(spot({ total_minutes: 12, days_count: 1, dominant_class: 'light' }))
    const mid = heatWeight(spot({ total_minutes: 300, days_count: 6, recurrence: 'recurring' }))
    const heavy = heatWeight(spot({ total_minutes: 4000, days_count: 25, recurrence: 'frequent', dominant_class: 'heavy', vehicles_count: 4 }))
    expect(light).toBeGreaterThanOrEqual(0.15); expect(light).toBeLessThan(mid); expect(mid).toBeLessThan(heavy); expect(heavy).toBe(1)
    expect(heatWeight(spot({ total_minutes: -5, days_count: 0 }))).toBe(0.15)
  })
  it('نصف القطر 140..420 م ويتحول إلى بكسل بحسب التكبير (يتضاعف مع كل مستوى)', () => {
    expect(heatRadiusMeters(spot({ total_minutes: 0, days_count: 0, dominant_class: 'light' }))).toBeGreaterThanOrEqual(140)
    expect(heatRadiusMeters(spot({ total_minutes: 4000, days_count: 25, recurrence: 'frequent', dominant_class: 'heavy' }))).toBe(420)
    const p12 = metersToPixels(420, 33.3, 12), p13 = metersToPixels(420, 33.3, 13)
    expect(p13 / p12).toBeCloseTo(2, 5); expect(p12).toBeGreaterThan(10); expect(p12).toBeLessThan(20)
  })
  it('اللوحة 256 لوناً من الأزرق إلى الأحمر مروراً بالأخضر والأصفر، والتلوين يحوّل الشدة إلى لون مع شفافية متدرّجة', () => {
    const pal = buildHeatPalette()
    expect(pal.length).toBe(1024)
    expect([pal[0], pal[1], pal[2]]).toEqual([0x1d, 0x4e, 0xd8])           // أزرق
    expect([pal[1020], pal[1021], pal[1022]]).toEqual([0xdc, 0x26, 0x26])  // أحمر
    const g = Math.round(0.3 * 255) * 4; expect(pal[g + 1]).toBeGreaterThan(pal[g]!)   // أخضر عند 30%
    expect(HEAT_STOPS[2]![1]).toBe('#facc15')
    const px = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 40])
    colorizeHeat(px, pal)
    expect(px[3]).toBe(0)                                                  // الفارغ يبقى شفافاً
    expect([px[4], px[5], px[6]]).toEqual([0xdc, 0x26, 0x26]); expect(px[7]).toBeGreaterThan(200)   // الأقصى أحمر شبه معتم
    expect(px[8]).toBeLessThan(0x60); expect(px[11]).toBeLessThan(px[7]!)                              // الخافت أزرق/أخضر وأشف
  })
  it('شدة المركز: بقعة ثقيلة وحدها تصل إلى الأحمر، وخفيفة تبقى في الأزرق/الأخضر', () => {
    expect(heatCoreAlpha(1)).toBeCloseTo(0.53, 2); expect(heatCoreAlpha(0.15)).toBeCloseTo(0.148, 2); expect(heatCoreAlpha(5)).toBe(heatCoreAlpha(1))
  })
  it('أيقونة السلة للثقيلة أو الشبه يومية متعددة الآليات؛ العلامة تحمل لون الصنف ونبضاً للشبه يومي وتمييزاً للمختارة', () => {
    expect(isLandmarkSpot(spot({ dominant_class: 'heavy' }))).toBe(true)
    expect(isLandmarkSpot(spot({ recurrence: 'frequent', vehicles_count: 2 }))).toBe(true)
    expect(isLandmarkSpot(spot({ recurrence: 'frequent', vehicles_count: 1 }))).toBe(false)
    expect(isLandmarkSpot(spot({}))).toBe(false)
    const html = (spotIcon(spot({ dominant_class: 'heavy', recurrence: 'frequent' }), false).options.html as string)
    expect(html).toContain('--c:#ef4444'); expect(html).toContain('waste-spot__pulse'); expect(html).toContain('waste-spot--landmark'); expect(html).toContain('<svg')
    const plain = spotIcon(spot({}), false).options.html as string
    expect(plain).not.toContain('waste-spot__pulse'); expect(plain).not.toContain('<svg'); expect(plain).toContain('--c:#f59e0b')
    expect(spotIcon(spot({}), true).options.html as string).toContain('waste-spot--selected')
    expect(spotIcon(spot({}), false)).toBe(spotIcon(spot({ id: 9 }), false))   // ذاكرة الأيقونات
  })
  it('سلسلة الخلفيات الداكنة تنتهي بـ OSM مع فلتر CSS (لا تفشل)، والعادية OSM بلا فلتر', () => {
    expect(DARK_TILES.length).toBeGreaterThanOrEqual(3)
    expect(DARK_TILES[0]!.id).toBe('carto-dark')
    expect(DARK_TILES.at(-1)).toMatchObject({ id: 'osm-filtered', filter: true })
    expect(DARK_TILES.at(-1)!.url).toContain('tile.openstreetmap.org')
    expect(LIGHT_TILES).toMatchObject({ id: 'osm', filter: false })
  })
})
