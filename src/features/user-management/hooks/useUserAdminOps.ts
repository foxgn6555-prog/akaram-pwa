/** عمليات حساب المستخدم عبر admin-users: تعطيل/تفعيل · كلمة مرور · بريد */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { usersKeys } from '@lib/query-keys/users.keys'
import { users, type PlatformUser } from '@sdk/users.sdk'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'

function useUserAdminMutation() {
  const queryClient = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return { queryClient, addToast }
}

/** تعطيل/تفعيل حساب — تحديث متفائل على banned_until + إبطال بعد الحسم */
export function useSetUserBanned() {
  const { queryClient, addToast } = useUserAdminMutation()

  return useMutation({
    mutationFn: ({ userId, banned }: { userId: string; banned: boolean }) =>
      users.setBanned(userId, banned),

    onMutate: async ({ userId, banned }) => {
      await queryClient.cancelQueries({ queryKey: usersKeys.lists() })
      const previous = queryClient.getQueriesData({ queryKey: usersKeys.lists() })
      queryClient.setQueriesData(
        { queryKey: usersKeys.lists() },
        (old: PlatformUser[] | undefined) =>
          old?.map((u) => (u.id === userId ? { ...u, banned_until: banned ? '2099-01-01' : null } : u)),
      )
      return { previous }
    },

    onError: (error, _vars, context) => {
      context?.previous.forEach(([key, value]) => queryClient.setQueryData(key, value))
      addToast({ type: 'error', message: handleAppError(error, { scope: 'setUserBanned' }).message })
    },

    onSuccess: (_d, { banned }) => {
      addToast({
        type: banned ? 'info' : 'success',
        message: banned ? 'عُطّل الحساب — لن يتمكن من الدخول' : 'فُعّل الحساب بنجاح',
      })
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: usersKeys.lists() })
    },
  })
}

/** إعادة تعيين كلمة مرور مستخدم */
export function useResetUserPassword() {
  const { queryClient, addToast } = useUserAdminMutation()

  return useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      users.resetPassword(userId, password),

    onError: (error) => {
      addToast({ type: 'error', message: handleAppError(error, { scope: 'resetUserPassword' }).message })
    },

    onSuccess: () => {
      addToast({ type: 'success', message: 'عُيّنت كلمة المرور الجديدة — شاركها مع المستخدم بقناة آمنة' })
      void queryClient.invalidateQueries({ queryKey: usersKeys.lists() })
    },
  })
}

/** تغيير بريد مستخدم (الخادم يمنع تغيير الذات) */
export function useUpdateUserEmail() {
  const { queryClient, addToast } = useUserAdminMutation()

  return useMutation({
    mutationFn: ({ userId, email }: { userId: string; email: string }) =>
      users.updateEmail(userId, email),

    onError: (error) => {
      addToast({ type: 'error', message: handleAppError(error, { scope: 'updateUserEmail' }).message })
    },

    onSuccess: (_d, { email }) => {
      addToast({ type: 'success', message: `غُيّر البريد الإلكتروني إلى ${email}` })
      void queryClient.invalidateQueries({ queryKey: usersKeys.lists() })
    },
  })
}