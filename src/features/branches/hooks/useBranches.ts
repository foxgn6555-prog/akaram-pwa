import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { branchesKeys } from '@lib/query-keys/branches.keys'
import { branches, type CreateBranchInput } from '@sdk/branches.sdk'
import { API } from '@lib/constants/api.constants'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'

export function useBranches(includeInactive = false) {
  return useQuery({
    queryKey: branchesKeys.list(includeInactive),
    queryFn: () => branches.list(includeInactive),
    staleTime: API.STALE_TIME.REFERENCE,
  })
}

export function useCreateBranch() {
  const queryClient = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)

  return useMutation({
    mutationFn: (input: CreateBranchInput) => branches.create(input),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: branchesKeys.all })
      addToast({ type: 'success', message: `تم إنشاء الفرع: ${created.name}` })
    },
    onError: (error) => {
      addToast({ type: 'error', message: handleAppError(error, { scope: 'createBranch' }).message })
    },
  })
}

export function useToggleBranch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      branches.setActive(id, active),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: branchesKeys.all })
    },
  })
}
