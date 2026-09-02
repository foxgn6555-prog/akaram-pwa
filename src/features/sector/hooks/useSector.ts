/** خطافات وحدة «مسؤول القسم» */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sectorKeys } from '@lib/query-keys/sector.keys'
import { API } from '@lib/constants/api.constants'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'
import {
  sector, sectorTeam, sectorSupplies, sectorBreakdowns,
  sectorPhotos, sectorAttendance, sectorSummary as fetchSummary,
} from '@sdk/sector.sdk'
import type {
  CreateWorkerInput, CreateVehicleInput, CreateSupplyInput,
  CreateBreakdownInput, CreateAttendanceInput,
} from '../types'

/* ── القواطع وملف المدير ── */
export function useSectors() {
  return useQuery({
    queryKey: sectorKeys.sectors(),
    queryFn: () => sector.listSectors(),
    staleTime: API.STALE_TIME.REFERENCE,
  })
}

export function useManagerProfile() {
  return useQuery({
    queryKey: sectorKeys.profile(),
    queryFn: () => sector.myProfile(),
    staleTime: API.STALE_TIME.REFERENCE,
  })
}

/* ── الفريق: عمال ── */
export function useWorkers(active = true) {
  return useQuery({
    queryKey: sectorKeys.workers(active ? 'active' : 'archived'),
    queryFn: () => sectorTeam.listWorkers(active),
    staleTime: API.STALE_TIME.DEFAULT,
  })
}

export function useCreateWorker() {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (input: CreateWorkerInput) => sectorTeam.createWorker(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sectorKeys.all })
      addToast({ type: 'success', message: 'أُضيف العامل إلى فريقك' })
    },
    onError: (e) => addToast({ type: 'error', message: handleAppError(e, { scope: 'createWorker' }).message }),
  })
}

export function useArchiveWorker() {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      sectorTeam.archiveWorker(id, reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sectorKeys.all })
      addToast({ type: 'warning', message: 'نُقل العامل إلى الأرشيف' })
    },
    onError: (e) => addToast({ type: 'error', message: handleAppError(e, { scope: 'archiveWorker' }).message }),
  })
}

/* ── الفريق: آليات ── */
export function useVehicles(active = true) {
  return useQuery({
    queryKey: sectorKeys.vehicles(active ? 'active' : 'archived'),
    queryFn: () => sectorTeam.listVehicles(active),
    staleTime: API.STALE_TIME.DEFAULT,
  })
}

export function useCreateVehicle() {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (input: CreateVehicleInput) => sectorTeam.createVehicle(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sectorKeys.all })
      addToast({ type: 'success', message: 'أُضيفت الآلية إلى قواطعك' })
    },
    onError: (e) => addToast({ type: 'error', message: handleAppError(e, { scope: 'createVehicle' }).message }),
  })
}

export function useArchiveVehicle() {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      sectorTeam.archiveVehicle(id, reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sectorKeys.all })
      addToast({ type: 'warning', message: 'نُقلت الآلية إلى الأرشيف' })
    },
    onError: (e) => addToast({ type: 'error', message: handleAppError(e, { scope: 'archiveVehicle' }).message }),
  })
}

/* ── طلبات المستلزمات ── */
export function useSupplies(scope: 'active' | 'archived' = 'active') {
  return useQuery({
    queryKey: sectorKeys.supplies(scope),
    queryFn: () => sectorSupplies.list(scope),
    staleTime: API.STALE_TIME.DEFAULT,
  })
}

export function useSubmitSupply() {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (input: CreateSupplyInput) => sectorSupplies.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sectorKeys.all })
      addToast({ type: 'success', message: 'أُرسل كتاب طلب المستلزمات إلى معاون المدير المفوض' })
    },
    onError: (e) => addToast({ type: 'error', message: handleAppError(e, { scope: 'submitSupply' }).message }),
  })
}

/* ── بلاغات الأعطال ── */
export function useBreakdowns(scope: 'active' | 'archived' = 'active') {
  return useQuery({
    queryKey: sectorKeys.breakdowns(scope),
    queryFn: () => sectorBreakdowns.list(scope),
    staleTime: API.STALE_TIME.DEFAULT,
  })
}

export function useSubmitBreakdown() {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (input: CreateBreakdownInput) => sectorBreakdowns.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sectorKeys.all })
      addToast({ type: 'success', message: 'سُجّل بلاغ العطل وحُفظ في الأرشيف' })
    },
    onError: (e) => addToast({ type: 'error', message: handleAppError(e, { scope: 'submitBreakdown' }).message }),
  })
}

/* ── الصور ── */
export function usePhotos(scope: 'active' | 'archived' = 'active') {
  return useQuery({
    queryKey: sectorKeys.photos(scope),
    queryFn: () => sectorPhotos.list(scope),
    staleTime: API.STALE_TIME.DEFAULT,
  })
}

export function useUploadPhoto() {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: ({ file, caption }: { file: File; caption: string }) =>
      sectorPhotos.upload(file, caption),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sectorKeys.all })
      addToast({ type: 'success', message: 'رُفعت الصورة وحُفظت' })
    },
    onError: (e) => addToast({ type: 'error', message: handleAppError(e, { scope: 'uploadPhoto' }).message }),
  })
}

/* ── الحضورية ── */
export function useAttendanceByDate(date: string) {
  return useQuery({
    queryKey: sectorKeys.attendance(date),
    queryFn: () => sectorAttendance.listByDate(date),
    staleTime: API.STALE_TIME.DEFAULT,
  })
}

export function useSetAttendance() {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (input: CreateAttendanceInput) => sectorAttendance.upsert(input),
    onSuccess: (_d, input) => {
      void qc.invalidateQueries({ queryKey: sectorKeys.all })
      addToast({
        type: 'success',
        message: input.is_present ? `سُجّل «${input.worker_name}» حاضرًا` : `سُجّل «${input.worker_name}» غائبًا`,
      })
    },
    onError: (e) => addToast({ type: 'error', message: handleAppError(e, { scope: 'setAttendance' }).message }),
  })
}

/* ── ملخص الرئيسية ── */
export function useSectorSummary() {
  return useQuery({
    queryKey: sectorKeys.summary(),
    queryFn: fetchSummary,
    staleTime: API.STALE_TIME.DEFAULT,
  })
}
