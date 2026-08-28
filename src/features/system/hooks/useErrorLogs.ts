/** سجل أخطاء التطبيق + حلّها (تحديث متفائل) */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { systemKeys } from '@lib/query-keys/system.keys'
import { system, type ErrorLogFilters } from '@sdk/system.sdk'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'

export function useErrorLogs(filters: ErrorLogFilters = {}) {
  return useQuery({
    queryKey: systemKeys.errors(filters as Record<string, unknown>),
    queryFn: () => system.errorLogs(filters),
    staleTime: 15_000,
  })
}

export function useResolveError() {
  const queryClient = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)

  return useMutation({
    mutationFn: ({ id, resolved }: { id: number; resolved: boolean }) =>
      system.resolveError(id, resolved),

    onMutate: async ({ id, resolved }) => {
      await queryClient.cancelQueries({ queryKey: systemKeys.all })
      const snapshots = queryClient.getQueriesData({ queryKey: systemKeys.errors() })
      queryClient.setQueriesData(
        { queryKey: systemKeys.errors() },
        (old: Array<{ id: number; resolved: boolean }> | undefined) =>
          old?.map((e) => (e.id === id ? { ...e, resolved } : e)),
      )
      return { snapshots }
    },

    onError: (error, _vars, context) => {
      context?.snapshots.forEach(([key, value]) => queryClient.setQueryData(key, value))
      addToast({ type: 'error', message: handleAppError(error, { scope: 'resolveError' }).message })
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: systemKeys.all })
    },
  })
}
