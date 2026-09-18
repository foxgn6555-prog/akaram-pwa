/** اختبارات الباني المشترك لملف PowerPoint — مصدر واحد للمتصفح ودالة الحافة. */
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import {
  authorityLineFor, buildPptx, composeComplaintSlides, fitInside, imageDimensions, validMagic,
  type ComposeInput, type ComposeItem,
} from '@lib/pptx/complaintPptx'

const pngBytes = (width: number, height: number) => {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

const item = (overrides: Partial<ComposeItem> = {}): ComposeItem => ({
  id: overrides.id ?? 'i1',
  alley: overrides.alley ?? '44',
  neighborhood: overrides.neighborhood ?? '44',
  center: overrides.center ?? 'بلدية الكرادة',
  title: overrides.title ?? 'أنقاض',
  status: overrides.status ?? 'approved',
  manager: overrides.manager ?? 'المهندس علي',
  subject: overrides.subject ?? 'بريد الأنقاض',
})

const brand = [
  { name: 'brand-baghdad.png', bytes: pngBytes(8, 8) },
  { name: 'brand-alliance.png', bytes: pngBytes(8, 8) },
  { name: 'brand-akaram.png', bytes: pngBytes(8, 8) },
]

const input = (overrides: Partial<ComposeInput> = {}): ComposeInput => ({
  reportTitle: 'التقرير اليومي الجامع للشكاوى',
  coverTitle: 'تقرير معالجة التلكؤات ليوم',
  authorityLine: authorityLineFor({}, 'karrada'),
  contractorLine: 'تحالف شركات جزيرة الأكرام وفيرست ترايد',
  reportDate: '2026-09-18',
  sectorLabel: 'قاطع الكرادة',
  scopeLabel: 'تقرير يومي جامع',
  layout: { accent: '#cf63c6' },
  items: [item()],
  mediaFor: () => ({ afters: [] }),
  brand,
  ...overrides,
})

describe('تكوين الشرائح المطابق للتصميم المعتمد', () => {
  it('الترتيب: غلاف ← مؤشرات ← جدول ← فواصل وصور لكل مجموعة', () => {
    const slides = composeComplaintSlides(input({
      items: [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c', subject: 'بريد ثانٍ', manager: 'مسؤول آخر' })],
    }))
    // غلاف + جدول + صورة لكل موقع — دون شريحتي المؤشرات والفاصل
    expect(slides).toHaveLength(5)
    expect(slides[0]!.xml).toContain('تقرير معالجة التلكؤات ليوم')
    expect(slides[1]!.xml).toContain('جدول بيانات التلكؤات')
    expect(slides[2]!.xml).toContain('محلة 44 - زقاق 44 - أنقاض')
    expect(slides.some(slide => slide.xml.includes('المؤشرات التنفيذية للتقرير'))).toBe(false)
    expect(slides.some(slide => slide.xml.includes('مجموعة البريد والمسؤول'))).toBe(false)
  })

  it('الغلاف: الشعارات الثلاثة بترتيب التصميم وأسطر الجهة والقاطع', () => {
    const cover = composeComplaintSlides(input())[0]!
    const akaram = cover.xml.indexOf('r:embed="rId4"')
    const alliance = cover.xml.indexOf('r:embed="rId3"')
    const baghdad = cover.xml.indexOf('r:embed="rId2"')
    expect(akaram).toBeGreaterThan(-1)
    expect(akaram).toBeLessThan(alliance)
    expect(alliance).toBeLessThan(baghdad)
    expect(cover.xml).toContain('أمانة بغداد / دائرة بلدية الكرادة')
    expect(cover.xml).toContain('قاطع الكرادة - 2026-09-18')
    expect(cover.rels).toContain('brand-baghdad.png')
  })

  it('الجدول: العناوين وحدها عريضة والجسم عادي بتخطيط الأعمدة المعتمد', () => {
    const slides = composeComplaintSlides(input({ items: [item()] }))
    const table = slides[1]!
    expect(table.xml).toContain('b="1"')
    expect(table.xml).toContain('b="0"')
    expect(table.xml).toContain('مسؤول القسم')
    expect(table.xml).toContain('بلدية الكرادة')
  })

  it('شريحة قبل/بعد: شريط التذييل بصيغة التصميم وإطارات البطاقتين', () => {
    const slides = composeComplaintSlides(input({
      mediaFor: id => id === 'i1'
        ? { before: { bytes: pngBytes(16, 9), width: 16, height: 9, ext: 'png' }, afters: [{ bytes: pngBytes(16, 9), width: 16, height: 9, ext: 'png' }] }
        : { afters: [] },
    }))
    const photo = slides[2]!
    expect(photo.xml).toContain('محلة 44 - زقاق 44 - أنقاض')
    expect(photo.xml).toContain('صورة المعالجة')
    expect(photo.xml).toContain('صورة التلكؤ / الشكوى')
    expect(photo.images).toHaveLength(2)
    expect(photo.rels).toContain('rId2')
  })

  it('غياب صور المعالجة يعرض شريحة واحدة برسالة واضحة', () => {
    const slides = composeComplaintSlides(input())
    const photo = slides[2]!
    expect(photo.xml).toContain('لم تتم المعالجة بعد')
    expect(photo.xml).toContain('الصورة غير متاحة')
    expect(photo.images).toHaveLength(0)
  })

  it('تعدد صور المعالجة ينتج شريحة لكل صورة بعنوان مرقم', () => {
    const after = { bytes: pngBytes(4, 4), width: 4, height: 4, ext: 'png' as const }
    const slides = composeComplaintSlides(input({ mediaFor: () => ({ afters: [after, after] }) }))
    const first = slides[2]!
    const second = slides[3]!
    expect(first.xml).toContain('صورة المعالجة 1 من 2')
    expect(second.xml).toContain('صورة المعالجة 2 من 2')
  })
})

describe('حزمة PowerPoint الناتجة', () => {
  it('تفتح كحزمة OOXML سليمة بعدد الشرائح المتوقع', async () => {
    const slides = composeComplaintSlides(input({ items: [item({ id: 'a' }), item({ id: 'b' })] }))
    const bytes = await buildPptx(slides, 'تقرير الاختبار', new JSZip())
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
    const zip = await JSZip.loadAsync(bytes)
    for (let index = 1; index <= slides.length; index += 1) {
      expect(zip.files[`ppt/slides/slide${index}.xml`]).toBeTruthy()
    }
    const types = await zip.file('[Content_Types].xml')!.async('string')
    expect(types).toContain('presentationml.presentation.main+xml')
    const presentation = await zip.file('ppt/presentation.xml')!.async('string')
    expect(presentation).toContain('<p:sldId')
  })
})

describe('أدوات الصور المشتركة', () => {
  it('fitInside يحافظ على نسبة الأبعاد داخل الإطار', () => {
    const landscape = fitInside(0, 0, 5.6, 4.8, 1600, 900)
    expect(Math.abs(landscape.w / landscape.h - 16 / 9)).toBeLessThan(0.001)
    const portrait = fitInside(0, 0, 5.6, 4.8, 900, 1600)
    expect(Math.abs(portrait.w / portrait.h - 9 / 16)).toBeLessThan(0.001)
  })

  it('imageDimensions يقرأ أبعاد PNG وvalidMagic يرفض المحتوى المزيف', () => {
    expect(imageDimensions(pngBytes(640, 480), 'image/png')).toEqual({ width: 640, height: 480 })
    expect(validMagic(pngBytes(4, 4), 'image/png')).toBe(true)
    expect(validMagic(new Uint8Array([1, 2, 3, 4]), 'image/png')).toBe(false)
  })
})
