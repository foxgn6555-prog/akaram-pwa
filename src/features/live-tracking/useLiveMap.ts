/** استعلامات خريطة البث المباشر لغرفة العمليات (00287) — تحديث تلقائي كل دقيقة. */
import { useQuery } from '@tanstack/react-query'
import { liveTracking } from '@sdk/live-tracking.sdk'
import { LIVE_MAP_REFRESH_MS } from './live-map.logic'

export function useLiveMapRows() {
  return useQuery({ queryKey: ['live', 'map'], queryFn: () => liveTracking.mapCurrent(null), refetchInterval: LIVE_MAP_REFRESH_MS, refetchOnWindowFocus: true })
}
export function useLiveZones() {
  return useQuery({ queryKey: ['live', 'zones'], queryFn: () => liveTracking.zones(), staleTime: 5 * 60_000 })
}
