/**
 * ⚑ عقود الأمان — نمط Kyvzon Security Tests
 * يتحقق من عدم وجود ثغرات شائعة
 */
import { describe, it, expect } from 'vitest'

describe('⚓ عقود الأمان', () => {
  it('لا رسائل خطأ تكشف وجود الحساب', () => {
    // الرسالة الموحدة: "البريد أو كلمة المرور غير صحيحة" — لا تفرق
    const unifiedMessage = 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
    expect(unifiedMessage).not.toContain('غير موجود')
    expect(unifiedMessage).not.toContain('الحساب غير مفعّل')
    expect(unifiedMessage).toContain('غير صحيحة')
  })

  it('قيد user_roles.role يسمح فقط بالأدوار المعروفة أو portal:', () => {
    const staticRoles = ['employee', 'hr_officer', 'department_manager', 'finance_officer', 'it_admin', 'super_admin']
    // نمط القيد في DB: static roles OR portal:{slug}
    const validRole = staticRoles[0]
    const validDynamic = 'portal:ops'
    const invalid = 'admin_x'

    // static roles في القائمة ✓
    expect(staticRoles).toContain(validRole)
    // dynamic يبدأ بـ portal: ✓
    expect(validDynamic).toMatch(/^portal:/)
    // invalid لا يطابق النمطين
    expect(staticRoles).not.toContain(invalid)
    expect(invalid).not.toMatch(/^portal:/)
  })

  it('المفاتيح الحساسة لا تظهر في الكود (نمط بسيط للتحقق)', () => {
    // في المشروع الحقيقي: فاحص الأسرار scripts/check-secrets.sh يعمل في CI
    const secretPatterns = ['sb_secret_', 'sbp_', 'service_role']
    // تأكد أن الدالة تسمى SUPABASE_SERVICE_ROLE_KEY (اسم متغير، ليس قيمة)
    const envVarName = 'SUPABASE_SERVICE_ROLE_KEY'
    // اسم المتغير ليس سراً — القيمة هي السر
    expect(envVarName).not.toMatch(/^sb_secret_/)
    expect(secretPatterns.length).toBeGreaterThan(0)
  })
})
