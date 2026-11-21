/**
 * hooks التخطيط الجغرافي — قراءة وكتابة عبر react-query مع تحديث الكاش.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { handleAppError } from '@lib/errors/error.handler'
import { useUiStore } from '@stores/ui.store'
import {
  mapPlanningSdk,
  type MapGeometryReview,
  type MapStreet,
  type StreetKind,
} from '@sdk/map-planning.sdk'

export const mapKeys = {
  all: ['map-planning'] as const,
  zones: () => ['map-planning', 'zones'] as const,
  streets: (zoneId: string) => ['map-planning', 'streets', zoneId] as const,
  alleys: (zoneId: string) => ['map-planning', 'alleys', zoneId] as const,
  mahallas: (zoneId: string) => ['map-planning', 'mahallas', zoneId] as const,
  reviews: (zoneId: string) => ['map-planning', 'reviews', zoneId] as const,
  skips: (zoneId: string) => ['map-planning', 'skips', zoneId] as const,
}

export function useMapZones() {
  return useQuery({
    queryKey: mapKeys.zones(),
    queryFn: () => mapPlanningSdk.zones(),
    staleTime: 5 * 60_000,
  })
}

export function useMapStreets(zoneId: string | null) {
  return useQuery({
    queryKey: mapKeys.streets(zoneId ?? ''),
    queryFn: () => mapPlanningSdk.streets(zoneId as string),
    enabled: !!zoneId,
    staleTime: 2 * 60_000,
  })
}

export function useMapAlleys(zoneId: string | null) {
  return useQuery({
    queryKey: mapKeys.alleys(zoneId ?? ''),
    queryFn: () => mapPlanningSdk.alleys(zoneId as string),
    enabled: !!zoneId,
    staleTime: 2 * 60_000,
  })
}

export function useMapMahallas(zoneId: string | null) {
  return useQuery({
    queryKey: mapKeys.mahallas(zoneId ?? ''),
    queryFn: () => mapPlanningSdk.mahallas(zoneId as string),
    enabled: !!zoneId,
    staleTime: 5 * 60_000,
  })
}

export function useMapReviews(zoneId: string | null, onlyPending = true) {
  return useQuery({
    queryKey: [...mapKeys.reviews(zoneId ?? ''), onlyPending] as const,
    queryFn: () => mapPlanningSdk.reviews(zoneId as string, onlyPending),
    enabled: !!zoneId,
  })
}

export function useMapSkips(zoneId: string | null) {
  return useQuery({
    queryKey: mapKeys.skips(zoneId ?? ''),
    queryFn: () => mapPlanningSdk.skips(zoneId as string),
    enabled: !!zoneId,
  })
}

/**
 * كل تعديل يُبطل كاش نفس الزون (شوارع + أزقة + مراجعات)، لأن الحرّاس في
 * القاعدة قد تُسجّل تقاطعاً جديداً عند أي إدراج — فالكاش القديم يصبح كاذباً.
 */
function useInvalidateZone() {
  const qc = useQueryClient()
  return (zoneId: string) => {
    void qc.invalidateQueries({ queryKey: mapKeys.streets(zoneId) })
    void qc.invalidateQueries({ queryKey: mapKeys.alleys(zoneId) })
    void qc.invalidateQueries({ queryKey: mapKeys.reviews(zoneId) })
    void qc.invalidateQueries({ queryKey: mapKeys.zones() })
  }
}

export function useSaveStreet() {
  const invalidate = useInvalidateZone()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (input: {
      id?: string
      zone_id: string
      code: string
      name: string | null
      kind: StreetKind
      path: MapStreet['path']
      width_m?: number | null
      is_bridge?: boolean
    }) => mapPlanningSdk.saveStreet(input),
    onSuccess: (row) => {
      invalidate(row.zone_id)
      addToast({ type: 'success', message: 'تم حفظ الشارع' })
    },
    onError: (error) => {
      addToast({ type: 'error', message: handleAppError(error, { scope: 'map-planning' }).message })
    },
  })
}

export function useSaveAlley() {
  const invalidate = useInvalidateZone()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (input: {
      id?: string
      zone_id: string
      mahalla_id: string
      code: string
      name: string | null
      path: MapStreet['path']
      width_m?: number | null
    }) => mapPlanningSdk.saveAlley(input),
    onSuccess: (row) => {
      invalidate(row.zone_id)
      addToast({ type: 'success', message: 'تم حفظ الزقاق' })
    },
    onError: (error) => {
      addToast({ type: 'error', message: handleAppError(error, { scope: 'map-planning' }).message })
    },
  })
}

export function useArchiveStreet() {
  const invalidate = useInvalidateZone()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (v: { id: string; zoneId: string }) => mapPlanningSdk.archiveStreet(v.id),
    onSuccess: (_d, v) => {
      invalidate(v.zoneId)
      addToast({ type: 'success', message: 'تم أرشفة الشارع' })
    },
    onError: (error) => {
      addToast({ type: 'error', message: handleAppError(error, { scope: 'map-planning' }).message })
    },
  })
}

export function useArchiveAlley() {
  const invalidate = useInvalidateZone()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (v: { id: string; zoneId: string }) => mapPlanningSdk.archiveAlley(v.id),
    onSuccess: (_d, v) => {
      invalidate(v.zoneId)
      addToast({ type: 'success', message: 'تم أرشفة الزقاق' })
    },
    onError: (error) => {
      addToast({ type: 'error', message: handleAppError(error, { scope: 'map-planning' }).message })
    },
  })
}

export function useDecideReview() {
  const invalidate = useInvalidateZone()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (v: {
      id: string
      zoneId: string
      decision: MapGeometryReview['decision']
    }) => mapPlanningSdk.decideReview(v.id, v.decision),
    onSuccess: (_d, v) => {
      invalidate(v.zoneId)
      addToast({ type: 'success', message: 'تم تسجيل القرار' })
    },
    onError: (error) => {
      addToast({ type: 'error', message: handleAppError(error, { scope: 'map-planning' }).message })
    },
  })
}

export function useLinkAlleyMahalla() {
  const invalidate = useInvalidateZone()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (v: { alleyId: string; mahallaId: string; zoneId: string }) =>
      mapPlanningSdk.linkAlleyMahalla(v.alleyId, v.mahallaId),
    onSuccess: (_d, v) => {
      invalidate(v.zoneId)
      addToast({ type: 'success', message: 'تم ربط الزقاق بالمحلة' })
    },
    onError: (error) => {
      addToast({ type: 'error', message: handleAppError(error, { scope: 'map-planning' }).message })
    },
  })
}
