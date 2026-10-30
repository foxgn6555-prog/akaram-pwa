/** 00384 — منطق خريطة النفايات: الفلاتر الافتراضية (الخفيف مخفي)، التبديل المتعدد، الملخص، الشهر الافتراضي، الحجم */
import { describe, expect, it } from 'vitest'
import type { GpsHotspot } from '@sdk/gps-hotspots.sdk'
import { DEFAULT_FILTERS, applyFilters, defaultMonth, hotspotRadiusPx, hotspotStyle, peakHours, previousMonth, summarize, toggleIn } from '@features/gps-hotspots/hotspots.logic'

const spot = (p: Partial<GpsHotspot>): GpsHotspot => ({ id: 1, month: '2026-09-01', wh_id: 1, lat: 33.3, lng: 44.4, stops_count: 5, days_count: 4, vehicles_count: 2, total_minutes: 172, avg_minutes: 34, max_minutes: 90, light_count: 2, medium_count: 2, heavy_count: 1,
  dominant_class: 'medium', recurrence: 'recurring', first_at: null, last_at: null, sector_ids: [1, 2], sector_names: ['أ', 'ب'], vehicles: [{ device: 'd-1', name: 'ك1', db_number: '1', sector: 'أ', stops: 3, minutes: 100 }, { device: 'd-2', name: 'ك2', db_number: '2', sector: 'ب', stops: 2, minutes: 72 }], days: [], hours: [], ...p })
const rows = [
  spot({ id: 1 }),
  spot({ id: 2, dominant_class: 'light', recurrence: 'once', vehicles_count: 1, sector_ids: [1], total_minutes: 15, stops_count: 1, vehicles: [{ device: 'd-1', name: null, db_number: null, sector: null, stops: 1, minutes: 15 }] }),
  spot({ id: 3, dominant_class: 'heavy', recurrence: 'frequent', vehicles_count: 1, sector_ids: [3], total_minutes: 900, stops_count: 12, vehicles: [{ device: 'd-3', name: null, db_number: null, sector: null, stops: 12, minutes: 900 }] }),
]

describe('waste-map logic (00384)', () => {
  it('الافتراضي يخفي الخفيف ويبقي كل التكرارات والقواطع', () => {
    expect(DEFAULT_FILTERS.classes).toEqual(['medium', 'heavy'])
    expect(applyFilters(rows, DEFAULT_FILTERS).map((r) => r.id)).toEqual([1, 3])
  })
  it('الفلاتر متعددة ومجمّعة: صنف + تكرار + آليات + قاطع', () => {
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, classes: ['light'] }).map((r) => r.id)).toEqual([2])
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, classes: [], recurrence: ['frequent'] }).map((r) => r.id)).toEqual([3])
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, classes: [], minVehicles: 2 }).map((r) => r.id)).toEqual([1])
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, classes: [], sectorIds: [1] }).map((r) => r.id)).toEqual([1, 2])
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, classes: [], sectorIds: [2, 3] }).map((r) => r.id)).toEqual([1, 3])
    expect(toggleIn(['a', 'b'], 'a')).toEqual(['b']); expect(toggleIn(['b'], 'a')).toEqual(['b', 'a'])
  })
  it('الملخص: بقع/توقفات/دقائق/آليات مميزة/بقع متعددة الآليات', () => {
    const s = summarize(rows)
    expect(s).toMatchObject({ spots: 3, stops: 18, totalMinutes: 1087, vehicles: 3, multi: 1 })
    expect(s.byClass).toEqual({ light: 1, medium: 1, heavy: 1 }); expect(s.byRecurrence).toEqual({ once: 1, recurring: 1, frequent: 1 })
  })
  it('الشهر الافتراضي = الشهر السابق إن كان منسوخاً وإلا آخر شهر', () => {
    const now = new Date(2026, 9, 30)
    expect(previousMonth(now)).toBe('2026-09')
    expect(defaultMonth([{ month: '2026-10', rows: 1, synced_at: '' }, { month: '2026-09', rows: 2, synced_at: '' }], now)).toBe('2026-09')
    expect(defaultMonth([{ month: '2026-10', rows: 1, synced_at: '' }], now)).toBe('2026-10')
    expect(defaultMonth([], now)).toBeNull()
  })
  it('الحجم بحسب الدقائق (مقيَّد) واللون بحسب الصنف والحلقة بحسب التكرار', () => {
    expect(hotspotRadiusPx(spot({ total_minutes: 0 }))).toBe(8)
    expect(hotspotRadiusPx(spot({ total_minutes: 100000 }))).toBe(34)
    expect(hotspotRadiusPx(spot({ total_minutes: 172 }))).toBeGreaterThan(hotspotRadiusPx(spot({ total_minutes: 15 })))
    expect(hotspotStyle(rows[2]!)).toMatchObject({ fill: '#ef4444', weight: 3 })
    expect(hotspotStyle(rows[0]!, true).ring).toBe('#22d3ee')
    const hours = Array.from({ length: 24 }, () => 0); hours[8] = 4; hours[17] = 2
    expect(peakHours(hours)).toBe('08:00 · 17:00'); expect(peakHours([])).toBe('—')
  })
})
