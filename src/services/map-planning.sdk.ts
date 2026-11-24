/**
 * 20261122000600 — SDK التخطيط الجغرافي (الزونات · الشوارع · الأزقة · المحلات).
 *
 * المصدر الوحيد للقراءة والكتابة على جداول map_*. الحرّاس في القاعدة
 * (app.map_overlap_check) هي المرجع النهائي: هنا نُمرّر الأخطاء كما هي
 * حتى تعرضها الواجهة بنصّها العربي الجاهز (MAP_OVERLAP / MAP_CROSSING …).
 */
import { sdkGuard, supabase } from './client'
import type { ColumnSelection } from '@features/map-planning/export-columns'

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
  /** أطول مسافة بين عقدتين (متر) — فوق ١٥٠م الشكل المرسوم تقريبي */
  max_segment_m?: number | null
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
  /** أطول مسافة بين عقدتين (متر) — فوق ١٥٠م الشكل المرسوم تقريبي */
  max_segment_m?: number | null
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

/** يهرب محارف التعبير النمطي الخاصة — بادئة الكود بيانات لا نمط */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** أعلى رقم مستخدم لبادئة في زون — أساس الترقيم التالي */
export function nextCode(existing: readonly string[], prefix: string): string {
  let max = 0
  // البادئة تُهرَّب: بلا `escapeRegExp` كانت بادئة تحوي «.» تطابق أي حرف،
  // فتُقفز أرقام بأكواد زونات أخرى («.-0005» تُحسب من «X-0005»).
  const re = new RegExp(`^${escapeRegExp(prefix)}-(\\d+)$`)
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
  /**
   * زيارات أُسقطت لعدم إثباتها (مكوث ≤ 0 · نقاط < 3 · زقاق مغطّى ≥95% بشارع).
   * تُبلَّغ للمستخدم بدل إخفائها — «لا صفر كاذب» تعني أيضاً «لا صمت عن المسقَط».
   */
  skipped_visits: number
}

/** سطر من سجل شهادات البناء (gps_visit_builds) */
export interface VisitBuildRow {
  zone_id: string
  day: string
  status: 'built' | 'empty' | 'failed' | 'skipped'
  visits_created: number | null
  points_in_day: number | null
  points_at_build: string | null
  duration_ms: number | null
  error: string | null
  actor_name: string | null
  finished_at: string | null
}

/**
 * صفّ تشخيص جاهزية الزيارات (`public.map_visit_readiness`).
 *
 * `level = 'fleet'` صفّ واحد يجمع الأسطول كله: نقاط GPS غير منسوبة إلى زون في
 * القاعدة، فنسبتها إلى زون تحدث داخل المحرّك هندسياً. لذلك مجاميع النقاط
 * والربط والشهادة تُعرض مرة واحدة، ومجاميع الزيارات تُعرض لكل زون.
 */
export interface VisitReadinessRow {
  level: 'fleet' | 'zone'
  day: string
  zone_id: string | null
  zone_name: string | null
  points_total: number
  points_bound: number
  points_unbound: number
  devices_total: number
  devices_bound: number
  visits_total: number
  build_status: string | null
  build_at: string | null
  certified: boolean
  reason:
    | 'no_points'
    | 'unbound_devices'
    | 'needs_build'
    | 'visits_without_certificate'
    | 'certificate_stale'
    | 'built'
    | 'ok'
  reason_label: string
}

/** شدّة اللون في الواجهة بحسب السبب — سبب واحد لا مجموعة نصوص */
export const VISIT_READINESS_TONE: Record<VisitReadinessRow['reason'], 'ok' | 'warn' | 'danger' | 'info'> = {
  ok: 'ok',
  built: 'ok',
  no_points: 'danger',
  unbound_devices: 'danger',
  needs_build: 'warn',
  visits_without_certificate: 'warn',
  // بُني، لكن وصلت نقاط أحدث من البناء ⇒ الشهادة غير معتمدة. تحذير لا خطر:
  // البيانات سليمة، والحل إعادة استخراج لا إصلاح بيانات.
  certificate_stale: 'warn',
}

export interface BuildScanResult {
  ok: boolean
  from: string
  to: string
  built: number
  empty: number
  failed: number
  skipped: number
}

