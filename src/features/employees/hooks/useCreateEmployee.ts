import { useMutation, useQueryClient } from '@tanstack/react-query'
import { employeesKeys } from '@lib/query-keys/employees.keys'
import { employees } from '@sdk/employees.sdk'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'
import type { CreateEmployeeInput } from '../types'

export function useCreateEmployee() {
  const queryClient = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)

  return useMutation({
    mutationFn: (input: CreateEmployeeInput) => employees.create(input),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: employeesKeys.lists() })
      addToast({ type: 'success', message: `تم إضافة الموظف: ${created.full_name}` })
    },
    onError: (error) => {
      addToast({ type: 'error', message: handleAppError(error, { scope: 'createEmployee' }).message })
    },
  })
}
