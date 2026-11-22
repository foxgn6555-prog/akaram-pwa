/**
 * عقد الجولة ⑤ — الإصلاح ٤: حالتان لا تُصفَّران، وبيانات تُضاع.
 *
 * ## ① «ربع ٣» يبقى مختاراً بعد تبديل الزون
 *
 * الـ`useEffect` المسؤول عن «زون جديد ⇒ حالة جديدة» يجلب سكربت الزون
 * **كاملاً** ويُصفّر `script` و`polygon` — لكنه **لا يمسّ `quarter`**.
 * النتيجة: الواجهة تعرض «الربع ٣» مضيئاً وملاحظة «هذا الربع 3 من 4»
 * بينما السكربت المعروض هو الزون كاملاً. المشغّل ينسخه ظنّاً أنه ربع.
 *
 * ## ② اسم الملف لا يُحفظ أبداً
 *
 * `useMapImport` كان يرسل `file: { name: <عدد> }`:
 *   · المفتاح `file` لا `file_name` — وSQL يقرأ `p_meta->>'file_name'`
 *   · والقيمة **عدد الصفوف** لا الاسم
 * فأثر مزدوج: العمود يبقى `null` دائماً، ولو قُرئ لكان `297` مكان `export.osm`.
 * `map_import_batches.file_name` معرَّف في المهاجرة الأصلية بأنه «للتتبّع
 * لا للمعالجة» — وعمود تتبّع لا يُكتب أبداً لا يؤدّي غرضه.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const HOOK_RAW = readFileSync(join(ROOT, 'src/features/map-import/hooks/useMapImport.ts'), 'utf8')
/** بلا تعليقات — وإلا التقط الشرحُ العبارةَ القديمة التي يوثّقها */
const HOOK = HOOK_RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
const PAGE = readFileSync(
  join(ROOT, 'src/portals/ops-room/pages/MapPlanning/OpsMapImportPage.tsx'),
  'utf8',
)
const SQL = readFileSync(
  join(ROOT, 'supabase/migrations/20261122001300_map_import_batch.sql'),
  'utf8',
)

/** إزالة تعليقات TSX حتى لا يلتقط الفحص شرحَ العيب نفسه */
const PAGE_CODE = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

describe('① `quarter` يُصفَّر عند تبديل الزون', () => {
  /** جسم الـeffect المرتبط بـ`activeZoneId` */
  const effect = (() => {
    const start = PAGE_CODE.indexOf('useEffect(() => {')
    const at = PAGE_CODE.indexOf('}, [activeZoneId])')
    expect(start).toBeGreaterThan(-1)
    expect(at).toBeGreaterThan(start)
    // نأخذ آخر useEffect قبل التبعية
    const before = PAGE_CODE.slice(0, at)
    const lastStart = before.lastIndexOf('useEffect(() => {')
    return PAGE_CODE.slice(lastStart, at)
  })()

  it('الـeffect هو المسؤول عن التصفير لا معالج النقر', () => {
    expect(effect).toContain('setQuarter(null)')
  })

  it('يُصفّر قبل جلب السكربت — لا وميض حالة قديمة', () => {
    const clearAt = effect.indexOf('setQuarter(null)')
    const fetchAt = effect.indexOf('mapImportSdk.zoneScript')
    expect(clearAt).toBeLessThan(fetchAt)
  })

  it('يُصفّر `quarterBusy` أيضاً — وإلا بقي الزر معطّلاً', () => {
    expect(effect).toContain('setQuarterBusy(false)')
  })

  it('يشرح السبب لا يفعل فقط — A future reader needs it', () => {
    const idx = PAGE.indexOf('كان **يبقى مختاراً**')
    expect(idx).toBeGreaterThan(-1)
    expect(PAGE.slice(idx, idx + 700)).toContain('الزون ب كاملاً')
  })
})

describe('② اسم الملف يُحفظ فعلاً', () => {
  it('يُرسَل تحت `file_name` — وهو ما يقرأه SQL', () => {
    expect(HOOK).toContain('file_name: opts.fileName')
    // SQL يقرأ هذا المفتاح بالحرف
    expect(SQL).toContain("p_meta->>'file_name'")
  })

  it('يُرسَل `file_bytes` أيضاً', () => {
    expect(HOOK).toContain('file_bytes: opts.fileBytes')
    expect(SQL).toContain("p_meta->>'file_bytes'")
  })

  it('الحمولة القديمة الخاطئة أُزيلت', () => {
    // كانت: file: { name: preview.stats.streets + preview.stats.alleys }
    expect(HOOK).not.toContain('file: { name:')
    expect(HOOK).not.toMatch(/file:\s*\{\s*name:/)
  })

  it('`InsertOptions` يوثّق الاسم وحجمه', () => {
    expect(HOOK_RAW).toMatch(/interface InsertOptions[\s\S]{0,900}fileName\?: string/)
    expect(HOOK_RAW).toMatch(/interface InsertOptions[\s\S]{0,900}fileBytes\?: number/)
  })

  it('الصفحة تمرّر اسم الملف من phase', () => {
    expect(PAGE_CODE).toContain('fileName: phase.kind')
    expect(PAGE_CODE).toContain('phase.fileName')
  })

  it('اسم الملف النوع `string` لا `number` — العيب كان رقماً', () => {
    expect(HOOK).toMatch(/fileName\?: string/)
    expect(HOOK).not.toMatch(/fileName\?: number/)
  })
})

describe('② التتبّع يبقى ممكناً', () => {
  it('العمود مقروء في سجل الدفعات', () => {
    const SDK = readFileSync(join(ROOT, 'src/services/map-import.sdk.ts'), 'utf8')
    // `MapImportBatch` يحمل file_name في الاستعلام
    expect(SDK).toContain('map_import_batches')
  })

  it('المهاجرة الأصلية تنصّ على الغرض: للتتبّع', () => {
    expect(SQL).toContain('للتتبّع لا للمعالجة')
  })
})
