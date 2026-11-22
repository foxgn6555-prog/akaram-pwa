/**
 * عقد توافق شاشة الهاتف — صفحة استيراد الخريطة.
 *
 * سبب وجود هذا الملف: الصفحة ظهرت على الهاتف (٣٦٠–٣٩٠px) بسكربت Overpass
 * يخرج من الحدود ومنطقة إسقاط غير مكتملة. العيب ليس في القيمة المرئية بل في
 * قواعد CSS: `<pre>` الافتراضي `white-space: pre` فلا يلتفّ، وسكربت Overpass
 * **سطر واحد** بطول يزيد على ٢٠٠ حرف بلا مسافة واحدة.
 *
 * الاختبار يقيس ما يُبنى فعلاً لا ما نتمنّاه:
 *   ① الكلاس المستعمل في الصفحة موجود في CSS المُولَّد (لا كلاس وهمي)
 *   ② min-w-0 على أعمدة الشبكة (وإلا فرض المحتوى عرضه — min-width:auto)
 *   ③ لا `overflow-x-auto` على الـ<pre> (كان يسمح بالتمدّد الأفقي)
 *   ④ whitespace-pre-wrap + break-anywhere مجتمعتان على نفس العنصر
 *
 * يُشغَّل بعد `vite build` (‏dist/ مطلوب) — يُتخطّى بلطف إن لم يكن موجوداً.
 */
import { describe, expect, it, beforeAll } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const PAGE = join(ROOT, 'src/portals/ops-room/pages/MapPlanning/OpsMapImportPage.tsx')
const page = readFileSync(PAGE, 'utf8')

/** يجمع كل CSS المُبنى (قد يكون موزّعاً على عدة ملفات). */
function builtCss(): string {
  const dir = join(ROOT, 'dist/assets')
  if (!existsSync(dir)) return ''
  return readdirSync(dir)
    .filter((f) => f.endsWith('.css'))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n')
}

const css = builtCss()
const hasCss = css.length > 0

describe('① الكلاسات المستعملة موجودة فعلاً في CSS المُولَّد', () => {
  it('break-anywhere مُعرَّفة بـ overflow-wrap: break-word', () => {
    if (!hasCss) return // لا dist — التخطّي (CI يشغّل build قبله)
    expect(css).toMatch(/\.break-anywhere\{[^}]*overflow-wrap:\s*break-word/)
  })

  it('whitespace-pre-wrap تُبقي تنسيق الأسطر وتسمح بالالتفاف', () => {
    if (!hasCss) return
    expect(css).toMatch(/\.whitespace-pre-wrap\{[^}]*white-space:\s*pre-wrap/)
  })

  it('<pre> الافتراضي هو white-space: pre — أي أن الإصلاح ضروري لا تجميلي', () => {
    if (!hasCss) return
    // إثبات العيب الأصلي: القاعدة الافتراضية تمنع الالتفاف
    expect(css).toMatch(/pre\{white-space:\s*pre\}/)
  })
})

describe('② عنصر السكربت', () => {
  const pre = page.slice(page.indexOf('<pre'), page.indexOf('</pre>'))

  it('يحمل whitespace-pre-wrap و break-anywhere معاً', () => {
    expect(pre).toContain('whitespace-pre-wrap')
    expect(pre).toContain('break-anywhere')
  })

  it('لا يحمل overflow-x-auto (كان يسمح بالتمدّد الأفقي خارج الحدود)', () => {
    expect(pre).not.toContain('overflow-x-auto')
  })

  it('يحتفظ بالتمرير العمودي للسكربت الطويل', () => {
    expect(pre).toContain('overflow-y-auto')
  })

  it('له حشو علوي يكفي لزر النسخ المطلق', () => {
    // pt-9 = 2.25rem — الزر absolute top-2 بارتفاع ~22px
    expect(pre).toContain('pt-9')
  })
})

describe('③ أعمدة الشبكة تنكمش على الهاتف', () => {
  it('حاوية الشبكة تحمل min-w-0', () => {
    const grid = page.slice(page.indexOf('grid min-w-0 gap-4 lg:grid-cols-2') - 60)
    expect(page).toContain('grid min-w-0 gap-4 lg:grid-cols-2')
    expect(grid).toBeTruthy()
  })

  it('أقسام الخطوات الأربع كلها تحمل min-w-0', () => {
    // min-width:auto هو الافتراضي في grid ⇒ المحتوى يفرض عرضه بدل أن ينكمش.
    // التعليق {/* ══ ① السكربت ══ */} يقع **قبل** <section> لا بعده — لا تبحث بعده.
    const sections = page.match(/<section className="min-w-0 rounded-2xl/g) ?? []
    expect(sections.length).toBeGreaterThanOrEqual(4)
  })

  it('قسم السكربت تحديداً يحمل min-w-0', () => {
    const i = page.indexOf('① السكربت')
    const after = page.slice(i, i + 400)
    expect(after).toContain('min-w-0 rounded-2xl')
  })

  it('قسم الإسقاط يحمل min-w-0', () => {
    expect(page).toContain('min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">')
  })
})

describe('④ الرؤوس لا تتجاوز الحاوية', () => {
  it('رأس خطوة ② يستعمل flex-wrap للشارة', () => {
    // ٤٠٠ حرف: الفتحة + الأيقونة + صنف العنوان + العنوان — ٢٥٩ فعلياً
    expect(page).toMatch(/<h2 className="flex flex-wrap items-center gap-x-2 gap-y-1[^"]*"[\s\S]{0,400}إسقاط ملف/)
  })

  it('رأس خطوة ③ يقصّ اسم الملف بـ truncate بدل دفعه خارج الحدود', () => {
    expect(page).toMatch(/truncate text-\[10px\] font-bold text-slate-400 sm:ms-auto/)
  })

  it('رأس خطوة ④ يستعمل flex-wrap', () => {
    expect(page).toMatch(/<h2 className="flex flex-wrap items-center gap-x-2 gap-y-1[^"]*"[\s\S]{0,400}الإدراج على دفعات/)
  })
})

describe('⑤ النصوص الطويلة الديناميكية قابلة للكسر', () => {
  it('رسالة الخطأ العامة', () => {
    expect(page).toMatch(/break-anywhere text-\[11px\] font-normal opacity-80/)
  })

  it('قائمة أخطاء الإدراج (أكواد وأسباب إنجليزية طويلة)', () => {
    expect(page).toMatch(/break-anywhere font-mono/)
  })

  it('سبب تخطّي العنصر في المستبعدات', () => {
    expect(page).toMatch(/break-anywhere text-\[10px\] leading-tight text-red-600/)
  })
})

describe('⑥ لا فيض أفقي في باقي عناصر الصفحة', () => {
  beforeAll(() => {
    // حرس: أي `w-[...px]` ثابت أو min-w عريض على هذه الصفحة يُعيد العيب
    expect(page).not.toMatch(/\bw-\[(\d{3,})px\]/)
  })

  it('الأزرار الطويلة داخل flex-wrap', () => {
    expect(page).toMatch(/mt-2 flex flex-wrap items-center gap-2/)
  })
})
