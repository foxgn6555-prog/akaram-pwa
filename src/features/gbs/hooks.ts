/** خطافات وحدة GBS الحاويات (00136) — react-query + SDK حصراً */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { gbs } from '@sdk/gbs.sdk'
import { useUiStore } from '@stores/ui.store'
import { handleAppError } from '@lib/errors/error.handler'
import type {
  GbsContainerSaveInput,
  GbsContainerStatus,
  GbsUpdateState,
  GbsUpdateRequestInput,
} from './types'

export const gbsKeys = {
  containers: (search?: string | null, status?: GbsContainerStatus | null) =>
    ['gbs', 'containers', search ?? '', status ?? ''] as const,
  updates: (state: GbsUpdateState) => ['gbs', 'updates', state] as const,
  myUpdates: () => ['gbs', 'my-updates'] as const,
}

function useGbsError(scope: string) {
  const addToast = useUiStore((state) => state.addToast)
  return (error: unknown) =>
    addToast({ type: 'error' as const, message: handleAppError(error, { scope }).message })
}

export function useGbsContainers(search?: string | null, status?: GbsContainerStatus | null) {
  return useQuery({
    queryKey: gbsKeys.containers(search, status),
    queryFn: () => gbs.containers(search, status),
    refetchInterval: 60000,
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
