/** خطافات «التصفير» (00398) — بوابة التطوير المركزية + صفحة التفاصيل للمعتمِدين في أي بوابة */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUiStore } from '@stores/ui.store'
import { PLATFORM_RESET_ERROR_MESSAGES, platformReset, type PlatformResetResult } from '@sdk/platform-reset.sdk'

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
  return { ok: (message: string) => addToast({ type: 'success', message }), warn: (message: string) => addToast({ type: 'warning', message }), err: (e: unknown) => addToast({ type: 'error', message: platformResetErrorMessage(e) }) }
}
function useInvalidateAll() {
  const qc = useQueryClient()
  return () => { void qc.invalidateQueries({ queryKey: platformResetKeys.all }); void qc.invalidateQueries({ queryKey: ['sector-manager'] }) }
}

export const usePlatformResetCounts = (enabled = true) => useQuery({ queryKey: platformResetKeys.counts(), queryFn: () => platformReset.counts(), enabled, staleTime: 15_000 })
export const usePlatformResetList = (enabled = true) => useQuery({ queryKey: platformResetKeys.list(), queryFn: () => platformReset.list(), enabled, refetchInterval: 30_000 })
export const usePlatformResetDetail = (id: string | null | undefined) =>
  useQuery({ queryKey: platformResetKeys.detail(id ?? ''), queryFn: () => platformReset.detail(id as string), enabled: !!id })

/** بعد نجاح قاعدة البيانات نبدأ التنظيف فوراً؛ الفشل لا يلغي نجاح القاعدة ويظل قابلاً للإعادة. */
export async function completePlatformReset(id: string, result?: PlatformResetResult): Promise<string[]> {
  const errors: string[] = []
  if (result?.buckets?.length) {
    try { const r = await platformReset.wipeStorage(id); if (r.remaining) errors.push('بقيت ملفات تخزين') }
    catch { errors.push('تعذر حذف بعض ملفات التخزين') }
  }
  if (result?.warehouse_wipe) {
    try { const r = await platformReset.wipeWarehouse(id); if (!r.ok) errors.push(platformResetErrorMessage(r.error)) }
    catch { errors.push('تعذر إكمال تصفير مستودع GPS') }
  }
  return errors
}

export function usePlatformResetRequest() {
  const t = useToast(), inv = useInvalidateAll()
  return useMutation({
    mutationFn: async (x: { categories: string[]; password: string }) => {
      const r = await platformReset.request(x.categories, x.password)
      return { ...r, cleanupErrors: r.via_chain ? [] : await completePlatformReset(r.id, r.result) }
    },
    onSuccess: (r) => { inv(); if (r.cleanupErrors.length) t.warn(`صُفّرت قاعدة البيانات لكن بقيت مهام: ${r.cleanupErrors.join('، ')} — أعد المحاولة من التفاصيل`); else t.ok(r.via_chain ? 'تم إرسال طلب التصفير' : `اكتمل التصفير — حُذف ${r.result?.rows_deleted ?? 0} سجل`) },
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
    mutationFn: async (x: { id: string; password: string }) => {
      const r = await platformReset.approve(x.id, x.password)
      return { ...r, cleanupErrors: r.final ? await completePlatformReset(r.id, r.result) : [] }
    },
    onSuccess: (r) => { inv(); if (r.cleanupErrors.length) t.warn(`صُفّرت قاعدة البيانات لكن بقيت مهام: ${r.cleanupErrors.join('، ')} — أعد المحاولة من التفاصيل`); else t.ok(r.final ? `اكتمل التصفير — حُذف ${r.result?.rows_deleted ?? 0} سجل` : 'سُجّلت موافقتك — بانتظار بقية الخطوات') },
    onError: t.err,
  })
}
export function usePlatformResetReject() {
  const t = useToast(), inv = useInvalidateAll()
  return useMutation({ mutationFn: (x: { id: string; note: string }) => platformReset.reject(x.id, x.note), onSuccess: () => { inv(); t.ok('رُفض طلب التصفير') }, onError: t.err })
}
/** حذف الملفات المحلية على دفعات؛ حالة المستودع مستقلة تماماً. */
export function usePlatformResetWipeStorage() {
  const t = useToast(), inv = useInvalidateAll()
  return useMutation({
    mutationFn: (x: { id: string; onProgress?: (n: number) => void }) => platformReset.wipeStorage(x.id, x.onProgress),
    onSuccess: (r) => { inv(); t.ok(`حُذف ${r.deleted} ملف${r.remaining ? ` — بقي ${r.remaining}، أعد المحاولة` : ''}`) },
    onError: (e) => { inv(); t.err(e) },
  })
}
export function usePlatformResetWipeWarehouse() {
  const t = useToast(), inv = useInvalidateAll()
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await platformReset.wipeWarehouse(id)
      if (!r.ok) throw new Error(r.error ?? 'تعذر تصفير المستودع — أعد المحاولة')
      return r
    },
    onSuccess: () => { inv(); t.ok('اكتمل تصفير مستودع GPS وأرشيفه') },
    onError: (e) => { inv(); t.err(e) },
  })
}
