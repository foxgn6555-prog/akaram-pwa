import type { Role } from '@lib/constants/roles.constants'

/** حساب الصلاحيات من أدوار المستخدم (تُقرأ من user_roles وليس JWT فقط) */
export function hasRole(roles: readonly Role[], ...needed: readonly Role[]): boolean {
  return needed.some((r) => roles.includes(r))
}

export function hasAllRoles(roles: readonly Role[], ...needed: readonly Role[]): boolean {
  return needed.every((r) => roles.includes(r))
}
