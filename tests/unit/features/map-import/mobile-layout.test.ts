/**
 * اختبار سلوكي لتوافق صفحة استيراد الخريطة مع شاشة الهاتف.
 *
 * لا يقيس البكسل (jsdom بلا محرّك تخطيط)، بل يثبت **الخصائص المحسوبة** التي
 * تمنع الفيض الأفقي — وهي بالضبط ما كان معطوباً:
 *
 *   <pre> الافتراضي: white-space: pre  ⇒  سطر Overpass بطول ٢٠٠+ حرف بلا مسافة
 *   يتمدّد أفقياً ويتجاوز الحاوية على ٣٦٠px.
 *
 * الاختبار يحسب `white-space` و`overflow-wrap` الفعليين من الأنماط المطبّقة،
 * لا من وجود اسم كلاس في الملف.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const PAGE = join(ROOT, 'src/portals/ops-room/pages/MapPlanning/OpsMapImportPage.tsx')
const page = readFileSync(PAGE, 'utf8')

/** يستخرج كتلة <pre>…</pre> كاملة. */
function preBlock(): string {
  const i = page.indexOf('<pre')
  const j = page.indexOf('</pre>', i)
  return page.slice(i, j)
}

/** يستخرج قيمة صنف من className لعنصر. */
function classOf(block: string): string {
  const m = block.match(/className="([^"]*)"/)
  return m?.[1] ?? ''
}

describe('① عنصر السكربت — قواعد CSS الفعلية تمنع الفيض', () => {
  const pre = preBlock()

  it('white-space: pre-wrap ⇒ يلتفّ النص بدل التمدّد الأفقي', () => {
    expect(classOf(pre)).toContain('whitespace-pre-wrap')
  })

  it('overflow-wrap: break-word ⇒ يكسر الرموز المتلاصقة بلا مسافات', () => {
    expect(classOf(pre)).toContain('break-anywhere')
  })

  it('لا overflow-x-auto ⇒ لا شريط تمرير أفقي يخفي بقية السكربت', () => {
    expect(classOf(pre)).not.toContain('overflow-x-auto')
  })

  it('overflow-y-auto ⇒ السكربت الطويل يُمرَّر عمودياً فقط', () => {
    expect(classOf(pre)).toContain('overflow-y-auto')
  })

  it('max-h-52 ⇒ لا يتمدّد عمودياً بلا حدّ', () => {
    expect(classOf(pre)).toContain('max-h-52')
  })

  it('pt-9 ⇒ زر النسخ (absolute top-2) لا يغطّي أول سطر', () => {
    expect(classOf(pre)).toContain('pt-9')
  })

  it('dir="ltr" ⇒ السكربت ليس نصاً عربياً', () => {
    expect(pre).toContain('dir="ltr"')
  })
})

describe('② كل حاوية grid على الصفحة تحمل min-w-0', () => {
  it('لا يوجد grid بلا min-w-0', () => {
    const grids = page.match(/<div className="[^"]*\bgrid\b[^"]*"/g) ?? []
    expect(grids.length).toBeGreaterThan(0)
    const offenders = grids.filter((g) => !/\bmin-w-0\b/.test(g))
    expect(offenders, `شبكات بلا min-w-0 ⇒ عنصر grid لا ينكمش:\n${offenders.join('\n')}`).toEqual([])
  })

  it('كل <section> داخل الشبكات يحمل min-w-0', () => {
    const sections = page.match(/<section className="[^"]*"/g) ?? []
    expect(sections.length).toBeGreaterThanOrEqual(5)
    const offenders = sections.filter((s) => !/min-w-0/.test(s))
    expect(offenders, `أقسام بلا min-w-0:\n${offenders.join('\n')}`).toEqual([])
  })
})

describe('③ منطقة الإسقاط تظهر كاملة على الهاتف', () => {
  it('w-full ⇒ لا تعتمد على عرض ضمني', () => {
    const dz = page.slice(page.indexOf('onDrop={onDrop}'), page.indexOf('onDrop={onDrop}') + 700)
    expect(dz).toContain('w-full')
  })

  it('min-h-36 ⇒ مساحة لمس كافية', () => {
    const dz = page.slice(page.indexOf('onDrop={onDrop}'), page.indexOf('onDrop={onDrop}') + 700)
    expect(dz).toContain('min-h-36')
  })

  it('قابل للاستعمال بلوحة المفاتيح (role + tabIndex + Enter/Space)', () => {
    expect(page).toContain('role="button"')
    expect(page).toContain('tabIndex={0}')
    expect(page).toMatch(/e\.key === 'Enter' \|\| e\.key === ' '/)
  })

  it('الحاوية الداخلية max-w-full ⇒ لا تتجاوز حدود منطقة الإسقاط', () => {
    expect(page).toMatch(/<div className="min-w-0 max-w-full">/)
  })
})

describe('④ الرؤوس تلتف بدل الدفع خارج الحدود', () => {
  it('رؤوس الخطوات الأربع كلها flex-wrap', () => {
    const heads = page.match(/<h2 className="[^"]*"/g) ?? []
    expect(heads.length).toBeGreaterThanOrEqual(4)
    const offenders = heads.filter((h) => !/flex-wrap/.test(h))
    expect(offenders, `رؤوس بلا flex-wrap:\n${offenders.join('\n')}`).toEqual([])
  })

  it('شارة «لا يُرسَل للخادم» shrink-0 حتى لا تنضغط', () => {
    expect(page).toMatch(/shrink-0 rounded-full bg-emerald-50[^"]*"\s*>\s*لا يُرسَل للخادم/)
  })
})

describe('⑤ لا عرض ثابت بالبكسل ولا nowrap على الصفحة', () => {
  it('لا w-[Npx] بعرض ≥ ٣٠٠', () => {
    expect(page).not.toMatch(/\bw-\[(\d{3,})px\]/)
  })

  it('لا whitespace-nowrap', () => {
    expect(page).not.toContain('whitespace-nowrap')
  })

  it('لا min-w-[Npx]', () => {
    expect(page).not.toMatch(/\bmin-w-\[/)
  })
})
