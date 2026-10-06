/** خطافات وحدة GBS الحاويات (00136) — react-query + SDK حصراً */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { gbs } from '@sdk/gbs.sdk'
import { useUiStore } from '@stores/ui.store'
import { handleAppError } from '@lib/errors/error.handler'
import { buildGbsWorkbook, downloadWorkbook, type GbsImportRow } from './gbs-excel'
import type {
  GbsContainerSaveInput,
  GbsContainerStatus,
  GbsUpdateState,
  GbsUpdateRequestInput,
} from './types'

export const gbsKeys = {
  containers: (
    search?: string | null,
    status?: GbsContainerStatus | null,
    parent?: 'karrada' | 'zaafaraniya' | null,
    sectorId?: number | null,
  ) => ['gbs', 'containers', search ?? '', status ?? '', parent ?? '', sectorId ?? 0] as const,
  zones: () => ['gbs', 'zones'] as const,
  updates: (state: GbsUpdateState) => ['gbs', 'updates', state] as const,
  myUpdates: () => ['gbs', 'my-updates'] as const,
  jurisdiction: () => ['gbs', 'jurisdiction'] as const,
}

function useGbsError(scope: string) {
  const addToast = useUiStore((state) => state.addToast)
  return (error: unknown) =>
    addToast({ type: 'error' as const, message: handleAppError(error, { scope }).message })
}

export function useGbsContainers(
  search?: string | null,
  status?: GbsContainerStatus | null,
  parent?: 'karrada' | 'zaafaraniya' | null,
  sectorId?: number | null,
) {
  return useQuery({
    queryKey: gbsKeys.containers(search, status, parent, sectorId),
    queryFn: () => gbs.containers(search, status, parent, sectorId),
    refetchInterval: 60000,
  })
}

export function useGbsZones() {
  return useQuery({
    queryKey: gbsKeys.zones(),
    queryFn: () => gbs.zones(),
    staleTime: 5 * 60000,
  })
}

export function useGbsUpdates(state: GbsUpdateState = 'pending') {
  return useQuery({
    queryKey: gbsKeys.updates(state),
    queryFn: () => gbs.updates(state),
    refetchInterval: 60000,
  })
}

export function useGbsMyUpdates() {
  return useQuery({
    queryKey: gbsKeys.myUpdates(),
    queryFn: () => gbs.myUpdates(),
    refetchInterval: 60000,
  })
}

/** مناطق اختصاص مسؤول القسم (00138) — للواجهة التوضيحية؛ العزل يطبقه الخادم */
export function useGbsJurisdiction() {
  return useQuery({
    queryKey: gbsKeys.jurisdiction(),
    queryFn: () => gbs.jurisdiction(),
    staleTime: 5 * 60000,
  })
}

export function useGbsSaveContainer() {
  const qc = useQueryClient()
  const addToast = useUiStore((state) => state.addToast)
  const onError = useGbsError('gbsSaveContainer')
  return useMutation({
    mutationFn: (input: GbsContainerSaveInput) => gbs.save(input),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['gbs'] })
      addToast({
        type: 'success',
        message: vars.id ? 'تم تحديث بيانات الحاوية' : 'تمت إضافة الحاوية إلى الخريطة',
      })
    },
    onError,
  })
}

/** 00183: استيراد الحاويات من Excel (محاكاة أو تنفيذ) */
export function useGbsImport() {
  const qc = useQueryClient()
  const onError = useGbsError('gbsImport')
  return useMutation({
    mutationFn: (x: { rows: GbsImportRow[]; dryRun: boolean; updateExisting: boolean }) => gbs.importRows(x.rows, x.dryRun, x.updateExisting),
    onSuccess: (_r, x) => { if (!x.dryRun) void qc.invalidateQueries({ queryKey: ['gbs'] }) },
    onError,
  })
}
/** 00183: تصدير الحاويات إلى Excel (الملف نفسه قالب الاستيراد) */
export function useGbsExport() {
  const addToast = useUiStore((state) => state.addToast)
  const onError = useGbsError('gbsExport')
  return useMutation({
    mutationFn: async (template: boolean) => {
      const rows = template ? [] : await gbs.exportAll()
      await downloadWorkbook(await buildGbsWorkbook(rows, { template }), template ? 'قالب-حاويات-GBS.xlsx' : `حاويات-GBS-${new Date().toISOString().slice(0, 10)}.xlsx`)
      return rows.length
    },
    onSuccess: (n, template) => addToast({ type: 'success', message: template ? 'نُزّل قالب الاستيراد' : `صُدّرت ${n} حاوية` }),
    onError,
  })
}

export function useGbsDeleteContainer() {
  const qc = useQueryClient()
  const addToast = useUiStore((state) => state.addToast)
  const onError = useGbsError('gbsDeleteContainer')
  return useMutation({
    mutationFn: (id: string) => gbs.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['gbs'] })
      addToast({ type: 'success', message: 'تم حذف الحاوية من الخريطة' })
    },
    onError,
  })
}

export function useGbsRequestUpdate() {
  const qc = useQueryClient()
  const addToast = useUiStore((state) => state.addToast)
  const onError = useGbsError('gbsRequestUpdate')
  return useMutation({
    mutationFn: (input: GbsUpdateRequestInput) => gbs.requestUpdate(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['gbs'] })
      addToast({
        type: 'success',
        message: 'أُرسل طلب التحديث إلى غرفة العمليات — لا تتغير البيانات قبل الموافقة',
      })
    },
    onError,
  })
}

export function useGbsReviewUpdate() {
  const qc = useQueryClient()
  const addToast = useUiStore((state) => state.addToast)
  const onError = useGbsError('gbsReviewUpdate')
  return useMutation({
    mutationFn: (x: { updateId: string; approve: boolean; reviewNote?: string }) =>
      gbs.review(x.updateId, x.approve, x.reviewNote),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['gbs'] })
      addToast({
        type: 'success',
        message: vars.approve
          ? 'تم اعتماد التحديث وطُبقت الحالة الجديدة على الخريطة'
          : 'تم رفض طلب التحديث وإبلاغ مسؤول القسم',
      })
    },
    onError,
  })
}
