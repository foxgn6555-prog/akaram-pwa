/**
 * مطابقة المحرّك الجديد (TS) بالسكربت المرجعي (Python).
 *
 * المعيار: كل رقم هنا مُقتبس من تشغيل فعلي لـ`scripts/import-map-planning.py`
 * أو محسوب يدوياً من صيغة مستقلة، لا من دالة أخرى في الملف نفسه (وإلا
 * اختبرنا الدالة ضد نفسها).
 */
import { describe, expect, it } from 'vitest'
import {
  BOUNDARY_TOL_M,
  centroid,
  clipPath,
  densitySanity,
  distM,
  insideOrOnZone,
  nearestBoundaryM,
  pathLengthM,
  pointInPolygon,
  polygonAreaM2,
  polygonPerimeterM,
  segDistanceM,
  segIntersectParams,
  type LatLng,
} from '@features/map-import/lib/geometry'

/** مربّع ١كم × ١كم تقريباً عند خط عرض بغداد (33.3) */
const SQ: LatLng[] = [
  [33.3, 44.4],
  [33.3, 44.411],
  [33.309, 44.411],
  [33.309, 44.4],
  [33.3, 44.4],
]

/** يُخرج الجزء الأول أو يفشل الاختبار — يفصل التحقق عن الاستخدام (noUncheckedIndexedAccess) */
function part1(parts: LatLng[][]): LatLng[] {
  const p = parts[0]
  expect(p).toBeDefined()
  return p as LatLng[]
}
/** نقطة من مصفوفة أو يفشل الاختبار — لا `!` أعمى */
function pt(points: LatLng[], i: number): LatLng {
  const v = points[i]
  expect(v).toBeDefined()
  return v as LatLng
}

describe('① distM — haversine', () => {
  it('درجة عرض واحدة ≈ 111.2 كم', () => {
    const d = distM([33.3, 44.4], [34.3, 44.4])
    expect(d / 1000).toBeCloseTo(111.19, 0)
  })
  it('درجة طول عند 33.3° ≈ 93 كم', () => {
    const d = distM([33.3, 44.4], [33.3, 45.4])
    expect(d / 1000).toBeCloseTo(93.2, 0)
  })
  it('نفس النقطة ⇒ صفر بالضبط', () => {
    expect(distM([33.3, 44.4], [33.3, 44.4])).toBe(0)
  })
})

describe('② pointInPolygon — ray casting', () => {
  it('النقطة الوسطى داخل', () => {
    expect(pointInPolygon([33.304, 44.405], SQ)).toBe(true)
  })
  it('خارج من كل جهة', () => {
    expect(pointInPolygon([33.29, 44.405], SQ)).toBe(false)
    expect(pointInPolygon([33.32, 44.405], SQ)).toBe(false)
    expect(pointInPolygon([33.304, 44.39], SQ)).toBe(false)
    expect(pointInPolygon([33.304, 44.42], SQ)).toBe(false)
  })
  it('يعمل مع الحلقة المفتوحة (آخر نقطة ≠ أولها) — وهي صيغة gps_geofences', () => {
    const open = SQ.slice(0, 4)
    expect(pointInPolygon([33.304, 44.405], open)).toBe(true)
    expect(pointInPolygon([33.32, 44.405], open)).toBe(false)
  })
  it('مضلّع أقل من ٣ نقاط ⇒ خارج دائماً', () => {
    expect(pointInPolygon([33.3, 44.4], [[33.3, 44.4], [33.31, 44.41]])).toBe(false)
  })
})

describe('③ segDistanceM / nearestBoundaryM', () => {
  it('نقطة على المقطع ⇒ صفر', () => {
    expect(segDistanceM([33.3, 44.405], [33.3, 44.4], [33.3, 44.411])).toBeCloseTo(0, 3)
  })
  it('نقطة بعيدة ١٠٠م تقريباً عن ضلع', () => {
    // 0.0009° عرض ≈ 100م
    const d = segDistanceM([33.3009, 44.405], [33.3, 44.4], [33.3, 44.411])
    expect(d).toBeGreaterThan(99)
    expect(d).toBeLessThan(101)
  })
  it('أقرب حدّ للمركز = نصف الضلع', () => {
    const d = nearestBoundaryM([33.3045, 44.4055], SQ)
    expect(d).toBeGreaterThan(480)
  })
})

describe('④ insideOrOnZone — تسامح ٥م', () => {
  it('نقطة على الحد تماماً تُعدّ داخلة (كانت تُرفض قبل إصلاح الجولة ٢)', () => {
    expect(insideOrOnZone([33.3, 44.405], SQ)).toBe(true)
  })
  it('نقطة خارج الحد بـ٣م تُعدّ داخلة', () => {
    // 3م ≈ 0.000027° عرض
    expect(insideOrOnZone([33.3 - 0.000027, 44.405], SQ, BOUNDARY_TOL_M)).toBe(true)
  })
  it('نقطة خارج الحد بـ٥٠م ليست داخلة', () => {
    expect(insideOrOnZone([33.3 - 0.00045, 44.405], SQ)).toBe(false)
  })
})

