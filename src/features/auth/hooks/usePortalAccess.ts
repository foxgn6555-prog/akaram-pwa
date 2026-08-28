/** يحدد أي البوابات متاحة للمستخدم + هل يحتاج شاشة اختيار */
import { useQuery } from '@tanstack/react-query'
import { authKeys } from '@lib/query-keys/auth.keys'
import { useAuth } from './useAuth'
import { accessiblePortals, type PortalDefinition } from '@lib/constants/portals.constants'
import type { PortalAccess } from '../types'

export function usePortalAccess(): ReturnType<typeof useQuery<PortalAccess | null>> {
  const { data: session } = useAuth()

  return useQuery<PortalAccess | null>({
    queryKey: [...authKeys.portalAccess(), session?.id],
    enabled: !!session,
    queryFn: async (): Promise<PortalAccess | null> => {
      if (!session) return null
      const portals: PortalDefinition[] = accessiblePortals(session.roles)
      return {
        roles: session.roles,
        portals,
      }
    },
  })
}
