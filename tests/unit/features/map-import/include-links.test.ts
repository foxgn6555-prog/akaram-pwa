/**
 * روابط الطرق (`*_link`) — عرض للمقارنة، لا إدراج.
 *
 * ## لماذا
 * Overpass يرسم `primary_link` وغيرها بلون الطريق الذي تخدمه. نحن نُسقطها
 * عمداً منذ الجولة ٩ لأنها منحدرات لا شوارع (تصنيفها يضخّم الكثافة ويولّد
 * زيارات وهمية). فتُصبح خريطتنا أقل كثافة عند التقاطعات الكبرى — وهو جزء من
 * «الشكل لا يطابق» المقيس في المرحلة ②.
 *
 * ## الحلّ
 * خيار `includeLinks` **للعرض وحده**: تُقرأ وتُرسم، ويُوسم كل صف منها
 * `excludeFromImport: true` فيُفلتر قبل الإرسال للقاعدة، ويُستثنى من
 * الإحصاءات. الفصل بين «ما يُعرض» و«ما يُستورد» هو جوهر التصميم.
 */
import { describe, expect, it } from 'vitest'
import { assembleImport } from '@features/map-import/lib/assemble'
import { classify, LINK_HIGHWAY_TAGS, ROUTE_HIGHWAY_TAGS } from '@features/map-import/lib/classify'
import type { OsmWay } from '@features/map-import/lib/osm-stream'

/** مضلّع مربّع بسيط حول 33.30..33.32 / 44.30..44.32 */
const ZONE: [number, number][] = [
  [33.3, 44.3],
  [33.3, 44.32],
  [33.32, 44.32],
  [33.32, 44.3],
]

function way(id: number, highway: string, nodes: number[], name?: string): OsmWay {
  return { id, nodes, tags: { highway, ...(name ? { name } : {}) } } as OsmWay
}

/** عقد على خط أفقي داخل الزون */
function nodesFor(ids: number[], lat: number, lngFrom: number, lngTo: number) {
  const m = new Map<number, [number, number]>()
  ids.forEach((id, i) => m.set(id, [lat, lngFrom + ((lngTo - lngFrom) * i) / (ids.length - 1)]))
  return m
}

describe('① التصنيف: الوسوم معروفة لكن تُسقط افتراضياً', () => {
  it('كل روابط الطرق مقبولة في قائمة القراءة (وإلا لم تُقرأ أصلاً)', () => {
    for (const hw of LINK_HIGHWAY_TAGS) {
      expect(ROUTE_HIGHWAY_TAGS).toContain(hw)
    }
  })

  it('بلا includeLinks ⇒ null (السلوك السابق حرفياً)', () => {
    for (const hw of LINK_HIGHWAY_TAGS) {
      expect(classify({ highway: hw, name: null }), hw).toBeNull()
    }
  })

  it('بـincludeLinks ⇒ فئة الطريق الأصلي', () => {
    expect(classify({ highway: 'primary_link', name: null }, { includeLinks: true })).toBe('STR')
    expect(classify({ highway: 'secondary_link', name: null }, { includeLinks: true })).toBe('SEC')
    expect(classify({ highway: 'tertiary_link', name: null }, { includeLinks: true })).toBe('TRC')
  })

  it('motorway_link وtrunk_link ⇒ STR', () => {
    expect(classify({ highway: 'motorway_link', name: null }, { includeLinks: true })).toBe('STR')
    expect(classify({ highway: 'trunk_link', name: null }, { includeLinks: true })).toBe('STR')
  })

  it('الأوسمة العادية لا تتأثر بالخيار', () => {
    expect(classify({ highway: 'primary', name: null }, { includeLinks: true })).toBe('STR')
    expect(classify({ highway: 'primary', name: null })).toBe('STR')
  })
})

