/**
 * مراقب الجلسة (00312) — حارس المسارات يعمل عند «دخول» البوابة فقط (loader)،
 * أما إن انتهت الجلسة أثناء العمل (إبطال رمز التحديث، تعطيل الحساب من IT،
 * تغيير كلمة المرور من جهاز آخر، أو خروج من تبويب آخر) فلا شيء كان يعيد
 * المستخدم إلى تسجيل الدخول — تبقى الصفحة مفتوحة وتفشل طلباتها واحداً تلو الآخر.
 * هنا: عند زوال الجلسة ونحن داخل مسار محمي → إفراغ الكاش والتوجيه إلى /login.
 */
import { auth } from '@sdk/auth.sdk'
import { queryClient } from '@config/query-client.config'

/** المسارات العامة التي لا تتطلب جلسة — mirror لـ PUBLIC_ROUTES (بلا استيراد الموجّه لتفادي الدورات) */
export const PUBLIC_PATH_PREFIXES: readonly string[] = ['/login', '/forgot-password', '/reset-password', '/403', '/citizen']

export function isPublicPath(pathname: string): boolean {
  return pathname === '/' || PUBLIC_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

/** قرار نقي قابل للاختبار: هل نعيد التوجيه إلى /login؟ */
export function shouldRedirectToLogin(pathname: string, hasSession: boolean): boolean {
  if (hasSession) return false
  return !isPublicPath(pathname)
}

interface MinimalRouter {
  state: { location: { pathname: string } }
  navigate: (to: string, opts?: { replace?: boolean }) => Promise<void> | void
}

/** يبدأ المراقبة ويعيد دالة الإلغاء */
export function startSessionWatch(router: MinimalRouter): () => void {
  let hadSession = false
  return auth.onAuthStateChange((token) => {
    const has = token !== null
    // نتصرف فقط عند الانتقال من «جلسة قائمة» إلى «لا جلسة» — لا عند التهيئة الأولى
    if (hadSession && !has && shouldRedirectToLogin(router.state.location.pathname, false)) {
      queryClient.clear()
      void router.navigate('/login', { replace: true })
    }
    hadSession = has
  })
}
