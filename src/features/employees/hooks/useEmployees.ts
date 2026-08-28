/** قائمة الموظفين — مع جلب محسوب وإبطال مفتاحي سليم */
import { useQuery } from '@tanstack/react-query'
import { employeesKeys } from '@lib/query-keys/employees.keys'
import { employees } from '@sdk/employees.sdk'
import { API } from '@lib/constants/api.constants'
import type { EmployeeFilters } from '../types'

export function useEmployees(filters: EmployeeFilters = {}) {
  return useQuery({
    queryKey: employeesKeys.list(filters as Record<string, unknown>),
    queryFn: () => employees.list(filters),
    staleTime: API.STALE_TIME.REFERENCE,
  })
}
