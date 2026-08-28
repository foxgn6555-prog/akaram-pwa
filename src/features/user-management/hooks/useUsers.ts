/** قائمة مستخدمي المنصة — RPC آمنة (الخادم يتحقق من الدور) */
import { useQuery } from '@tanstack/react-query'
import { usersKeys } from '@lib/query-keys/users.keys'
import { users } from '@sdk/users.sdk'

export function useUsers(searchQuery?: string) {
  return useQuery({
    queryKey: usersKeys.list(searchQuery),
    queryFn: () => users.list(searchQuery),
    staleTime: 15_000,
  })
}

/** مستخدم من الكاش المشترك لقائمة المستخدمين (بلا طلب إضافي) */
export function useUserFromList(userId: string | undefined) {
  const { data: all, ...rest } = useUsers()
  return {
    ...rest,
    data: userId ? all?.find((u) => u.id === userId) : undefined,
  }
}
