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
}
