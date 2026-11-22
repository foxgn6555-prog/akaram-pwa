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
export { useCoverageByPlace, useCoverageByVehicle, useCoverageRollup, useUnvisitedPlaces, useCoverageTrend } from './hooks/useMapPlanning'
export { useVisitsEnriched, useVehiclesDay, useUnvisitedEnriched } from './hooks/useMapPlanning'
