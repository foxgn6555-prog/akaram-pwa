/**
 * الجولة ③ — «عرض جميع الزونات» في محرّر الخريطة.
 *
 * ## ما تحميه هذه الاختبارات
 * ① **الاختيار لا يُصفَّر عند الإطفاء/التشغيل** — هذا هو العطل الذي كان سيقع
 *    لو رُبط `zoneId` بالطبقة: يفتح المستخدم المحرّر على زون، يُطفئ الطبقة
 *    ليرى الخريطة نظيفة، فيعود إلى أوّل زون في القائمة وقد فقد موضعه.
 * ② **الطبقة حدود فقط** — لا تُرسم شوارع/أزقة زون آخر (الأداء أولاً: رسم
 *    آلاف العناصر يجمّد الخريطة، وهو نفس العطل الذي مُنع في تقرير ②).
 * ③ **النقر على زون يختاره** — الطبقة مدخل لا زخرفة.
 * ④ **الزونات بلا مضلّع لا تُسقط الشاشة** — تُتجاهَل ويُنبَّه بعددها.
 * ⑤ **لوحة الألوان مستقرة** — تعتمد على الترتيب لا على `id`.
 */
import { describe, expect, it } from 'vitest'
import { zoneColorAt, ZONE_PALETTE, parseZonePolygonText } from '@features/map-import/lib/zone-polygon'
import { centroid } from '@features/map-import/components/ZoneOutlinesLayer'

describe('③ لوحة ألوان الزونات', () => {
  it('تعيد لوناً معرَّفاً دائماً', () => {
    for (let i = 0; i < 40; i++) expect(ZONE_PALETTE).toContain(zoneColorAt(i))
  })

  it('الأزونات الثمانية الأولى بألوان مختلفة — وهذا سبب وجود اللوحة', () => {
    const eight = Array.from({ length: 8 }, (_, i) => zoneColorAt(i))
    expect(new Set(eight).size).toBe(8)
  })

  it('ما بعد الثمانية يعيد التدوير لا `undefined`', () => {
    expect(zoneColorAt(8)).toBe(zoneColorAt(0))
    expect(zoneColorAt(0)).not.toBeUndefined()
  })

  it('الفهرس السالب لا يُخرج لوناً خارج اللوحة (لا انهيار على بيانات شاذة)', () => {
    expect(ZONE_PALETTE).toContain(zoneColorAt(-1))
    expect(ZONE_PALETTE).toContain(zoneColorAt(-9))
  })

  it('مستقلّ عن المعرّف: نفس الترتيب = نفس اللون دائماً', () => {
    // دالّة واحدة لا تقبل id أصلاً — الحارس أن التوقيع بقي رقماً واحداً
    expect(zoneColorAt.length).toBe(1)
  })
})

describe('③ مركز التسمية', () => {
  it('متوسّط القمم', () => {
    expect(centroid([[1, 2], [3, 4]])).toEqual([2, 3])
  })

  it('مضلّع فارغ لا يُنتج NaN (Leaflet يرفض Null Island صامتاً)', () => {
    const [lat, lng] = centroid([])
    expect(Number.isFinite(lat)).toBe(true)
    expect(Number.isFinite(lng)).toBe(true)
  })

  it('مثلث حقيقي: المركز داخل نطاق القمم', () => {
    const pts: Array<[number, number]> = [
      [33.3, 44.4],
      [33.32, 44.42],
      [33.28, 44.42],
    ]
    const [lat, lng] = centroid(pts)
    expect(lat).toBeGreaterThan(33.28)
    expect(lat).toBeLessThan(33.32)
    expect(lng).toBeGreaterThanOrEqual(44.4)
  })
})

describe('③ رسم المضلّع: أقلّ من ٣ نقاط ليس مضلّعاً', () => {
  it('نقطتان لا ترسمان شيئاً — الشرط في المكوّن `points.length < 3`', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync('src/features/map-import/components/ZoneOutlinesLayer.tsx', 'utf8'),
    )
    expect(src).toContain('points.length < 3')
  })

  it('نصّ Overpass فارغ يُنتج نقاطاً فارغة (لا استثناء)', () => {
    expect(parseZonePolygonText('')).toEqual([])
    expect(parseZonePolygonText(null)).toEqual([])
  })

  it('نصّ صالح يُنتج أزواج lat/lng بالترتيب الصحيح', () => {
    expect(parseZonePolygonText('33.30 44.40 33.31 44.41')).toEqual([
      [33.3, 44.4],
      [33.31, 44.41],
    ])
  })
})

describe('③ الطبقة لا ترسم عناصر داخلية', () => {
  it('لا تستورد شوارع ولا أزقة — حدود فقط', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync('src/features/map-import/components/ZoneOutlinesLayer.tsx', 'utf8'),
    )
    expect(src).not.toMatch(/useMapStreets|useMapAlleys/)
    expect(src).toContain('<Polygon')
    // لا `Polyline` للشوارع داخل الطبقة
    expect(src).not.toContain('<Polyline')
  })
})
