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
import type { ColumnSelection } from '../export-columns'

export const mapKeys = {
  all: ['map-planning'] as const,
  zones: () => ['map-planning', 'zones'] as const,
  streets: (zoneId: string) => ['map-planning', 'streets', zoneId] as const,
  alleys: (zoneId: string) => ['map-planning', 'alleys', zoneId] as const,
  mahallas: (zoneId: string) => ['map-planning', 'mahallas', zoneId] as const,
  reviews: (zoneId: string) => ['map-planning', 'reviews', zoneId] as const,
  skips: (zoneId: string) => ['map-planning', 'skips', zoneId] as const,
  visits: (zoneId: string, day: string) => ['map-planning', 'visits', zoneId, day] as const,
  buildLedger: (day: string) => ['map-planning', 'build-ledger', day] as const,
  certified: (day: string) => ['map-planning', 'certified', day] as const,
  coverage: (zoneId: string, day: string) => ['map-planning', 'coverage', zoneId, day] as const,
  coverageByPlace: (zoneId: string, day: string) => ['map-planning', 'cov-place', zoneId, day] as const,
  coverageByVehicle: (zoneId: string, day: string) => ['map-planning', 'cov-vehicle', zoneId, day] as const,
  coverageRollup: (zoneId: string, day: string) => ['map-planning', 'cov-rollup', zoneId, day] as const,
  unvisited: (zoneId: string, day: string) => ['map-planning', 'unvisited', zoneId, day] as const,
  trend: (zoneId: string, until: string, days: number) => ['map-planning', 'trend', zoneId, until, days] as const,
  exportPrefs: (kind: string) => ['map-planning', 'export-prefs', kind] as const,
  groupedDrivers: (zoneId: string, from: string, to: string) =>
    ['map-planning', 'grouped-drivers', zoneId, from, to] as const,
  visitsEnriched: (zoneId: string, day: string, vehicleId: string) =>
    ['map-planning', 'visits-enr', zoneId, day, vehicleId] as const,
  vehiclesDay: (zoneId: string, day: string) => ['map-planning', 'veh-day', zoneId, day] as const,
  unvisitedEnriched: (zoneId: string, day: string) => ['map-planning', 'unvisited-enr', zoneId, day] as const,
  sectorManagers: (sectors: number[]) => ['map-planning', 'sec-mgr', [...sectors].sort().join(',')] as const,
  vehicleVisitsGrouped: (zoneId: string, from: string, to: string, rest: string) =>
    ['map-planning', 'veh-visits-grouped', zoneId, from, to, rest] as const,
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

/**
 * قائمة فلتر السائق: من قاد آلية فعلاً في الزون والمدى.
 *
 * لا نعرض كل موظفي الشركة: قائمة بـ٥٠٠ اسم معظمها بلا صف واحد أسوأ من
 * قائمة بـ٥ أسماء كلها تعمل. وتُطبَّق نفس قيد الزون المطبَّق في التقرير.
 */
export function useGroupedDrivers(zoneId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: mapKeys.groupedDrivers(zoneId ?? '', from, to),
    queryFn: () => mapPlanningSdk.groupedDrivers({ zoneId: zoneId as string, from, to }),
    enabled: Boolean(zoneId),
    staleTime: 5 * 60_000,
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
 * بناء زيارات **يوم بغداد واحد** لزون واحد + تسجيل شهادة البناء.
 *
 * `day` تاريخ فقط (YYYY-MM-DD) — الخادم يحسب حدود اليوم بتوقيت بغداد.
 * كان الكود يرسل `T00:00:00Z`–`T23:59:59Z` فيغطي 03:00 بغداد ليوم D حتى
 * 02:59 بغداد من D+1، أي «يوم UTC» لا «يوم بغداد» — خلل يزيح ٣ ساعات من كل يوم.
 *
 * الشهادة المسجَّلة هي شرط حذف النقاط الخام: لا يُحذف يوم من
 * `gps_device_position_history` قبل أن يُبنى بنجاح.
 */
export function useBuildVisits() {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (v: { zoneId: string; day: string }) => mapPlanningSdk.buildVisits(v),
    onSuccess: (r, v) => {
      void qc.invalidateQueries({ queryKey: ['map-planning', 'visits', v.zoneId] })
      void qc.invalidateQueries({ queryKey: ['map-planning', 'coverage', v.zoneId] })
      void qc.invalidateQueries({ queryKey: mapKeys.buildLedger(v.day) })
      void qc.invalidateQueries({ queryKey: mapKeys.certified(v.day) })
      addToast({
        type: 'success',
        message: `بُنيت ${r.visits_created} زيارة من ${r.points} نقطة`
          + ` (${r.visits_merged} دمج · ${r.skipped_visits} أُسقطت لعدم إثباتها)`
          + ' — اليوم الآن محميّ قبل التفريغ',
      })
    },
    onError: (error) => {
      addToast({ type: 'error', message: handleAppError(error, { scope: 'map-visits' }).message })
    },
  })
}

/** شهادات البناء لكل زون في يوم — تُعرَض كشارة «محميّ / غير محميّ» */
export function useVisitBuildLedger(day: string) {
  return useQuery({
    queryKey: mapKeys.buildLedger(day),
    queryFn: () => mapPlanningSdk.visitBuildLedger(day),
    enabled: Boolean(day),
    staleTime: 30_000,
  })
}

/** هل بُني اليوم بالكامل؟ شرط حذف النقاط الخام */
export function useDayCertified(day: string) {
  return useQuery({
    queryKey: mapKeys.certified(day),
    queryFn: () => mapPlanningSdk.isDayCertified(day),
    enabled: Boolean(day),
    staleTime: 30_000,
  })
}

