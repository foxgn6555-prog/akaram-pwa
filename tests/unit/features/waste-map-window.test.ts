/**
 * الجولة ⑤ — اختبارات regresion لنافذة خريطة النفايات الشهرين والبقع غير المحددة.
 *
 * هذه الاختبارات تعمل على جانب العميل (vitest) وتكمّل اختبارات SQL على مستوى القاعدة
 * (`tests/db-warehouse/pull-engine-test.sql` → E9 للنافذة، `tests/db/gps-hotspots-test.sql` → G3 للتقليم)
 * التي لا تُشغل عبر vitest.
 *
 * غرضها: ضمان ألا regrese سلوك تحديد الشهر الافتراضي، المقارنة الشهرية (من الإحصاء الدائم
 * لا من الصفوف التي قد تُقلم)، إسناد القاطع الجغرافي، وفرز/فلتر البقع غير المحددة.
 */
import { describe, expect, it } from 'vitest'
import type { GpsHotspot } from '@sdk/gps-hotspots.sdk'
import {
  applyFilters,
  compareMonths,
  defaultMonth,
  previousMonth,
  prevMonthOf,
  rankTop,
  spotPlace,
  spotSectorIds,
  summarize,
} from '@features/gps-hotspots/hotspots.logic'

const spot = (p: Partial<GpsHotspot>): GpsHotspot => ({
  id: 1,
  month: '2026-09-01',
  wh_id: 1,
  lat: 33.3,
  lng: 44.4,
  stops_count: 5,
  days_count: 4,
  vehicles_count: 2,
  total_minutes: 172,
  avg_minutes: 34,
  max_minutes: 90,
  light_count: 2,
  medium_count: 2,
  heavy_count: 1,
  dominant_class: 'medium',
  recurrence: 'recurring',
  first_at: null,
  last_at: null,
  sector_ids: [1, 2],
  sector_names: ['قاطع أ', 'قاطع ب'],
  vehicles: [],
  days: [],
  hours: [],
  ...p,
})

describe('⑤ نافذة الشهرين — الشهر الافتراضي والمقارنة', () => {
  it('الشهر السابق يُحسب بشكل صحيح عبر حدود السنة', () => {
    expect(prevMonthOf('2026-11')).toBe('2026-10')
    expect(prevMonthOf('2026-01')).toBe('2025-12')
    expect(prevMonthOf('2026-03')).toBe('2026-02')
  })

  it('الشهر الافتراضي = الشهر السابق إن كان منسوخاً، وإلا أول شهر متاح، وإلا null', () => {
    const now = new Date(2026, 10, 30) // بغداد نوفمبر 2026
    expect(previousMonth(now)).toBe('2026-10')
    expect(
      defaultMonth(
        [{ month: '2026-11', rows: 1, synced_at: '' }, { month: '2026-10', rows: 3, synced_at: '' }],
        now,
      ),
    ).toBe('2026-10')
    expect(defaultMonth([{ month: '2026-11', rows: 1, synced_at: '' }], now)).toBe('2026-11')
    expect(defaultMonth([], now)).toBeNull()
  })

  it('★ المقارنة الشهرية تُستمد من الإحصاء الدائم (month_stats) لا من الصفوف —所以即使 خرج الشهر من النافذة يُقارن', () => {
    // الإحصاء يُحتفظ به للأبد (deletable = false) حتى بعد تقليم الصفوف خارج النافذة
    const stats = [
      { month: '2026-10', spots: 100, stops: 400, total_minutes: 5000, multi_vehicle: 10, by_class: { heavy: 10, medium: 40, light: 50 }, by_recurrence: { once: 60, recurring: 30, frequent: 10 }, by_sector: [], updated_at: '2026-10-31T20:30:00Z' },
      { month: '2026-09', spots: 80, stops: 320, total_minutes: 4000, multi_vehicle: 8, by_class: { heavy: 8, medium: 32, light: 40 }, by_recurrence: { once: 48, recurring: 24, frequent: 8 }, by_sector: [], updated_at: '2026-09-30T20:30:00Z' },
    ]
    const c = compareMonths(stats, '2026-10')
    expect(c.month).toBe('2026-10')
    expect(c.previous).toBe('2026-09')
    expect(c.available).toBe(true)
    expect(c.rows.find((r) => r.label === 'بقع')).toMatchObject({ current: 100, previous: 80, delta: 20, pct: 25 })
    expect(c.rows.find((r) => r.label === 'توقفات')).toMatchObject({ current: 400, previous: 320, delta: 80, pct: 25 })
    expect(c.rows.find((r) => r.label === 'دقائق التوقف')).toMatchObject({ current: 5000, previous: 4000, delta: 1000, pct: 25 })
  })

  it('إذا لم يتوفر شهر سابق تكون المقارنة غير متاحة وبدون%', () => {
    const stats = [{ month: '2026-10', spots: 100, stops: 400, total_minutes: 5000, multi_vehicle: 10, by_class: {}, by_recurrence: {}, by_sector: [], updated_at: '' }]
    const c = compareMonths(stats, '2026-10')
    expect(c.available).toBe(false)
    expect(c.rows.find((r) => r.label === 'بقع')?.delta).toBeNull()
    expect(c.rows.find((r) => r.label === 'بقع')?.pct).toBeNull()
  })

  it('الشهر الحالي غائب من الإحصاء -> غير متاح (السابق موجود)', () => {
    const stats = [{ month: '2026-09', spots: 80, stops: 320, total_minutes: 4000, multi_vehicle: 8, by_class: {}, by_recurrence: {}, by_sector: [], updated_at: '' }]
    const c = compareMonths(stats, '2026-10')
    expect(c.available).toBe(false)
    // الشهر السابق موجود ⇒ previous تحمل قيمته، بينما delta يُحسب من current=0
    expect(c.rows.find((r) => r.label === 'بقع')?.previous).toBe(80)
    expect(c.rows.find((r) => r.label === 'بقع')?.delta).toBe(-80)
  })

  it('الشهر الحالي موجود والسابق غائب -> غير متاح', () => {
    const stats = [{ month: '2026-10', spots: 100, stops: 400, total_minutes: 5000, multi_vehicle: 10, by_class: {}, by_recurrence: {}, by_sector: [], updated_at: '' }]
    const c = compareMonths(stats, '2026-10')
    expect(c.available).toBe(false)
    expect(c.rows.find((r) => r.label === 'بقع')?.delta).toBeNull()
    expect(c.rows.find((r) => r.label === 'بقع')?.pct).toBeNull()
  })
})

