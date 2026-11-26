/**
 * SDK المصادقة: session + user + الأدوار + تحديد البوابة.
 * دخول الموظفين يمر عبر staff-login: عدّاد خادمي 10/15 دقيقة وقفل 5 دقائق
 * لكل بريد + مصدر جهاز، مع بقاء جلسة Supabase محفوظة كما كانت.
 */
import { sdkGuard, sdkMaybe, sdkVoid, supabase } from './client'
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

export interface ActiveSessionInfo {
  id?: string
  ip?: string | null
  user_agent?: string | null
  created_at?: string | null
}

export class LoginGatewayError extends AuthError {
  readonly lockedUntil?: string
  readonly failuresLeft?: number
  /** الجولة ٣: الحساب بلغ حد الأجهزة المسموح */
  readonly maxSessions?: number
  readonly activeSessions?: number
  readonly activeList?: ActiveSessionInfo[]
  /** الحساب حسّاس: يحتاج رمز موافقة من الجهاز الحالي */
  readonly requiresDeviceCode?: boolean

  constructor(
    message: string,
    code: string,
    details: {
      lockedUntil?: string
      failuresLeft?: number
      maxSessions?: number
      activeSessions?: number
      activeList?: ActiveSessionInfo[]
      requiresDeviceCode?: boolean
    } = {},
  ) {
    super(message, code)
    this.name = 'LoginGatewayError'
    this.lockedUntil = details.lockedUntil
    this.failuresLeft = details.failuresLeft
    this.maxSessions = details.maxSessions
    this.activeSessions = details.activeSessions
    this.activeList = details.activeList
    this.requiresDeviceCode = details.requiresDeviceCode
  }
}

async function toLoginGatewayError(error: unknown): Promise<LoginGatewayError> {
  let body: {
    error?: string
    locked_until?: string
    failures_left?: number
    max?: number
    active?: number
    others?: ActiveSessionInfo[]
    requires_code?: boolean
  } = {}
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
  if (code === 'SESSION_LIMIT_REACHED') {
    return new LoginGatewayError(
      'الحساب مفتوح على جهاز آخر — يمكنك إنهاء الجلسة السابقة والانتقال إلى هذا الجهاز',
      code,
      {
        maxSessions: body.max,
        activeSessions: body.active,
        activeList: body.others ?? [],
        requiresDeviceCode: body.requires_code === true,
      },
    )
  }
  if (code === 'DEVICE_CODE_REQUIRED') {
    return new LoginGatewayError(
      'هذا حساب حسّاس: لن يتم الانتقال إلا برمز الموافقة من جهازك الحالي',
      'SESSION_LIMIT_REACHED',
      { maxSessions: body.max, activeSessions: body.active, activeList: body.others ?? [], requiresDeviceCode: true },
    )
  }
  if (code === 'AUTH_THROTTLED') return new LoginGatewayError('الخدمة قيّدت المحاولات مؤقتاً — انتظر قليلاً ثم أعد المحاولة', code)
  if (code === 'LOGIN_GUARD_UNAVAILABLE' || code === 'CONFIGURATION') return new LoginGatewayError('تعذر التحقق الآمن من حالة الدخول — حاول لاحقاً', code)
  if (code === 'INVALID_INPUT') return new LoginGatewayError('تحقق من البريد الإلكتروني وكلمة المرور', code)
  return new LoginGatewayError('تعذر الاتصال بخدمة الدخول — حاول مرة أخرى', 'AUTH_NETWORK')
}

export const auth = {
  async login(
    email: string,
    password: string,
    options: { switchDevice?: boolean; deviceCode?: string } = {},
  ): Promise<SessionUser> {
    const normalizedEmail = email.trim().toLowerCase()
    let data: { session?: { access_token: string; refresh_token: string; user?: { id: string; email?: string | null } } | null } | null = null
    let error: unknown = null

    try {
      const result = await supabase.functions.invoke<{ session?: { access_token: string; refresh_token: string; user?: { id: string; email?: string | null } } }>('staff-login', {
        body: {
          email: normalizedEmail,
          password,
          source_id: getLoginSourceId(),
          ...(options.switchDevice ? { switch: true } : {}),
          ...(options.deviceCode ? { device_code: options.deviceCode.trim() } : {}),
        },
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

  /**
   * يبني SessionUser من الحساب + أدواره في user_roles
   *
   * ## عطل الإنتاج الذي يمنعه `sdkMaybe` هنا
   * كان الاسم الكامل يُقرأ بـ `sdkGuard(...maybeSingle())`. و`maybeSingle`
   * **تُرجع `data: null` بلا خطأ** حين لا يوجد صفّ — وهو نتيجة مشروعة لا
   * فشل. لكن `sdkGuard` يرفض `null` صراحةً ويُطلق `EMPTY_RESULT`، فينفجر
   * بناء الجلسة **كله** لمستخدم حسابه بلا صفّ في `employees`: لا أدوار، لا
   * بوابة، وشاشة خطأ بدل التطبيق.
   *
   * الحساب بلا صفّ موظف حالة واقعية ومتوقعة (حسابات إدارية/متعاقدين/مدير
   * نظام لم يُربط بموظف). الاسم الكامل تكميلي — غيابه لا يجوز أن يمنع الدخول.
   * لذا يُقرأ بـ `sdkMaybe` الذي يتيح `null` ويُبقي توحيد أخطاء الشبكة.
   *
   * الأدوار تُقرأ بـ `sdkGuard` كما هي: مصفوفة فارغة ليست `null`، وفشل
   * قراءتها فعلاً فشل — لا نُخفيه.
   */
  async buildSessionUser(userId: string, email: string | null): Promise<SessionUser> {
    const rolesData = await sdkGuard(
      supabase.from('user_roles').select('role').eq('user_id', userId),
    )
    const roles = (rolesData as Array<{ role: Role }>).map((r) => r.role)

    const fullNameData = await sdkMaybe<{ full_name: string }>(
      supabase.from('employees').select('full_name').eq('user_id', userId).maybeSingle(),
    )

    return {
      id: userId,
      email,
      fullName: fullNameData?.full_name ?? null,
      roles,
      primaryRole: ROLE_PRIORITY.find((r) => roles.includes(r)) ?? 'employee',
    }
  },
}
