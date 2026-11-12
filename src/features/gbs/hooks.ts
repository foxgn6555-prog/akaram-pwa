/** خطافات وحدة GBS الحاويات (00136) — react-query + SDK حصراً */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { gbs } from '@sdk/gbs.sdk'
import { useUiStore } from '@stores/ui.store'
import { handleAppError } from '@lib/errors/error.handler'
import { useAuth } from '@features/auth/hooks/useAuth'
import { buildGbsWorkbook, downloadWorkbook, type GbsImportRow } from './gbs-excel'
import type {
  GbsLocationRequestInput,
  GbsContainerSaveInput,
  GbsContainerStatus,
  GbsUpdateState,
  GbsUpdateRequestInput,
} from './types'

export const gbsKeys = {
  containers: (
    search?: string | null,
    status?: GbsContainerStatus | null,
    parent?: string | null,
    sectorId?: number | null,
  ) => ['gbs', 'containers', search ?? '', status ?? '', parent ?? '', sectorId ?? 0] as const,
  zones: () => ['gbs', 'zones'] as const,
  updates: (state: GbsUpdateState) => ['gbs', 'updates', state] as const,
  myUpdates: () => ['gbs', 'my-updates'] as const,
  jurisdiction: () => ['gbs', 'jurisdiction'] as const,
  followUpSummary: () => ['gbs', 'follow-up-summary'] as const,
}

function useGbsError(scope: string) {
  const addToast = useUiStore((state) => state.addToast)
  return (error: unknown) =>
    addToast({ type: 'error' as const, message: handleAppError(error, { scope }).message })
}

/** حساب IT يعاين البوابة فقط؛ لا يستدعي استعلامات بيانات GBS ولا يعرض أي نتائج مخزنة. */
function useGbsQueryAccess() {
  const { data: session, isLoading } = useAuth()
  const previewOnly = !!session?.roles?.includes('it_admin')
  return { previewOnly, enabled: !isLoading && !!session && !previewOnly }
}

export function useGbsVisualPreviewOnly() {
  return useGbsQueryAccess().previewOnly
}

export function useGbsContainers(
  search?: string | null,
  status?: GbsContainerStatus | null,
  parent?: string | null,
  sectorId?: number | null,
) {
  const access = useGbsQueryAccess()
  return useQuery({
    queryKey: gbsKeys.containers(search, status, parent, sectorId),
    queryFn: () => gbs.containers(search, status, parent, sectorId),
    enabled: access.enabled,
    select: (rows) => access.enabled ? rows : [],
    refetchInterval: 60000,
  })
}

export function useGbsZones() {
  const access = useGbsQueryAccess()
  return useQuery({
    queryKey: gbsKeys.zones(),
    queryFn: () => gbs.zones(),
    enabled: access.enabled,
    select: (rows) => access.enabled ? rows : [],
    staleTime: 5 * 60000,
  })
}

export function useGbsUpdates(state: GbsUpdateState = 'pending') {
  const access = useGbsQueryAccess()
  return useQuery({
    queryKey: gbsKeys.updates(state),
    queryFn: () => gbs.updates(state),
    enabled: access.enabled,
    select: (rows) => access.enabled ? rows : [],
    refetchInterval: 60000,
  })
}

export function useGbsMyUpdates() {
  const access = useGbsQueryAccess()
  return useQuery({
    queryKey: gbsKeys.myUpdates(),
    queryFn: () => gbs.myUpdates(),
    enabled: access.enabled,
    select: (rows) => access.enabled ? rows : [],
    refetchInterval: 60000,
  })
}

/** مناطق اختصاص مسؤول القسم (00138) — للواجهة التوضيحية؛ العزل يطبقه الخادم */
export function useGbsJurisdiction() {
  const access = useGbsQueryAccess()
  return useQuery({
    queryKey: gbsKeys.jurisdiction(),
    queryFn: () => gbs.jurisdiction(),
    enabled: access.enabled,
    select: (rows) => access.enabled ? rows : [],
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

/** 00260: طلب تحديث موقع (المتابعة) */
export function useGbsRequestLocation() {
  const qc = useQueryClient()
  const addToast = useUiStore((state) => state.addToast)
  const onError = useGbsError('gbsRequestLocation')
  return useMutation({
    mutationFn: (input: GbsLocationRequestInput) => gbs.requestLocation(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['gbs'] })
      addToast({ type: 'success', message: 'أُرسل طلب تحديث الموقع إلى غرفة العمليات — لا يتغير موقع الحاوية قبل الاعتماد' })
    },
    onError,
  })
}

/** 00260: ملخص الحاويات لرئيسية المتابعة */
export function useFollowUpContainersSummary() {
  const access = useGbsQueryAccess()
  return useQuery({
    queryKey: gbsKeys.followUpSummary(),
    queryFn: () => gbs.followUpSummary(),
    enabled: access.enabled,
    select: (summary) => access.enabled ? summary : null,
    refetchInterval: 60000,
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
