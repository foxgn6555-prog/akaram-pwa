/**
 * عقد المرحلة ② — المعاينة تُطابق Overpass بصرياً.
 *
 * قرار المشغّل: **«نمط Overpass افتراضياً للمعاينة: نعم»**
 *
 * السبب المقيس (docs/plans/map-import-shape-mismatch-diagnosis.md، السبب ②):
 * المسارات متطابقة تقريباً، لكن ألواننا (أحمر/برتقالي/تركوازي) صالبة داكنة
 * وألوان OSM فاتحة جداً ⇒ العين تقرأ خريطتين مختلفتين رغم تطابق الهندسة.
 *
 * يُحرس هنا أيضاً قرار تصميمي مهم: **الروابط تُعرض ولا تُستورد**. لولا هذا
 * العقد، تفعيل الخيار كان سيُدرج ١١٩ منحدراً كشوارع فيضخّم الكثافة ويولّد
 * زيارات وهمية — وهو سبب إسقاطها الأصلي.
 */
import { describe, expect, it } from 'vitest'
import { osmStrokeFor, strokeFor } from '@features/map-import/lib/osm-colors'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const PAGE = readFileSync(
  join(ROOT, 'src/portals/ops-room/pages/MapPlanning/OpsMapImportPage.tsx'),
  'utf8',
)
const COLORS = readFileSync(join(ROOT, 'src/features/map-import/lib/osm-colors.ts'), 'utf8')
const SDK = readFileSync(join(ROOT, 'src/services/map-import.sdk.ts'), 'utf8')
const ASSEMBLE = readFileSync(join(ROOT, 'src/features/map-import/lib/assemble.ts'), 'utf8')

describe('① نمط Overpass افتراضي', () => {
  it('الحالة الابتدائية previewStyle = overpass', () => {
    expect(PAGE).toMatch(/useState<PreviewStyle>\('overpass'\)/)
  })

  it('لا توجد قيمة ابتدائية أخرى للنمط', () => {
    expect(PAGE).not.toMatch(/useState<PreviewStyle>\('brand'\)/)
  })

  it('الرسم يمرّ عبر strokeFor بالنمط والسمة', () => {
    expect(PAGE).toMatch(/strokeFor\(previewStyle, r, theme\)/)
  })

  it('الألوان القديمة أُزيلت من الصفحة (لا مصدرين للحقيقة)', () => {
    expect(PAGE).not.toMatch(/const KIND_COLOR/)
    expect(PAGE).not.toMatch(/const ALLEY_COLOR/)
  })

  it('يوجد زرّان: ألوان Overpass وألوان المنصة', () => {
    expect(PAGE).toContain('ألوان Overpass')
    expect(PAGE).toContain('ألوان المنصة')
  })
})

describe('② لوحة osm-carto — القيم المرجعية المثبّتة', () => {
  it('القيم الأساسية موجودة حرفياً', () => {
    for (const c of ['#e892a2', '#f9b29c', '#fcd6a4', '#f7fabf', '#ffffff', '#fa8072']) {
      expect(COLORS, c).toContain(c)
    }
  })

  it('footway/steps متقطّعة (dashArray)', () => {
    const footBlock = COLORS.slice(COLORS.indexOf('footway:'), COLORS.indexOf('steps:') + 200)
    expect(footBlock).toContain('dashArray')
  })

  it('service بلا تقطيع (طريق لا ممر)', () => {
    const line = COLORS.split('\n').find((l) => l.trim().startsWith('service:'))
    expect(line).toBeTruthy()
    expect(line).not.toContain('dashArray')
  })

  it('لوحة المنصة محفوظة حرفياً للتراجع', () => {
    expect(COLORS).toContain("primary: '#dc2626'")
    expect(COLORS).toContain("alley: '#7c3aed'")
  })
})

describe('③ osmHighway يُحفظ — شرط الألوان الصحيحة', () => {
  it('الحقل موجود في ImportRow', () => {
    expect(ASSEMBLE).toMatch(/osmHighway\?: string/)
  })

  it('يُملأ من وسم الشوط لا من التصنيف', () => {
    expect(ASSEMBLE).toMatch(/osmHighway: row\.way\.tags\.highway/)
  })
})

