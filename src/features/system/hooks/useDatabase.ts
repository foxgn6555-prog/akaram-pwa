/** مراقبة قاعدة البيانات — بيانات مرجعية بطيئة التغير */
import { useQuery } from '@tanstack/react-query'
import { systemKeys } from '@lib/query-keys/system.keys'
import { system } from '@sdk/system.sdk'
import { API } from '@lib/constants/api.constants'

export function useDbStats() {
  return useQuery({
    queryKey: systemKeys.dbStats(),
    queryFn: () => system.dbStats(),
    staleTime: API.STALE_TIME.REFERENCE,
  })
}

export function useTableDetails(tableName: string | undefined) {
  return useQuery({
    queryKey: systemKeys.tableDetail(tableName ?? ''),
    queryFn: () => system.dbTableDetails(tableName as string),
    enabled: !!tableName,
    staleTime: API.STALE_TIME.REFERENCE,
  })
}

export function useDbOverview() {
  return useQuery({
    queryKey: systemKeys.dbOverview(),
    queryFn: () => system.dbOverview(),
    staleTime: API.STALE_TIME.REFERENCE,
  })
}
