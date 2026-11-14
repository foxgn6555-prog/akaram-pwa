/**
 * 00414 — سياسة كلمة المرور في مكان واحد.
 *
 * سبب وجودها: الطول الأدنى كان مكتوبًا رقمًا صريحًا (8) في ثلاثة مواضع مختلفة
 * (إنشاء مستخدم · إعادة الضبط من بطاقة المستخدم · دعم الدخول)، فتغيير السياسة
 * يحتاج تعديل ثلاثة ملفات وثلاث رسائل — وقد تختلف بينها.
 *
 * ⚠️ السياسة تُطبَّق عند **تعيين** كلمة المرور فقط (إنشاء حساب · إعادة ضبط).
 * ولا تُطبَّق على شاشة **الدخول**: رفع حدّ الدخول يقفل حسابًا قائمًا كلمة مروره
 * أقصر من الحد الجديد، بينما رفع الحد في Auth لا يمسّ كلمات المرور القائمة.
 */
export const PASSWORD_MIN_LENGTH = 10

export const PASSWORD_RULE_HINT = `${PASSWORD_MIN_LENGTH} أحرف فأكثر · حرف واحد على الأقل · رقم واحد على الأقل`

export interface PasswordPolicyResult {
  ok: boolean
  /** رسالة عربية جاهزة للعرض عند المخالفة */
  error: string | null
}

/** فحص موحّد لكلمة مرور جديدة (واجهة) — نفس القواعد في كل الشاشات الثلاث */
export function checkPasswordPolicy(value: string): PasswordPolicyResult {
  if (value.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: `كلمة المرور: ${PASSWORD_MIN_LENGTH} أحرف على الأقل` }
  }
  if (!/[A-Za-z\u0600-\u06FF]/.test(value)) {
    return { ok: false, error: 'كلمة المرور يجب أن تحتوي حرفاً واحداً على الأقل' }
  }
  if (!/[0-9]/.test(value)) {
    return { ok: false, error: 'كلمة المرور يجب أن تحتوي رقماً واحداً على الأقل' }
  }
  return { ok: true, error: null }
}
