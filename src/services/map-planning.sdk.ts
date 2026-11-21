/**
 * 20261122000600 — SDK التخطيط الجغرافي (الزونات · الشوارع · الأزقة · المحلات).
 *
 * المصدر الوحيد للقراءة والكتابة على جداول map_*. الحرّاس في القاعدة
 * (app.map_overlap_check) هي المرجع النهائي: هنا نُمرّر الأخطاء كما هي
 * حتى تعرضها الواجهة بنصّها العربي الجاهز (MAP_OVERLAP / MAP_CROSSING …).
 */
import { sdkGuard, supabase } from './client'

// ── الأنواع ────────────────────────────────────────────────────────────────
export type MapZoneCode = 'ARK' | 'RTH' | 'WTH' | 'JAD'
export type StreetKind = 'primary' | 'secondary' | 'tertiary' | 'local'
export type MapStatus = 'draft' | 'verified' | 'archived'

/** نقطة: [lat, lng] — التنسيق المخزَّن في القاعدة */
export type MapPoint = [number, number]

export interface MapZone {
  id: string
  geofence_id: string
  code: string
  name: string
  sector_id: number | null
  created_at: string
}

export interface MapStreet {
  id: string
  zone_id: string
  code: string
  name: string | null
  kind: StreetKind
  path: MapPoint[]
  length_m: number
  width_m: number | null
  width_source: string | null
  is_bridge: boolean
  status: MapStatus
  osm_way_id: number | null
  confirmed_at: string | null
}

export interface MapAlley {
  id: string
  zone_id: string
  mahalla_id: string | null
  code: string
  name: string | null
  path: MapPoint[]
  length_m: number
  width_m: number | null
  width_source: string | null
  status: MapStatus
  osm_way_id: number | null
  /** كود المحلة — من join، للعرض والفلترة */
  mahalla_code?: string | null
  mahalla_name?: string | null
}

export interface MapMahalla {
  id: string
  zone_id: string
  code: string
  osm_number: string | null
  name: string
  boundary_state: string
}

export interface MapGeometryReview {
  id: string
  zone_id: string
  table_name: 'map_streets' | 'map_alleys'
  record_code: string
  other_code: string
  kind: 'crossing' | 'near_parallel'
  detail: Record<string, unknown>
  reviewed: boolean
  decision: 'ok' | 'fix_needed' | 'merged' | 'ignored' | null
  created_at: string
}

export interface MapImportSkip {
  id: string
  zone_id: string
  table_name: 'map_streets' | 'map_alleys'
  code: string
  name: string | null
  error_code: string | null
  error_msg: string
  created_at: string
}

// ── الأكواد: توليد تسلسلي بادئته بحسب التصنيف ───────────────────────────────
export const STREET_PREFIX: Record<StreetKind, string> = {
  primary: 'STR',
  secondary: 'SEC',
  tertiary: 'TRC',
  local: 'LOC',
}

export const KIND_LABEL_AR: Record<StreetKind, string> = {
  primary: 'رئيسي',
  secondary: 'ثانوي',
  tertiary: 'ثالثة',
  local: 'محلي',
}

export const STATUS_LABEL_AR: Record<MapStatus, string> = {
  draft: 'مسودة',
  verified: 'مؤكَّد',
  archived: 'مؤرشف',
}

