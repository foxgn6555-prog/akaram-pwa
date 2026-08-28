import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { archiveKeys } from '@lib/query-keys/archive.keys'
import { archive } from '@sdk/archive.sdk'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'

export function useArchiveCounts() {
  return useQuery({
    queryKey: archiveKeys.counts(),
    queryFn: () => archive.counts(),
  })
}

export function useArchivedTable(table: string | undefined) {
  return useQuery({
    queryKey: archiveKeys.table(table ?? ''),
    queryFn: () => archive.listTable(table as string),
    enabled: !!table,
  })
}

export function useRestore() {
  const queryClient = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)

  return useMutation({
    mutationFn: ({ table, id }: { table: string; id: string }) => archive.restore(table, id),
    onSuccess: (_d, { table }) => {
      void queryClient.invalidateQueries({ queryKey: archiveKeys.all })
      addToast({ type: 'success', message: `تمت استعادة السجل من ${table}` })
    },
    onError: (error) => {
      addToast({ type: 'error', message: handleAppError(error, { scope: 'restore' }).message })
    },
  })
}
