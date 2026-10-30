import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { gpsHotspots } from '@sdk/gps-hotspots.sdk'

export const gpsHotspotsKeys = { list: (month: string | null) => ['gps-hotspots', 'list', month] as const }
/** يجلب كل أصناف الشهر مرة واحدة (classes=null) والفلترة محلية — البيانات تتغير مرة يومياً فقط */
export const useGpsHotspots = (month: string | null) =>
  useQuery({ queryKey: gpsHotspotsKeys.list(month), queryFn: () => gpsHotspots.list({ month, classes: null, recurrence: null, minVehicles: 1, sectorIds: null }), staleTime: 5 * 60_000, placeholderData: keepPreviousData, refetchInterval: 15 * 60_000 })
export const useGpsHotspotsMonthStats = () =>
  useQuery({ queryKey: ['gps-hotspots', 'month-stats'] as const, queryFn: gpsHotspots.monthStats, staleTime: 10 * 60_000 })
