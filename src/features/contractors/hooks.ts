import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { contractors, type CheckinInput, type ContractorWageMode } from '@sdk/contractors.sdk'
import { useUiStore } from '@stores/ui.store'
import { handleAppError } from '@lib/errors/error.handler'

const ROOT = ['contractors']
const useAction = <T>(fn: (x: T) => Promise<unknown>, message: string) => {
  const qc = useQueryClient(), toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: fn,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ROOT }); toast({ type: 'success', message }) },
    onError: (e) => toast({ type: 'error', message: handleAppError(e, { scope: 'contractors' }).message }),
  })
}
export const useContractorMe = () => useQuery({ queryKey: [...ROOT, 'me'], queryFn: () => contractors.me(), refetchInterval: 60_000 })
export const useContractorMyMonth = (month?: string) => useQuery({ queryKey: [...ROOT, 'my-month', month ?? 'current'], queryFn: () => contractors.myMonth(month) })
export const useContractorPhotoUrl = (path: string | null | undefined) =>
  useQuery({ queryKey: [...ROOT, 'photo', path], queryFn: () => contractors.signedUrl(path as string), enabled: Boolean(path), staleTime: 25 * 60_000 })
export const useContractorCheckin = () => useAction((x: CheckinInput) => contractors.checkin(x), 'تم إثبات تواجدك في الموقع وتسجيل العدد')
export const useSetHeadcount = () => useAction((x: { headcount: number }) => contractors.setHeadcount(x.headcount), 'تم تحديث عدد اليوم')
// التطوير المركزية
export const useContractorManagerOptions = (enabled = true) => useQuery({ queryKey: [...ROOT, 'manager-options'], queryFn: () => contractors.managerOptions(), enabled })
export const useContractorProfileForUser = (userId: string | undefined) => useQuery({ queryKey: [...ROOT, 'profile', userId], queryFn: () => contractors.profileForUser(userId as string), enabled: Boolean(userId) })
export const useAssignContractor = () => useAction((x: { userId: string; managerUserId: string; sectorId?: number | null; notes?: string }) => contractors.assign(x.userId, x.managerUserId, x.sectorId, x.notes), 'أُسند المتعهد إلى مسؤول القسم ومنطقته')
export const useUnassignContractor = () => useAction((x: { userId: string; reason: string }) => contractors.unassign(x.userId, x.reason), 'أُلغي إسناد المتعهد')
// المالية (00188)
export const useContractorWagesSheet = (month: string) => useQuery({ queryKey: [...ROOT, 'wages', month], queryFn: () => contractors.wagesSheet(month) })
export const useSetContractorWage = () => useAction((x: { workerId: string; month: string; mode: ContractorWageMode; amount: number; note?: string | null }) => contractors.setWage(x), 'حُفظ أجر العامل')
export const useCopyPreviousWages = () => useAction((x: { month: string }) => contractors.copyPreviousWages(x.month), 'نُسخت أجور الشهر السابق للعمال الذين لا أجر لهم')
// مسؤول القسم
export const useManagerTeamSummary = () => useQuery({ queryKey: [...ROOT, 'manager-team'], queryFn: () => contractors.managerTeamSummary(), refetchInterval: 60_000 })
export const useManagerContractorPhotosToday = () => useQuery({ queryKey: [...ROOT, 'manager-contractor-photos'], queryFn: () => contractors.managerContractorPhotosToday(), refetchInterval: 60_000 })
