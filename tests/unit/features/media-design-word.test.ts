/**
 * 00202 — تصدير التصميم إلى Word قابل للتعديل: يُبنى ملف .docx حقيقي ويُفكّ (ZIP) ويُفحص XML الوثيقة:
 * ترتيب الصفحات، النصوص الحقيقية (قابلة للتحرير)، الجداول، الصور المضمّنة، اتجاه RTL، قياس A4.
 */
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { Packer } from 'docx'
import { buildWordDocument, chunk4, fitInBox, wordPageCount, PHOTO_BOX, type WordImage, type WordReportData } from '@features/media/lib/design-word'

// PNG 1×1 صالح
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))
const img = (w = 4000, h = 3000): WordImage => ({ bytes: PNG, width: w, height: h, type: 'png' })

const data: WordReportData = {
  title: 'التقرير اليومي المصور — الكرادة',
  coverUrl: 'cover',
  summary: {
    companyName: 'شركة جزيرة الأكارم وفيرست ترايد',
    reportLine: 'التقرير اليومي المصور / الكرادة',
    orgLabel: 'الجهة المنظمة للتقرير',
    orgValue: 'شركة جزيرة الأكارم وفيرست ترايد',
    subjectLabel: 'موضوع التقرير',
    subjectValue: 'التقرير اليومي المصور للفعاليات المنجزة في قطاع الكرادة',
    dateLabel: 'الأربعاء',
    dateValue: '7/10/2026',
    sectorName: 'الكرادة',
    rows: [{ t: '1', work: 'كنس شارع جواد' }, { t: '2', work: 'غسل مدرسة الرشيد' }],
    footer: 'الجهة المتصرفة لجنة الإشراف والمراقبة والتقييم في أمانة بغداد',
  },
  theme: [{ bg: '#1e3a8a', fg: '#ffffff' }, { bg: '#1d4ed8', fg: '#ffffff' }, { bg: '#fbbf24', fg: '#0f172a' }],
  colors: { barFrom: '#fbfbfb', barTo: '#c9c9c9', border: '#444444', barText: '#1a1a1a' },
  fontName: 'Cairo',
  groups: [
    { workType: 'كنس شارع جواد', sheetText: 'أعمال كنس شارع جواد (نص معدّل)', photos: Array.from({ length: 5 }, (_, i) => ({ url: `p${i}`, caption: `عبارة ${i + 1}` })) },
    { workType: 'غسل مدرسة الرشيد', sheetText: 'غسل مدرسة الرشيد', photos: [{ url: 'q0', caption: 'غسل الساحة' }] },
  ],
}
const images = new Map<string, WordImage>([['cover', img(2480, 3508)], ...data.groups.flatMap((g) => g.photos.map((p) => [p.url, img()] as [string, WordImage]))])

async function unzipDoc(d: WordReportData, imgs = images) {
  const buf = await Packer.toBuffer(buildWordDocument(d, imgs))
  const zip = await JSZip.loadAsync(buf)
  const xml = await zip.file('word/document.xml')!.async('string')
  const media = Object.keys(zip.files).filter((f) => f.startsWith('word/media/'))
  return { xml, media, zip }
}

describe('Word — دوال نقية', () => {
  it('fitInBox يحافظ على النسبة ولا يكبّر خارج الصندوق', () => {
    expect(fitInBox(4000, 3000, PHOTO_BOX)).toEqual({ width: PHOTO_BOX.w, height: Math.round((PHOTO_BOX.w * 3000) / 4000) })
    const tall = fitInBox(3000, 4000, PHOTO_BOX)
    expect(tall.width).toBeLessThanOrEqual(PHOTO_BOX.w)
    expect(tall.height).toBeLessThanOrEqual(PHOTO_BOX.h)
    expect(Math.abs(tall.width / tall.height - 0.75)).toBeLessThan(0.01)
    expect(fitInBox(0, 0, PHOTO_BOX)).toEqual({ width: PHOTO_BOX.w, height: PHOTO_BOX.h })
  })
  it('wordPageCount = غلاف + جدول + لكل فقرة ورقة + صفحات 4 صور', () => {
    expect(chunk4([1, 2, 3, 4, 5]).length).toBe(2)
    expect(wordPageCount(data.groups)).toBe(2 + (1 + 2) + (1 + 1))
  })
})

describe('Word — الملف الناتج', () => {
  it('ملف docx صالح: صفحات بالترتيب، فواصل صفحات بعددها، صور مضمّنة، A4', async () => {
    const { xml, media, zip } = await unzipDoc(data)
    expect(zip.file('[Content_Types].xml')).not.toBeNull()
    expect((xml.match(/<w:br w:type="page"\/>/g) ?? []).length).toBe(wordPageCount(data.groups) - 1)
    // الغلاف + 6 صور (الشعارات غير محمّلة هنا ⇒ بديل نصي) — docx يوحّد الملفات المتطابقة بايتاً فنعدّ الرسومات
    expect((xml.match(/<w:drawing>/g) ?? []).length).toBe(7)
    expect(media.length).toBeGreaterThanOrEqual(1)
    expect(xml).toContain('w:w="11906"')
    expect(xml).toContain('w:h="16838"')
  })
  it('النصوص حقيقية قابلة للتحرير (لا صور): العناوين، صفوف الجدول، نص الورقة المعدّل، عبارات الصور', async () => {
    const { xml } = await unzipDoc(data)
    for (const t of ['شركة جزيرة الأكارم وفيرست ترايد', 'التقرير اليومي المصور / الكرادة', 'الجهة المنظمة للتقرير', 'موضوع التقرير', 'الأربعاء', '7/10/2026', 'الفقرات المنجزة', 'اسم القاطع', 'كنس شارع جواد', 'غسل مدرسة الرشيد', 'أعمال كنس شارع جواد (نص معدّل)', 'عبارة 5', 'غسل الساحة', 'الجهة المتصرفة لجنة الإشراف والمراقبة والتقييم في أمانة بغداد'])
      expect(xml, t).toContain(t)
    expect(xml).toContain('>ت<')
  })
  it('RTL: جداول من اليمين لليسار ونصوص rtl، وألوان القالب مطبّقة كتظليل خلايا، واسم القاطع عمودي', async () => {
    const { xml } = await unzipDoc(data)
    expect(xml).toContain('<w:bidiVisual/>')
    expect(xml).toContain('<w:rtl/>')
    expect(xml).toContain('w:fill="1E3A8A"')
    expect(xml).toContain('w:fill="FBBF24"')
    expect(xml).toContain('w:fill="C9C9C9"')
    expect(xml).toContain('w:textDirection w:val="btLr"')
    expect(xml).toContain('w:ascii="Cairo"')
  })
  it('بلا غلاف: صفحة عنوان نصية؛ صورة مفقودة: بديل نصي بدل فشل التصدير', async () => {
    const { xml, media } = await unzipDoc({ ...data, coverUrl: null }, new Map())
    expect(media.length).toBe(0)
    expect(xml).toContain('التقرير اليومي المصور — الكرادة')
    expect(xml).toContain('عبارة 1')
  })
  it('خلية الشعارات والجدول الرسمي: 3 صفوف معلومات + رأس + صفوف الفقرات بدمج عمودي لاسم القاطع', async () => {
    const { xml } = await unzipDoc(data)
    expect(xml).toContain('<w:vMerge w:val="restart"/>')
    expect((xml.match(/<w:vMerge w:val="continue"\/>/g) ?? []).length).toBe(data.summary.rows.length - 1)
  })
})
