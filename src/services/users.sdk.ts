/**
 * SDK إدارة المستخدمين (البوابة التقنية — وحدة إدارة المستخدمين)
 *  · list: RPC آمنة تتحقق من الدور على الخادم
 *  · setUserRole: RPC مع تدقيق إلزامي ومنع تعديل الذات
 *  · create: Edge Function admin-users (إنشاء auth يتطلب صلاحية admin API)
 */
import { sdkGuard, sdkVoid, supabase } from './client'
import { SDKError } from '@lib/errors/SDKError'
import type { Role } from '@lib/constants/roles.constants'

export interface PlatformUser {
  id: string
  email: string | null
  created_at: string
  last_sign_in_at: string | null
  roles: Role[]
  employee_name: string | null
  employee_number: string | null
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

  async create(input: CreateUserInput): Promise<{ user_id: string }> {
    const { data, error } = await supabase.functions.invoke<{ user_id: string }>('admin-users', {
      body: input,
    })
    if (error) {
      throw new SDKError(
        ERROR_MESSAGES[(error as { code?: string }).code ?? ''] ?? 'فشل إنشاء المستخدم — حاول مجدداً',
        'CREATE_USER_FAILED',
        error,
      )
    }
    if (!data?.user_id) {
      throw new SDKError('استجابة غير متوقعة من خدمة إنشاء المستخدمين', 'CREATE_USER_EMPTY')
    }
    return data
  },
}

/** رسائل آمنة بالعربية لأكواد الـ Edge Function */
const ERROR_MESSAGES: Record<string, string> = {
  BAD_EMAIL: 'صيغة البريد الإلكتروني غير صحيحة',
  WEAK_PASSWORD: 'كلمة المرور ضعيفة — 8 أحرف فأكثر مع رقم',
  BAD_ROLE: 'الدور المحدد غير معروف',
  NAME_REQUIRED: 'الاسم الكامل مطلوب',
  EMAIL_TAKEN: 'البريد الإلكتروني مستخدم مسبقاً',
  EMPLOYEE_NUMBER_TAKEN: 'الرقم الوظيفي مستخدم مسبقاً',
  EMPLOYEE_LINK_FAILED: 'أُنشئ المستخدم لكن فشل ربط سجل الموظف — أكمل الربط من الشاشة',
  FORBIDDEN: 'لا تملك صلاحية إنشاء المستخدمين',
}
