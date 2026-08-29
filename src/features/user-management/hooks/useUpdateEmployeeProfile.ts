/** تعديل بيانات الموظف المرتبط بمستخدم — RPC آمنة + تحديث كاش القائمة */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { usersKeys } from '@lib/query-keys/users.keys'
import { users, type PlatformUser } from '@sdk/users.sdk'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'
import type { UpdateEmployeeProfileInput } from '../types'

export function useUpdateEmployeeProfile() {
  const queryClient = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)

  return useMutation({
    mutationFn: (input: UpdateEmployeeProfileInput) => users.updateEmployeeProfile(input),

    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: usersKeys.lists() })
      const previous = queryClient.getQueriesData({ queryKey: usersKeys.lists() })

      // تحديث متفائل: بيانات الموظف تنعكس فوراً على القائمة والتفاصيل
      queryClient.setQueriesData(
        { queryKey: usersKeys.lists() },
        (old: PlatformUser[] | undefined) =>
          old?.map((u) =>
            u.id === input.user_id
              ? {
                  ...u,
                  employee_name: input.full_name,
                  employee_number: input.employee_number ?? u.employee_number,
                  phone: input.phone ?? u.phone,
                  job_title: input.job_title ?? u.job_title,
                  department_id: input.department_id ?? u.department_id,
                }
              : u,
          ),
      )
      return { previous }
    },

    onError: (error, _vars, context) => {
      context?.previous.forEach(([key, value]) => queryClient.setQueryData(key, value))
      addToast({ type: 'error', message: handleAppError(error, { scope: 'updateEmployeeProfile' }).message })
    },

    onSuccess: () => {
      addToast({ type: 'success', message: 'حُفظت بيانات المستخدم بنجاح' })
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: usersKeys.lists() })
    },
  })
}