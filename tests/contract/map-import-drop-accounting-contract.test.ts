/**
 * عقد الجولة ⑥ — محاسبة الإسقاط مغلقة: لا شوط يختفي بلا سبب مكتوب.
 *
 * ## التعارض الذي حلّه هذا الملف
 *
 * وثيقة التشخيص ذكرت «١٩٤ شوطاً مسقَطاً» بينما تحقّق حيّ أعطى **٣٥**.
 * التخمين السابق («روابط `*_link` تُسقط في assembleImport») كان **خطأً**:
 * الرابط لا يُسقط بل يُعرض بـ`excludeFromImport`. القياس الفعلي على
 * `export.osm` كشف **ثلاث** مراحل إسقاط لا واحدة:
 *
 * | المرحلة | الساقط | مُبلَّغ؟ |
 * |---|---|---|
 * | قراءة (`ROUTE_SET`) | ٣٥ | نعم (`skippedByTag`) |
 * | `classify` — روابط `*_link` | ١٥٩ | نعم (مرسومة `excludeFromImport`) |
 * | **`classify` — أسماء منشآت** | **٧٢** | **لا — صامت** |
 * | قصّ | ٨ | نعم |
 *
 * و٣٥+١٥٩ = **١٩٤** بالضبط: رقم الوثيقة كان مجموع أوّل مرحلتين، لا
 * إسقاطاً واحداً. لكن الأخطر أن الـ٧٢ (٣٧ primary · ٢٦ secondary · ٦ trunk ·
 * ٣ tertiary بأسماء «ساحة الفتح» و«مجسر ملعب الشعب» و«جسر 14 تموز») كانت
 * تختفي **بلا أي أثر** — فلا يمكن للمشغّل أن يعرف لماذا خريطته أنقص من ملفه.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { classify, nonStreetWord, isNonStreetName } from '@features/map-import/lib/classify'

const ROOT = process.cwd()
const ASSEMBLE = readFileSync(join(ROOT, 'src/features/map-import/lib/assemble.ts'), 'utf8')
const CLASSIFY = readFileSync(join(ROOT, 'src/features/map-import/lib/classify.ts'), 'utf8')

describe('① المحاسبة مغلقة — كل شوط مقبول يصل إلى نتيجة معلنة', () => {
  it('لا `continue` صامت في مسار classify', () => {
    // الشكل القديم: الإسقاط ثم continue مباشرة بلا تسجيل
    expect(ASSEMBLE).not.toMatch(/if \(cls === null\) continue/)
  })

  it('الإسقاط يُسجَّل مع وسمه واسمه', () => {
    const start = ASSEMBLE.indexOf('if (cls === null) {')
    expect(start).toBeGreaterThan(-1)
    const block = ASSEMBLE.slice(start, start + 1800)
    expect(block).toContain('skipped.push')
    expect(block).toContain('osmWayId: way.id')
    expect(block).toContain('name: way.tags.name')
  })

  it('الروابط مستثناة من السجل — ليست مفقودة بل معروضة', () => {
    const start = ASSEMBLE.indexOf('if (cls === null) {')
    const block = ASSEMBLE.slice(start, start + 1800)
    expect(block).toContain('isLink')
    expect(block).toMatch(/\/_link\$\/\.test/)
    expect(block).toContain('if (!isLink')
  })

  it('سبب «اسم منشأة» منفصل عن سبب «وسم غير مصنَّف»', () => {
    const start = ASSEMBLE.indexOf('if (cls === null) {')
    const block = ASSEMBLE.slice(start, start + 1800)
    expect(block).toContain('اسم منشأة لا شارع')
    expect(block).toContain('لا يقابله تصنيف لدينا')
  })
})

describe('② الكلمة المسبِّبة تُستخرج لا تُخفى', () => {
  it('«ساحة الفتح» ⇒ ساحة', () => {
    expect(nonStreetWord('ساحة الفتح')).toBe('ساحة')
    expect(nonStreetWord('الساحة')).toBe('ساحة')
  })

  it('«مجسر ملعب الشعب» ⇒ مجسر', () => {
    expect(nonStreetWord('مجسر ملعب الشعب')).toBe('مجسر')
  })

  it('«جسر 14 تموز» و«نفق احمد عرابي»', () => {
    expect(nonStreetWord('جسر 14 تموز')).toBe('جسر')
    expect(nonStreetWord('نفق احمد عرابي')).toBe('نفق')
  })

  it('شارع حقيقي ⇒ null (لا إيجابية كاذبة)', () => {
    expect(nonStreetWord('شارع الرشيد')).toBeNull()
    expect(nonStreetWord('الطريق الحلقي الثاني')).toBeNull()
    expect(nonStreetWord('905-16')).toBeNull()
    expect(nonStreetWord(null)).toBeNull()
  })

  it('`isNonStreetName` بقي متوافقاً — لا كسر للمستدعين', () => {
    expect(isNonStreetName('ساحة الفتح')).toBe(true)
    expect(isNonStreetName('شارع الرشيد')).toBe(false)
    expect(CLASSIFY).toContain('return nonStreetWord(name) !== null')
  })
})

describe('③ التمييز الجوهري: عرض ≠ استيراد ≠ إسقاط', () => {
  it('الرابط يُصنَّف عند includeLinks (معروض) وnull بدونه', () => {
    const link = { highway: 'primary_link', name: null }
    expect(classify(link, { includeLinks: true })).toBe('STR')
    expect(classify(link)).toBeNull()
  })

  it('اسم منشأة على way رئيسي ⇒ null دائماً حتى مع includeLinks', () => {
    const facility = { highway: 'primary', name: 'ساحة الفتح' }
    expect(classify(facility)).toBeNull()
    expect(classify(facility, { includeLinks: true })).toBeNull()
  })

  it('الروابط لا تدخل القاعدة — excludeFromImport يبقى', () => {
    expect(ASSEMBLE).toContain('excludeFromImport: true as const')
  })
})

describe('④ الأرقام الموثّقة', () => {
  it('الوثيقة تشرح المراحل الثلاث وتصحّح الرقم', () => {
    const doc = readFileSync(join(ROOT, 'docs/plans/map-import-shape-mismatch-diagnosis.md'), 'utf8')
    expect(doc).toContain('١٩٤')
    expect(doc).toContain('٧٢')
    // التصحيح لا يترك الرقم القديم مجرّداً بلا سياق
    expect(doc).toMatch(/١٩٤[\s\S]{0,400}(١٥٩|مراحل)/)
  })
})
