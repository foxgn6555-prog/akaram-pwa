/** خطافات «التصفير» (00398) — بوابة التطوير المركزية + صفحة التفاصيل للمعتمِدين في أي بوابة */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUiStore } from '@stores/ui.store'
import { PLATFORM_RESET_ERROR_MESSAGES, platformReset } from '@sdk/platform-reset.sdk'

export * from '@sdk/platform-reset.sdk'

export const platformResetKeys = {
  all: ['platform-reset'] as const,
  counts: () => [...platformResetKeys.all, 'counts'] as const,
  list: () => [...platformResetKeys.all, 'list'] as const,
  detail: (id: string) => [...platformResetKeys.all, 'detail', id] as const,
}

export function platformResetErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error ?? '')
  const code = Object.keys(PLATFORM_RESET_ERROR_MESSAGES).find((k) => text.includes(k))
  return (code && PLATFORM_RESET_ERROR_MESSAGES[code]) || text || 'خطأ غير معروف'
}

function useToast() {
  const addToast = useUiStore((s) => s.addToast)
  return { ok: (message: string) => addToast({ type: 'success', message }), err: (e: unknown) => addToast({ type: 'error', message: platformResetErrorMessage(e) }) }
}
function useInvalidateAll() {
  const qc = useQueryClient()
  return () => { void qc.invalidateQueries({ queryKey: platformResetKeys.all }); void qc.invalidateQueries({ queryKey: ['sector-manager'] }) }
}

export const usePlatformResetCounts = (enabled = true) => useQuery({ queryKey: platformResetKeys.counts(), queryFn: () => platformReset.counts(), enabled, staleTime: 15_000 })
export const usePlatformResetList = (enabled = true) => useQuery({ queryKey: platformResetKeys.list(), queryFn: () => platformReset.list(), enabled, refetchInterval: 30_000 })
export const usePlatformResetDetail = (id: string | null | undefined) =>
  useQuery({ queryKey: platformResetKeys.detail(id ?? ''), queryFn: () => platformReset.detail(id as string), enabled: !!id })

export function usePlatformResetRequest() {
  const t = useToast(), inv = useInvalidateAll()
  return useMutation({
    mutationFn: (x: { categories: string[]; password: string }) => platformReset.request(x.categories, x.password),
    onSuccess: (r) => { inv(); t.ok(r.via_chain ? 'تم إرسال طلب التصفير' : `نُفِّذ التصفير — حُذف ${r.result?.rows_deleted ?? 0} سجل`) },
    onError: t.err,
  })
}
export function usePlatformResetCancel() {
  const t = useToast(), inv = useInvalidateAll()
  return useMutation({ mutationFn: (id: string) => platformReset.cancel(id), onSuccess: () => { inv(); t.ok('أُلغي طلب التصفير') }, onError: t.err })
}
export function usePlatformResetApprove() {
  const t = useToast(), inv = useInvalidateAll()
  return useMutation({
    mutationFn: (x: { id: string; password: string }) => platformReset.approve(x.id, x.password),
    onSuccess: (r) => { inv(); t.ok(r.final ? `نُفِّذ التصفير — حُذف ${r.result?.rows_deleted ?? 0} سجل` : 'سُجّلت موافقتك — بانتظار بقية الخطوات') },
    onError: t.err,
  })
}
export function usePlatformResetReject() {
  const t = useToast(), inv = useInvalidateAll()
  return useMutation({ mutationFn: (x: { id: string; note: string }) => platformReset.reject(x.id, x.note), onSuccess: () => { inv(); t.ok('رُفض طلب التصفير') }, onError: t.err })
}
/** حذف ملفات التخزين (ومسح مستودع GPS إن لزم) بعد تنفيذ التصفير — من المتصفح */
export function usePlatformResetWipeStorage() {
  const t = useToast(), inv = useInvalidateAll()
  return useMutation({
    mutationFn: async (x: { id: string; warehouse: boolean; onProgress?: (n: number) => void }) => {
      const s = await platformReset.wipeStorage(x.id, x.onProgress)
      const w = x.warehouse ? await platformReset.wipeWarehouse() : null
      return { ...s, warehouse: w }
    },
    onSuccess: (r) => { inv(); t.ok(`حُذف ${r.deleted} ملف${r.remaining ? ` — بقي ${r.remaining}` : ''}${r.warehouse ? (r.warehouse.ok ? ' · مُسح مستودع GPS' : ` · تعذر مسح المستودع (${r.warehouse.error ?? ''})`) : ''}`) },
    onError: t.err,
  })
}
