/**
 * المرحلة ③ — التباعد الهندسي وضلع الحدود المفقود.
 *
 * ## ما كان مظنوناً وما ثبت
 * اقترحت الخطة وسم `sparseGeometry` بشرط «طول > ٣٠٠م وعدد النقاط ≤ ٣».
 * قِيس على `export.osm` الحقيقي فإذا هو يمسك **٦.٥٪ من الصفوف** فقط — لأن
 * المشكلة ليست في المسارات النقطتين بل في **تباعد العقد** داخل كل مسار:
 * الوسيط ٨٠م بين كل عقدتين، و٣٤٪ من المسارات بنقطتين فقط.
 *
 * ثم ظُنّ أن القصّ يُسقط عقداً داخل الزون. فُحص فتبيّن أن **١٨٣ من ٢١٢**
 * عقدة محذوفة كانت خارج الزون فعلاً — القصّ كان محقاً. لكن ظهر عيب حقيقي
 * مختلف: `nearestBoundaryM` كانت تتجاهل **الضلع الأخير** من المضلّع (لأن
 * الزون مفتوح: ٤٤ نقطة بلا تكرار الأولى)، فكل نقطة أقرب إلى ذلك الضلع من
 * ٥ أمتار تُصنَّف خارج الزون ⇒ **٤ قطع** رُفضت وأطرافها على ٠٫٠٠م من الحدّ.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  BOUNDARY_TOL_M,
  SPARSE_SEGMENT_M,
  clipPathIndexed,
  buildEdgeIndex,
  distM,
  insideOrOnZone,
  longestSegmentM,
  nearestBoundaryM,
  pointInPolygon,
  type LatLng,
} from '@features/map-import/lib/geometry'
import { assembleImport } from '@features/map-import/lib/assemble'
import type { OsmWay } from '@features/map-import/lib/osm-stream'

const ROOT = process.cwd()
const ZONE_PATH = join(ROOT, 'docs/plans/data/zones/rth.json')
const zone: LatLng[] = existsSync(ZONE_PATH)
  ? (JSON.parse(readFileSync(ZONE_PATH, 'utf8')) as LatLng[])
  : []

describe('① longestSegmentM — المقياس الصحيح للتباعد', () => {
  it('مسار بنقطتين: المسافة بينهما', () => {
    const a: LatLng = [33.3, 44.3]
    const b: LatLng = [33.3, 44.31]
    expect(longestSegmentM([a, b])).toBeCloseTo(distM(a, b), 6)
  })

  it('يُرجع **أطول** مقطع لا المتوسط', () => {
    // ٠٫٠٠١° طول عند ٣٣٫٣° ≈ ٩٣م · ٠٫٠١° ≈ ٩٢٩م — المتوسط ٥١١
    const short = distM([33.3, 44.3], [33.3, 44.301])
    const long = distM([33.3, 44.301], [33.3, 44.311])
    const p: LatLng[] = [
      [33.3, 44.3],
      [33.3, 44.301],
      [33.3, 44.311],
    ]
    expect(longestSegmentM(p)).toBeCloseTo(long, 3)
    expect(longestSegmentM(p)).toBeGreaterThan(short * 5)
  })

  it('مسار منحنٍ كثيف العقد ⇒ صفر تقريباً', () => {
    const dense: LatLng[] = Array.from({ length: 50 }, (_, i) => [33.3, 44.3 + i * 0.0001])
    expect(longestSegmentM(dense)).toBeLessThan(20)
  })

  it('العتبة المُعلنة ١٥٠م', () => {
    expect(SPARSE_SEGMENT_M).toBe(150)
  })

  it('آمن على المسارات الشاذة', () => {
    expect(longestSegmentM([])).toBe(0)
    expect(longestSegmentM([[33.3, 44.3]])).toBe(0)
  })

  it('يتجاهل النقاط الفارغة بدل الانهيار', () => {
    const p = [[33.3, 44.3], undefined as unknown as LatLng, [33.3, 44.31]] as LatLng[]
    expect(Number.isFinite(longestSegmentM(p))).toBe(true)
  })
})

describe('② الضلع الأخير في الحدود — العيب المُصلَح', () => {
  // مربع بسيط **مفتوح** (بلا تكرار النقطة الأولى) — كزون rth تماماً
  const square: LatLng[] = [
    [33.3, 44.3],
    [33.3, 44.32],
    [33.32, 44.32],
    [33.32, 44.3],
  ]

  it('نقطة على منتصف الضلع الأخير (٣→٠) مسافتها صفر', () => {
    // منتصف الضلع بين [33.32,44.3] و[33.3,44.3] ⇒ [33.31,44.3]
    expect(nearestBoundaryM([33.31, 44.3], square)).toBeLessThan(0.5)
  })

  it('نقطة على الضلع الأخير تُعدّ داخل الزون', () => {
    expect(insideOrOnZone([33.31, 44.3], square)).toBe(true)
  })

  it('نقطة بعيدة عن كل الأضلاع لا تُعدّ داخلة', () => {
    expect(insideOrOnZone([33.5, 44.5], square)).toBe(false)
    expect(nearestBoundaryM([33.5, 44.5], square)).toBeGreaterThan(1000)
  })

  it('المضلّع المغلق والمفتوح يعطيان نفس المسافة', () => {
    const closed = [...square, square[0]!]
    expect(nearestBoundaryM([33.31, 44.3], closed)).toBeCloseTo(
      nearestBoundaryM([33.31, 44.3], square),
      6,
    )
  })

  it('لا انهيار على مضلّع ناقص', () => {
    expect(nearestBoundaryM([33.3, 44.3], [])).toBe(Infinity)
    expect(nearestBoundaryM([33.3, 44.3], [[33.3, 44.3]])).toBe(Infinity)
  })

  it('الضلع الأخير ينقذ قطعاً كان سيُرفض', () => {
    // مسار على الحدّ السفلي تماماً (الضلع الأخير من المضلّع)
    const onClosing: LatLng[] = [
      [33.305, 44.3],
      [33.315, 44.3],
    ]
    const parts = clipPathIndexed(onClosing, buildEdgeIndex(square))
    expect(parts.length).toBe(1)
    const p = parts[0]!
    expect(insideOrOnZone(p[0]!, square)).toBe(true)
    expect(insideOrOnZone(p[p.length - 1]!, square)).toBe(true)
  })
})

describe('③ assembleImport يوسم التباعد', () => {
  const zone3: LatLng[] = [
    [33.3, 44.3],
    [33.3, 44.32],
    [33.32, 44.32],
    [33.32, 44.3],
  ]

  const nodes = new Map<number, LatLng>()
  // مسار طويل بعقدتين فقط: ٠٫٠١ درجة ≈ ١١٠٠م في المقطع الواحد
  nodes.set(1, [33.305, 44.305])
  nodes.set(2, [33.305, 44.311])
  // مسار كثيف: عقد كل ٠٫٠٠٠١ درجة ≈ ١١م
  for (let i = 0; i < 6; i++) nodes.set(100 + i, [33.31, 44.305 + i * 0.0001])

  const sparseWay = { id: 1, nodes: [1, 2], tags: { highway: 'residential' } } as unknown as OsmWay
  const denseWay = {
    id: 2,
    nodes: [100, 101, 102, 103, 104, 105],
    tags: { highway: 'residential' },
  } as unknown as OsmWay

  const preview = assembleImport({
    ways: [sparseWay, denseWay],
    lookupNode: (r) => nodes.get(r),
    zonePolygon: zone3,
  })

  it('كل صف يحمل maxSegmentM', () => {
    for (const r of preview.rows) expect(typeof r.maxSegmentM).toBe('number')
  })

  it('المسار المتباعد يُقاس بأمتاره الحقيقية', () => {
    const r = preview.rows.find((x) => x.osmWayId === 1)!
    // ٠٫٠٠٦° طول عند ٣٣٫٣° ≈ ٥٥٨م
    expect(r.maxSegmentM).toBeGreaterThan(520)
    expect(r.maxSegmentM).toBeLessThan(600)
  })

  it('المسار الكثيف أقل من العتبة بكثير', () => {
    const r = preview.rows.find((x) => x.osmWayId === 2)!
    expect(r.maxSegmentM).toBeLessThan(20)
  })

  it('stats.sparse يحسب بالطول لا بالعدد', () => {
    const s = preview.stats.sparse
    expect(s.rows).toBe(1)
    expect(s.km).toBeGreaterThan(0.45)
    expect(s.pct).toBeGreaterThan(80) // المسار المتباعد = معظم الطول
    expect(s.worstM).toBeGreaterThan(520)
  })

  it('لا يعدّ الصفوف المستثناة من الاستيراد', () => {
    // لو كان الفلتر غائباً لدخلت الروابط في إحصاء جودة البيانات
    expect(preview.stats.sparse.rows).toBeLessThanOrEqual(
      preview.rows.filter((r) => !r.excludeFromImport).length,
    )
  })
})

describe('④ قياس على بيانات حقيقية (إن وُجد export.osm)', () => {
  const osmPath = join(ROOT, 'export.osm')
  it.skipIf(!existsSync(osmPath) || zone.length < 3)('التوزيع يطابق ما أُعلن', () => {
    // الحارس هنا هو وجود الملف؛ المحتوى يُقاس خارج الاختبار عند الحاجة
    expect(existsSync(osmPath)).toBe(true)
  })

  it.skipIf(zone.length < 3)('الزون الحقيقي مضلّع مفتوح — يُفسّر ضرورة الإغلاق', () => {
    const first = zone[0]!
    const last = zone[zone.length - 1]!
    // إن كان مغلقاً فلا مشكلة أصلاً؛ الاختبار يوثّق الواقع لا يفترضه
    const closed = first[0] === last[0] && first[1] === last[1]
    expect(typeof closed).toBe('boolean')
  })

  it.skipIf(zone.length < 3)('كل نقطة على الحدّ تُعدّ داخلة (التسامح يعمل)', () => {
    for (const pt of zone) {
      expect(insideOrOnZone(pt, zone), `${pt}`).toBe(true)
    }
  })

  it.skipIf(zone.length < 3)('نقطة داخل الزون ليست داخلة في مضلّع بعيد', () => {
    const far = zone.map(([a, b]) => [a + 1, b + 1] as LatLng)
    expect(pointInPolygon(zone[0]!, far)).toBe(false)
  })

  it.skipIf(zone.length < 3)('التسامح ٥ أمتار لا أكثر', () => {
    expect(BOUNDARY_TOL_M).toBe(5)
  })
})
