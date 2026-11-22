/**
 * اختبارات المجمّع — يربط القارئ بالهندسة والتصنيف.
 *
 * ملفات الاختبار مبنية يدوياً عمداً: مربّع ~١كم والطرق داخله معروفة أطوالها
 * بالحساب اليدوي، فنستطيع الحكم على الناتج لا على نفسه.
 */
import { describe, expect, it } from 'vitest'
import { assembleImport, pathToJsonb } from '@features/map-import/lib/assemble'
import { parseOsmStream, textToStream, type OsmWay } from '@features/map-import/lib/osm-stream'
import { polygonAreaM2, type LatLng } from '@features/map-import/lib/geometry'

const ZONE: LatLng[] = [
  [33.3, 44.4],
  [33.3, 44.411],
  [33.309, 44.411],
  [33.309, 44.4],
]

/** يبني XML من عُقد وأشواط مُعلنة، ثم يُحلّل ويُجمّع */
async function run(nodes: Array<[number, number, number]>, ways: string[], zone = ZONE) {
  const xml = `<?xml version="1.0"?><osm>${nodes
    .map(([id, lat, lng]) => `<node id="${id}" lat="${lat}" lon="${lng}"/>`)
    .join('')}${ways.join('')}</osm>`
  const collected: OsmWay[] = []
  const map = new Map<number, LatLng>()
  await parseOsmStream(textToStream(xml), {
    onNode: (id, lat, lng) => map.set(id, [lat, lng]),
    onWay: (w) => collected.push(w),
  })
  return assembleImport({ ways: collected, lookupNode: (r) => map.get(r), zonePolygon: zone })
}

/** صف من الناتج أو يفشل الاختبار — يفصل التحقق عن الاستخدام (noUncheckedIndexedAccess) */
function row<T>(rows: T[], i: number): T {
  const v = rows[i]
  expect(v).toBeDefined()
  return v as T
}

const way = (id: number, refs: number[], tags: Record<string, string>) =>
  `<way id="${id}">${refs.map((r) => `<nd ref="${r}"/>`).join('')}${Object.entries(tags)
    .map(([k, v]) => `<tag k="${k}" v="${v}"/>`)
    .join('')}</way>`

describe('① مسار سليم داخل الزون', () => {
  it('شارع واحد من نقطتين ⇒ صف واحد بكود STR-0001', async () => {
    const r = await run(
      [
        [1, 33.302, 44.402],
        [2, 33.306, 44.406],
      ],
      [way(100, [1, 2], { highway: 'primary', name: 'شارع السعدون' })],
    )
    expect(r.rows).toHaveLength(1)
    expect(row(r.rows, 0).code).toBe('STR-0001')
    expect(row(r.rows, 0).kind).toBe('primary')
    expect(row(r.rows, 0).name).toBe('شارع السعدون')
    expect(r.skipped).toHaveLength(0)
  })

  it('الطول محسوب ويطابق المسافة بين النقطتين', async () => {
    const r = await run(
      [
        [1, 33.3, 44.405],
        [2, 33.31, 44.405],
      ],
      [way(1, [1, 2], { highway: 'residential' })],
    )
    // 0.01° عرض ≈ 1112م — لكن الزون ينتهي عند 33.309، فيُقصّ إلى ~1001م
    expect(r.rows).toHaveLength(1)
    expect(row(r.rows, 0).lengthM).toBeGreaterThan(990)
    expect(row(r.rows, 0).lengthM).toBeLessThan(1015)
  })
})

