/**
 * عقد المعاينة الكاملة — صفحة استيراد الخريطة.
 *
 * العيب الذي كشفه المشغّل: بعد إدراج ملف .osm ظهرت «عيّنة **٥٠** من **٣٠٨**»
 * على الخريطة المصغّرة. الرقم «٥» لم يكن حدّ أداء بل مثالاً في خطة سابقة،
 * فكانت المعاينة ترسم **١٦٪** من العناصر. المشغّل رأى خريطة مبعثرة فظنّ أن
 * الاستيراد ناقص — والبيانات كانت كاملة في المعاينة (٣٠٨ صفاً) والقاعدة.
 *
 * درس: **العيّنة في المعاينة تُوهم بالنقص.** المعاينة وظيفتها أن تُطابق
 * الحقيقة؛ إن قصّت شيئاً فيجب أن تقوله صراحةً لا أن تُخفيه.
 *
 * يحرس هذا الملف أيضاً عيباً ثانياً: تغيير الزون بعد التحليل كان يمسح العمل
 * بلا سؤال، ولو لم يمسحه لقُصَّ ملف بحدود زون آخر ⇒ نتائج خاطئة بصمت.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const PAGE = join(ROOT, 'src/portals/ops-room/pages/MapPlanning/OpsMapImportPage.tsx')
const page = readFileSync(PAGE, 'utf8')

describe('① سقف الرسم لا يُوهم بالنقص', () => {
  it('السقف ٣٠٠٠ لا ٥٠ — أكبر زون فعلي ٦٥٣ فكل زون واقعي يُرسم كاملاً', () => {
    expect(page).toMatch(/const MAX_RENDERED_WAYS = 3000/)
    expect(page).not.toMatch(/SAMPLE_SIZE = 50/)
  })

  it('لا قصّ إطلاقاً تحت السقف', () => {
    expect(page).toMatch(/if \(rows\.length <= MAX_RENDERED_WAYS\) return rows/)
  })

  it('فوق السقف: توزيع منتظم لا أوّل N (أول الصفوف شريط واحد من الزون)', () => {
    expect(page).toMatch(/const step = rows\.length \/ MAX_RENDERED_WAYS/)
    expect(page).toMatch(/rows\[Math\.floor\(i \* step\)\]/)
  })

  it('الترويسة تعلن القصّ صراحةً بدل «عيّنة» مُبهمة', () => {
    expect(page).toMatch(/truncatedForMap > 0/)
    expect(page).toMatch(/البقية تُدرَج كاملة/)
    expect(page).toMatch(/كل عناصر الملف/)
  })

  it('لا كلمة «عيّنة» في ترويسة الخريطة — تُوهم بأن المعاينة ناقصة', () => {
    const header = page.slice(page.indexOf('<Layers size={14}'), page.indexOf('</h3>'))
    expect(header).not.toContain('عيّنة')
  })
})

describe('② تغيير الزون لا يُتلف التحليل بصمت', () => {
  it('يوجد سؤال صريح قبل المسح', () => {
    expect(page).toMatch(/window\.confirm\(/)
  })

  it('السؤال يذكر أن الملف يخصّ حدود الزون السابق', () => {
    expect(page).toMatch(/حدود الزون السابق[\s\S]{0,80}نتائج خاطئة/)
  })

  it('الإلغاء يُبقي الزون الحالي (return قبل setZoneId)', () => {
    const handler = page.slice(page.indexOf('if (phase.kind !== \'idle\')'), page.indexOf('setZoneId(z.id)'))
    expect(handler).toMatch(/if \(!ok\) return/)
  })

  it('الضغط على الزون النشط لا يفعل شيئاً', () => {
    expect(page).toMatch(/if \(z\.id === activeZoneId\) return/)
  })

  it('reset() لا تُستدعى من effect الجلب — وإلا يُمحى التحليل عند كل تصيير', () => {
    const effect = page.slice(page.indexOf('useEffect(() => {\n    if (!activeZoneId) return'), page.indexOf('}, [activeZoneId])'))
    expect(effect).not.toMatch(/\breset\(\)/)
  })

  it('تبعيات effect الجلب لا تتضمن reset', () => {
    expect(page).toMatch(/\}, \[activeZoneId\]\)/)
  })
})

describe('③ الأرقام المعروضة تُطابق ما سيُدرَج', () => {
  it('عدد الصفوف المعروض يأتي من preview.rows لا من العيّنة', () => {
    // الترويسة تقارن sample.length بـ preview.rows.length — لا تخفي الكلّي
    expect(page).toMatch(/preview\.rows\.length/)
  })

  it('عدد الدفعات محسوب من كل الصفوف لا من المعروض', () => {
    expect(page).toMatch(/Math\.ceil\(preview\.rows\.length \/ 200\)/)
  })
})
