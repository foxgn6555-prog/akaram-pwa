/** خطافات السُّلَف (00191): الأنواع (التطوير) · الطلب (غرفة العمليات) · التسليم والتسديد (المالية) */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { advances, advanceErrorMessage, type AdvanceCreateInput, type AdvancesFilter } from '@sdk/advances.sdk'
import { useUiStore } from '@stores/ui.store'

export const ADVANCES_ROOT = ['advances']
const useAction = <T, R = unknown>(fn: (x: T) => Promise<R>, message: string | ((r: R) => string)) => {
  const qc = useQueryClient(), toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ADVANCES_ROOT }); void qc.invalidateQueries({ queryKey: ['treasury'] })
      void qc.invalidateQueries({ queryKey: ['sector-manager'] }); void qc.invalidateQueries({ queryKey: ['notifications'] })
      toast({ type: 'success', message: typeof message === 'function' ? message(r) : message })
    },
    onError: (e) => toast({ type: 'error', message: advanceErrorMessage(e) }),
  })
}

export const useAdvanceTypes = (all = false) => useQuery({ queryKey: [...ADVANCES_ROOT, 'types', all], queryFn: () => advances.types(all), staleTime: 5 * 60_000 })
export const useSaveAdvanceType = () => useAction((x: Parameters<typeof advances.saveType>[0]) => advances.saveType(x), 'حُفظ نوع السلفة')
export const useAdvancePolicy = () => useQuery({ queryKey: [...ADVANCES_ROOT, 'policy'], queryFn: () => advances.policy(), staleTime: 60_000 })
export const useAdvanceEmployeeLookup = (q: string, enabled = true) =>
  useQuery({ queryKey: [...ADVANCES_ROOT, 'emp-lookup', q], queryFn: () => advances.employeeLookup(q), enabled, staleTime: 60_000, placeholderData: (prev) => prev })
export const useAdvancesList = (f: AdvancesFilter, enabled = true) =>
  useQuery({ queryKey: [...ADVANCES_ROOT, 'list', f], queryFn: () => advances.list(f), enabled, placeholderData: (prev) => prev })
export const useAdvance = (id?: string | null) => useQuery({ queryKey: [...ADVANCES_ROOT, 'one', id ?? ''], queryFn: () => advances.get(id as string), enabled: !!id })
export const useAdvancesSummary = () => useQuery({ queryKey: [...ADVANCES_ROOT, 'summary'], queryFn: () => advances.summary(), placeholderData: (prev) => prev })

export const useCreateAdvance = () => useAction((x: AdvanceCreateInput) => advances.create(x), (r) => `أُرسل طلب السلفة ${r.ref_no} إلى سلسلة الموافقات`)
export const useDecideAdvance = () => useAction((x: Parameters<typeof advances.decide>[0]) => advances.decide(x), (r) => (r.status === 'approved' ? 'اكتملت الموافقات وأُبلغت المالية للتسليم' : r.status === 'rejected' ? 'رُفض الطلب' : 'سُجّلت الموافقة وانتقل الطلب إلى الخطوة التالية'))
export const useDeliverAdvance = () => useAction((x: { id: string; note?: string | null }) => advances.deliver(x.id, x.note), 'سُجّل التسليم وخُصم المبلغ من القاصة — يبدأ الاستقطاع من الشهر التالي')
export const useSettleAdvanceCash = () => useAction((x: { id: string; amount: number; note?: string | null }) => advances.settleCash(x.id, x.amount, x.note), (r) => (r.status === 'settled' ? 'سُدّدت السلفة بالكامل' : 'سُجّل التسديد النقدي'))
export const useCancelAdvance = () => useAction((x: { id: string; reason: string }) => advances.cancel(x.id, x.reason), 'أُلغيت السلفة')
