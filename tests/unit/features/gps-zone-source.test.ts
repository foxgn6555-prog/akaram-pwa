/** 00410 — ترشيح الزونات المعروضة: قواطع المنصة افتراضياً، وزونات المزوّد عند الطلب فقط */
import { describe, expect, it } from 'vitest'
import { isPlatformZone, visibleZones } from '@features/gps-lvn/zone-source'

const z = (id: string, source: 'platform' | 'lvn') => ({ id, name: id, source, color: '#000', polygon: [] })

describe('ترشيح زونات الخريطة حسب المصدر', () => {
  it('يعتبر المنصة فقط زوناً تشغيلياً للعرض الافتراضي', () => {
    expect(isPlatformZone(z('a', 'platform'))).toBe(true)
    expect(isPlatformZone(z('b', 'lvn'))).toBe(false)
  })

  it('يُخفي زونات المزوّد افتراضياً ويُبقي كل قواطع المنصة', () => {
    const zones = [z('p1', 'platform'), z('v1', 'lvn'), z('p2', 'platform')]
    expect(visibleZones(zones, false).map((x) => x.id)).toEqual(['p1', 'p2'])
  })

  it('يُظهر الجميع بترتيبهم الأصلي عند تشغيل المفتاح', () => {
    const zones = [z('p1', 'platform'), z('v1', 'lvn'), z('p2', 'platform')]
    expect(visibleZones(zones, true).map((x) => x.id)).toEqual(['p1', 'v1', 'p2'])
  })

  it('لا يفشل مع قائمة فارغة', () => {
    expect(visibleZones([], false)).toEqual([])
    expect(visibleZones([], true)).toEqual([])
  })
})
