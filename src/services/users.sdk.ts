/**
 * SDK إدارة المستخدمين (البوابة التقنية — وحدة إدارة المستخدمين)
 *  · list: RPC آمنة تتحقق من الدور على الخادم
 *  · setUserRole: RPC مع تدقيق إلزامي ومنع تعديل الذات
 *  · updateEmployeeProfile: RPC set_employee_profile (تعديل بيانات الموظف المرتبط)
 *  · create / updateEmail / setBanned / resetPassword: Edge Function admin-users
 *    (عمليات auth تتطلب admin API عبر service_role — لا يلمسه العميل أبداً)
 */
import { sdkGuard, sdkVoid, supabase } from './client'
import { SDKError } from '@lib/errors/SDKError'
import type { Role } from '@lib/constants/roles.constants'

export interface PlatformUser {
  id: string
  email: string | null
  created_at: string
  last_sign_in_at: string | null
  /** حالة الحساب (auth ban) — null يعني مفعّلاً */
  banned_until: string | null
  roles: Role[]
  /** بيانات سجل الموظف المرتبط (null إن لم يُربط) */
  employee_id: string | null
  employee_name: string | null
  employee_number: string | null
  phone: string | null
  job_title: string | null
  department_id: string | null
  department_name: string | null
}

export interface CreateUserInput {
  email: string
  password: string
  full_name: string
  role: Role
  employee_number?: string
  department_id?: string
  job_title?: string
}

/** تعديل بيانات الموظف المرتبط بمستخدم (ينشئ السجل إن لم يوجد) */
export interface UpdateEmployeeProfileInput {
  user_id: string
  full_name: string
  phone?: string | null
  job_title?: string | null
  department_id?: string | null
  employee_number?: string | null
}

export const users = {
  async list(searchQuery?: string): Promise<PlatformUser[]> {
    return sdkGuard(
      supabase.rpc('list_platform_users', { p_query: searchQuery ?? null }),
    ) as Promise<PlatformUser[]>
  },

  /** منح (grant) أو سحب (revoke) دور — الخادم يدقق ويؤرشف */
  async setUserRole(userId: string, role: Role, grant: boolean): Promise<void> {
    await sdkVoid(
      supabase.rpc('set_user_role', {
        p_user_id: userId,
        p_role: role,
        p_grant: grant,
      }),
    )
  },

  /** تعديل بيانات الموظف المرتبط — RPC آمنة تُدقَّن على الخادم (وتنشئ السجل إن لم يوجد) */
  async updateEmployeeProfile(input: UpdateEmployeeProfileInput): Promise<void> {
    await sdkVoid(
      supabase.rpc('set_employee_profile', {
        p_user_id: input.user_id,
        p_full_name: input.full_name,
        p_phone: input.phone ?? null,
        p_job_title: input.job_title ?? null,
        p_department_id: input.department_id ?? null,
        p_employee_number: input.employee_number ?? null,
      }),
    )
  },

  async create(input: CreateUserInput): Promise<{ user_id: string }> {
    return invokeAdmin<{ user_id: string }>({ action: 'create', ...input })
  },

  /** تعطيل/تفعيل حساب (الخادم يمنع تعطيل الذات) */
  async setBanned(userId: string, banned: boolean): Promise<void> {
    await invokeAdmin({ action: 'set_ban', user_id: userId, banned })
  },

  /** إعادة تعيين كلمة مرور مستخدم */
  async resetPassword(userId: string, password: string): Promise<void> {
    await invokeAdmin({ action: 'reset_password', user_id: userId, password })
  },

  /** تغيير بريد مستخدم (الخادم يمنع تغيير الذات) */
  async updateEmail(userId: string, email: string): Promise<void> {
    await invokeAdmin({ action: 'update_email', user_id: userId, email })
  },
}

/** نداء موحّد لـ admin-users مع رسائل عربية آمنة */
async function invokeAdmin<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('admin-users', { body })
  if (error) {
    throw new SDKError(
      ERROR_MESSAGES[(error as { code?: string }).code ?? ''] ?? 'فشلت العملية — حاول مجدداً',
      'ADMIN_USERS_FAILED',
      error,
    )
  }
  if (!data) {
    throw new SDKError('استجابة غير متوقعة من خدمة إدارة المستخدمين', 'ADMIN_USERS_EMPTY')
  }
  return data
}

/** رسائل آمنة بالعربية لأكواد الـ Edge Function */
const ERROR_MESSAGES: Record<string, string> = {
  BAD_EMAIL: 'صيغة البريد الإلكتروني غير صحيحة',
  WEAK_PASSWORD: 'كلمة المرور ضعيفة — 8 أحرف فأكثر مع رقم وحرف',
  BAD_ROLE: 'الدور المحدد غير معروف',
  BAD_ACTION: 'عملية غير معروفة',
  NAME_REQUIRED: 'الاسم الكامل مطلوب',
  USER_REQUIRED: 'المستخدم غير محدد',
  EMAIL_TAKEN: 'البريد الإلكتروني مستخدم مسبقاً',
  EMPLOYEE_NUMBER_TAKEN: 'الرقم الوظيفي مستخدم مسبقاً',
  EMPLOYEE_LINK_FAILED: 'أُنشئ المستخدم لكن فشل ربط سجل الموظف — أكمل الربط من الشاشة',
  SELF_FORBIDDEN: 'لا يمكنك تنفيذ هذه العملية على حسابك — استخدم قنواتك الشخصية',
  FORBIDDEN: 'لا تملك صلاحية إدارة المستخدمين',
  CREATE_FAILED: 'فشل إنشاء المستخدم — حاول مجدداً',
  UPDATE_FAILED: 'فشل تحديث الحساب — حاول مجدداً',
  BAN_FAILED: 'فشل تغيير حالة الحساب — حاول مجدداً',
  RESET_FAILED: 'فشل تعيين كلمة المرور — حاول مجدداً',
  ROLE_ASSIGN_FAILED: 'فشل تعيين الدور — رُجّع الإنشاء، حاول مجدداً',
}
