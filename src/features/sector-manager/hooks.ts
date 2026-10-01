import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { approvals, sectorManager, type ApprovalRequestType, type ApprovalStep, type ParentSector } from '@sdk/sector-manager.sdk'
import { useUiStore } from '@stores/ui.store'
import { handleAppError } from '@lib/errors/error.handler'

const ROOT = ['sector-manager']
const useAction = <T, R = unknown>(fn: (x: T) => Promise<R>, message: string | ((r: R) => string)) => {
  const qc = useQueryClient(), toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ROOT }); void qc.invalidateQueries({ queryKey: ['hr'] }); toast({ type: 'success', message: typeof message === 'function' ? message(r) : message }) },
    onError: (e) => toast({ type: 'error', message: handleAppError(e, { scope: 'sector-manager' }).message }),
  })
}
// التطوير المركزية
export const useSectorManagerOptions = (enabled = true) => useQuery({ queryKey: [...ROOT, 'options'], queryFn: () => sectorManager.options(), enabled })
export const useSectorManagerProfile = (userId: string | undefined) => useQuery({ queryKey: [...ROOT, 'profile', userId], queryFn: () => sectorManager.profileForUser(userId as string), enabled: Boolean(userId) })
export const useSaveSectorManagerProfile = () => useAction((x: { userId: string; parentSectors: ParentSector[]; notes?: string | null }) => sectorManager.saveProfile(x.userId, x.parentSectors, x.notes), 'حُفظت قواطع مسؤول القاطع')
// البوابة
export const useSectorManagerMe = () => useQuery({ queryKey: [...ROOT, 'me'], queryFn: () => sectorManager.me() })
export const useSectorTeam = () => useQuery({ queryKey: [...ROOT, 'team'], queryFn: () => sectorManager.team(), refetchInterval: 60_000 })
export const useSectorDashboard = () => useQuery({ queryKey: [...ROOT, 'dashboard'], queryFn: () => sectorManager.dashboard(), refetchInterval: 60_000 })
export const useSectorReports = (from?: string, to?: string) => useQuery({ queryKey: [...ROOT, 'reports', from ?? '', to ?? ''], queryFn: () => sectorManager.reports(from, to) })
export const useFieldOpsSectorManagers = () => useQuery({ queryKey: [...ROOT, 'fo-sector-managers'], queryFn: () => sectorManager.fieldOpsSectorManagers(), refetchInterval: 60_000 })
export const useNotifyTargets = () => useQuery({ queryKey: [...ROOT, 'notify-targets'], queryFn: () => sectorManager.notifyTargets() })
export const useSectorNotices = () => useQuery({ queryKey: [...ROOT, 'notices'], queryFn: () => sectorManager.notices() })
export const useSendSectorNotice = () => useAction((x: { title: string; body: string; targets?: string[] }) => sectorManager.notify(x.title, x.body, x.targets), (n) => `أُرسل التبليغ إلى ${n} من مسؤولي الأقسام`)
// سلاسل الموافقات
export const useApprovalChains = (enabled = true) => useQuery({ queryKey: [...ROOT, 'chains'], queryFn: () => approvals.chains(), enabled })
export const useSaveApprovalChain = () => useAction((x: { requesterRole: string; requestType: ApprovalRequestType; steps: ApprovalStep[]; active?: boolean }) => approvals.saveChain(x.requesterRole, x.requestType, x.steps, x.active ?? true), 'حُفظت سلسلة الموافقات')
export const useDeleteApprovalChain = () => useAction((id: string) => approvals.deleteChain(id), 'حُذفت السلسلة')
export const useMyApprovalTasks = () => useQuery({ queryKey: [...ROOT, 'tasks'], queryFn: () => approvals.myTasks(), refetchInterval: 60_000 })
export const useApprovalTimeline = (kind: ApprovalRequestType | undefined, requestId: string | undefined) =>
  useQuery({ queryKey: [...ROOT, 'timeline', kind, requestId], queryFn: () => approvals.timeline(kind as ApprovalRequestType, requestId as string), enabled: Boolean(kind && requestId) })
export const useDecideApproval = () => useAction((x: { kind: ApprovalRequestType; requestId: string; approve: boolean; note?: string | null }) => approvals.decide(x.kind, x.requestId, x.approve, x.note), 'تم تسجيل قرارك')
