/**
 * SDK الأدوار الحساسة (الجولة ٢) — المصدر هو جدول public.sensitive_roles على الخادم.
 *  · list: القائمة التسعة مع حالة التفعيل وعدد الحاملين (قراءة محروسة)
 *  · set:  تفعيل/تعطيل + تدقيق إلزامي (تقنية المعلومات فقط — يُفرض في القاعدة)
 * لا يوجد أي قرار صلاحية في العميل: الواجهة تعرض فقط وتستدعي دالة محروسة.
 */
import { sdkGuard, supabase } from './client'

export interface SensitiveRole {
  role: string
  label: string
  reason: string | null
  active: boolean
  holders: number
  updated_at: string | null
}

export const sensitiveRoles = {
  async list(): Promise<SensitiveRole[]> {
    return sdkGuard(supabase.rpc('sensitive_roles_list')) as Promise<SensitiveRole[]>
  },

  async set(role: string, active: boolean, reason?: string | null): Promise<{ role: string; active: boolean; changed: boolean }> {
    return sdkGuard(
      supabase.rpc('sensitive_role_set', { p_role: role, p_active: active, p_reason: reason ?? null }),
    ) as Promise<{ role: string; active: boolean; changed: boolean }>
  },
}
