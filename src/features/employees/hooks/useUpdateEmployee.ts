/** تعديل موظف — تحديث متفائل مع التراجع عند الفشل */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { employeesKeys } from '@lib/query-keys/employees.keys'
import { employees } from '@sdk/employees.sdk'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'
import type { Employee, UpdateEmployeeInput } from '../types'

export function useUpdateEmployee() {
  const queryClient = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateEmployeeInput }) =>
      employees.update(id, input),

    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: employeesKeys.detail(id) })
      const previous = queryClient.getQueryData<Employee>(employeesKeys.detail(id))
      if (previous) {
        queryClient.setQueryData<Employee>(employeesKeys.detail(id), { ...previous, ...input })
      }
      return { previous }
    },

    onError: (error, { id }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(employeesKeys.detail(id), context.previous)
      }
      addToast({ type: 'error', message: handleAppError(error, { scope: 'updateEmployee' }).message })
    },

    onSettled: (_data, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: employeesKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: employeesKeys.lists() })
    },
  })
}
