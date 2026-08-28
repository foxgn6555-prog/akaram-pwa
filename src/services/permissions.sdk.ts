/**
 * SDK مصفوفة صلاحيات الصفحات (00023)
 * القراءة متاحة للكل (الشريط الجانبي يحتاجها) · الإدارة IT فقط (RLS)
 */
import { sdkGuard, sdkVoid, supabase } from './client'
import type { RolePagePermission, UserPageOverride, OverrideEffect, PermissionEffect } from '@features/permissions/types'

export const permissions = {
  /** كل قواعد الأدوار */
  async listRolePermissions(): Promise<RolePagePermission[]> {
    return sdkGuard(
      supabase
        .from('role_page_permissions')
        .select('id, role, page_key, effect')
        .order('page_key'),
    ) as Promise<RolePagePermission[]>
  },

  /** كل القيود الفردية */
  async listUserOverrides(): Promise<UserPageOverride[]> {
    return sdkGuard(
      supabase
        .from('user_page_overrides')
        .select('id, user_id, page_key, effect, reason')
        .order('page_key'),
    ) as Promise<UserPageOverride[]>
  },

  /** منح/إخفاء صفحة لدور (upsert) */
  async setRoleEffect(role: string, pageKey: string, effect: PermissionEffect | null): Promise<void> {
    if (effect === null) {
      await sdkVoid(
        supabase
          .from('role_page_permissions')
          .delete()
          .eq('role', role)
          .eq('page_key', pageKey),
      )
      return
    }
    await sdkVoid(
      supabase
        .from('role_page_permissions')
        .upsert({ role, page_key: pageKey, effect } as never, { onConflict: 'role,page_key' }),
    )
  },

  /** قفل/فتح صفحة لشخص (upsert) */
  async setUserOverride(
    userId: string,
    pageKey: string,
    effect: OverrideEffect | null,
    reason?: string,
  ): Promise<void> {
    if (effect === null) {
      await sdkVoid(
        supabase
          .from('user_page_overrides')
          .delete()
          .eq('user_id', userId)
          .eq('page_key', pageKey),
      )
      return
    }
    await sdkVoid(
      supabase
        .from('user_page_overrides')
        .upsert({ user_id: userId, page_key: pageKey, effect, reason } as never, {
          onConflict: 'user_id,page_key',
        }),
    )
  },

  /** هل يرى مستخدم صفحة؟ (سؤال الخادم — يُستخدم في الحارس) */
  async canSee(pageKey: string): Promise<boolean> {
    return sdkGuard(
      supabase.rpc('can_i_see', { p_page_key: pageKey }),
    ) as Promise<boolean>
  },
}
