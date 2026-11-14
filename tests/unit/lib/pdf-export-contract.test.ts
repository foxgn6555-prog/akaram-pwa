/**
 * عقد تصدير PDF — حارس ضد ترقيات jsPDF الكبرى (S-07).
 *
 * الكود يستخدم واجهة محددة بدقة في ملفَّين:
 *   · src/features/gps-lvn/trip-route-export.ts
 *   · src/features/media/lib/design-export.ts
 * وهي: باني `new jsPDF({...})` ثم `addImage(dataURL,'JPEG',x,y,w,h,undefined,'FAST')`
 * ثم `output('blob')` — **كلها متزامنة**. أي تحوّل في jsPDF إلى واجهة غير متزامنة يعني
 * PDF بلا صورة بصمت، وهو ما يمنعه هذا الاختبار.
 *
 * يُستورد بناء المتصفح صراحةً (`dist/jspdf.es.min.js`) لأنه ما تحزمه Vite فعلاً؛
 * بناء Node (`jspdf`) يمنع قراءة الملفات بلا أذونات ولا علاقة له بالمتصفح.
 */
import { describe, expect, it } from 'vitest'
// مسار مُصدَّر رسمياً في خريطة exports للحزمة ('./dist/*') — بناء المتصفح الذي تحزمه Vite
import { jsPDF } from 'jspdf/dist/jspdf.es.min.js'

/** أصغر JPEG صالح (1×1) — يكفي لاختبار مسار الصور */
const TINY_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDc0NDL/wAALCAABAAEBAREA/8QAFAABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AmAA/9k='

describe('عقد jsPDF المستخدم في تصدير PDF', () => {
  it('addImage متزامن ويُدرج الصورة فعلاً في الملف', () => {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
    const returned = pdf.addImage(TINY_JPEG, 'JPEG', 10, 10, 190, 277, undefined, 'FAST')
    // متزامن ⇒ يُعيد كائن المستند نفسه (لو صار غير متزامن لَعاد Promise)
    expect(returned).not.toBeInstanceOf(Promise)
    const ascii = Buffer.from(pdf.output('arraybuffer')).toString('latin1')
    expect(ascii).toMatch(/subtype\s*\/image/i)
  })

  it("output('blob') يُرجع Blob صالحاً", () => {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
    pdf.addImage(TINY_JPEG, 'JPEG', 10, 10, 190, 277, undefined, 'FAST')
    const blob = pdf.output('blob')
    expect(blob.size).toBeGreaterThan(1000)
    expect(blob.type).toContain('pdf')
  })
})