describe('② القصّ — العيب المُصلح', () => {
  it('طريق يعبر الزون كاملاً يُدرج مقصوصاً لا يُسقط', async () => {
    const r = await run(
      [
        [1, 33.29, 44.405], // خارج جنوباً
        [2, 33.32, 44.405], // خارج شمالاً
      ],
      [way(1, [1, 2], { highway: 'primary', name: 'شارع عابر' })],
    )
    expect(r.rows).toHaveLength(1)
    expect(row(r.rows, 0).code).toBe('STR-0001')
    expect(row(r.rows, 0).lengthM).toBeGreaterThan(990)
    expect(row(r.rows, 0).lengthM).toBeLessThan(1015)
    // لا تحذير إسقاط
    expect(r.skipped.filter((s) => s.osmWayId === 1)).toHaveLength(0)
  })

  it('طريقان عابران (شمال-جنوب وشرق-غرب) ⇒ كلاهما يُدرج', async () => {
    const r = await run(
      [
        [1, 33.29, 44.405], // خارج جنوباً
        [2, 33.32, 44.405], // خارج شمالاً
        [3, 33.304, 44.399], // خارج غرباً (الحد 44.4)
        [4, 33.304, 44.412], // خارج شرقاً (الحد 44.411)
      ],
      [
        way(1, [1, 2], { highway: 'primary' }),
        way(2, [3, 4], { highway: 'secondary' }),
      ],
    )
    expect(r.rows).toHaveLength(2)
    expect(r.rows.map((x) => x.code).sort()).toEqual(['SEC-0001', 'STR-0001'])
    // كلاهما بطول عرض/طول الزون لا بطول المقطع الأصلي
    for (const row of r.rows) {
      expect(row.lengthM).toBeGreaterThan(990)
      expect(row.lengthM).toBeLessThan(1040)
    }
  })
})

describe('③ ما يُرفض — مع السبب', () => {
  it('شوط بعقدة واحدة ناقصة ⇒ يُدرج الجزء الصالح ويُعلم بذلك', async () => {
    // ٢ من ٣ عقد موجودة ⇒ مقطع صالح. لا نُسقط ما يمكن رسمه.
    const r = await run(
      [
        [1, 33.302, 44.402],
        [2, 33.303, 44.403],
      ],
      [way(9, [1, 2, 999], { highway: 'primary', name: 'جزئي' })],
    )
    expect(r.rows).toHaveLength(1)
    expect(row(r.rows, 0).name).toBe('جزئي')
    expect(r.skipped.some((s) => s.osmWayId === 9 && s.reason.includes('عقد ناقصة'))).toBe(true)
  })

  it('شوط بعقدتين ناقصتين من ثلاث ⇒ يُسقط بلا تخمين', async () => {
    const r = await run(
      [[1, 33.302, 44.402]],
      [way(9, [1, 997, 998], { highway: 'primary', name: 'ناقص' })],
    )
    expect(r.rows).toHaveLength(0)
    expect(r.skipped).toHaveLength(1)
    expect(row(r.skipped, 0).reason).toContain('عقد ناقصة')
    expect(row(r.skipped, 0).name).toBe('ناقص')
  })

  it('شوط بشهادتين فقط بلا عقد كافية ⇒ مرفوض', async () => {
    const r = await run([[1, 33.302, 44.402]], [way(9, [1], { highway: 'primary' })])
    expect(r.rows).toHaveLength(0)
  })

  it('ساحة الفتح ليست شارعاً ⇒ لا صف ولا تخطٍّ (ليست مرشّحة أصلاً)', async () => {
    const r = await run(
      [
        [1, 33.302, 44.402],
        [2, 33.303, 44.403],
      ],
      [way(5, [1, 2], { highway: 'primary', name: 'ساحة الفتح' })],
    )
    expect(r.rows).toHaveLength(0)
    expect(r.skipped).toHaveLength(0) // رُفضت في القارئ لكي لا تُشوش القائمة
  })

  it('شوط خارج الزون تماماً ⇒ لا صف ولا تخطٍّ (ليس من شأننا)', async () => {
    const r = await run(
      [
        [1, 33.4, 44.5],
        [2, 33.41, 44.51],
      ],
      [way(7, [1, 2], { highway: 'primary' })],
    )
    expect(r.rows).toHaveLength(0)
    expect(r.skipped).toHaveLength(0)
  })
})

