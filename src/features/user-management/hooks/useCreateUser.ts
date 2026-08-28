import { useMutation, useQueryClient } from '@tanstack/react-query'
import { usersKeys } from '@lib/query-keys/users.keys'
import { users } from '@sdk/users.sdk'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'
import type { CreateUserInput } from '../types'

export function useCreateUser() {
  const queryClient = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)

  return useMutation({
    mutationFn: (input: CreateUserInput) => users.create(input),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: usersKeys.lists() })
      addToast({ type: 'success', message: `تم إنشاء المستخدم بنجاح (${result.user_id.slice(0, 8)}…)` })
    },
    onError: (error) => {
      addToast({ type: 'error', message: handleAppError(error, { scope: 'createUser' }).message })
    },
  })
}
