/** خريطة الأدوار → البوابات: توجيه مباشر دائماً — البوابة الافتراضية = بوابة الدور ذي الأولوية العليا */
import { accessiblePortals, PORTALS, type PortalDefinition, type PortalId } from '@lib/constants/portals.constants'
import { ROLE_PRIORITY, type Role } from '@lib/constants/roles.constants'

export type PortalResolution =
  | { type: 'single'; portal: PortalId; path: string }
  | { type: 'denied' }

/**
 * البوابة الافتراضية الصريحة لكل دور — تتقدم على منطق الأولوية العام.
 * مدير النظام (super_admin) بوابته «التطوير المركزية» (/it): من خلالها
 * يُضاف المستخدمون والفروع ويُتحكم بالتطبيق كاملاً.
 */
const ROLE_DEFAULT_PORTAL: Partial<Record<Role, PortalId>> = {
  super_admin: PORTALS.IT,
}

export function resolvePortal(roles: readonly Role[]): PortalResolution {
  const portals = accessiblePortals(roles)

  if (portals.length === 0) return { type: 'denied' }

  // ① الافتراضية الصريحة من الخريطة أعلاه (super_admin → /it)
  const primary = ROLE_PRIORITY.find((r) => roles.includes(r))
  const explicitId = primary ? ROLE_DEFAULT_PORTAL[primary] : undefined
  const explicit = explicitId ? portals.find((p) => p.id === explicitId) : undefined

  // ② وإلا: بوابة الدور الأساسي (الأعلى في ROLE_PRIORITY —
  // نفس ترتيب app.custom_access_token_hook و primaryRole في auth.sdk).
  // لا شاشة اختيار بعد تسجيل الدخول — التنقل بين البوابات من قائمة المستخدم في الهيدر.
  const byRole = primary ? portals.find((p) => p.allowedRoles.includes(primary)) : undefined
  const portal: PortalDefinition | undefined = explicit ?? byRole ?? portals[0]

  if (!portal) return { type: 'denied' }
  return { type: 'single', portal: portal.id as PortalId, path: portal.path }
}
