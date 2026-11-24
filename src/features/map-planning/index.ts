/**
 * ميزة التخطيط الجغرافي — المنطق والخطافات.
 * الصفحات تعيش في بوابة غرفة العمليات (لأنها وحدتها التشغيلية) وتستورد من هنا.
 */
export {
  mapKeys,
  useArchiveAlley,
  useArchiveStreet,
  useDecideReview,
  useLinkAlleyMahalla,
  useMapAlleys,
  useMapMahallas,
  useMapReviews,
  useMapSkips,
  useMapStreets,
  useMapZones,
  useSaveAlley,
  useSaveStreet,
} from './hooks/useMapPlanning'
export { useMapVisits, useMapCoverage, useBuildVisits } from './hooks/useMapPlanning'
// 20261128000100: الشهادة قبل الحذف — سجل البناء وحالة الحماية اليومية
export { useVisitBuildLedger, useDayCertified, useRunBuildScan } from './hooks/useMapPlanning'
export { useCoverageByPlace, useCoverageByVehicle, useCoverageRollup, useUnvisitedPlaces, useCoverageTrend } from './hooks/useMapPlanning'
export { useVisitsEnriched, useVehiclesDay, useUnvisitedEnriched } from './hooks/useMapPlanning'
export { useVehicleVisitsGrouped, useGroupedDrivers } from './hooks/useMapPlanning'
export type { GroupedFilters } from './hooks/useMapPlanning'