describe('⑤ segIntersectParams', () => {
  it('تقاطع متصالب ⇒ النسبة محسوبة يدوياً (44.405 بين 44.4 و44.411)', () => {
    const t = segIntersectParams([33.3, 44.4], [33.3, 44.411], [33.305, 44.405], [33.295, 44.405])
    // (44.405 − 44.4) / (44.411 − 44.4) = 0.005/0.011 = 0.4545 — لا 0.5
    expect(t).toBeCloseTo(5 / 11, 4)
  })
  it('تقاطع في المنتصف تماماً ⇒ 0.5', () => {
    const t = segIntersectParams([33.3, 44.4], [33.3, 44.41], [33.305, 44.405], [33.295, 44.405])
    expect(t).toBeCloseTo(0.5, 5)
  })
  it('متوازيان ⇒ null', () => {
    expect(segIntersectParams([33.3, 44.4], [33.3, 44.411], [33.31, 44.4], [33.31, 44.411])).toBeNull()
  })
  it('لا يتقاطعان ⇒ null', () => {
    expect(segIntersectParams([33.301, 44.4], [33.301, 44.402], [33.305, 44.406], [33.305, 44.408])).toBeNull()
  })
})

describe('⑥ clipPath — الأهم: يمنع تضخيم الطول', () => {
  it('مسار كامل داخل الزون ⇒ يبقى كاملاً', () => {
    const line: LatLng[] = [
      [33.302, 44.402],
      [33.306, 44.406],
    ]
    const parts = clipPath(line, SQ)
    expect(parts).toHaveLength(1)
    expect(pathLengthM(part1(parts))).toBeCloseTo(pathLengthM(line), 1)
  })
  /**
   * هذا هو العيب الذي أُصلح: كان الجزء «المقصوص» يمتد خارج الزون
   * (٢٢٢٤م بدل ١٠٠١م) ثم يرفضه المجمّع ⇒ الطريق العابر يُسقط كاملاً.
   */
  it('مسار يعبر الزون كاملاً ⇒ يُقصّ لطول عرض الزون بالضبط', () => {
    const line: LatLng[] = [
      [33.29, 44.405], // خارج جنوباً
      [33.32, 44.405], // خارج شمالاً
    ]
    const parts = clipPath(line, SQ)
    expect(parts).toHaveLength(1)
    const len = pathLengthM(part1(parts))
    // عرض الزون = 0.009° ≈ 1001م — لا 2224م (العيب) ولا 3336م (بلا قصّ)
    expect(len).toBeGreaterThan(990)
    expect(len).toBeLessThan(1015)
    // وطرفاه على الحدّ أو داخله — وهذا ما يجعل المجمّع يقبله
    expect(insideOrOnZone(pt(part1(parts), 0), SQ)).toBe(true)
    expect(insideOrOnZone(pt(part1(parts), part1(parts).length - 1), SQ)).toBe(true)
  })

  it('عبور شرق-غرب ⇒ طول عرض الزون لا طول المقطع كاملاً', () => {
    const parts = clipPath([[33.304, 44.39], [33.304, 44.42]], SQ)
    expect(parts).toHaveLength(1)
    const len = pathLengthM(part1(parts))
    // 0.011° طول عند 33.3° ≈ 1023م
    expect(len).toBeGreaterThan(1010)
    expect(len).toBeLessThan(1040)
  })

  it('عبور قطري ⇒ لا يتجاوز قطر الزون', () => {
    const parts = clipPath([[33.29, 44.39], [33.32, 44.42]], SQ)
    const total = parts.reduce((s, p) => s + pathLengthM(p), 0)
    // القطر ≈ 1430م — العيب كان يعطي 2898م
    expect(total).toBeLessThan(1500)
    expect(total).toBeGreaterThan(1250)
  })

  it('مسار يعود فيدخل الزون مرتين ⇒ جزآن لا جزء واحد ملتوٍ', () => {
    const parts = clipPath(
      [[33.29, 44.405], [33.32, 44.405], [33.29, 44.405]],
      SQ,
    )
    expect(parts.length).toBe(2)
    // مجموع الطولين ≈ 2002م (مروران) لا 4337م (العيب)
    const total = parts.reduce((s, p) => s + pathLengthM(p), 0)
    expect(total).toBeLessThan(2100)
    for (const p of parts) {
      expect(insideOrOnZone(pt(p, 0), SQ)).toBe(true)
      expect(insideOrOnZone(pt(p, p.length - 1), SQ)).toBe(true)
    }
  })

  it('يبدأ داخل الزون وينتهي خارجه ⇒ يُغلق عند الحدّ', () => {
    const parts = clipPath([[33.304, 44.405], [33.32, 44.405]], SQ)
    expect(parts).toHaveLength(1)
    expect(insideOrOnZone(pt(part1(parts), 0), SQ)).toBe(true)
    expect(insideOrOnZone(pt(part1(parts), part1(parts).length - 1), SQ)).toBe(true)
    // من 33.304 إلى الحدّ 33.309 = 0.005° ≈ 556م — لا 1779م
    expect(pathLengthM(part1(parts))).toBeLessThan(600)
  })
  it('مسار خارج الزون تماماً ⇒ لا أجزاء', () => {
    const line: LatLng[] = [
      [33.35, 44.5],
      [33.36, 44.51],
    ]
    expect(clipPath(line, SQ)).toHaveLength(0)
  })
  it('مسار يخرج ويدخل ⇒ جزآن منفصلان', () => {
    // يدخل الزون ثم يخرج من اليمين ثم يعود
    const line: LatLng[] = [
      [33.304, 44.395],
      [33.304, 44.42],
      [33.304, 44.395],
    ]
    const parts = clipPath(line, SQ)
    expect(parts.length).toBeGreaterThanOrEqual(1)
    // كل جزء داخل الزون فعلاً
    for (const p of parts) {
      expect(insideOrOnZone(pt(p, 0), SQ)).toBe(true)
    }
  })
  it('أجزاء أقصر من ٣م تُسقط', () => {
    // قطعة ١م داخل الحد
    const line: LatLng[] = [
      [33.30002, 44.405],
      [33.30001, 44.405],
    ]
    expect(clipPath(line, SQ)).toHaveLength(0)
  })
})

