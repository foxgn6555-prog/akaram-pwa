import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { space, type SpacePlan } from '@sdk/space.sdk'
import { useUiStore } from '@stores/ui.store'
import { handleAppError } from '@lib/errors/error.handler'

export const spaceKeys = { all: ['space'] as const }
const msg = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e)
  if (m.includes('IT_FORBIDDEN')) return 'هذا الإجراء لحسابات التطوير المركزية فقط'
  if (m.includes('SPACE_LIMITS_REQUIRED')) return 'الخطة المخصصة تتطلب حدّ قاعدة البيانات وحدّ التخزين'
  return m
}
/** اللوحة: تُزامن أولاً نتائج الضغط المجدولة التي حان موعدها ثم تقرأ الأرقام */
export function useSpaceOverview() {
  return useQuery({ queryKey: spaceKeys.all, queryFn: async () => { try { await space.sync() } catch { /* القراءة تكفي */ } return space.overview() }, staleTime: 30_000, refetchInterval: 60_000 })
}
export function useSetSpacePlan() {
  const qc = useQueryClient(), toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (p: { plan: SpacePlan; dbLimit?: number; storageLimit?: number; threshold?: number }) => space.setPlan(p.plan, p.dbLimit, p.storageLimit, p.threshold),
    onSuccess: (data) => { qc.setQueryData(spaceKeys.all, data); toast({ type: 'success', message: 'حُفظت حدود المساحة' }) },
    onError: (e) => { handleAppError(e, { scope: 'space' }); toast({ type: 'error', message: msg(e) }) },
  })
}
export function useSpaceReclaimNow() {
  const qc = useQueryClient(), toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (tables?: string[]) => space.reclaimNow(tables),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: spaceKeys.all })
      toast({ type: r.scheduled > 0 ? 'success' : 'warning', message: r.scheduled > 0 ? `جُدول ضغط ${r.scheduled} جدول يبدأ خلال دقيقة — النتيجة تظهر في اللوحة بعد اكتماله` : r.skipped > 0 ? `أُجِّل ضغط ${r.skipped} جدول — راجع السبب في السجل` : 'لا جداول تحتاج ضغطاً الآن' })
    },
    onError: (e) => { handleAppError(e, { scope: 'space' }); toast({ type: 'error', message: msg(e) }) },
  })
}
