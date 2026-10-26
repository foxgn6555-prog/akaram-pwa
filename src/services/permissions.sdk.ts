/**
 * SDK نظام الصلاحيات الموحّد (00350) — القراءة عبر RLS (التطوير المركزية) والكتابة عبر RPC فقط
 */
import { sdkGuard, sdkVoid, supabase } from './client'
import type { PermissionAction } from '@config/permission-catalog'

export type PermissionEffect = 'allow' | 'deny'
export type PermissionSource = 'super_admin' | 'override' | 'template' | 'role' | 'none'

export interface PermissionTemplate { id: string; name: string; description: string | null; is_active: boolean; created_at: string; updated_at: string; users_count?: number }
export interface PermissionTemplateRule { template_id: string; unit_key: string; action: PermissionAction; effect: PermissionEffect }
export interface UserPermissionTemplate { user_id: string; template_id: string; assigned_at: string }
export interface UserPermissionOverride { user_id: string; unit_key: string; action: PermissionAction; effect: PermissionEffect; reason: string | null; created_at: string }
export interface EffectivePermissionRow { unit_key: string; portal: string; label: string; parent_key: string | null; sort: number; action: PermissionAction; allowed: boolean; source: PermissionSource; reason: string | null }
export interface PermissionAuditRow { id: number; actor_id: string | null; actor_name: string | null; target_user: string | null; template_id: string | null; kind: string; detail: Record<string, unknown>; created_at: string }

const ERRORS: Record<string, string> = {
  PERMISSION_SELF_EDIT: 'لا يمكنك تعديل صلاحيات حسابك أنت — اطلب ذلك من زميل في التطوير المركزية.',
  PERMISSION_TARGET_SUPER_ADMIN: 'صلاحيات مدير النظام الأعلى لا تُعدَّل إلا من مدير نظام أعلى آخر.',
  PERMISSION_TEMPLATE_NOT_FOUND: 'القالب غير موجود.',
  PERMISSION_TEMPLATE_IN_USE: 'القالب مسنَد إلى مستخدمين — أزل إسناده أولاً ثم احذفه.',
  PERMISSION_TEMPLATE_NAME_INVALID: 'اسم القالب يجب أن يكون بين حرفين و80 حرفاً.',
  PERMISSION_RULES_INVALID: 'إحدى القواعد تشير إلى وحدة أو إجراء غير صالح.',
  PERMISSION_DENIED: 'ليست لديك صلاحية هذا الإجراء — راجع التطوير المركزية.',
  IT_USER_NOT_FOUND: 'المستخدم غير موجود.',
  IT_FORBIDDEN: 'هذه الإدارة للتطوير المركزية فقط.',
  DUPLICATE_SUBMIT: 'نُفِّذت هذه العملية قبل لحظات — لم تُكرَّر.',
  'duplicate key': 'يوجد قالب بهذا الاسم.',
}
export function permissionErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  for (const [k, v] of Object.entries(ERRORS)) if (msg.includes(k)) return v
  return msg || 'حدث خطأ غير متوقع'
}

const rpc = <T,>(fn: string, args: Record<string, unknown>) => sdkGuard(supabase.rpc(fn, args as never)) as Promise<T>
const rpcVoid = (fn: string, args: Record<string, unknown>) => sdkVoid(supabase.rpc(fn, args as never))

export const permissions = {
  /** القوالب مع عدد المستخدمين المسنَدين */
  async templates(): Promise<PermissionTemplate[]> {
    const rows = (await sdkGuard(supabase.from('permission_templates').select('id, name, description, is_active, created_at, updated_at, user_permission_template(count)').order('name'))) as unknown as Array<PermissionTemplate & { user_permission_template: Array<{ count: number }> }>
    return rows.map(({ user_permission_template, ...t }) => ({ ...t, users_count: user_permission_template?.[0]?.count ?? 0 }))
  },
  templateRules(templateId: string) { return sdkGuard(supabase.from('permission_template_rules').select('template_id, unit_key, action, effect').eq('template_id', templateId)) as Promise<PermissionTemplateRule[]> },
  templateSave(t: { id?: string; name: string; description?: string | null; is_active?: boolean }) { return rpc<string>('it_permission_template_save', { p: t }) },
  templateRulesSet(templateId: string, rules: Array<{ unit_key: string; action: PermissionAction; effect: PermissionEffect }>) { return rpc<number>('it_permission_template_rules_set', { p_template: templateId, p_rules: rules }) },
  templateDelete(templateId: string) { return rpcVoid('it_permission_template_delete', { p_template: templateId }) },

  async userTemplate(userId: string): Promise<UserPermissionTemplate | null> {
    const rows = (await sdkGuard(supabase.from('user_permission_template').select('user_id, template_id, assigned_at').eq('user_id', userId))) as UserPermissionTemplate[]
    return rows[0] ?? null
  },
  userTemplateSet(userId: string, templateId: string | null) { return rpcVoid('it_user_permission_template_set', { p_user: userId, p_template: templateId }) },
  userOverrides(userId: string) { return sdkGuard(supabase.from('user_permission_overrides').select('user_id, unit_key, action, effect, reason, created_at').eq('user_id', userId)) as Promise<UserPermissionOverride[]> },
  userOverrideSet(userId: string, unit: string, action: PermissionAction, effect: PermissionEffect | null, reason?: string | null) {
    return rpcVoid('it_user_permission_override_set', { p_user: userId, p_unit: unit, p_action: action, p_effect: effect, p_reason: reason ?? null })
  },
  userEffective(userId: string) { return rpc<EffectivePermissionRow[]>('it_user_permissions_effective', { p_user: userId }) },
  audit(userId?: string | null, templateId?: string | null, limit = 100) { return rpc<PermissionAuditRow[]>('it_permission_audit_list', { p_user: userId ?? null, p_template: templateId ?? null, p_limit: limit }) },
}
