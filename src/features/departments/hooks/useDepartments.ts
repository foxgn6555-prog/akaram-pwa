import { useQuery } from '@tanstack/react-query'
import { departmentsKeys } from '@lib/query-keys/departments.keys'
import { departments } from '@sdk/departments.sdk'
import { API } from '@lib/constants/api.constants'

export function useDepartments() {
  return useQuery({
    queryKey: departmentsKeys.list({ active: true }),
    queryFn: () => departments.list(),
    staleTime: API.STALE_TIME.REFERENCE,
  })
}
