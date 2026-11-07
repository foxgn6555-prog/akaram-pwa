import type { Role } from '@lib/constants/roles.constants'
import type { PortalDefinition } from '@lib/constants/portals.constants'

export type { SessionUser } from '@sdk/auth.sdk'
export type { Role } from '@lib/constants/roles.constants'

export interface PortalAccess {
  /** أدوار المستخدم الفعلية */
  roles: Role[]
  /** البوابات المقابلة لأدوار الحساب والمُعروضة في مبدّل البوابات */
  portals: PortalDefinition[]
}
