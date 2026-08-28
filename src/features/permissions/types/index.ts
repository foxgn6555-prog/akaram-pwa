/** mirror لـ 00023_page_permissions.sql */
export type PermissionEffect = 'grant' | 'hide'
export type OverrideEffect = 'allow' | 'lock'

export interface RolePagePermission {
  id: string
  role: string
  page_key: string
  effect: PermissionEffect
}

export interface UserPageOverride {
  id: string
  user_id: string
  page_key: string
  effect: OverrideEffect
  reason: string | null
}

/** مصفوفة جاهزة للعرض: صفحة × تأثيراتها */
export interface PagePermissionRow {
  page_key: string
  label: string
  portal: string
  /** الأدوار الممنوحة */
  grantedRoles: string[]
  /** الأدوار المخفية عنها */
  hiddenRoles: string[]
  /** قفل/فتح فردي */
  overrides: Array<{ user_id: string; email: string | null; effect: OverrideEffect; reason: string | null }>
}