/** تشغيل البناء الآلي المتأخر (بعد سحب تاريخ من المزوّد) */
export function useRunBuildScan() {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (lookbackDays: number) => mapPlanningSdk.runBuildScan(lookbackDays),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['map-planning'] })
      addToast({
        type: r.failed > 0 ? 'error' : 'success',
        message: `بناء متأخر: ${r.built} بُني · ${r.empty} بلا نقاط · ${r.failed} فشل · ${r.skipped} سليم سابقاً`,
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

// ── تفضيلات التصدير (المرحلة ⑦) ───────────────────────────────────────────

/** تفضيل المستخدم للأعمدة؛ null = لم يحفظ بعد ⇒ الواجهة تستعمل الافتراضي */
export function useExportPrefs(kind: 'places' | 'visits') {
  return useQuery({
    queryKey: mapKeys.exportPrefs(kind),
    queryFn: () => mapPlanningSdk.exportPrefsGet(kind),
    staleTime: 5 * 60_000,
  })
}

export function useSaveExportPrefs() {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (v: { kind: 'places' | 'visits'; columns: ColumnSelection[] }) =>
      mapPlanningSdk.exportPrefsSet(v.kind, v.columns),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: mapKeys.exportPrefs(v.kind) })
      addToast({ type: 'success', message: 'تم حفظ ترتيب الأعمدة' })
    },
    onError: (error) => {
      addToast({ type: 'error', message: handleAppError(error, { scope: 'map-export' }).message })
    },
  })
}

// ── الزيارات المُثراة: سائق/شفت/مسؤول (الجولة ٦) ───────────────────────────

/** زيارات يوم — مُصفّاة بآلية اختيارية */
export function useVisitsEnriched(zoneId: string | null, day: string, vehicleId: string | null) {
  return useQuery({
    queryKey: mapKeys.visitsEnriched(zoneId ?? '', day, vehicleId ?? ''),
    queryFn: () => mapPlanningSdk.visitsEnriched(zoneId as string, day, vehicleId),
    enabled: Boolean(zoneId),
    staleTime: 60_000,
  })
}

export function useVehiclesDay(zoneId: string | null, day: string) {
  return useQuery({
    queryKey: mapKeys.vehiclesDay(zoneId ?? '', day),
    queryFn: () => mapPlanningSdk.vehiclesDay(zoneId as string, day),
    enabled: Boolean(zoneId),
    staleTime: 60_000,
  })
}

export function useUnvisitedEnriched(zoneId: string | null, day: string) {
  return useQuery({
    queryKey: mapKeys.unvisitedEnriched(zoneId ?? '', day),
    queryFn: () => mapPlanningSdk.unvisitedEnriched(zoneId as string, day),
    enabled: Boolean(zoneId),
    staleTime: 60_000,
  })
}

// ── التقرير المُجمَّع بشكل ورقة الشركة (الجولة ٢٠) ─────────────────────────

export interface GroupedFilters {
  vehicleId?: string | null
  shift?: string | null
  status?: 'confirmed' | 'uncertain' | null
  mahalla?: string | null
  /** false = اعرض كل آلية دخلت الزون ولو كانت مربوطة بزون آخر */
  respectVehicleZone?: boolean
  /** السائق (employee_id) */
  driverId?: string | null
  /** نوع المكان: أزقة أو شوارع فقط */
  kind?: 'alley' | 'street' | null
  /** true ⇒ المؤكد فقط (استبعاد الزيارات غير المؤكدة) */
  confirmedOnly?: boolean
}

/**
 * صف لكل (آلية × يوم × محلة) للأزقة، وصف لكل (آلية × يوم) للشوارع.
 *
 * المفتاح يشمل الفلاتر كلها حتى لا يُعاد استعمال صفوف مرشَّحة بفلتر آخر
 * (خطأ كلاسيكي في react-query: نتيجة مفلترة تُعرض لفلتر مختلف).
 */
export function useVehicleVisitsGrouped(
  zoneId: string | null,
  from: string,
  to: string,
  filters: GroupedFilters = {},
) {
  const { vehicleId = null, shift = null, status = null, mahalla = null,
    respectVehicleZone = true, driverId = null, kind = null,
    confirmedOnly = false } = filters
  const rest = [vehicleId ?? '', shift ?? '', status ?? '', mahalla ?? '',
    respectVehicleZone ? 'rz1' : 'rz0', driverId ?? '', kind ?? '',
    confirmedOnly ? 'c1' : 'c0'].join('|')
  return useQuery({
    queryKey: mapKeys.vehicleVisitsGrouped(zoneId ?? '', from, to, rest),
    queryFn: () =>
      mapPlanningSdk.vehicleVisitsGrouped({
        zoneId: zoneId as string, from, to,
        ...(vehicleId ? { vehicleId } : {}),
        ...(shift ? { shift } : {}),
        ...(status ? { status } : {}),
        ...(mahalla ? { mahalla } : {}),
        ...(respectVehicleZone ? {} : { respectVehicleZone: false }),
        ...(driverId ? { driverId } : {}),
        ...(kind ? { kind } : {}),
        ...(confirmedOnly ? { confirmedOnly: true } : {}),
      }),
    enabled: Boolean(zoneId),
    staleTime: 60_000,
  })
}

/** مسؤولو الأقسام لقطاعات محددة — الربط من القاطع إلى المسؤول، لا إدخال يدوي */
export function useSectorManagers(sectors: number[]) {
  return useQuery({
    queryKey: mapKeys.sectorManagers(sectors),
    queryFn: () => mapPlanningSdk.sectorManagers(sectors),
    enabled: sectors.length > 0,
    staleTime: 5 * 60_000,
  })
}