export interface CoverageRow {
  place_kind: 'street' | 'alley'
  places_total: number
  places_visited: number
  places_confirmed: number
  /** زِير لكن لم يتحقق شرطه — منفصل عن المؤكد عمداً */
  places_uncertain: number
  coverage_pct: number
}

/** حالة المكان في يوم — ثلاثية صريحة، لا «صفر كاذب» */
export type PlaceCoverageState = 'confirmed' | 'uncertain' | 'not_entered'

export function placeCoverageState(row: Pick<PlaceCoverageRow, 'visited' | 'confirmed'>): PlaceCoverageState {
  if (!row.visited) return 'not_entered'
  return row.confirmed ? 'confirmed' : 'uncertain'
}

/** صف تغطية مكان واحد (app.map_coverage_by_place) */
export interface PlaceCoverageRow {
  place_kind: 'street' | 'alley'
  place_id: string
  place_code: string
  place_name: string | null
  mahalla_code: string | null
  width_m: number | null
  length_m: number | null
  visited: boolean
  confirmed: boolean
  uncertain_visits: number
  visits_count: number
  first_entered_at: string | null
  last_exited_at: string | null
  total_dwell_seconds: number
  vehicles_count: number
  max_depth_m: number | null
}

/** صف أداء آلية (app.map_coverage_by_vehicle) */
export interface VehicleCoverageRow {
  vehicle_id: string
  vehicle_name: string | null
  db_number: string | null
  plate_number: string | null
  shift: string | null
  driver_name: string | null
  /** false = مؤرشفة أو غير مسجّلة — تظهر بصراحة لا تُخفى */
  in_fleet: boolean
  unbound_devices: number
  visits_count: number
  confirmed_count: number
  uncertain_count: number
  places_count: number
  total_dwell_seconds: number
  first_at: string | null
  last_at: string | null
}

export interface ZoneCoverageRollup {
  places_total: number
  places_visited: number
  places_confirmed: number
  places_uncertain: number
  places_not_entered: number
  visits_total: number
  visits_confirmed: number
  visits_uncertain: number
  coverage_pct: number
  confirmed_pct: number
  uncertain_pct: number
  vehicles_active: number
  total_dwell_seconds: number
}

export interface TrendRow {
  day: string
  places_total: number
  places_visited: number
  places_confirmed: number
  places_uncertain: number
  coverage_pct: number
  visits_total: number
}

