/** خطافات القاصة (00189): مستحقات · مكافآت · GPS · فعاليات الشركة */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { treasury, treasuryErrorMessage, type RewardType, type TreasuryKind, type TreasuryListFilter } from '@sdk/treasury.sdk'
import { useUiStore } from '@stores/ui.store'

export const TREASURY_ROOT = ['treasury']
const useAction = <T, R = unknown>(fn: (x: T) => Promise<R>, message: string | ((r: R) => string)) => {
  const qc = useQueryClient(), toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: TREASURY_ROOT }); void qc.invalidateQueries({ queryKey: ['notifications'] }); toast({ type: 'success', message: typeof message === 'function' ? message(r) : message }) },
    onError: (e) => toast({ type: 'error', message: treasuryErrorMessage(e) }),
  })
}

export const useReceivableTypes = () => useQuery({ queryKey: [...TREASURY_ROOT, 'types'], queryFn: () => treasury.types(), staleTime: 5 * 60_000 })
export const useSaveReceivableType = () => useAction((x: { id?: string | null; name: string; isActive?: boolean; sortOrder?: number }) => treasury.saveType(x), 'حُفظ نوع المستحقات')
export const useTreasuryList = (f: TreasuryListFilter, enabled = true) =>
  useQuery({ queryKey: [...TREASURY_ROOT, 'list', f], queryFn: () => treasury.list(f), enabled, placeholderData: (prev) => prev })
export const useTreasurySummary = (from?: string | null, to?: string | null, enabled = true) =>
  useQuery({ queryKey: [...TREASURY_ROOT, 'summary', from ?? '', to ?? ''], queryFn: () => treasury.summary(from, to), enabled, placeholderData: (prev) => prev })
export const useEmployeeLookup = (q: string, enabled = true) =>
  useQuery({ queryKey: [...TREASURY_ROOT, 'emp-lookup', q], queryFn: () => treasury.employeeLookup(q), enabled, staleTime: 60_000, placeholderData: (prev) => prev })
export const useCompletedDesigns = (f: { from?: string | null; to?: string | null; sector?: string | null; periodType?: string | null }) =>
  useQuery({ queryKey: [...TREASURY_ROOT, 'events', f], queryFn: () => treasury.completedDesigns(f), placeholderData: (prev) => prev })

const RECORD_MSG: Record<TreasuryKind, string> = {
  receipt: 'سُجّل الاستلام وأُبلغت الشؤون المالية — يبقى المبلغ مجمّداً حتى تأكيدها',
  reward: 'سُجّلت المكافأة',
  gps_payment: 'سُجّل تسديد GPS وأُبلغت الشؤون المالية',
}
export const useTreasuryRecord = () =>
  useAction((x: { kind: TreasuryKind; amount?: number | null; typeId?: string | null; employeeId?: string | null; rewardType?: RewardType | null; details?: string | null }) => treasury.record(x),
    (r) => (r.kind === 'reward' ? (r.needs_finance ? 'سُجّلت المكافأة وأُبلغت الشؤون المالية لتسليمها' : 'سُجّلت المكافأة وأُبلغ الموظف') : RECORD_MSG[r.kind]))
export const useTreasuryConfirm = () => useAction((x: { id: string; note?: string | null }) => treasury.confirm(x.id, x.note), 'تم التأكيد وأُبلغ المدير التنفيذي')
export const useTreasuryCancel = () => useAction((x: { id: string; reason: string }) => treasury.cancel(x.id, x.reason), 'أُلغيت الحركة')
