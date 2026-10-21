import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { coldArchive, coldErrorMessage } from '@sdk/cold-archive.sdk'
import { useUiStore } from '@stores/ui.store'
import { handleAppError } from '@lib/errors/error.handler'

export const coldKeys = {
  all: ['cold-archive'] as const,
  settings: () => [...coldKeys.all, 'settings'] as const,
  preview: (from: string, to: string) => [...coldKeys.all, 'preview', from, to] as const,
  packages: () => [...coldKeys.all, 'packages'] as const,
  package: (id: string) => [...coldKeys.all, 'package', id] as const,
}

const useAction = <T, R>(fn: (x: T) => Promise<R>, message: string | ((r: R) => string)) => {
  const qc = useQueryClient(), toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: coldKeys.all }); toast({ type: 'success', message: typeof message === 'function' ? message(r) : message }) },
    onError: (e) => { handleAppError(e, { scope: 'cold-archive' }); toast({ type: 'error', message: coldErrorMessage(e) }) },
  })
}

export const useColdSettings = () => useQuery({ queryKey: coldKeys.settings(), queryFn: () => coldArchive.settings() })
export const useSaveColdSettings = () => useAction(coldArchive.saveSettings, 'حُفظت إعدادات الأرشيف البارد')
export const useColdPreview = (from: string, to: string, enabled: boolean) =>
  useQuery({ queryKey: coldKeys.preview(from, to), queryFn: () => coldArchive.preview(from, to), enabled: enabled && Boolean(from && to) })
export const useColdPackages = () => useQuery({ queryKey: coldKeys.packages(), queryFn: () => coldArchive.packages(), refetchInterval: 60_000 })
export const useColdPackage = (id: string | null) => useQuery({ queryKey: coldKeys.package(id ?? ''), queryFn: () => coldArchive.package(id as string), enabled: Boolean(id) })
export const useCreateColdPackage = () => useAction((x: { from: string; to: string; note?: string | null }) => coldArchive.createPackage(x.from, x.to, x.note), (p) => `أُنشئت الحزمة ${p.code} — ${p.file_count} ملف`)
export const useCancelColdPackage = () => useAction((x: { id: string; reason: string }) => coldArchive.cancel(x.id, x.reason), 'أُلغيت الحزمة وتحرّرت ملفاتها')
export const useRequestColdPurge = () => useAction((id: string) => coldArchive.purgeRequest(id), 'سُجِّل طلب الحذف — بانتظار موافقة حساب IT آخر')
export const useApproveColdPurge = () => useAction((id: string) => coldArchive.purgeApprove(id), 'تمت الموافقة — زر الحذف متاح الآن')
export const useRunColdPurge = () => useAction((x: { id: string; onProgress?: (done: number, total: number) => void }) => coldArchive.purgeRun(x.id, x.onProgress),
  (p) => p.status === 'purged' ? `حُذفت ملفات الحزمة ${p.code} من المنصة (${p.purged_count} ملف)` : `توقف الحذف عند ${p.purged_count}/${p.file_count} — اضغط «استئناف»`)