/** أعلى رقم مستخدم لبادئة في زون — أساس الترقيم التالي */
export function nextCode(existing: readonly string[], prefix: string): string {
  let max = 0
  const re = new RegExp(`^${prefix}-(\\d+)$`)
  for (const code of existing) {
    const m = re.exec(code)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`
}

// ── الزيارات والتغطية (المرحلة ⑤/⑥) ───────────────────────────────────────
/**
 * حالة الزيارة — ثلاث حالات صريحة في العرض، مصدرها حقلان في القاعدة:
 *   confirmed  = تحققت المعايير الثلاثة (عمق + مكوث + تقارب)
 *   uncertain  = تحقق بعضها، و`reason` يشرح أيّها غاب
 *   (لا صف)    = لم تُدخل أصلاً — لا يُعرَض كـ«صفر تغطية»
 */
export type VisitStatus = 'confirmed' | 'uncertain'

export const VISIT_STATUS_LABEL_AR: Record<'confirmed' | 'uncertain' | 'not_entered', string> = {
  confirmed: 'مؤكد',
  uncertain: 'غير مؤكد',
  not_entered: 'لم تُدخل',
}

export interface MapVisit {
  id: string
  zone_id: string
  vehicle_id: string | null
  device_id: string | null
  place_kind: 'street' | 'alley'
  place_id: string
  place_code: string
  place_name: string | null
  placeday: string
  seq: number
  entered_at: string
  exited_at: string | null
  dwell_seconds: number | null
  points_count: number
  max_depth_m: number | null
  status: VisitStatus
  reason: string | null
  created_at: string
}

export interface VisitBuildResult {
  visits_created: number
  visits_merged: number
  places_scanned: number
}

export interface CoverageRow {
  place_kind: 'street' | 'alley'
  places_total: number
  places_visited: number
  places_confirmed: number
  coverage_pct: number
}

/** تنسيق المكوث: 90 ⇒ «1 د 30 ث» · 8 ⇒ «8 ث» */
export function formatDwell(seconds: number | null): string {
  if (seconds === null) return '—'
  const s = Math.max(0, Math.round(seconds))
  const m = Math.floor(s / 60)
  return m > 0 ? `${m} د ${s % 60} ث` : `${s} ث`
}

/** حالة العرض الثلاثية: زيارة غير موجودة = «لم تُدخل» وليست صفراً */
export function visitDisplayStatus(visit: MapVisit | null | undefined): 'confirmed' | 'uncertain' | 'not_entered' {
  return visit ? visit.status : 'not_entered'
}

// ── القراءة ────────────────────────────────────────────────────────────────
export const mapPlanningSdk = {
  /** الزونات المخطَّطة (مع عدد عناصر كل زون) */
  async zones(): Promise<MapZone[]> {
    return sdkGuard(supabase.from('map_zones').select('*').order('code'))
  },

  async streets(zoneId: string): Promise<MapStreet[]> {
    return sdkGuard(
      supabase.from('map_streets').select('*').eq('zone_id', zoneId).order('code'),
    )
  },

  async alleys(zoneId: string): Promise<MapAlley[]> {
    return sdkGuard(
      supabase
        .from('map_alleys')
        .select('*, mahalla:map_mahallas(code, name)')
        .eq('zone_id', zoneId)
        .order('code'),
    ).then((rows) =>
      (rows as unknown as (MapAlley & { mahalla?: { code: string; name: string } | null })[]).map(
        (r) => ({
          ...r,
          mahalla_code: r.mahalla?.code ?? null,
          mahalla_name: r.mahalla?.name ?? null,
        }),
      ),
    )
  },

  async mahallas(zoneId: string): Promise<MapMahalla[]> {
    return sdkGuard(
      supabase.from('map_mahallas').select('*').eq('zone_id', zoneId).order('code'),
    )
  },

  /** مراجعات الهندسة (تقاطعات مسموحة تنتظر قراراً) */
  async reviews(zoneId: string, onlyPending = true): Promise<MapGeometryReview[]> {
    let q = supabase.from('map_geometry_reviews').select('*').eq('zone_id', zoneId)
    if (onlyPending) q = q.eq('reviewed', false)
    return sdkGuard(q.order('created_at', { ascending: false }))
  },

  /** العناصر التي رفضها الاستيراد — لا تُسقط بصمت */
  async skips(zoneId: string): Promise<MapImportSkip[]> {
    return sdkGuard(
      supabase.from('map_import_skips').select('*').eq('zone_id', zoneId).order('code'),
    )
  },

  // ── الكتابة ──────────────────────────────────────────────────────────────
  async saveStreet(input: {
    id?: string
    zone_id: string
    code: string
    name: string | null
    kind: StreetKind
    path: MapPoint[]
    width_m?: number | null
    is_bridge?: boolean
  }): Promise<MapStreet> {
    const row = {
      zone_id: input.zone_id,
      code: input.code,
      name: input.name,
      kind: input.kind,
      path: input.path,
      width_m: input.width_m ?? null,
      is_bridge: input.is_bridge ?? false,
    }
    const q = input.id
      ? supabase.from('map_streets').update(row).eq('id', input.id).select().single()
      : supabase.from('map_streets').insert(row).select().single()
    return sdkGuard(q)
  },

  async saveAlley(input: {
    id?: string
    zone_id: string
    mahalla_id: string
    code: string
    name: string | null
    path: MapPoint[]
    width_m?: number | null
  }): Promise<MapAlley> {
    const row = {
      zone_id: input.zone_id,
      mahalla_id: input.mahalla_id,
      code: input.code,
      name: input.name,
      path: input.path,
      width_m: input.width_m ?? null,
    }
    const q = input.id
      ? supabase.from('map_alleys').update(row).eq('id', input.id).select().single()
      : supabase.from('map_alleys').insert(row).select().single()
    return sdkGuard(q)
  },

  async archiveStreet(id: string): Promise<void> {
    return sdkGuard(
      supabase.from('map_streets').update({ status: 'archived' }).eq('id', id).select().maybeSingle(),
    )
  },

  async archiveAlley(id: string): Promise<void> {
    return sdkGuard(
      supabase.from('map_alleys').update({ status: 'archived' }).eq('id', id).select().maybeSingle(),
    )
  },

  /** قرار المشرف على تقاطع مسجَّل */
  async decideReview(id: string, decision: MapGeometryReview['decision']): Promise<void> {
    return sdkGuard(
      supabase
        .from('map_geometry_reviews')
        .update({ reviewed: true, decision, reviewed_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .maybeSingle(),
    )
  },

  /** ربط زقاق بمحلته (من قائمة MHL-0000) */
  async linkAlleyMahalla(alleyId: string, mahallaId: string): Promise<void> {
    return sdkGuard(
      supabase
        .from('map_alleys')
        .update({ mahalla_id: mahallaId, link_source: 'manual' })
        .eq('id', alleyId)
        .select()
        .maybeSingle(),
    )
  },

  // ── الزيارات (المرحلة ⑤) ─────────────────────────────────────────────────
  /** زيارات زون في يوم، مرتّبة زمنياً */
  async visits(zoneId: string, day: string): Promise<MapVisit[]> {
    return sdkGuard(
      supabase
        .from('map_visits')
        .select('*')
        .eq('zone_id', zoneId)
        .eq('placeday', day)
        .order('entered_at'),
    )
  },

  /**
   * تشغيل المحرّك على نافذة زمنية. `replace=true` يجعل النتيجة idempotent:
   * إعادة التشغيل تحذف زيارات النافذة أولاً ثم تعيد بنائها.
   */
  async buildVisits(input: {
    zoneId: string
    from: string
    to: string
    vehicleId?: string | null
  }): Promise<VisitBuildResult> {
    const { data, error } = await supabase.rpc('map_build_visits', {
      p_zone: input.zoneId,
      p_from: input.from,
      p_to: input.to,
      p_vehicle: input.vehicleId ?? null,
    })
    if (error) throw new Error(error.message)
    const row = (Array.isArray(data) ? data[0] : data) as VisitBuildResult | null
    return row ?? { visits_created: 0, visits_merged: 0, places_scanned: 0 }
  },

  /** ملخّص التغطية لزون/يوم — صفّان: street و alley */
  async coverage(zoneId: string, day: string): Promise<CoverageRow[]> {
    const { data, error } = await supabase.rpc('map_coverage_summary', {
      p_zone: zoneId,
      p_day: day,
    })
    if (error) throw new Error(error.message)
    return (data ?? []) as CoverageRow[]
  },
}