describe('④ الروابط: تُعرض ولا تُستورد — لا استثناء', () => {
  it('sendBatch يُفلتر excludeFromImport', () => {
    expect(SDK).toMatch(/filter\(\(r\) => !r\.excludeFromImport\)/)
  })

  it('الفلترة داخل sendBatch لا في الواجهة', () => {
    // الواجهة قد تُضيف مسار إدراج لاحقاً — الفلترة في الطبقة التي تُرسل
    expect(SDK).toMatch(/const importable = input\.rows\.filter/)
  })

  it('الإحصاءات تُحسب من الصفوف القابلة للاستيراد', () => {
    expect(ASSEMBLE).toMatch(/importableRows/)
    expect(ASSEMBLE).toMatch(/const streets = importableRows\.filter/)
  })

  it('الكثافة لا تضمّ الروابط', () => {
    expect(ASSEMBLE).toMatch(/importableRows\.reduce\(\(s, r\) => s \+ r\.lengthM, 0\)/)
  })

  it('الخيار عرض لا استيراد — معلَن في الواجهة', () => {
    expect(PAGE).toContain('وصلات الطرق')
  })
})

describe('⑤ نمطا العرض مختلفان جوهرياً', () => {
  it('overpass يستعمل osmStrokeFor وbrand يستعمل brandStrokeFor', () => {
    expect(COLORS).toMatch(/if \(style !== 'overpass'\) return brandStrokeFor\(row\)/)
    expect(COLORS).toMatch(/const base = osmStrokeFor\(row\)/)
  })

  it('كلاهما يُرجع سماكة موجبة (لا خطوط غير مرئية)', () => {
    expect(COLORS).toMatch(/weight: 4/)
    expect(COLORS).toMatch(/weight: 3/)
    expect(COLORS).toMatch(/weight: 2/)
  })
})

describe('⑥ إطار الرسم (casing) — شرط رؤية الشوارع البيضاء', () => {
  it('اللوحة تُصدّر casing', () => {
    expect(COLORS).toMatch(/casing\?: \{ color: string; weight: number \}/)
  })

  it('casing لا يُمرَّر لـLeaflet (يُصفّى عبر leafletPath)', () => {
    // العقد: pathOptions لا يستقبل OsmStroke كاملاً — حقول Leaflet فقط
    expect(PAGE).toMatch(/pathOptions=\{leafletPath\(st\)\}/)
    expect(PAGE).not.toMatch(/pathOptions=\{st\}/)
  })

  it('الصفحة ترسم طبقة إطار قبل الخط', () => {
    expect(PAGE).toMatch(/key=\{`casing-/)
    expect(PAGE).toMatch(/interactive: false/)
  })

  it('الإطار يُرسم قبل الخط في DOM (Leaflet يرتّب بترتيب الإضافة)', () => {
    // المصفوفة المرجعة هي [إطار, خط] — الترتيب في `return [` هو ما يحدد الرسم
    expect(PAGE).toMatch(/return \[\s*<Polyline\s*key=\{`casing-/)
  })

  it('الشوارع البيضاء لها إطار (وإلا اختفت على الأرضية الفاتحة)', () => {
    for (const hw of ['tertiary', 'residential', 'unclassified', 'service']) {
      expect(osmStrokeFor({ osmHighway: hw }).casing, hw).toBeDefined()
    }
  })
})

describe('⑦ الوضع الليلي — لا شوارع بيضاء على خلفية داكنة', () => {
  it('strokeFor يقبل السمة', () => {
    expect(COLORS).toMatch(/theme: 'light' \| 'dark' = 'light'/)
  })

  it('الصفحة تمرّر سمة البلاطات', () => {
    expect(PAGE).toMatch(/strokeFor\(previewStyle, r, theme\)/)
  })

  it('ليلي: لا لون أبيض نقي لأي صنف', () => {
    for (const hw of ['tertiary', 'residential', 'unclassified', 'service', 'living_street']) {
      expect(strokeFor('overpass', { osmHighway: hw }, 'dark').color, hw).not.toBe('#ffffff')
    }
  })

  it('نهاري: الشوارع بيضاء (مطابقة OSM)', () => {
    for (const hw of ['tertiary', 'residential', 'unclassified']) {
      expect(strokeFor('overpass', { osmHighway: hw }, 'light').color, hw).toBe('#ffffff')
    }
  })
})
