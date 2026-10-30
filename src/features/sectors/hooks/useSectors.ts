import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { sectorsSdk, type ParentSectorNode } from '@sdk/sectors.sdk'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'

export const sectorsKeys = { all: ['sectors'] as const, tree: (inactive: boolean) => ['sectors', 'tree', inactive] as const }

/** شجرة القطاعات والمناطق من قاعدة البيانات (بديل القوائم اليدوية) */
export function useSectorsTree(includeInactive = false) {
  return useQuery({ queryKey: sectorsKeys.tree(includeInactive), queryFn: () => sectorsSdk.tree(includeInactive), staleTime: 5 * 60 * 1000 })
}

function useSectorsMutation<TInput>(fn: (input: TInput) => Promise<ParentSectorNode[]>, okMessage: string) {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: fn,
    onSuccess: (tree) => {
      qc.setQueryData(sectorsKeys.tree(true), tree)
      void qc.invalidateQueries({ queryKey: sectorsKeys.all })
      addToast({ type: 'success', message: okMessage })
    },
    onError: (error) => { addToast({ type: 'error', message: handleAppError(error, { scope: 'sectors' }).message }) },
  })
}

export function useSaveParentSector() { return useSectorsMutation(sectorsSdk.saveParent, 'تم حفظ القطاع') }
export function useSetParentSectorActive() { return useSectorsMutation((v: { code: string; active: boolean }) => sectorsSdk.setParentActive(v.code, v.active), 'تم تحديث حالة القطاع') }
export function useSaveArea() { return useSectorsMutation(sectorsSdk.saveArea, 'تم حفظ المنطقة') }