export const SHIFT_LABEL_AR: Record<string, string> = {
  morning: 'صباحي',
  evening: 'مسائي',
  night: 'ليلي',
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

// ── الزيارة المُثراة: سائق، شفت، مسؤول (الجولة ٦) ─────────────────────────
/** مصدر الشفت/السائق: من انطلاقية اليوم (دقيق) أم من سجل الآلية (بديل موسوم) */
export type ShiftSource = 'departure' | 'vehicle' | 'none'

export const SHIFT_SOURCE_LABEL_AR: Record<ShiftSource, string> = {
  departure: 'من انطلاقية اليوم',
  vehicle: 'من سجل الآلية',
  none: 'غير معروف',
}

export interface EnrichedVisit extends MapVisit {
  vehicle_name: string | null
  db_number: string | null
  /** السائق الفعلي لليوم إن وُجدت انطلاقية، وإلا السائق الثابت للآلية */
  driver_name: string | null
  shift: string | null
  shift_source: ShiftSource
  driver_source: ShiftSource
  department_manager_names: string | null
  sector_id: number | null
  sector_name: string | null
}

export interface VehicleDayRow {
  vehicle_id: string
  vehicle_name: string
  db_number: string
  plate_number: string
  fleet_shift: string | null
  fleet_driver: string | null
  shift: string | null
  driver_name: string | null
  shift_source: ShiftSource
  visits_count: number
  confirmed_count: number
  uncertain_count: number
  places_count: number
  total_dwell_seconds: number
  first_at: string | null
  last_at: string | null
}

export interface UnvisitedEnriched {
  place_kind: 'street' | 'alley'
  place_id: string
  place_code: string
  place_name: string | null
  mahalla_code: string | null
  length_m: number | null
  width_m: number | null
  department_manager_names: string | null
}

/**
 * مصدر محلة الصف في التقرير المُجمَّع.
 *
 * **قرار المستخدم (2026-11-19): لا محلة للشوارع — لا اشتقاق ولا تخمين.**
 * `map_streets` لا يحمل `mahalla_id`، وهذا صحيح ومقصود: الفحص أظهر أن ٥٦٪
 * من الشوارع تلامس محلّتين أو أكثر (أقصاها ٦)، و٥٥٪ من نقاطها لا زقاق ضمن
 * ٦٠م منها. فنِسبتُها إلى محلة ستكون صحيحة في نصف الحالات فقط.
 *
 * لذلك أنواع الصفوف ثلاثة:
 *   actual  — صف أزقة: محلة الزقاق مسجَّلة في القاعدة (١٠٠٪ من الأزقة)
 *   street  — صف شوارع: بلا محلة، بأمانة — لا رقم مخترع
 *   unknown — زقاق بلا محلة (لا يحدث اليوم، محفوظ للاحتياط)
 */
export type MahallaSource = 'actual' | 'street' | 'unknown'

export const MAHALLA_SOURCE_LABEL_AR: Record<MahallaSource, string> = {
  actual: 'مؤكدة',
  street: 'بلا محلة',
  unknown: 'غير معروفة',
}

export const MAHALLA_SOURCE_HINT_AR: Record<MahallaSource, string> = {
  actual: 'محلة الزقاق مسجَّلة في قاعدة البيانات',
  street: 'صف شوارع — الشوارع لا تحمل محلة في الخريطة، ولا تُنسب إلى محلة تخميناً',
  unknown: 'زقاق بلا محلة في القاعدة — يحتاج ربطاً',
}

/** سائق في قائمة فلتر السائق — من قاد آلية فعلاً في الزون والمدى */
export interface GroupedDriver {
  driver_id: string
  driver_name: string
  vehicles_count: number
}

/** صف التقرير المُجمَّع: آلية ← سائق ← محلة ← (شارع · أزقة) */
export interface GroupedVisitRow {
  zone_id: string
  zone_name: string | null
  placeday: string
  vehicle_id: string | null
  db_number: string | null
  plate_number: string | null
  vehicle_name: string | null
  driver_name: string | null
  shift: string | null
  mahalla_code: string | null
  mahalla_number: string | null
  mahalla_name: string | null
  /** أسماء الشوارع مفصولة بـ« · » */
  street_names: string | null
  street_mahalla_source: MahallaSource
  /** أسماء الأزقة كاملة مفصولة بـ« · » */
  alley_names: string | null
  /** أرقام الأزقة فقط، مفصولة بفاصلة — كما في الورقة المعتمدة */
  alley_week_or_num: string | null
  alleys_count: number
  streets_count: number
  visits_count: number
  confirmed_count: number
  uncertain_count: number
  total_dwell_seconds: number
  first_entered_at: string | null
  last_exited_at: string | null
  avg_dwell_seconds: number
  max_depth_m: number | null
}

/** لا نُخفي معلومة: هل هذا الشفت مؤكد من انطلاقية أم من سجل الآلية؟ */
export function shiftCaveat(r: { shift_source: ShiftSource }): string | null {
  return r.shift_source === 'vehicle' ? 'لم تُسجَّل انطلاقية — الشفت من سجل الآلية' : null
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
  /**
   * حفظ شارع (إدراج أو تحديث).
   *
   * ⚠ عيب أُصلح — سبب «خطأ عند تعديل الشارع»:
   *   كان يكتب `width_m: input.width_m ?? null` و`is_bridge: input.is_bridge ?? false`
   *   دائماً. وعمود `map_streets.width_m` هو **NOT NULL default 6.0**، والمحرّر
   *   لا يرسل عرضاً ⇒ يصل `null` ⇒ ترفض القاعدة الطلب بـ
   *   `23502 not_null_violation` ⇒ **كل** حفظ شارع يفشل برسالة إنجليزية.
   *   والدليل في الإنتاج: صفر صفّ في `map_edit_log`، وصفر شارع بعرض ≠ 6.0.
   *
   *   والإصلاح ليس «املأ null بستة»: تمرير `is_bridge: false` كان **يمسح**
   *   صفة الجسر من أي جسر عند مجرّد تغيير اسمه (تحقّقنا عملياً: true ⇒ false).
   *
   *   القاعدة الآن: الحقل الغائب **لا يُكتب**. الموجود في القاعدة يبقى،
   *   والإدراج الجديد يأخذ افتراضيات العمود.
   */
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
    const row: Record<string, unknown> = {
      zone_id: input.zone_id,
      code: input.code,
      name: input.name,
      kind: input.kind,
      path: input.path,
    }
    // الحقول الاختيارية تُضاف فقط عند تمريرها صراحةً — `null` يعني «لا تلمس»
    if (input.width_m !== undefined && input.width_m !== null) row.width_m = input.width_m
    if (input.is_bridge !== undefined) row.is_bridge = input.is_bridge

    const q = input.id
      ? supabase.from('map_streets').update(row).eq('id', input.id).select().single()
      : supabase.from('map_streets').insert(row).select().single()
    return sdkGuard(q)
  },

  /** حفظ زقاق — نفس قانون العرض أعلاه: `map_alleys.width_m` NOT NULL default 3.0 */
  async saveAlley(input: {
    id?: string
    zone_id: string
    mahalla_id: string
    code: string
    name: string | null
    path: MapPoint[]
    width_m?: number | null
  }): Promise<MapAlley> {
    const row: Record<string, unknown> = {
      zone_id: input.zone_id,
      mahalla_id: input.mahalla_id,
      code: input.code,
      name: input.name,
      path: input.path,
    }
    if (input.width_m !== undefined && input.width_m !== null) row.width_m = input.width_m

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
   * بناء زيارات **يوم بغدادي واحد** مع تسجيل الشهادة في `gps_visit_builds`.
   *
   * `p_day` تاريخ فقط (YYYY-MM-DD) والخادم يحسب حدود اليوم بتوقيت بغداد
   * (`app.map_day_bounds`). السبب: الكود السابق كان يرسل `T00:00:00Z`–`T23:59:59Z`
   * فيغطي 03:00 بغداد ليوم D حتى 02:59 بغداد ليوم D+1 — أي يوم UTC لا يوم بغداد.
   *
   * الشهادة شرط حذف النقاط الخام: لا يُحذف يوم من `gps_device_position_history`
   * قبل أن يبني هذا الاستدعاء زياراته بنجاح.
   */
  async buildVisits(input: { zoneId: string; day: string }): Promise<VisitBuildResult & { day: string; points: number }> {
    const { data, error } = await supabase.rpc('map_visit_build_logged', {
      p_zone: input.zoneId,
      p_day: input.day,
    })
    if (error) throw new Error(error.message)
    const r = (data ?? {}) as Record<string, unknown>
    return {
      visits_created: Number(r.visits_created ?? 0),
      visits_merged: Number(r.visits_merged ?? 0),
      places_scanned: Number(r.places_scanned ?? 0),
      skipped_visits: Number(r.skipped_visits ?? 0),
      day: String(r.day ?? input.day),
      points: Number(r.points ?? 0),
    }
  },

  /** شهادات البناء لكل زون في يوم — أساس شارة «محمي/غير محمي» في الواجهة */
  async visitBuildLedger(day: string): Promise<VisitBuildRow[]> {
    const { data, error } = await supabase
      .from('gps_visit_builds')
      .select('zone_id, day, status, visits_created, points_in_day, points_at_build, duration_ms, error, actor_name, finished_at')
      .eq('day', day)
    if (error) throw new Error(error.message)
    return (data ?? []) as VisitBuildRow[]
  },

  /** هل بُني هذا اليوم بالكامل؟ (كل الزونات) — شرط الحذف */
  async isDayCertified(day: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('map_day_is_certified', { p_day: day })
    if (error) throw new Error(error.message)
    return data === true
  },

  /** تشغيل البناء الآلي المتأخر بعد سحب تاريخ من المزوّد */
  async runBuildScan(lookbackDays = 4): Promise<BuildScanResult> {
    const { data, error } = await supabase.rpc('gps_visits_build_run', { p_lookback_days: lookbackDays })
    if (error) throw new Error(error.message)
    return data as BuildScanResult
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

  // ── إحصاءات التغطية (المرحلة ⑥) ─────────────────────────────────────────
  /** كل مكان في الزون مع حالته في يوم بغداد */
  async coverageByPlace(zoneId: string, day: string, kind?: 'street' | 'alley'): Promise<PlaceCoverageRow[]> {
    const { data, error } = await supabase.rpc('map_coverage_by_place', {
      p_zone: zoneId,
      p_day: day,
      p_kind: kind ?? null,
    })
    if (error) throw new Error(error.message)
    return (data ?? []) as PlaceCoverageRow[]
  },

  /** أداء كل آلية متتبَّعة — تشمل المؤرشفة بصراحة */
  async coverageByVehicle(zoneId: string, day: string): Promise<VehicleCoverageRow[]> {
    const { data, error } = await supabase.rpc('map_coverage_by_vehicle', {
      p_zone: zoneId,
      p_day: day,
    })
    if (error) throw new Error(error.message)
    return (data ?? []) as VehicleCoverageRow[]
  },

  /** ملخص الزون في يوم — النسب الثلاث منفصلة */
  async coverageRollup(zoneId: string, day: string): Promise<ZoneCoverageRollup | null> {
    const { data, error } = await supabase.rpc('map_coverage_rollup', {
      p_zone: zoneId,
      p_day: day,
    })
    if (error) throw new Error(error.message)
    const row = Array.isArray(data) ? data[0] : data
    return (row ?? null) as ZoneCoverageRollup | null
  },

  /** الأماكن التي لم تُدخل — أهم مخرَج للمفتّش */
  async unvisitedPlaces(zoneId: string, day: string, kind?: 'street' | 'alley'): Promise<PlaceCoverageRow[]> {
    const { data, error } = await supabase.rpc('map_unvisited_places', {
      p_zone: zoneId,
      p_day: day,
      p_kind: kind ?? null,
    })
    if (error) throw new Error(error.message)
    return ((data ?? []) as Pick<PlaceCoverageRow, 'place_kind' | 'place_id' | 'place_code' | 'place_name' | 'mahalla_code' | 'length_m' | 'width_m'>[])
      .map((r) => ({ ...r, visited: false, confirmed: false } as PlaceCoverageRow))
  },

  /** اتجاه التغطية لآخر N يوماً */
  async coverageTrend(zoneId: string, until: string, days = 14): Promise<TrendRow[]> {
    const { data, error } = await supabase.rpc('map_coverage_trend', {
      p_zone: zoneId,
      p_until: until,
      p_days: days,
    })
    if (error) throw new Error(error.message)
    return (data ?? []) as TrendRow[]
  },

  // ── تفضيلات التصدير وسجلّه (المرحلة ⑦) ──────────────────────────────────
  /** تفضيل المستخدم الحالي — مصفوفة فارغة إن لم يحفظ بعد */
  async exportPrefsGet(kind: 'places' | 'visits'): Promise<ColumnSelection[]> {
    const { data, error } = await supabase.rpc('map_export_prefs_get', { p_kind: kind })
    if (error) throw new Error(error.message)
    return (Array.isArray(data) ? data : []) as ColumnSelection[]
  },

  async exportPrefsSet(kind: 'places' | 'visits', columns: ColumnSelection[]): Promise<void> {
    // نُمرّر الحقول الثلاثة فقط — لا نُرسل دوال أو حقولاً دخيلة إلى القاعدة
    const clean = columns.map((c) => ({ id: c.id, visible: c.visible, order: c.order }))
    const { error } = await supabase.rpc('map_export_prefs_set', { p_kind: kind, p_columns: clean })
    if (error) throw new Error(error.message)
  },

  /** أثر التصدير — يُستدعى بعد بناء الملف بنجاح */
  async exportLogAdd(input: {
    zoneId: string
    kind: 'places' | 'visits'
    from: string
    to: string
    rowCount: number
    columns: ColumnSelection[]
  }): Promise<void> {
    const clean = input.columns.map((c) => ({ id: c.id, visible: c.visible, order: c.order }))
    const { error } = await supabase.rpc('map_export_log_add', {
      p_zone: input.zoneId,
      p_kind: input.kind,
      p_from: input.from,
      p_to: input.to,
      p_rows: input.rowCount,
      p_columns: clean,
    })
    if (error) throw new Error(error.message)
  },

  // ── الزيارات المُثراة (الجولة ٦) ─────────────────────────────────────────
  /** زيارات يوم بغداد مع السائق والشفت ومسؤول القسم */
  async visitsEnriched(
    zoneId: string, day: string, vehicleId?: string | null, kind?: 'street' | 'alley',
  ): Promise<EnrichedVisit[]> {
    const { data, error } = await supabase.rpc('map_visits_enriched', {
      p_zone: zoneId, p_day: day,
      p_vehicle: vehicleId ?? null, p_kind: kind ?? null,
    })
    if (error) throw new Error(error.message)
    return (data ?? []) as EnrichedVisit[]
  },

  /** أداء الآليات في يوم — الشفت والسائق من الانطلاقية إن وُجدت */
  async vehiclesDay(zoneId: string, day: string): Promise<VehicleDayRow[]> {
    const { data, error } = await supabase.rpc('map_vehicles_day', { p_zone: zoneId, p_day: day })
    if (error) throw new Error(error.message)
    return (data ?? []) as VehicleDayRow[]
  },

  /** الأماكن التي لم تُدخل + مسؤول قسمها */
  async unvisitedEnriched(zoneId: string, day: string, kind?: 'street' | 'alley'): Promise<UnvisitedEnriched[]> {
    const { data, error } = await supabase.rpc('map_unvisited_enriched', {
      p_zone: zoneId, p_day: day, p_kind: kind ?? null,
    })
    if (error) throw new Error(error.message)
    return (data ?? []) as UnvisitedEnriched[]
  },

  /** مسؤولو الأقسام لقواطع — للعرض في رأس التقرير */
  async sectorManagers(sectors: number[]): Promise<{ sector_id: number; manager_names: string | null; manager_shifts: string | null; managers_count: number }[]> {
    const { data, error } = await supabase.rpc('map_sector_managers', { p_sectors: sectors })
    if (error) throw new Error(error.message)
    return (data ?? []) as { sector_id: number; manager_names: string | null; manager_shifts: string | null; managers_count: number }[]
  },

  /**
   * التقرير المُجمَّع بشكل ورقة الشركة: صف لكل (آلية × يوم × محلة).
   *
   * كل الفلاتر اختيارية — `null` يعني «بلا قيد». هذا هو المدخل الموحّد
   * للتصدير المعتمد وللطباعة، فلا ينحرف ملف Excel عن الشاشة.
   */
  async vehicleVisitsGrouped(input: {
    zoneId: string
    from: string
    to: string
    vehicleId?: string | null
    shift?: string | null
    status?: 'confirmed' | 'uncertain' | null
    mahalla?: string | null
    /**
     * الافتراضي `true`: لا تظهر آلية مربوطة بزون إلا في زونها.
     * طلب المستخدم: «لا يهمني أي بيانات لهذه الآلية خارج زون الأرخيته».
     * آلية بلا `map_zone_id` تظهر في كل مكان دائماً — لا نحجب ما لا تصنيف له.
     */
    respectVehicleZone?: boolean
    /** السائق (employee_id) — يعمل على أي آلية كان يقودها */
    driverId?: string | null
    /** نوع المكان: 'alley' | 'street' | null */
    kind?: 'alley' | 'street' | null
    /** true ⇒ المؤكد فقط (استبعاد الزيارات غير المؤكدة) */
    confirmedOnly?: boolean
  }): Promise<GroupedVisitRow[]> {
    const { data, error } = await supabase.rpc('map_vehicle_visits_grouped', {
      p_zone: input.zoneId,
      p_from: input.from,
      p_to: input.to,
      p_vehicle: input.vehicleId ?? null,
      p_shift: input.shift ?? null,
      p_status: input.status ?? null,
      p_mahalla: input.mahalla ?? null,
      p_respect_vehicle_zone: input.respectVehicleZone ?? true,
      p_driver: input.driverId ?? null,
      p_kind: input.kind ?? null,
      p_confirmed: input.confirmedOnly ? true : null,
    })
    if (error) throw new Error(error.message)
    return (data ?? []) as GroupedVisitRow[]
  },

  /**
   * سائقو التقرير: من قاد آلية فعلاً في هذا الزون وهذا المدى.
   * تُطبّق نفس قيد الزون المطبَّق في التقرير — لا سائق بلا صف.
   */
  async groupedDrivers(input: {
    zoneId: string
    from: string
    to: string
  }): Promise<GroupedDriver[]> {
    const { data, error } = await supabase.rpc('map_grouped_drivers', {
      p_zone: input.zoneId,
      p_from: input.from,
      p_to: input.to,
    })
    if (error) throw new Error(error.message)
    return (data ?? []) as GroupedDriver[]
  },

  /**
   * تشخيص «لماذا لا تظهر زيارات؟» — قراءة فقط، بلا بناء ولا حذف.
   *
   * يُرجع صفّ الأسطول أولاً ثم صفّاً لكل زون، مع `reason` صريح. الشاشة تعرضه
   * بدل جملة «لا زيارات» التي تُخفي الفرق بين «لم يصل شيء» و«وصل ولم يُربط».
   */
  async visitReadiness(day: string, zoneId?: string | null): Promise<VisitReadinessRow[]> {
    const { data, error } = await supabase.rpc('map_visit_readiness', {
      p_day: day,
      p_zone: zoneId ?? null,
    })
    if (error) throw new Error(error.message)
    return (data ?? []) as VisitReadinessRow[]
  },

  // ── الأرشيف والاحتفاظ (الجولة ④) ─────────────────────────────────────────

  /** صفوف زيارات ليوم بغداد أو مدى — مصدر التصدير قبل الحذف. */
  async visitReports(input: { from: string; to?: string; zoneId?: string | null }): Promise<VisitReportRow[]> {
    const { data, error } = await supabase.rpc('gps_visit_reports', {
      p_from: input.from,
      p_to: input.to ?? input.from,
      p_zone: input.zoneId ?? null,
    })
    if (error) throw new Error(error.message)
    return (data ?? []) as VisitReportRow[]
  },

  /**
   * حارس التصدير قبل الحذف — يوم بيوم.
   *
   * **تُبلّغ ولا تحذف.** الحذف عبر شاشة الاحتفاظ (data_retention_*) التي تفرض
   * التصدير على مستوى الطلب. الفرق أن هذه تفحص كل يوم على حدة، فتمنع
   * «٢٩ يوماً صُدِّرت ويوم أُبيد بلا نسخة».
   */
  async visitPurgeGuard(input: { cutoff: string; keepDays?: number }): Promise<VisitPurgeVerdict[]> {
    const { data, error } = await supabase.rpc('map_visits_purge_guard', {
      p_cutoff: input.cutoff,
      p_keep_days: input.keepDays ?? 30,
    })
    if (error) throw new Error(error.message)
    return (data ?? []) as VisitPurgeVerdict[]
  },
}

// ═══════════════════════════════════════════════════════════════════════════════
// الأرشيف والاحتفاظ (20261128000400 — الجولة ④)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * صفّ تصدير زيارة — مصدر الأرشيف قبل الحذف.
 *
 * **لا يقرأ نقاط GPS الخام** (قد تكون حُذفت بعد ٤٨ ساعة). صفوف `map_visits`
 * وحدها. وعند الحاجة لعدد صفوف دقيق لطلب الحذف: خُذ `visits_count` من أول
 * صفّ — لا `rows.length` إن كنت تُفلتر في العميل.
 */
export interface VisitReportRow {
  placeday: string
  zone_id: string | null
  zone_name: string | null
  vehicle_id: string | null
  db_number: string | null
  driver_name: string | null
  mahalla_number: string | null
  place_kind: 'alley' | 'street' | null
  place_name: string | null
  entered_at: string | null
  exited_at: string | null
  dwell_seconds: number | null
  points_count: number | null
  status: string | null
  /** ⚠ العدد الكلي كما في القاعدة — ثابت في كل صفّ */
  visits_count: number
  zones_count: number
  days_count: number
}

/**
 * حكم يوم واحد في حارس الحذف.
 *
 * `exported` = يوجد طلب احتفاظ قاطعه **بعد** هذا اليوم (المحرك يحذف < cutoff).
 * `can_purge` = الطلب مُثبت ببصمة أو بعدد صفوف. الفرق مقصود: طلب بلا بصمة
 * قيده «قيد التنفيذ» لا «مُثبت» — ويجب ألا يُجيز حذفاً.
 */
export interface VisitPurgeVerdict {
  placeday: string
  visits: number
  days_old: number
  exported: boolean
  can_purge: boolean
  reason: string
}
