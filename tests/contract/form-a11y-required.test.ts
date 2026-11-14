/**
 * الجولة 13 — وصولية النماذج (a11y):
 * الحقول الإلزامية تُعلَن لقارئ الشاشة بـaria-required، والحقول التي كان لها
 * placeholder فقط (بلا <label>) صار لها aria-label.
 *
 * اختبار عقد على المصدر: يمنع أي تراجع صامت (حذف الوسم عند إعادة كتابة النموذج).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

describe('وصولية النماذج — aria-required و aria-label', () => {
  it('نموذج إنشاء المستخدم: البريد والاسم وكلمة المرور معلَّمة إلزامية', () => {
    const f = src('src/portals/it/pages/UserManagement/CreateUser.tsx')
    expect(f).toMatch(/id="cu-email"[\s\S]{0,80}aria-required="true"/)
    expect(f).toMatch(/id="cu-name"[\s\S]{0,80}aria-required="true"/)
    expect(f).toMatch(/id="cu-password"[\s\S]{0,40}aria-required="true"/)
  })

  it('نموذج إضافة مادة (المخزن): اسم المادة إلزامي وكل حقل له اسم وصولي', () => {
    const f = src('src/portals/ops-room/pages/Store/OpsStorePage.tsx')
    expect(f).toContain('data-testid="item-name" aria-label="اسم المادة" aria-required="true"')
    expect(f).toContain('data-testid="item-unit" aria-label="الوحدة"')
    expect(f).toContain('data-testid="item-min" aria-label="الحد الأدنى"')
  })

  it('نموذج المصروف: المبلغ إلزامي ومسمّى، والبيان مسمّى (كان placeholder فقط)', () => {
    const f = src('src/portals/finance/pages/Expenses/FinanceExpensesPage.tsx')
    expect(f).toContain('aria-label="المبلغ بالدينار" aria-required="true"')
    expect(f).toContain('aria-label="بيان المصروف"')
  })

  it('نموذج الطلب نيابة عن موظف: اختيار الموظف إلزامي', () => {
    const f = src('src/portals/hr/pages/Leaves/Leaves.tsx')
    expect(f).toMatch(/aria-required="true" value=\{employeeId\}/)
  })

  it('لا نستخدم required الأصلي (يغيّر سلوك المتصفح) — التحقق يبقى في الكود', () => {
    for (const p of [
      'src/portals/it/pages/UserManagement/CreateUser.tsx',
      'src/portals/ops-room/pages/Store/OpsStorePage.tsx',
      'src/portals/finance/pages/Expenses/FinanceExpensesPage.tsx',
      'src/portals/hr/pages/Leaves/Leaves.tsx',
    ]) {
      expect(src(p)).not.toMatch(/<(input|select|textarea)[^>]*\srequired[=\s>]/)
    }
  })
})

describe('الجولة 13 — دقة وسم الأرقام في لوحة الحالة', () => {
  it('وسم عدد الدوال يقول public وapp (الرقم يجمع المخططين فعلاً)', () => {
    const f = src('src/portals/it/pages/DevOps/DevOpsStatusPage.tsx')
    expect(f).toContain('دوال RPC في public وapp')
    expect(f).not.toContain('hint="دوال RPC وجداول public"')
  })
})