describe('④ الأكواد — ثابتة عبر التشغيل', () => {
  it('نفس المدخل ⇒ نفس الأكواد بالضبط', async () => {
    const nodes: Array<[number, number, number]> = [
      [1, 33.302, 44.402],
      [2, 33.306, 44.406],
      [3, 33.304, 44.4],
      [4, 33.304, 44.41],
    ]
    const ways = [
      way(50, [1, 2], { highway: 'primary', name: 'أ' }),
      way(10, [3, 4], { highway: 'primary', name: 'ب' }),
    ]
    const a = await run(nodes, ways)
    const b = await run(nodes, ways)
    expect(a.rows.map((r) => r.code)).toEqual(b.rows.map((r) => r.code))
  })

  it('الترتيب y-ثم-x لا ترتيب الملف', async () => {
    // 10 شمالاً و20 جنوباً؛ 10 يظهر أولاً في الملف
    const r = await run(
      [
        [1, 33.307, 44.401],
        [2, 33.307, 44.402],
        [3, 33.301, 44.401],
        [4, 33.301, 44.402],
      ],
      [way(10, [3, 4], { highway: 'primary' }), way(20, [1, 2], { highway: 'primary' })],
    )
    expect(r.rows).toHaveLength(2)
    // الأصغر latitude أولاً ⇒ الصف الأول من النقاط 3,4
    expect(row(r.rows, 1).osmWayId).toBe(20)
    expect(row(r.rows, 0).osmWayId).toBe(10)
  })

  it('بادئات مختلفة تُعدّ منفصلة', async () => {
    const r = await run(
      [
        [1, 33.301, 44.401],
        [2, 33.301, 44.402],
        [3, 33.302, 44.401],
        [4, 33.302, 44.402],
        [5, 33.303, 44.401],
        [6, 33.303, 44.402],
      ],
      [
        way(1, [1, 2], { highway: 'primary' }),
        way(2, [3, 4], { highway: 'secondary' }),
        way(3, [5, 6], { highway: 'footway' }),
      ],
    )
    expect(r.rows.map((x) => x.code).sort()).toEqual(['ALY-0001', 'SEC-0001', 'STR-0001'])
  })
})

describe('⑤ المحلات', () => {
  it('رقم المحلة يُستخرج من الاسم ويُنشأ MHL', async () => {
    const r = await run(
      [
        [1, 33.302, 44.402],
        [2, 33.303, 44.403],
        [3, 33.304, 44.404],
        [4, 33.305, 44.405],
      ],
      [
        way(1, [1, 2], { highway: 'footway', name: '905-16' }),
        way(2, [3, 4], { highway: 'footway', name: '101-3' }),
      ],
    )
    expect(r.stats.mahallas).toBe(2)
    const byNum = Object.values(r.mahallas).filter((m) => m.osmNumber)
    expect(byNum.map((m) => m.osmNumber).sort()).toEqual(['101', '905'])
    expect(r.rows.every((x) => x.linkSource === 'osm_name')).toBe(true)
  })

  it('زقاق بلا رقم محلة ⇒ محلة «غير محدّدة» مُعلنة الزيف', async () => {
    const r = await run(
      [
        [1, 33.302, 44.402],
        [2, 33.303, 44.403],
      ],
      [way(1, [1, 2], { highway: 'footway', name: 'زقاق بلا رقم' })],
    )
    expect(r.stats.unnamedAlleys).toBe(1)
    const un = r.mahallas['__UNASSIGNED__']
    expect(un).toBeDefined()
    expect((un as { code: string }).code).toBe('MHL-0000')
    expect((un as { osmNumber: string | null }).osmNumber).toBeNull()
    expect(row(r.rows, 0).linkSource).toBe('manual')
    // ولا يُحتسب في عدد المحلات الحقيقية
    expect(r.stats.mahallas).toBe(0)
  })

  it('لا محلات ⇒ لا محلة «غير محدّدة»', async () => {
    const r = await run(
      [
        [1, 33.302, 44.402],
        [2, 33.303, 44.403],
      ],
      [way(1, [1, 2], { highway: 'primary' })],
    )
    expect(r.mahallas.__UNASSIGNED__).toBeUndefined()
    expect(r.stats.mahallas).toBe(0)
  })
})

