import { useMutation, useQueryClient } from '@tanstack/react-query'
import { departmentsKeys } from '@lib/query-keys/departments.keys'
import { departments, type CreateDepartmentInput } from '@sdk/departments.sdk'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'

export function useCreateDepartment() {
  const queryClient = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)

  return useMutation({
    mutationFn: (input: CreateDepartmentInput) => departments.create(input),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: departmentsKeys.lists() })
      addToast({ type: 'success', message: `تم إنشاء القسم: ${created.name}` })
    },
    onError: (error) => {
      addToast({ type: 'error', message: handleAppError(error, { scope: 'createDepartment' }).message })
    },
  })
}