describe('⑤ إسناد القاطع الجغرافي — geo_sector_id يسبق sector_ids', () => {
  it('spotSectorIds يعيد geo_sector_id إن وُجد', () => {
    expect(spotSectorIds(spot({ geo_sector_id: 5 }))).toEqual([5])
    expect(spotSectorIds(spot({ geo_sector_id: null, sector_ids: [1, 2] }))).toEqual([1, 2])
    expect(spotSectorIds(spot({ geo_sector_id: null, sector_ids: [], sector_names: [] }))).toEqual([])
  })

  it('spotPlace يعرض اسم المنطقة ثم القاطع poi "لم يُحدَّد القاطع" عند العدم', () => {
    expect(spotPlace(spot({ geo_zone_name: 'الكرادة', geo_sector_name: 'قاطع أ' }))).toBe('قاطع أ · الكرادة')
    expect(spotPlace(spot({ geo_sector_name: 'الأعظمية' }))).toBe('الأعظمية')
    expect(spotPlace(spot({ geo_sector_name: null, sector_names: ['المنصور', 'الكرادة'] }))).toBe('المنصور، الكرادة')
    expect(spotPlace(spot({ geo_sector_name: null, sector_ids: [], sector_names: [] }))).toBe('خارج القواطع')
  })

  it('applyFilters يُظهر غير المحددين بمفردهم ويُحتفظ بهم مع قاطع مختار', () => {
    const rows = [
      spot({ id: 1, geo_sector_id: 1 }),
      spot({ id: 2, geo_sector_id: null, sector_ids: [], sector_names: [] }),
      spot({ id: 3, geo_sector_id: 2 }),
    ]
    const onlyUnlocated = applyFilters(rows, { classes: [], recurrence: [], minVehicles: 1, sectorIds: [], unlocated: true })
    expect(onlyUnlocated.map((r) => r.id)).toEqual([2])
    const unlocatedPlusSector = applyFilters(rows, { classes: [], recurrence: [], minVehicles: 1, sectorIds: [1], unlocated: true })
    expect(unlocatedPlusSector.map((r) => r.id)).toEqual([1, 2])
  })
})

describe('⑤ الملخص والترتيب/top spots', () => {
  it('rankTop يرتب الأثقل أولاً ويُرقم من 1', () => {
    const rows = [
      spot({ id: 1, total_minutes: 100 }),
      spot({ id: 2, total_minutes: 900 }),
      spot({ id: 3, total_minutes: 150 }),
    ]
    const ranks = rankTop(rows, 2)
    expect(ranks.get(2)).toBe(1)
    expect(ranks.get(3)).toBe(2)
    expect(ranks.get(1)).toBeUndefined()
  })

  it('summarize يحسب عدد البقع الفريدة والآليات المميزة', () => {
    const rows = [
      spot({ id: 1, vehicles_count: 2, vehicles: [{ device: 'd-1', name: null, db_number: null, sector: null, stops: 3, minutes: 100 }] }),
      spot({ id: 2, vehicles_count: 1, vehicles: [{ device: 'd-2', name: null, db_number: null, sector: null, stops: 1, minutes: 15 }] }),
    ]
    const s = summarize(rows)
    expect(s.spots).toBe(2)
    expect(s.vehicles).toBe(2)
    expect(s.multi).toBe(1)
  })
})