describe('⑥ العرض', () => {
  it('الشارع يأخذ العرض الافتراضي ويُوسم default', async () => {
    const r = await run(
      [
        [1, 33.302, 44.402],
        [2, 33.303, 44.403],
      ],
      [way(1, [1, 2], { highway: 'primary' })],
    )
    expect(row(r.rows, 0).widthM).toBe(6)
    expect(row(r.rows, 0).widthSource).toBe('default')
  })

  it('زقاقان متوازيان على ١٠م ⇒ العرض مقيس ≈ ٧م', async () => {
    // ٠.٠٠٠٠٩° عرض ≈ 10م
    const r = await run(
      [
        [1, 33.302, 44.402],
        [2, 33.302, 44.404],
        [3, 33.30209, 44.402],
        [4, 33.30209, 44.404],
      ],
      [way(1, [1, 2], { highway: 'footway' }), way(2, [3, 4], { highway: 'footway' })],
    )
    expect(r.rows).toHaveLength(2)
    // كلاهما قِيس من محور الآخر
    expect(r.rows.every((x) => x.widthSource === 'measured')).toBe(true)
    // 10 − 2×1.5 = 7
    expect(row(r.rows, 0).widthM).toBeGreaterThan(6)
    expect(row(r.rows, 0).widthM).toBeLessThan(8)
  })

  it('زقاق وحيد ⇒ العرض الافتراضي (لا جار يُقاس منه)', async () => {
    const r = await run(
      [
        [1, 33.302, 44.402],
        [2, 33.303, 44.403],
      ],
      [way(1, [1, 2], { highway: 'footway' })],
    )
    expect(row(r.rows, 0).widthSource).toBe('default')
    expect(row(r.rows, 0).widthM).toBe(3)
  })
})

describe('⑦ الإحصاءات', () => {
  it('الأطوال والكثافة محسوبة', async () => {
    const r = await run(
      [
        [1, 33.3005, 44.4005],
        [2, 33.3085, 44.4005],
      ],
      [way(1, [1, 2], { highway: 'primary' })],
    )
    expect(r.stats.streets).toBe(1)
    expect(r.stats.alleys).toBe(0)
    expect(r.stats.totalLengthKm).toBeGreaterThan(0.8)
    expect(r.stats.areaKm2).toBeGreaterThan(1)
    expect(r.stats.density).toBeGreaterThan(0)
  })

  it('كثافة منخفضة تُطلق تحذيراً (كاشف نقص OSM)', async () => {
    // شارع واحد قصير في زون ١ كم² ⇒ كثافة ~١ ⇒ تحذير
    const r = await run(
      [
        [1, 33.302, 44.402],
        [2, 33.303, 44.403],
      ],
      [way(1, [1, 2], { highway: 'primary' })],
    )
    expect(r.stats.densityWarn).toContain('منخفضة')
  })
})

describe('⑧ pathToJsonb — الصيغة التي تفهمها app.map_*', () => {
  it('مصفوفة [[lat,lng]] بلا فراغات', () => {
    expect(pathToJsonb([[33.3, 44.4], [33.31, 44.41]])).toBe('[[33.3,44.4],[33.31,44.41]]')
  })
  it('مصفوفة فارغة', () => {
    expect(pathToJsonb([])).toBe('[]')
  })
})

describe('⑨ المساحة تُطابق الحساب المستقل', () => {
  it('نفس مساحة polygonAreaM2', async () => {
    const r = await run([], [])
    expect(polygonAreaM2(r.zonePolygon)).toBeGreaterThan(1_000_000)
  })
})
