/** منح/سحب دور — تحديث متفائل على كاش القائمة + إبطال بعد الحسم */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { usersKeys } from '@lib/query-keys/users.keys'
import { users } from '@sdk/users.sdk'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'
import { ROLE_LABELS, type Role } from '@lib/constants/roles.constants'
import type { PlatformUser } from '@sdk/users.sdk'

export function useSetUserRole() {
  const queryClient = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)

  return useMutation({
    mutationFn: ({ userId, role, grant }: { userId: string; role: Role; grant: boolean }) =>
      users.setUserRole(userId, role, grant),

    onMutate: async ({ userId, role, grant }) => {
      await queryClient.cancelQueries({ queryKey: usersKeys.lists() })
      const previous = queryClient.getQueriesData({ queryKey: usersKeys.lists() })

      queryClient.setQueriesData(
        { queryKey: usersKeys.lists() },
        (old: PlatformUser[] | undefined) =>
          old?.map((u) => {
            if (u.id !== userId) return u
            const roles = grant
              ? [...u.roles, role]
              : u.roles.filter((r) => r !== role)
            return { ...u, roles }
          }),
      )
      return { previous }
    },

    onError: (error, _vars, context) => {
      context?.previous.forEach(([key, value]) => queryClient.setQueryData(key, value))
      addToast({
        type: 'error',
        message: handleAppError(error, { scope: 'setUserRole' }).message,
      })
    },

    onSuccess: (_data, { role, grant }) => {
      addToast({
        type: grant ? 'success' : 'info',
        message: grant
          ? `تم منح الدور: ${ROLE_LABELS[role]}`
          : `تم سحب الدور: ${ROLE_LABELS[role]}`,
      })
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: usersKeys.lists() })
    },
  })
}
