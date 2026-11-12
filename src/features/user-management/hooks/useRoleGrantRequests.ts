/** V-36 — طلبات منح/سحب الأدوار الحساسة لحساب معيّن (قيد موافقة المدير المفوض) */
import { useQuery } from '@tanstack/react-query'
import { users } from '@sdk/users.sdk'
import { usersKeys } from '@lib/query-keys'

export function useRoleGrantRequests(userId: string | undefined) {
  return useQuery({
    queryKey: [...usersKeys.details(), 'role-grant-requests', userId ?? ''] as const,
    queryFn: () => users.roleGrantRequests(userId as string),
    enabled: !!userId,
    staleTime: 30_000,
  })
}
