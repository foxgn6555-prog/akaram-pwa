/**
 * SDK المصادقة: session + user + الأدوار + تحديد البوابة.
 * دخول الموظفين يمر عبر staff-login: عدّاد خادمي 10/15 دقيقة وقفل 5 دقائق
 * لكل بريد + مصدر جهاز، مع بقاء جلسة Supabase محفوظة كما كانت.
 */
import { sdkGuard, sdkVoid, supabase } from './client'
import { ROLE_PRIORITY, type Role } from '@lib/constants/roles.constants'
import { AuthError } from '@lib/errors/AuthError'
import { getLoginSourceId } from '@features/auth/security/login-source'

export interface SessionUser {
  id: string
  email: string | null
  fullName: string | null
  roles: Role[]
  primaryRole: Role
}

export class LoginGatewayError extends AuthError {
  readonly lockedUntil?: string
  readonly failuresLeft?: number

  constructor(message: string, code: string, details: { lockedUntil?: string; failuresLeft?: number } = {}) {
    super(message, code)
    this.name = 'LoginGatewayError'
    this.lockedUntil = details.lockedUntil
    this.failuresLeft = details.failuresLeft
  }
}

async function toLoginGatewayError(error: unknown): Promise<LoginGatewayError> {
  let body: { error?: string; locked_until?: string; failures_left?: number } = {}
  const context = (error as { context?: Response } | null)?.context
  if (context && typeof context.clone === 'function') {
    try { body = await context.clone().json() as typeof body } catch { /* no response payload */ }
  }
  const code = body.error ?? ''
  if (code === 'INVALID_CREDENTIALS') {
    return new LoginGatewayError('البريد الإلكتروني أو كلمة المرور غير صحيحة', code, { failuresLeft: body.failures_left })
  }
  if (code === 'SOURCE_LOCKED') {
    return new LoginGatewayError('أُوقف الدخول مؤقتاً من هذا الجهاز لمدة خمس دقائق. يمكنك التواصل مع الدعم.', code, { lockedUntil: body.locked_until })
  }
  if (code === 'AUTH_THROTTLED') return new LoginGatewayError('الخدمة قيّدت المحاولات مؤقتاً — انتظر قليلاً ثم أعد المحاولة', code)
  if (code === 'LOGIN_GUARD_UNAVAILABLE' || code === 'CONFIGURATION') return new LoginGatewayError('تعذر التحقق الآمن من حالة الدخول — حاول لاحقاً', code)
  if (code === 'INVALID_INPUT') return new LoginGatewayError('تحقق من البريد الإلكتروني وكلمة المرور', code)
  return new LoginGatewayError('تعذر الاتصال بخدمة الدخول — حاول مرة أخرى', 'AUTH_NETWORK')
}

export const auth = {
  async login(email: string, password: string): Promise<SessionUser> {
    const normalizedEmail = email.trim().toLowerCase()
    let data: { session?: { access_token: string; refresh_token: string; user?: { id: string; email?: string | null } } | null } | null = null
    let error: unknown = null

    try {
      const result = await supabase.functions.invoke<{ session?: { access_token: string; refresh_token: string; user?: { id: string; email?: string | null } } }>('staff-login', {
        body: { email: normalizedEmail, password, source_id: getLoginSourceId() },
      })
      data = result.data
      error = result.error
    } catch {
      // لا نمرر خطأ الشبكة الخام إلى logger؛ قد يحوي تفاصيل طلب المصادقة.
      throw new LoginGatewayError('تعذر الاتصال بخدمة الدخول — تحقق من الشبكة ثم أعد المحاولة', 'AUTH_NETWORK')
    }

    if (error || !data?.session?.access_token || !data.session.refresh_token) {
      throw await toLoginGatewayError(error)
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    })
    if (sessionError || !sessionData.user) {
      throw new LoginGatewayError('تعذر حفظ جلسة الدخول — أعد المحاولة', 'AUTH_SESSION_FAILED')
    }

    return auth.buildSessionUser(sessionData.user.id, sessionData.user.email ?? null)
  },

  async logout(): Promise<void> {
    await sdkVoid(supabase.auth.signOut())
  },

  async getSession(): Promise<SessionUser | null> {
    const { data } = await supabase.auth.getSession()
    if (!data.session?.user) return null
    return auth.buildSessionUser(data.session.user.id, data.session.user.email ?? null)
  },

  /** رمز الوصول الحالي (JWT) — لتمرير هوية المستخدم لتضمينات محمية */
  async getAccessToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  },

  /**
   * مستمع تغيّر الجلسة (تسجيل دخول/تحديث توكن/خروج) — لتحديث تضمينات
   * تحتاج رمزاً حياً (مثل iframe مصمم التدفقات). يعيد دالة الإلغاء.
   */
  onAuthStateChange(callback: (accessToken: string | null) => void): () => void {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session?.access_token ?? null)
    })
    return () => data.subscription.unsubscribe()
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
