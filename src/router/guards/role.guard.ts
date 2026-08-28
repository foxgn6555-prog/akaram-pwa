/** حارس الدور — يتحقق من أن أدوار المستخدم تسمح بالمسار المطلوب */
import type { Role } from '@lib/constants/roles.constants'
import type { SessionUser } from '@sdk/auth.sdk'

export interface RoleGuardResult {
  allowed: boolean
  /** البوابات المتاحة — تستخدمها قائمة تبديل البوابات في الهيدر */
}

export function roleGuard(session: SessionUser | null, allowedRoles: readonly string[]): RoleGuardResult {
  if (!session) return { allowed: false }
  const allowed = session.roles.some((r: Role) => allowedRoles.includes(r))
  return { allowed }
}
