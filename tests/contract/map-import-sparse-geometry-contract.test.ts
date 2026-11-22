/**
 * عقد المرحلة ③ — الإعلان عن الشكل التقريبي قبل الإدراج.
 *
 * المبدأ: **البيانات صالحة، والشكل تقريبي.** لا يجوز إخفاء ذلك ولا منع
 * الإدراج بسببه. المشغّل يحتاج أن يعرف بالأرقام قبل أن يبني عليه قراراً،
 * لا أن يكتشف لاحقاً أن الخريطة زاويّة.
 *
 * يُحرس هنا أيضاً قرار تصميمي: **لا تلوين للمسارات الزاويّة**. تلوينها كان
 * سيُفسد مطابقة ألوان Overpass التي هي غرض المعاينة كله (المرحلة ②) — فالوسم
 * في التلميح وحده.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BOUNDARY_TOL_M,
  SPARSE_SEGMENT_M,
  nearestBoundaryM,
  type LatLng,
} from '@features/map-import/lib/geometry'

const ROOT = process.cwd()
const PAGE = readFileSync(
  join(ROOT, 'src/portals/ops-room/pages/MapPlanning/OpsMapImportPage.tsx'),
  'utf8',
)
const GEO = readFileSync(join(ROOT, 'src/features/map-import/lib/geometry.ts'), 'utf8')
const ASSEMBLE = readFileSync(join(ROOT, 'src/features/map-import/lib/assemble.ts'), 'utf8')

describe('① المقياس بالأمتار لا بعدد النقاط', () => {
  it('العتبة ١٥٠ متراً', () => {
    expect(SPARSE_SEGMENT_M).toBe(150)
  })

  it('لا يبقى أثر لمعيار «≤ ٣ نقاط» القديم', () => {
    // المعيار القديم كان يمسك ٦.٥٪ فقط من الصفوف — أُزيل لا عُطّل
    expect(ASSEMBLE).not.toMatch(/pts\.length\s*<=\s*3/)
    expect(GEO).not.toMatch(/pts\.length\s*<=\s*3/)
  })

  it('الصف يحمل maxSegmentM', () => {
    expect(ASSEMBLE).toMatch(/maxSegmentM\?: number/)
    expect(ASSEMBLE).toMatch(/maxSegmentM: round1\(longestSegmentM\(row\.pts\)\)/)
  })
})

describe('② الإحصاء بالطول لا بالعدد', () => {
  it('stats.sparse موجود', () => {
    expect(ASSEMBLE).toMatch(/sparse: \{/)
    expect(ASSEMBLE).toMatch(/km: number/)
    expect(ASSEMBLE).toMatch(/pct: number/)
  })

  it('pct محسوبة من الطول لا من عدد الصفوف', () => {
    expect(ASSEMBLE).toMatch(/sparseLenM \/ totalLengthM/)
  })

  it('يستثني الصفوف غير القابلة للاستيراد', () => {
    expect(ASSEMBLE).toMatch(/importableRows\.filter\(\(r\) => \(r\.maxSegmentM \?\? 0\) > SPARSE_SEGMENT_M\)/)
  })
})

describe('③ الإعلان للمشغّل', () => {
  it('تحذير في بطاقة الإحصاء', () => {
    expect(PAGE).toContain('الشكل تقريبي')
    expect(PAGE).toMatch(/preview\.stats\.sparse\.pct/)
  })

  it('التحذير يذكر النسبة والكيلومترات وأطول مقطع', () => {
    expect(PAGE).toMatch(/sparse\.pct\.toFixed\(0\)/)
    expect(PAGE).toMatch(/sparse\.km\.toFixed\(1\)/)
    expect(PAGE).toMatch(/sparse\.worstM\.toFixed\(0\)/)
  })

  it('التحذير يذكر الحلّ العملي', () => {
    expect(PAGE).toMatch(/أعد التصدير بلا اقتطاع|أعد تصدير الملف بلا اقتطاع/)
    expect(PAGE).toContain('أرباع')
  })

  it('تأكيد صريح عند الإدراج حين يكون الشكل تقريبياً', () => {
    expect(PAGE).toMatch(/const sp = preview\.stats\.sparse/)
    expect(PAGE).toMatch(/if \(sp\.pct > 0\)/)
    expect(PAGE).toMatch(/window\.confirm/)
  })

  it('التحذير لا يمنع الإدراج — البيانات صالحة', () => {
    // بعد التأكيد يُستدعى insert بلا شرط إضافي
    expect(PAGE).toMatch(/void insert\(activeZoneId, preview\)/)
  })

  it('لا تلوين للمسارات الزاويّة (حفاظاً على مطابقة Overpass)', () => {
    // التمييز في التلميح فقط
    expect(PAGE).toMatch(/أطول مقطع \{?r\.maxSegmentM/)
    expect(PAGE).not.toMatch(/maxSegmentM[^\n]*\?\s*'#[0-9a-f]{6}'/)
  })
})

describe('④ ضلع الحدود الأخير — العيب المُصلَح', () => {
  // مضلّع مفتوح كزون rth تماماً
  const square: LatLng[] = [
    [33.3, 44.3],
    [33.3, 44.32],
    [33.32, 44.32],
    [33.32, 44.3],
  ]

  it('nearestBoundaryM يمرّ على n ضلعاً لا n-1', () => {
    expect(GEO).toMatch(/for \(let i = 0; i < n; i\+\+\) \{/)
    expect(GEO).toMatch(/poly\[\(i \+ 1\) % n\]/)
  })

  it('نقطة على الضلع الأخير مسافتها صفر لا Infinity', () => {
    // منتصف الضلع بين [33.32,44.3] و[33.3,44.3] — هو الضلع الذي كان يُهمل
    expect(nearestBoundaryM([33.31, 44.3], square)).toBeLessThan(1)
  })

  it('التسامح ٥ أمتار معلن ومقصود (رديف لقاعدة البيانات)', () => {
    expect(BOUNDARY_TOL_M).toBe(5)
  })
})
