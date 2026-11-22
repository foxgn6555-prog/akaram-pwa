/**
 * فهرس الحدود — إثبات أن التحسين **لا يغيّر نتيجة** `clipPath`، وأن السقف يحمي الذاكرة.
 *
 * المنهج: نفس المدخلات على الدالتين القديمة (`clipPath`) والجديدة (`clipPathIndexed`)
 * ⇒ يجب أن تتطابق النتائج رقمياً. اختبار التكافؤ هو ما يجعل التحسين آمناً.
 */
import { describe, expect, it } from 'vitest'
import {
  buildEdgeIndex,
  clipPath,
  clipPathIndexed,
  pathLengthM,
  segmentCrossings,
  type LatLng,
} from '@features/map-import/lib/geometry'
import { assembleImport, DEFAULT_MAX_ROUTE_WAYS } from '@features/map-import/lib/assemble'
import type { OsmWay } from '@features/map-import/lib/osm-stream'

const SQ: LatLng[] = [
  [33.3, 44.4],
  [33.3, 44.411],
  [33.309, 44.411],
  [33.309, 44.4],
]

/** مضلّع ١٢٠ ضلعاً — يقارب حجم حدود الزون الحقيقي (٧٤٠ نقطة للثمانية) */
function ribbedZone(n = 120): LatLng[] {
  const out: LatLng[] = []
  const cLat = 33.305
  const cLng = 44.405
  const R = 0.01
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const r = i % 2 === 0 ? R : R * 0.97
    out.push([cLat + Math.sin(a) * r, cLng + Math.cos(a) * r])
  }
  return out
}

const paths: LatLng[][] = [
  // عابر شرق-غرب
  [[33.304, 44.39], [33.304, 44.42]],
  // عابر شمال-جنوب
  [[33.29, 44.405], [33.32, 44.405]],
  // قطري
  [[33.29, 44.39], [33.32, 44.42]],
  // داخل تماماً
  [[33.303, 44.403], [33.307, 44.407]],
  // خارج تماماً
  [[33.32, 44.43], [33.33, 44.44]],
  // يدخل ويخرج ويعود
  [
    [33.304, 44.39],
    [33.304, 44.42],
    [33.3045, 44.42],
    [33.3045, 44.39],
  ],
  // متعدد العقد ملتوٍ
  Array.from({ length: 20 }, (_, i) => [33.295 + i * 0.001, 44.395 + (i % 3) * 0.006] as LatLng),
]

describe('① تكافؤ الفهرس مع القصّ المباشر', () => {
  for (const zone of [SQ, ribbedZone(120), ribbedZone(740)]) {
    const label = zone.length === 4 ? 'مربّع' : `مضلّع ${zone.length} ضلعاً`
    it(`${label}: النتائج متطابقة على ${paths.length} مساراً`, () => {
      const idx = buildEdgeIndex(zone)
      for (const p of paths) {
        const a = clipPath(p, zone)
        const b = clipPathIndexed(p, idx)
        expect(b.length).toBe(a.length)
        for (let i = 0; i < a.length; i++) {
          const pa = a[i] as LatLng[]
          const pb = b[i] as LatLng[]
          expect(pb.length).toBe(pa.length)
          // فروق الفاصلة العائمة مسموحة بمقدار ١e-9 درجة (≈٠٫١ مم)
          for (let k = 0; k < pa.length; k++) {
            expect(Math.abs((pb[k] as LatLng)[0] - (pa[k] as LatLng)[0])).toBeLessThan(1e-9)
            expect(Math.abs((pb[k] as LatLng)[1] - (pa[k] as LatLng)[1])).toBeLessThan(1e-9)
          }
          expect(Math.abs(pathLengthM(pb) - pathLengthM(pa))).toBeLessThan(1e-6)
        }
      }
    })
  }
})

describe('② segmentCrossings', () => {
  it('يُرجع نسب التقاطع مرتّبة وفريدة', () => {
    const idx = buildEdgeIndex(SQ)
    // مقطع من خارج غرب إلى خارج شرق عبر المربّع
    const ts = segmentCrossings([33.304, 44.39], [33.304, 44.42], idx)
    expect(ts.length).toBe(2)
    const [t0, t1] = ts as [number, number]
    expect(t0).toBeLessThan(t1)
    // الحدّان عند 44.4 و44.411 داخل نطاق 44.39..44.42 ⇒ 0.333 و0.7
    expect(t0).toBeCloseTo((44.4 - 44.39) / 0.03, 6)
    expect(t1).toBeCloseTo((44.411 - 44.39) / 0.03, 6)
  })

  it('يُرجع مصفوفة فارغة لمقطع بعيد', () => {
    const idx = buildEdgeIndex(SQ)
    expect(segmentCrossings([33.32, 44.43], [33.33, 44.44], idx)).toHaveLength(0)
  })

  it('لا يُرجع تقاطعات مكرّرة عند زاوية', () => {
    const idx = buildEdgeIndex(SQ)
    // يمرّ بالزاوية (33.3، 44.4) تماماً
    const ts = segmentCrossings([33.295, 44.395], [33.305, 44.405], idx)
    expect(new Set(ts).size).toBe(ts.length)
  })
})

describe('③ سقف الأشواط يحمي من نفاد الذاكرة', () => {
  it('يوقف الملف الشاذّ برسالة مفهومة لا بانهيار', () => {
    const ways: OsmWay[] = Array.from({ length: 30 }, (_, i) => ({
      id: i + 1,
      nodes: [i * 2, i * 2 + 1],
      tags: { highway: 'residential' },
    }))
    expect(() =>
      assembleImport({
        ways,
        lookupNode: (r) => [33.304 + (r % 10) * 1e-5, 44.405] as LatLng,
        zonePolygon: SQ,
        opts: { maxRouteWays: 10 },
      }),
    ).toThrow(/MAP_TOO_MANY_WAYS/)
  })

  it('السقف الافتراضي يغطّي أكبر زون حقيقي بثلاثة أضعاف على الأقل', () => {
    // أكبر زون مقيس: ٦٥٤ عنصراً · أقصى كثافة شوهدت ~٨٠٠ شوط/كم² · أكبر مساحة ~٥.8 كم²
    const worstRealistic = 800 * 5.8
    expect(DEFAULT_MAX_ROUTE_WAYS).toBeGreaterThan(worstRealistic * 3)
  })

  it('يمرّ الملف الصغير بلا اعتراض', () => {
    const ways: OsmWay[] = [
      { id: 1, nodes: [1, 2], tags: { highway: 'residential', name: 'س' } },
    ]
    const p = assembleImport({
      ways,
      lookupNode: (r) => (r === 1 ? [33.304, 44.405] : [33.305, 44.406]),
      zonePolygon: SQ,
    })
    expect(p.rows.length).toBeGreaterThan(0)
  })
})
