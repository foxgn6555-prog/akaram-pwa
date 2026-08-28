import { useAuth } from './useAuth'
import { hasRole } from '@lib/utils/permissions.utils'
import type { Role } from '@lib/constants/roles.constants'

export function usePermissions() {
  const { data: session } = useAuth()
  const roles = (session?.roles ?? []) as Role[]

  return {
    roles,
    can: (...needed: readonly Role[]) => hasRole(roles, ...needed),
    is: (role: Role) => roles.includes(role),
  }
}
