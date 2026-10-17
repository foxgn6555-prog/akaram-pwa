/** 00271 — ورش الصيانة */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { maintenanceWorkshops, type WorkshopKey } from '@sdk/maintenance-workshops.sdk'
import { useUiStore } from '@stores/ui.store'
import { handleAppError } from '@lib/errors/error.handler'

const ROOT = ['maintenance-workshops']
export const useMaintenanceWorkshops = () => useQuery({ queryKey: [...ROOT, 'list'], queryFn: () => maintenanceWorkshops.list() })
export const useMaintenanceWorkshopAccount = (userId: string | undefined) =>
  useQuery({ queryKey: [...ROOT, 'account', userId], queryFn: () => maintenanceWorkshops.accountFor(userId as string), enabled: Boolean(userId) })
export const useAssignMaintenanceWorkshop = () => {
  const qc = useQueryClient(), toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (x: { userId: string; workshopKey: WorkshopKey; notes?: string | null }) => maintenanceWorkshops.assign(x),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ROOT }); toast({ type: 'success', message: 'حُفظت ورشة الحساب' }) },
    onError: (e) => toast({ type: 'error', message: handleAppError(e, { scope: 'maintenance-workshops' }).message }),
  })
}
export const useMyMaintenanceWorkshop = () => useQuery({ queryKey: [...ROOT, 'mine'], queryFn: () => maintenanceWorkshops.mine(), staleTime: 5 * 60_000 })
