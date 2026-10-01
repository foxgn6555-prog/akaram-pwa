/** 00162 · خطافات مخزن غرفة العمليات وطلبات المستلزمات */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { opsStore, type SupplyScope } from '@sdk/ops-store.sdk'
import { useUiStore } from '@stores/ui.store'
import { handleAppError } from '@lib/errors/error.handler'

const ROOT = ['ops-store']
const useAction = <T, R = unknown>(fn: (x: T) => Promise<R>, message: string | ((r: R) => string)) => {
  const qc = useQueryClient(), toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ROOT }); void qc.invalidateQueries({ queryKey: ['sector-manager'] }); void qc.invalidateQueries({ queryKey: ['sector'] }); toast({ type: 'success', message: typeof message === 'function' ? message(r) : message }) },
    onError: (e) => toast({ type: 'error', message: handleAppError(e, { scope: 'ops-store' }).message }),
  })
}
export const useStoreItems = (includeInactive = false) => useQuery({ queryKey: [...ROOT, 'items', includeInactive], queryFn: () => opsStore.items(includeInactive) })
export const useStoreMovements = (itemId?: string | null) => useQuery({ queryKey: [...ROOT, 'movements', itemId ?? 'all'], queryFn: () => opsStore.movements(itemId) })
export const useSaveStoreItem = () => useAction(opsStore.saveItem, 'حُفظت المادة')
export const useStoreReceive = () => useAction((x: { itemId: string; qty: number; note?: string | null }) => opsStore.receive(x.itemId, x.qty, x.note), (b) => `أُدخلت الكمية — الرصيد الآن ${b}`)
export const useStoreAdjust = () => useAction((x: { itemId: string; newQty: number; reason: string }) => opsStore.adjust(x.itemId, x.newQty, x.reason), 'سُوّي الرصيد وسُجّل السبب')
export const useSupplyRequests = (scope: SupplyScope = 'open') => useQuery({ queryKey: [...ROOT, 'requests', scope], queryFn: () => opsStore.requests(scope), refetchInterval: 60_000 })
export const useCreateSupplyRequest = () => useAction((x: { items: { item_id: string; qty: number }[]; notes?: string | null }) => opsStore.createRequest(x.items, x.notes), 'أُرسل طلب المستلزمات')
export const useDeliverSupply = () => useAction((x: { id: string; receiverName: string; items?: { item_id: string; delivered_qty: number }[] | null; note?: string | null }) => opsStore.deliver(x.id, x.receiverName, x.items, x.note), 'تم التسليم وأُنقص المخزن')
export const useCancelSupply = () => useAction((x: { id: string; reason: string }) => opsStore.cancel(x.id, x.reason), 'أُلغي الطلب')
