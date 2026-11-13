/** حارس البوابة — يوجه المستخدم للبوابة الصحيحة حسب أدواره */
import { resolvePortal, type PortalResolution } from '@router/portal.router'
import type { SessionUser } from '@sdk/auth.sdk'
import { accessiblePortals, PORTALS, type PortalId } from '@lib/constants/portals.constants'

export interface PortalGuardResult {
  decision: 'allow' | 'redirect' | 'denied'
  /** مسار التحويل عند redirect */
  redirectTo?: string
  resolution?: PortalResolution
}

export function portalGuard(session: SessionUser | null, requiredPortal: PortalId): PortalGuardResult {
  if (!session) return { decision: 'redirect', redirectTo: '/login' }

  const resolution = resolvePortal(session.roles)

  switch (resolution.type) {
    case 'denied':
      return { decision: 'denied' }
    case 'single':
      // V-33 (قرار المستخدم): البوابة المطلوبة ليست من أدوار الحساب ⇒ صفحة 403 صريحة
      // (كان تحويلاً صامتاً إلى بوابته، فيظن أنه فتح البوابة وهو في غيرها).
      return accessiblePortals(session.roles).some((p) => p.id === requiredPortal) ||
        requiredPortal === PORTALS.PUBLIC
        ? { decision: 'allow', resolution }
        : { decision: 'denied' }
  }
}
