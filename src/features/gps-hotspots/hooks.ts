import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { gpsHotspots } from '@sdk/gps-hotspots.sdk'

export const gpsHotspotsKeys = { list: (month: string | null) => ['gps-hotspots', 'list', month] as const }
/** يجلب كل أصناف الشهر مرة واحدة (classes=null) والفلترة محلية — البيانات تتغير مرة يومياً فقط */
/**
 * 00390: كان الشهر يُطلب أولاً بقيمة null (يختار الخادم أحدث شهر) ثم يُعاد الطلب بالشهر الافتراضي،
 * أي طلبان كاملان (~١٫٨ + ٢٫٨ م.ب) في كل فتح للخريطة. الآن يُمرَّر الشهر الافتراضي محسوباً من
 * `gps_hotspots_month_stats` (٦٠٠ بايت) فيبقى طلب واحد، و`enabled` يمنع طلب null العبثي.
 */
export const useGpsHotspots = (month: string | null, enabled = Boolean(month)) =>
  useQuery({ queryKey: gpsHotspotsKeys.list(month), enabled, queryFn: () => gpsHotspots.list({ month, classes: null, recurrence: null, minVehicles: 1, sectorIds: null, details: false }), staleTime: 5 * 60_000, placeholderData: keepPreviousData, refetchInterval: 15 * 60_000 })
export const useGpsHotspotsMonthStats = () =>
  useQuery({ queryKey: ['gps-hotspots', 'month-stats'] as const, queryFn: gpsHotspots.monthStats, staleTime: 10 * 60_000 })

/** 00405: تفاصيل البقعة تُجلب عند فتح اللوحة فقط (الآليات/الساعات/الأيام) — الحمولة من ٢٫٨ م.ب إلى ~٠٫٧ م.ب */
export const useGpsHotspotDetail = (id: number | null) =>
  useQuery({ queryKey: ['gps-hotspots', 'detail', id] as const, queryFn: () => gpsHotspots.details([id as number]), select: (rows) => rows[0] ?? null, enabled: id != null, staleTime: 10 * 60_000 })
