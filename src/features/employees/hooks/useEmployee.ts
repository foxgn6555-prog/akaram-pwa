import { useQuery } from '@tanstack/react-query'
import { employeesKeys } from '@lib/query-keys/employees.keys'
import { employees } from '@sdk/employees.sdk'

export function useEmployee(id: string | undefined) {
  return useQuery({
    queryKey: employeesKeys.detail(id ?? 'none'),
    queryFn: () => employees.getById(id as string),
    enabled: !!id,
  })
}
