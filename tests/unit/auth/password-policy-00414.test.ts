/**
 * 00414 — سياسة كلمة المرور 10 أحرف في مكان واحد.
 * قبل الإصلاح: الرقم 8 مكرّر في ثلاثة مواضع (إنشاء مستخدم · بطاقة المستخدم · دعم الدخول)
 * برسائل مختلفة ⇒ تغيير السياسة يحتاج ثلاث تعديلات وقد تتناقض.
 * ملاحظة أمان: شاشة **الدخول** تبقى على 8 (رفعها يقفل الحسابات القائمة).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PASSWORD_MIN_LENGTH, PASSWORD_RULE_HINT, checkPasswordPolicy } from '@features/auth/password-policy'
import { createSuperAdminSchema } from '@features/user-management/schemas/create-user.schema'

const src = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8')

describe('00414 — سياسة كلمة المرور', () => {
  it('الحد الأدنى 10 والقواعد الثلاث', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10)
    expect(PASSWORD_RULE_HINT).toContain('10')
    expect(checkPasswordPolicy('123456789k').ok).toBe(true)
    // 10 أرقام بلا حرف: الطول كافٍ لكن شرط الحرف غير محقَّق (كسابقاته قبل 00414 أيضًا)
    expect(checkPasswordPolicy('1234567890')).toMatchObject({ ok: false, error: 'كلمة المرور يجب أن تحتوي حرفاً واحداً على الأقل' })
    expect(checkPasswordPolicy('Abc123456')).toMatchObject({ ok: false, error: 'كلمة المرور: 10 أحرف على الأقل' })
    expect(checkPasswordPolicy('abcdefghij')).toMatchObject({ ok: false, error: 'كلمة المرور يجب أن تحتوي رقماً واحداً على الأقل' })
    expect(checkPasswordPolicy('1234567890a').ok).toBe(true)
    expect(checkPasswordPolicy('١٢٣٤٥٦٧٨٩٠').ok).toBe(false) // أرقام هندية بلا حرف لاتيني/عربي
  })

  it('حرف عربي يُحتسب حرفًا', () => {
    expect(checkPasswordPolicy('بغداد12345').ok).toBe(true)
  })

  it('إنشاء المستخدم يرفض 9 ويقبل 10', () => {
    const base = { email: 'x@akram.iq', full_name: 'اسم تجريبي', role: 'employee' as const, contractor_manager_id: 'm' }
    expect(createSuperAdminSchema.safeParse({ ...base, password: 'Abc123456' }).success).toBe(false)
    expect(createSuperAdminSchema.safeParse({ ...base, password: 'Abc1234567k' }).success).toBe(true)
  })

  it('الشاشات الثلاث تستخدم المصدر الواحد بلا رقم مكرّر', () => {
    const create = src('portals/it/pages/UserManagement/CreateUser.tsx')
    const detail = src('portals/it/pages/UserManagement/UserDetail.tsx')
    const support = src('portals/it/pages/Support/LoginSupportPage.tsx')
    expect(create).toContain('hint={PASSWORD_RULE_HINT}')
    expect(detail).toContain('newPassword.length < PASSWORD_MIN_LENGTH')
    expect(detail).not.toContain('8 أحرف فأكثر')
    expect(support).toContain('checkPasswordPolicy(newPassword)')
    expect(support).toContain('minLength={PASSWORD_MIN_LENGTH}')
    for (const f of [create, detail, support]) expect(f).not.toMatch(/newPassword\.length < 8\b/)
  })

  it('شاشة الدخول تبقى على 8 — رفعها يقفل حسابًا قائمًا', () => {
    expect(src('features/auth/schemas/auth.schema.ts')).toContain("password: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل')")
  })
})