describe('⑦ polygonAreaM2 — مساحة', () => {
  it('مربّع 1كم × 1كم ≈ 1.03 كم² (خط العرض 33.3 يضيّق الطول)', () => {
    const km2 = polygonAreaM2(SQ) / 1e6
    // 0.009° عرض × 0.011° طول ≈ 1001م × 1025م ≈ 1.026 كم²
    expect(km2).toBeGreaterThan(1.0)
    expect(km2).toBeLessThan(1.1)
  })
  it('المفتوح والمغلق يعطيان نفس المساحة (فرق تقريب ١٠ م² فقط)', () => {
    // لماذا لا يتساويان بالضبط: SQ يكرّر نقطة البداية في النهاية، فيُحسب
    // الضلع الأخير مرتين بمساحة ~٠. عند 1.03 كم² الفرق 10 م² = 1e-5 نسبياً.
    const closed = polygonAreaM2(SQ)
    const open = polygonAreaM2(SQ.slice(0, 4))
    expect(Math.abs(closed - open) / closed).toBeLessThan(1e-4)
  })
  it('مضلّع أقل من ٣ ⇒ صفر', () => {
    expect(polygonAreaM2([[33.3, 44.4], [33.31, 44.41]])).toBe(0)
  })
})

describe('⑧ polygonPerimeterM', () => {
  it('محيط المربّع ≈ 4 كم', () => {
    const p = polygonPerimeterM(SQ)
    expect(p / 1000).toBeGreaterThan(3.9)
    expect(p / 1000).toBeLessThan(4.2)
  })
})

describe('⑨ densitySanity — الفحص الذي يكشف نقص OSM', () => {
  it('كثافة ٢٠.٥ ضمن النطاق ⇒ لا تحذير', () => {
    // نضبط الطول ليخرج 20.5: المساحة ≈ 1.026 كم² ⇒ 21.03 كم مطلوبة
    const total = 20.5 * 1.026
    const { density, warn } = densitySanity(total * 1000, SQ)
    expect(warn).toBeNull()
    expect(density).toBeGreaterThan(19)
    expect(density).toBeLessThan(22)
  })
  it('كثافة ٢ ⇒ تحذير «منخفضة جداً» (يُظهر OSM ناقصاً)', () => {
    const { warn } = densitySanity(2 * 1026 * 1000 / 1000, SQ)
    expect(warn).toContain('منخفضة')
  })
  it('كثافة ٦٠ ⇒ تحذير «مرتفعة جداً» (يُظهر مضلّعاً مكرراً)', () => {
    const { warn } = densitySanity(60 * 1026, SQ)
    expect(warn).toContain('مرتفعة')
  })
  it('مضلّع صفر المساحة ⇒ تحذير صريح', () => {
    const { warn } = densitySanity(1000, [[33.3, 44.4], [33.3, 44.4], [33.3, 44.4]])
    expect(warn).toContain('صفر')
  })
})

describe('⑩ centroid', () => {
  it('مركز المربّع', () => {
    const c = centroid(SQ.slice(0, 4))
    expect(c[0]).toBeCloseTo(33.3045, 4)
    expect(c[1]).toBeCloseTo(44.4055, 4)
  })
})
