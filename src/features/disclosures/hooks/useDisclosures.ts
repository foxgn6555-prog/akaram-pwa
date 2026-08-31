/** خطافات الكشوفات التأديبية — وحدة الكشوفات */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { disclosuresKeys } from '@lib/query-keys/disclosures.keys'
import { disclosures } from '@sdk/disclosures.sdk'
import { API } from '@lib/constants/api.constants'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'
import type { CreateDisclosureInput } from '../types'

export function useDisclosureList() {
  return useQuery({
    queryKey: disclosuresKeys.list(),
    queryFn: () => disclosures.list(),
    staleTime: API.STALE_TIME.DEFAULT,
  })
}

export function useArchivedDisclosures() {
  return useQuery({
    queryKey: disclosuresKeys.archived(),
    queryFn: () => disclosures.listArchived(),
    staleTime: API.STALE_TIME.REFERENCE,
  })
}

export function useDisclosureSummary() {
  return useQuery({
    queryKey: disclosuresKeys.summary(),
    queryFn: () => disclosures.summary(),
    staleTime: API.STALE_TIME.DEFAULT,
  })
}

export function useCreateDisclosure() {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (input: CreateDisclosureInput) => disclosures.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: disclosuresKeys.all })
      addToast({ type: 'success', message: 'تم إنشاء الكشف بنجاح' })
    },
    onError: (e) =>
      addToast({ type: 'error', message: handleAppError(e, { scope: 'createDisclosure' }).message }),
  })
}

export function useArchiveDisclosure() {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      disclosures.archive(id, reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: disclosuresKeys.all })
      addToast({
        type: 'warning',
        message: 'نُقل الكشف إلى الأرشيف المركزي (IT) — وتم تنبيه التطوير المركزية',
      })
    },
    onError: (e) =>
      addToast({ type: 'error', message: handleAppError(e, { scope: 'archiveDisclosure' }).message }),
  })
}

export function useRestoreDisclosure() {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (id: string) => disclosures.restore(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: disclosuresKeys.all })
      addToast({ type: 'success', message: 'تمت استعادة الكشف إلى وحدة الكشوفات' })
    },
    onError: (e) =>
      addToast({ type: 'error', message: handleAppError(e, { scope: 'restoreDisclosure' }).message }),
  })
}

/** رفع الكشف لمعاون المدير المفوض */
export function useSubmitDisclosure() {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (id: string) => disclosures.submit(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: disclosuresKeys.all })
      addToast({ type: 'success', message: 'تم رفع الكشف إلى معاون المدير المفوض' })
    },
    onError: (e) =>
      addToast({ type: 'error', message: handleAppError(e, { scope: 'submitDisclosure' }).message }),
  })
}
