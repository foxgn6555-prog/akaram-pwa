/**
 * خطافات سجلات الأوزان — المحطة التحويلية
 * قراءة/إنشاء/تعديل/أرشفة/استعادة/إرسال لغرفة العمليات + ملخص اللوحة.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { transferStationKeys } from '@lib/query-keys/transfer-station.keys'
import { transferStation } from '@sdk/transfer-station.sdk'
import { API } from '@lib/constants/api.constants'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'
import type {
  CreateWeightInput,
  UpdateWeightInput,
  CreateSaksatInput,
  CreateAttendanceInput,
  Shift,
} from '../types'

export function useWeightList(filter?: { date?: string; shift?: Shift }) {
  return useQuery({
    queryKey: transferStationKeys.weightList(filter),
    queryFn: () => transferStation.list(filter),
    staleTime: API.STALE_TIME.DEFAULT,
  })
}

export function useArchivedWeights() {
  return useQuery({
    queryKey: transferStationKeys.archived(),
    queryFn: () => transferStation.listArchived(),
    staleTime: API.STALE_TIME.REFERENCE,
  })
}

export function useWeightSummary() {
  return useQuery({
    queryKey: transferStationKeys.summary(),
    queryFn: () => transferStation.summary(),
    staleTime: API.STALE_TIME.DEFAULT,
  })
}

export function useCreateWeight() {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (input: CreateWeightInput) => transferStation.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: transferStationKeys.all })
      addToast({ type: 'success', message: 'تم تسجيل الوزن بنجاح' })
    },
    onError: (error) =>
      addToast({ type: 'error', message: handleAppError(error, { scope: 'createWeight' }).message }),
  })
}

export function useUpdateWeight() {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateWeightInput }) =>
      transferStation.update(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: transferStationKeys.all })
      addToast({ type: 'success', message: 'تم تحديث السجل' })
    },
    onError: (error) =>
      addToast({ type: 'error', message: handleAppError(error, { scope: 'updateWeight' }).message }),
  })
}

/** حذف (أرشفة → أرشيف IT) — يتطلب سبباً */
export function useArchiveWeight() {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      transferStation.archive(id, reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: transferStationKeys.all })
      addToast({
        type: 'warning',
        message: 'نُقل السجل إلى الأرشيف المركزي (IT) — وتم تنبيه التطوير المركزية',
      })
    },
    onError: (error) =>
      addToast({ type: 'error', message: handleAppError(error, { scope: 'archiveWeight' }).message }),
  })
}

/** استعادة من أرشيف IT (تُستخدم من بوابة IT) */
export function useRestoreWeight() {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (id: string) => transferStation.restore(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: transferStationKeys.all })
      addToast({ type: 'success', message: 'تمت استعادة السجل إلى المحطة التحويلية' })
    },
    onError: (error) =>
      addToast({ type: 'error', message: handleAppError(error, { scope: 'restoreWeight' }).message }),
  })
}

/** إرسال دفتر تاريخ/شفت لغرفة العمليات للتدقيق */
export function useSendToOps() {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: ({ date, shift }: { date: string; shift: Shift }) =>
      transferStation.sendToOps(date, shift),
    onSuccess: (count) => {
      void qc.invalidateQueries({ queryKey: transferStationKeys.all })
      addToast({
        type: 'success',
        message: `أُرسل الدفتر إلى غرفة العمليات للتدقيق (${count} سجل)`,
      })
    },
    onError: (error) =>
      addToast({ type: 'error', message: handleAppError(error, { scope: 'sendToOps' }).message }),
  })
}

/* ═══ السكسات الخارجة · النسافات الخارجة · الحضورية (00043) ═══ */

export function useSaksatList(month?: string) {
  return useQuery({
    queryKey: transferStationKeys.saksatList(month),
    queryFn: () => transferStation.listSaksat(month),
    staleTime: API.STALE_TIME.DEFAULT,
  })
}

export function useCreateSaksat() {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (input: CreateSaksatInput) => transferStation.createSaksat(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: transferStationKeys.all })
      addToast({ type: 'success', message: 'تم تسجيل الخروج بنجاح' })
    },
    onError: (error) =>
      addToast({ type: 'error', message: handleAppError(error, { scope: 'createSaksat' }).message }),
  })
}

export function useSendSaksatFolder() {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (month: string) => transferStation.sendSaksatFolder(month),
    onSuccess: (count, month) => {
      void qc.invalidateQueries({ queryKey: transferStationKeys.all })
      addToast({
        type: 'success',
        message: `أُرسل فولدر السكسات لشهر ${month} (${count} سجل) لمعاون المدير المفوض`,
      })
    },
    onError: (error) =>
      addToast({ type: 'error', message: handleAppError(error, { scope: 'sendSaksatFolder' }).message }),
  })
}

export function useTripsList(month?: string) {
  return useQuery({
    queryKey: transferStationKeys.tripsList(month),
    queryFn: () => transferStation.listTrips(month),
    staleTime: API.STALE_TIME.DEFAULT,
  })
}

export function useCreateTrips() {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (input: CreateSaksatInput) => transferStation.createTrips(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: transferStationKeys.all })
      addToast({ type: 'success', message: 'تم تسجيل النسافة بنجاح' })
    },
    onError: (error) =>
      addToast({ type: 'error', message: handleAppError(error, { scope: 'createTrips' }).message }),
  })
}

export function useSendTripsFolder() {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (month: string) => transferStation.sendTripsFolder(month),
    onSuccess: (count, month) => {
      void qc.invalidateQueries({ queryKey: transferStationKeys.all })
      addToast({
        type: 'success',
        message: `أُرسل فولدر النسافات لشهر ${month} (${count} سجل) لمعاون المدير المفوض`,
      })
    },
    onError: (error) =>
      addToast({ type: 'error', message: handleAppError(error, { scope: 'sendTripsFolder' }).message }),
  })
}

export function useAttendanceList(date?: string) {
  return useQuery({
    queryKey: transferStationKeys.attendanceList(date),
    queryFn: () => transferStation.listAttendance(date),
    staleTime: API.STALE_TIME.DEFAULT,
  })
}

export function useCreateAttendance() {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (input: CreateAttendanceInput) => transferStation.createAttendance(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: transferStationKeys.all })
      addToast({ type: 'success', message: 'تم تسجيل الحضور بنجاح' })
    },
    onError: (error) =>
      addToast({ type: 'error', message: handleAppError(error, { scope: 'createAttendance' }).message }),
  })
}

/** الفولدرات الواردة لبوابة معاون المدير المفوض */
export function useSaksatSubmitted() {
  return useQuery({
    queryKey: transferStationKeys.saksatSubmitted(),
    queryFn: () => transferStation.listSaksatSubmitted(),
    staleTime: API.STALE_TIME.DEFAULT,
  })
}

export function useTripsSubmitted() {
  return useQuery({
    queryKey: transferStationKeys.tripsSubmitted(),
    queryFn: () => transferStation.listTripsSubmitted(),
    staleTime: API.STALE_TIME.DEFAULT,
  })
}
