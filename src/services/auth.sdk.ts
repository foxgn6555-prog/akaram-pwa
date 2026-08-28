/**
 * SDK المصادقة: session + user + الأدوار + تحديد البوابة
 * أمن الدخول (3 طبقات — docs/login-security.md):
 *   1) الخادم: is_login_locked RPC قبل المحاولة (الحاكم)
 *   2) Supabase Auth: PKCE + rate limiting مدمج (+ CAPTCHA اختياري)
 *   3) المتصفح: login-guard.ts (طبقة UX في صفحة الدخول)
 */
import { sdkGuard, sdkVoid, supabase, isNetworkError } from './client'
import { ROLE_PRIORITY, type Role } from '@lib/constants/roles.constants'
import { AuthError } from '@lib/errors/AuthError'
import { logger } from '@lib/monitoring/logger'

export interface SessionUser {
  id: string
  email: string | null
  fullName: string | null
  roles: Role[]
  primaryRole: Role
}

export const auth = {
  async login(email: string, password: string): Promise<SessionUser> {
    const normalizedEmail = email.trim().toLowerCase()

    // ── الطبقة 1: فحص القفل على الخادم (الحاكم) ──
    try {
      const { data: locked } = await supabase.rpc('is_login_locked', {
        p_email: normalizedEmail,
      })
      if (locked === true) {
        throw new AuthError(
          'تم قفل الدخول مؤقتاً بسبب محاولات فاشلة متكررة — حاول بعد ربع ساعة',
          'LOGIN_LOCKED',
        )
      }
    } catch (error) {
      if (error instanceof AuthError) throw error
      // فشل فحص القفل لا يمنع المحاولة — لكن يُسجل بوضوح (لا صمت أمني)
      logger.warn('فحص قفل الدخول فشل — الدخول سيستمر بحماية rate-limit فقط', {
        error: error instanceof Error ? error.message : String(error),
      })
    }

    // ── الطبقة 2: المصادقة نفسها ──
    try {
      const data = await sdkGuard<{ user: { id: string; email?: string | null } | null }>(
        supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        }),
      )
      const user = data.user
      if (!user) throw new AuthError('فشل تسجيل الدخول', 'AUTH_NO_USER')

      // نجاح: أبلغ الخادم (يمحو عدّاد الفشل) — خارج المسار الحرج
      void supabase.rpc('record_login_attempt', {
        p_email: normalizedEmail,
        p_success: true,
      })

      return auth.buildSessionUser(user.id, user.email ?? null)
    } catch (error) {
      if (error instanceof AuthError) throw error

      // فشل مصادقة: سجّل المحاولة الفاشلة على الخادم (تحسب نحو القفل)
      void supabase.rpc('record_login_attempt', {
        p_email: normalizedEmail,
        p_success: false,
      })

      if (isNetworkError(error)) {
        throw new AuthError('تعذر الاتصال بالخادم — تحقق من الشبكة', 'AUTH_NETWORK', error)
      }
      throw new AuthError('البريد الإلكتروني أو كلمة المرور غير صحيحة', 'AUTH_FAILED', error)
    }
  },

  async logout(): Promise<void> {
    await sdkVoid(supabase.auth.signOut())
  },

  async sendPasswordReset(email: string): Promise<void> {
    await sdkGuard(
      supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/reset-password`,
      }),
    )
  },

  async updatePassword(newPassword: string): Promise<void> {
    await sdkGuard(supabase.auth.updateUser({ password: newPassword }))
  },

  async getSession(): Promise<SessionUser | null> {
    const { data } = await supabase.auth.getSession()
    if (!data.session?.user) return null
    return auth.buildSessionUser(data.session.user.id, data.session.user.email ?? null)
  },

  /** يبني SessionUser من الحساب + أدواره في user_roles */
  async buildSessionUser(userId: string, email: string | null): Promise<SessionUser> {
    const rolesData = await sdkGuard(
      supabase.from('user_roles').select('role').eq('user_id', userId),
    )
    const roles = (rolesData as Array<{ role: Role }>).map((r) => r.role)

    const fullNameData = await sdkGuard(
      supabase.from('employees').select('full_name').eq('user_id', userId).maybeSingle(),
    )

    return {
      id: userId,
      email,
      fullName: (fullNameData as { full_name: string } | null)?.full_name ?? null,
      roles,
      primaryRole: ROLE_PRIORITY.find((r) => roles.includes(r)) ?? 'employee',
    }
  },
}