describe('② assembleImport: الروابط تُرسم ولا تُستورد', () => {
  const nodes = nodesFor([1, 2, 3, 4, 5, 6], 33.31, 44.301, 44.319)
  const body = way(100, 'primary', [1, 2, 3], 'شارع رئيسي')
  const link = way(200, 'primary_link', [4, 5, 6])
  const local = way(300, 'residential', [1, 2], 'سكني')

  const build = (includeLinks?: boolean) =>
    assembleImport({
      ways: [body, link, local],
      lookupNode: (r) => nodes.get(r),
      zonePolygon: ZONE,
      opts: includeLinks === undefined ? undefined : { includeLinks },
    })

  it('بلا الخيار: الرابط لا يظهر إطلاقاً (٣ صفوف ← ٢)', () => {
    const p = build(false)
    expect(p.rows).toHaveLength(2)
    expect(p.rows.some((r) => r.osmWayId === 200)).toBe(false)
  })

  it('الافتراضي = بلا الخيار (لا تغيير سلوك)', () => {
    expect(build().rows).toHaveLength(build(false).rows.length)
  })

  it('بالخيار: الرابط يظهر (٣ صفوف)', () => {
    const p = build(true)
    expect(p.rows).toHaveLength(3)
    const r = p.rows.find((x) => x.osmWayId === 200)
    expect(r).toBeDefined()
  })

  it('الرابط موسوم excludeFromImport', () => {
    const p = build(true)
    expect(p.rows.find((x) => x.osmWayId === 200)?.excludeFromImport).toBe(true)
  })

  it('الطرق العادية ليست موسومة', () => {
    const p = build(true)
    expect(p.rows.find((x) => x.osmWayId === 100)?.excludeFromImport).toBeUndefined()
    expect(p.rows.find((x) => x.osmWayId === 300)?.excludeFromImport).toBeUndefined()
  })

  it('يحمل وسمه الأصلي للون الصحيح', () => {
    const p = build(true)
    expect(p.rows.find((x) => x.osmWayId === 200)?.osmHighway).toBe('primary_link')
  })
})

describe('③ الإحصاءات تستثني الروابط (لا تضخيم للكثافة)', () => {
  const nodes = nodesFor([1, 2, 3, 4, 5, 6], 33.31, 44.301, 44.319)
  const body = way(100, 'primary', [1, 2, 3], 'رئيسي')
  const link = way(200, 'primary_link', [4, 5, 6])
  const local = way(300, 'residential', [4, 5], 'سكني')

  const p = assembleImport({
    ways: [body, link, local],
    lookupNode: (r) => nodes.get(r),
    zonePolygon: ZONE,
    opts: { includeLinks: true },
  })

  it('عدد الشوارع لا يضمّ الرابط', () => {
    // الرئيسي + السكني = ٢ شوارع. الرابط لا يُحتسب.
    expect(p.stats.streets).toBe(2)
  })

  it('الطول الكلي لا يضمّ الرابط', () => {
    const withLink = p.stats.totalLengthKm
    const withoutLink = assembleImport({
      ways: [body, local],
      lookupNode: (r) => nodes.get(r),
      zonePolygon: ZONE,
    }).stats.totalLengthKm
    expect(withLink).toBe(withoutLink)
  })

  it('الكثافة مطابقة للحالة بلا روابط', () => {
    const without = assembleImport({
      ways: [body, local],
      lookupNode: (r) => nodes.get(r),
      zonePolygon: ZONE,
    })
    expect(p.stats.density).toBe(without.stats.density)
  })
})

describe('④ osmHighway يُحفظ لكل الصفوف', () => {
  const nodes = nodesFor([1, 2, 3], 33.31, 44.301, 44.319)
  const cases = ['primary', 'residential', 'service', 'footway', 'steps', 'trunk', 'unclassified']

  it('كل وسم يُنقل إلى الصف حرفياً', () => {
    for (const hw of cases) {
      const p = assembleImport({
        ways: [way(1, hw, [1, 2, 3])],
        lookupNode: (r) => nodes.get(r),
        zonePolygon: ZONE,
      })
      expect(p.rows[0]?.osmHighway, hw).toBe(hw)
    }
  })

  it('الوسم موجود حتى للطرق المحلية المصنّفة زقاقاً', () => {
    // residential باسم «931-15» ⇒ ALY، لكن الوسم الأصلي محفوظ
    const p = assembleImport({
      ways: [way(1, 'residential', [1, 2, 3], '931-15')],
      lookupNode: (r) => nodes.get(r),
      zonePolygon: ZONE,
    })
    expect(p.rows[0]?.kind).toBe('alley')
    expect(p.rows[0]?.osmHighway).toBe('residential')
  })
})
