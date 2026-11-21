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
  visits: (zoneId: string, day: string) => ['map-planning', 'visits', zoneId, day] as const,
  coverage: (zoneId: string, day: string) => ['map-planning', 'coverage', zoneId, day] as const,
  coverageByPlace: (zoneId: string, day: string) => ['map-planning', 'cov-place', zoneId, day] as const,
  coverageByVehicle: (zoneId: string, day: string) => ['map-planning', 'cov-vehicle', zoneId, day] as const,
  coverageRollup: (zoneId: string, day: string) => ['map-planning', 'cov-rollup', zoneId, day] as const,
  unvisited: (zoneId: string, day: string) => ['map-planning', 'unvisited', zoneId, day] as const,
  trend: (zoneId: string, until: string, days: number) => ['map-planning', 'trend', zoneId, until, days] as const,
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

// ── الزيارات والتغطية (المرحلة ⑤/⑥) ───────────────────────────────────────

/** زيارات يوم كامل — تُقرأ من جدول دائم لا يتأثر بتفريغ نقاط GPS */
export function useMapVisits(zoneId: string | null, day: string) {
  return useQuery({
    queryKey: mapKeys.visits(zoneId ?? '', day),
    queryFn: () => mapPlanningSdk.visits(zoneId as string, day),
    enabled: Boolean(zoneId),
    staleTime: 60_000,
  })
}

/** ملخّص التغطية (شوارع + أزقة) — يعرض «لم تُدخل» لا صفراً كاذباً */
export function useMapCoverage(zoneId: string | null, day: string) {
  return useQuery({
    queryKey: mapKeys.coverage(zoneId ?? '', day),
    queryFn: () => mapPlanningSdk.coverage(zoneId as string, day),
    enabled: Boolean(zoneId),
    staleTime: 60_000,
  })
}

/**
 * تشغيل محرّك الزيارات. بعد النجاح نُبطل الزيارات والتغطية فقط — لا نمسّ
 * بيانات التخطيط (شوارع/أزقة) لأن المحرّك لا يعدّلها.
 */
export function useBuildVisits() {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (v: { zoneId: string; from: string; to: string; vehicleId?: string | null }) =>
      mapPlanningSdk.buildVisits(v),
    onSuccess: (r, v) => {
      void qc.invalidateQueries({ queryKey: ['map-planning', 'visits', v.zoneId] })
      void qc.invalidateQueries({ queryKey: ['map-planning', 'coverage', v.zoneId] })
      addToast({
        type: 'success',
        message: `استُخرجت ${r.visits_created} زيارة من ${r.places_scanned} مكاناً (${r.visits_merged} دمج)`,
      })
    },
    onError: (error) => {
      addToast({ type: 'error', message: handleAppError(error, { scope: 'map-visits' }).message })
    },
  })
}

// ── إحصاءات التغطية (المرحلة ⑥) ───────────────────────────────────────────

/** كل مكان مع حالته — الأساس لجدول التغطية وقائمة «لم تُزر» */
export function useCoverageByPlace(zoneId: string | null, day: string, kind?: 'street' | 'alley') {
  return useQuery({
    queryKey: [...mapKeys.coverageByPlace(zoneId ?? '', day), kind ?? 'all'] as const,
    queryFn: () => mapPlanningSdk.coverageByPlace(zoneId as string, day, kind),
    enabled: Boolean(zoneId),
    staleTime: 60_000,
  })
}

export function useCoverageByVehicle(zoneId: string | null, day: string) {
  return useQuery({
    queryKey: mapKeys.coverageByVehicle(zoneId ?? '', day),
    queryFn: () => mapPlanningSdk.coverageByVehicle(zoneId as string, day),
    enabled: Boolean(zoneId),
    staleTime: 60_000,
  })
}

export function useCoverageRollup(zoneId: string | null, day: string) {
  return useQuery({
    queryKey: mapKeys.coverageRollup(zoneId ?? '', day),
    queryFn: () => mapPlanningSdk.coverageRollup(zoneId as string, day),
    enabled: Boolean(zoneId),
    staleTime: 60_000,
  })
}

export function useUnvisitedPlaces(zoneId: string | null, day: string, kind?: 'street' | 'alley') {
  return useQuery({
    queryKey: [...mapKeys.unvisited(zoneId ?? '', day), kind ?? 'all'] as const,
    queryFn: () => mapPlanningSdk.unvisitedPlaces(zoneId as string, day, kind),
    enabled: Boolean(zoneId),
    staleTime: 60_000,
  })
}

export function useCoverageTrend(zoneId: string | null, until: string, days = 14) {
  return useQuery({
    queryKey: mapKeys.trend(zoneId ?? '', until, days),
    queryFn: () => mapPlanningSdk.coverageTrend(zoneId as string, until, days),
    enabled: Boolean(zoneId),
    staleTime: 5 * 60_000,
  })
}
