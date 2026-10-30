/**
 * 00384 — بقع التوقف (خريطة النفايات): قراءة الملخص المنسوخ ليلياً من مستودع GPS إلى المشروع الأول (gps_hotspots).
 * الواجهة لا تلمس المشروع الثاني أبداً؛ RLS/RPC تسمح لغرفة العمليات وIT والمدير العام فقط.
 */
import { supabase } from './client'
import { LvnSyncError } from './gps-lvn.sdk'

export type HotspotClass = 'light' | 'medium' | 'heavy'
export type HotspotRecurrence = 'once' | 'recurring' | 'frequent'
export interface GpsHotspotVehicle { device: string; name: string | null; db_number: string | null; sector: string | null; stops: number; minutes: number }
export interface GpsHotspot {
  id: number
  month: string
  wh_id: number
  lat: number
  lng: number
  stops_count: number
  days_count: number
  vehicles_count: number
  total_minutes: number
  avg_minutes: number
  max_minutes: number
  light_count: number
  medium_count: number
  heavy_count: number
  dominant_class: HotspotClass
  recurrence: HotspotRecurrence
  first_at: string | null
  last_at: string | null
  sector_ids: number[]
  sector_names: string[]
  /** 00387-ب: المنطقة جغرافياً من الزونات (null = خارج الزونات) */
  geo_sector_id?: number | null
  geo_sector_name?: string | null
  geo_zone_name?: string | null
  vehicles: GpsHotspotVehicle[]
  days: string[]
  hours: number[]
}
export interface GpsHotspotsSync { month: string; rows_count: number; thresholds: Record<string, number>; synced_at: string }
export interface GpsHotspotsMonth { month: string; rows: number; synced_at: string }
export interface GpsHotspotsList { month: string; rows: GpsHotspot[]; total: number; sync: GpsHotspotsSync | null; months: GpsHotspotsMonth[]; /** 00387-ب: بقع خارج كل الزونات */ unlocated?: number }
export interface GpsHotspotsFilters {
  /** YYYY-MM أو YYYY-MM-DD؛ null = آخر شهر منسوخ */
  month?: string | null
  /** null = كل الأصناف؛ الافتراضي في القاعدة = متوسط+ثقيل (الخفيف مخفي) */
  classes?: HotspotClass[] | null
  recurrence?: HotspotRecurrence[] | null
  minVehicles?: number
  sectorIds?: number[] | null
}

export interface GpsHotspotsMonthStats { month: string; spots: number; stops: number; total_minutes: number; multi_vehicle: number; by_class: Partial<Record<HotspotClass, number>>; by_recurrence: Partial<Record<HotspotRecurrence, number>>; by_sector: Array<{ sector_id: number; sector_name: string; spots: number }>; updated_at: string }

export const gpsHotspots = {
  /** 00385: إحصاء شهري دائم (يبقى بعد خروج الشهر من النافذة) — للمقارنة بين الأشهر */
  monthStats: async (): Promise<GpsHotspotsMonthStats[]> => {
    const { data, error } = await supabase.rpc('gps_hotspots_month_stats')
    if (error) throw new LvnSyncError(error.message)
    return (data ?? []) as unknown as GpsHotspotsMonthStats[]
  },
  list: async (f: GpsHotspotsFilters = {}): Promise<GpsHotspotsList> => {
    const { data, error } = await supabase.rpc('gps_hotspots_list', {
      p_month: f.month ? (f.month.length === 7 ? `${f.month}-01` : f.month) : null,
      p_classes: f.classes === undefined ? undefined : f.classes,
      p_recurrence: f.recurrence ?? null,
      p_min_vehicles: f.minVehicles ?? 1,
      p_sector_ids: f.sectorIds && f.sectorIds.length ? f.sectorIds : null,
    })
    if (error) throw new LvnSyncError(error.message)
    return data as unknown as GpsHotspotsList
  },
}
