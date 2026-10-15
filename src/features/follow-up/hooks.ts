import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { followUp, type ParentSector } from '@sdk/follow-up.sdk'
import { useUiStore } from '@stores/ui.store'
import { handleAppError } from '@lib/errors/error.handler'

const ROOT = ['follow-up']
const useAction = <T>(fn: (x: T) => Promise<void>, message: string) => {
  const qc = useQueryClient(), toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: fn,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ROOT }); toast({ type: 'success', message }) },
    onError: (e) => toast({ type: 'error', message: handleAppError(e, { scope: 'follow-up' }).message }),
  })
}
// التطوير المركزية
export const useFollowUpScopeOptions = (enabled = true) => useQuery({ queryKey: [...ROOT, 'scope-options'], queryFn: () => followUp.scopeOptions(), enabled })
export const useFollowUpProfile = (userId: string | undefined) => useQuery({ queryKey: [...ROOT, 'profile', userId], queryFn: () => followUp.profileForUser(userId as string), enabled: Boolean(userId) })
export const useAssignFollowUp = () => useAction((x: { userId: string; parentSectors: ParentSector[]; sectorIds: number[]; notes?: string | null }) => followUp.assign(x), 'حُفظ نطاق المتابعة')
export const useUnassignFollowUp = () => useAction((x: { userId: string; reason?: string | null }) => followUp.unassign(x.userId, x.reason), 'أُلغي تكليف المتابعة')
// البوابة
export const useFollowUpMe = () => useQuery({ queryKey: [...ROOT, 'me'], queryFn: () => followUp.me(), refetchInterval: 60_000 })
export const useFollowUpContractors = (date?: string | null) => useQuery({ queryKey: [...ROOT, 'contractors', date ?? ''], queryFn: () => followUp.contractors(date), refetchInterval: 60_000 })
export const useFollowUpSetHeadcount = () => useAction((x: { contractorUserId: string; headcount: number }) => followUp.setHeadcount(x.contractorUserId, x.headcount), 'حُفظ العدد')
