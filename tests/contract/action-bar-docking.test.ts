/**
 * عقد التصاق شريط إجراءات طلبات الصرف فوق الشريط السفلي للتنقل (على الموبايل).
 * سبب العقد: إزاحة `bottom` للعنصر الملصق تُقاس من داخل حشو منطقة التمرير (قيس بمعاينة حية: حشو 88px ⇒ فجوة 85px فوق الشريط السفلي حين كانت الإزاحة 3.5rem).
 * الصيغة: إزاحة الشريط = ارتفاع الشريط السفلي (3.5rem + حد/حشو) − الحشو السفلي لمنطقة التمرير (5.5rem) = −2rem تقريباً.
 * هذا الاختبار يحرس العلاقة بين ثوابت الملفين (لا يقيس التخطيط؛ القياس الفعلي في معاينة journey.mjs).
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8')

describe('ActionBar docking contract', () => {
  const shell = read('src/components/layout/AppShell.tsx')
  const ui = read('src/features/disbursements/components/DisbursementUi.tsx')

  it('AppShell: حشو منطقة التمرير السفلي على الموبايل/اللوح 5.5rem', () => {
    expect(shell).toMatch(/p-4 pb-\[calc\(5\.5rem\+env\(safe-area-inset-bottom\)\)\]/)
    expect(shell).toMatch(/sm:pb-\[calc\(5\.5rem\+env\(safe-area-inset-bottom\)\)\]/)
  })

  it('ActionBar: ملصق بإزاحة سالبة تعوّض الحشو (−2rem) ولا تعود إلى 3.5rem من حافة الشاشة', () => {
    const m = /className="sticky (-bottom-\d+) z-20/.exec(ui)
    expect(m, 'يجب أن يبدأ الشريط بـ sticky -bottom-N').not.toBeNull()
    const rem = Number((m?.[1] ?? '').replace('-bottom-', '')) * 0.25   // وحدة تيلويند: 8 = 2rem
    const navRem = 3.5          // ارتفاع الشريط السفلي التقريبي h-14 (حد 1px وحشو أيقونات يضيفان ≈0.2rem مغطّاة تحت الشريط)
    const padRem = 5.5
    expect(-rem).toBeCloseTo(navRem - padRem, 5)
    expect(ui).not.toMatch(/sticky bottom-\[calc\(3\.5rem\+env\(safe-area-inset-bottom\)\)\]/)
  })

  it('ActionBar على الشاشة الكبيرة: عائم بإزاحة 0 (الحشو السفلي lg:pb-6 وبلا شريط سفلي)', () => {
    expect(ui).toMatch(/lg:bottom-0/)
    expect(shell).toMatch(/lg:pb-6/)
  })
})
