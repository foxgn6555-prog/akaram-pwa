/** الجولة ٢ — الأدوار الحساسة: قراءة القائمة القابلة للتعديل + تفعيل/تعطيل بتدقيق */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { sensitiveRoles } from '@sdk/sensitive-roles.sdk'
import { usersKeys } from '@lib/query-keys/users.keys'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'

export const sensitiveRolesKey = [...usersKeys.all, 'sensitive-roles'] as const

export function useSensitiveRoles() {
  return useQuery({
    queryKey: sensitiveRolesKey,
    queryFn: () => sensitiveRoles.list(),
    staleTime: 60_000,
  })
}

export function useSetSensitiveRole() {
  const queryClient = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)

  return useMutation({
    mutationFn: ({ role, active, reason }: { role: string; active: boolean; reason?: string | null }) =>
      sensitiveRoles.set(role, active, reason),
    onSuccess: (data) => {
      addToast({
        type: 'success',
        message: data.changed
          ? data.active
            ? 'أُعيد تفعيل الدور الحسّاس — أصبح يتطلب موافقة المدير المفوض'
            : 'عُطّلت حماية الدور — يمكن منحه مباشرةً من الآن'
          : 'لا تغيير: الحالة كما هي',
      })
      void queryClient.invalidateQueries({ queryKey: sensitiveRolesKey })
    },
    onError: (error) => {
      addToast({ type: 'error', message: handleAppError(error, { scope: 'sensitiveRoles' }).message })
    },
  })
}
