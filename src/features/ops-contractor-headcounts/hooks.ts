import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { opsContractorHeadcounts, type CountSource } from '@sdk/ops-contractor-headcounts.sdk'
import { useUiStore } from '@stores/ui.store'
import { handleAppError } from '@lib/errors/error.handler'

const ROOT = ['ops-contractor-headcounts']
const useAction = <T>(fn: (x: T) => Promise<void>, message: string) => {
  const qc = useQueryClient(), toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: fn,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ROOT }); void qc.invalidateQueries({ queryKey: ['contractors'] }); toast({ type: 'success', message }) },
    onError: (e) => toast({ type: 'error', message: handleAppError(e, { scope: 'ops-contractor-headcounts' }).message }),
  })
}
export const useHeadcountSheet = (month: string, parent?: string | null) =>
  useQuery({ queryKey: [...ROOT, 'sheet', month, parent ?? ''], queryFn: () => opsContractorHeadcounts.sheet(month, parent), refetchInterval: 60_000 })
export const useHeadcountMonthStatus = (month: string) => useQuery({ queryKey: [...ROOT, 'status', month], queryFn: () => opsContractorHeadcounts.status(month) })
export const useHeadcountAudit = (month: string) => useQuery({ queryKey: [...ROOT, 'audit', month], queryFn: () => opsContractorHeadcounts.audit(month) })
export const useCorrectHeadcount = () => useAction((x: { contractorUserId: string; date: string; source: CountSource; headcount: number; reason: string }) => opsContractorHeadcounts.correct(x), 'صُحّح العدد وسُجّل السبب')
export const useHeadcountCoverageGaps = (month: string, source: CountSource | '') =>
  useQuery({ queryKey: [...ROOT, 'gaps', month, source], queryFn: () => opsContractorHeadcounts.coverageGaps(month, source as CountSource), enabled: Boolean(source) })
export const useApproveHeadcountMonth = () => useAction((x: { month: string; source: CountSource; force?: boolean }) => opsContractorHeadcounts.approve(x.month, x.source, x.force ?? false), 'اعتُمد الشهر وقُفل على الجهة المختارة لكل المتعهدين')
export const useReopenHeadcountMonth = () => useAction((x: { month: string; reason: string }) => opsContractorHeadcounts.reopen(x.month, x.reason), 'أُعيد فتح الشهر')
