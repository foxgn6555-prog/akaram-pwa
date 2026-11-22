/**
 * 20261122001300 — SDK استيراد الخريطة (الدفعات · سكربت ZON · الإحصاءات).
 *
 * المسؤولية الوحيدة: التحدّث إلى القاعدة. **لا يقرأ ملفات OSM ولا يُحلّل XML** —
 * ذلك في `features/map-import/lib/osm-stream.ts` داخل المتصفح، والملف لا يُرسل للخادم.
 *
 * كل ما يُرسل هنا هو **الصفوف الجاهزة** (`ImportRow` بعد التصنيف والقصّ)، على دفعات.
 * الدالة `app.map_import_batch` هي المرجع النهائي للحرّاس والتفريد — هنا نُمرّر الأخطاء كما هي.
 */
import { sdkGuard, supabase } from './client'
import { SDKError } from '@lib/errors/SDKError'
import type { ImportRow } from '@features/map-import/lib/assemble'
import type { MapPoint } from './map-planning.sdk'

// ── الأنواع ────────────────────────────────────────────────────────────────
export type ImportKind = 'primary' | 'secondary' | 'tertiary' | 'local' | 'alley'

/** صف واحد كما تستقبله `app.map_import_batch` (مفتاح `path` = [[lat,lng],…]) */
export interface ImportBatchRow {
  code: string
  kind: ImportKind
  name: string | null
  width_m: number | null
  width_source: string | null
  osm_way_id: number | null
  link_source: string | null
  mahalla_num: string | null
  path: MapPoint[]
}

/** محلة واحدة مرسلة مع الدفعة */
export interface ImportBatchMahalla {
  code: string
  osm_number: string | null
  name: string
}

/** ردّ `app.map_import_batch` */
export interface ImportBatchResult {
  batch_id: string | null
  inserted: number
  updated: number
  skipped: number
  errors: { code: string; kind?: string; error: string }[]
}

/**
 * شوط في القاعدة لا وجود له في الملف الجديد — «صف يتيم».
 *
 * ينشأ حين يُحذف الطريق من OSM (أو يُدمج، أو يُعاد رسمه بمعرّف جديد) ثم
 * يُستورد الملف الجديد: `map_import_batch` تُدرج وتُحدّث لكنها **لا تحذف**،
 * فيبقى الصف القديم يشير لشوط زال. أثره: كثافة مرتفعة كذباً وتغطية منخفضة
 * كذباً وزيارات لشارع غير موجود.
 *
 * راجع `app.map_orphan_report` — والدالة **لا تحذف شيئاً**.
 */
export interface OrphanPlace {
  place_kind: 'street' | 'alley'
  code: string
  name: string | null
  osm_way_id: number
  length_m: number | null
}

/** ردّ `app.map_orphan_purge` — ما حُذف فعلاً وما بقي محميّاً */
export interface OrphanPurgeResult {
  streets_deleted: number
  alleys_deleted: number
  visits_deleted: number
  /**
   * أشواط غائبة عن الملف لكنها **لم تُحذف**: صف يدوي بلا معرّف OSM، أو اسم
   * صحّحه موظف (`name_source = 'manual'`)، أو صف أُنشئ بعد وقت الدفعة.
   * نُبلّغ بالعدد بدل إخفائه — المشغّل يحتاج معرفة أن القاعدة ليست مطابقة للملف.
   */
  kept_protected: number
}

/** سطر في سجل الدفعات */
export interface MapImportBatch {
  id: string
  zone_id: string
  batch_no: number
  status: 'running' | 'done' | 'failed' | string
  rows_sent: number
  rows_inserted: number
  rows_updated: number
  rows_skipped: number
  error_count: number
  meta: Record<string, unknown> | null
  created_by: string | null
  created_at: string
}

/** سكربت Overpass الجاهز — `app.map_osm_script` تُرجع **نص السكربت** لا صفّاً */
export interface ZoneOsmScript {
  script: string
}

/** إحصاءات زون — تُقارن بالمرجع ٢١.٣ كم/كم² */
export interface ZoneImportStats {
  streets: number
  alleys: number
  total_length_km: number
  area_km2: number
  density: number
}

// ── الثوابت ────────────────────────────────────────────────────────────────
/** المرجع المقيس بعد إصلاح `clip_path` (الجولة ٩) — كان ٢٠.٤ قبل الإصلاح */
export const DENSITY_REFERENCE = 21.3

/** حجم الدفعة الافتراضي — منقول من قياس: ٢٠٠ صف ≈ ١٢٠ ك.ب طلب، آمن تحت حدّ الـ ١ م.ب */
export const DEFAULT_BATCH_SIZE = 200

// ── التحويل ────────────────────────────────────────────────────────────────
/**
 * يحوّل صفوف المحرّك إلى شكل الدالة.
 * الصفوف **لا تحمل null** في `ImportRow` (النوع مغلق) — لكن القاعدة تقبله،
 * فنمرّر null فقط حيث يكون الصف بلا قيمة فعلية (`name` للأزقة بلا اسم).
 */
export function toBatchRow(row: ImportRow): ImportBatchRow {
  return {
    code: row.code,
    kind: row.kind,
    name: row.name || null,
    width_m: row.widthM,
    width_source: row.widthSource,
    osm_way_id: row.osmWayId,
    link_source: row.linkSource ?? null,
    mahalla_num: row.mahallaNum ?? null,
    path: row.pts,
  }
}

/** يقسّم مصفوفة إلى دفعات بحجم ثابت — لا يُسقط ذيلاً */
export function chunk<T>(rows: T[], size = DEFAULT_BATCH_SIZE): T[][] {
  if (!Number.isFinite(size) || size < 1) throw new Error('BATCH_SIZE_INVALID')
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

// ── SDK ────────────────────────────────────────────────────────────────────
export const mapImportSdk = {
  /**
   * سكربت Overpass الجاهز للزون (يُنسخ ويُشغَّل على overpass-turbo.eu).
   *
   * `map_osm_script_v2` (المرحلة ① من مطابقة الشكل): maxsize 2ج.ب بدل 1،
   * و`out meta` بدل `out body`. الأثر المقصود: أقل اقتطاعاً من Overpass.
   * التراجع تلقائي إلى الدالة القديمة إن لم تُطبَّق المهاجرة بعد — لا نُعطّل
   * الصفحة على قاعدة لم تُحدَّث.
   */
  async zoneScript(zoneId: string): Promise<ZoneOsmScript> {
    let script: string
    try {
      script = await sdkGuard<string>(supabase.rpc('map_osm_script_v2', { p_zone: zoneId }))
    } catch {
      // المهاجرة لم تُطبَّق على هذه القاعدة — نستعمل القديمة بدل الفشل
      script = await sdkGuard<string>(supabase.rpc('map_osm_script', { p_zone: zoneId }))
    }
    return { script: String(script ?? '') }
  },

  /** سكربت ربع محدّد من الزون (1..4) — الحلّ الجذري لاقتطاع Overpass */
  async zoneScriptQuarter(zoneId: string, quarter: 1 | 2 | 3 | 4): Promise<ZoneOsmScript> {
    const script = await sdkGuard<string>(
      supabase.rpc('map_osm_script_quarter', { p_zone: zoneId, p_quarter: quarter }),
    )
    return { script: String(script ?? '') }
  },

  /**
   * إحصاءات زون **من القاعدة** (مصدر مستقل للتحقق من أرقام الواجهة).
   * تُقرأ من الجداول مباشرة — لا دالة تجميع في الهجرة، فنحسبها هنا بلا اختراع واجهة.
   */
  async zoneStats(zoneId: string): Promise<ZoneImportStats> {
    const [streets, alleys] = await Promise.all([
      sdkGuard<{ length_m: number | null }[]>(
        supabase.from('map_streets').select('length_m').eq('zone_id', zoneId),
      ),
      sdkGuard<{ length_m: number | null }[]>(
        supabase.from('map_alleys').select('length_m').eq('zone_id', zoneId),
      ),
    ])
    const totalM =
      streets.reduce((a, r) => a + Number(r.length_m ?? 0), 0) +
      alleys.reduce((a, r) => a + Number(r.length_m ?? 0), 0)
    const area = await this.zoneArea(zoneId)
    return {
      streets: streets.length,
      alleys: alleys.length,
      total_length_km: totalM / 1000,
      area_km2: area,
      density: area > 0 ? totalM / 1000 / area : 0,
    }
  },

  /** مضلّع الزون الخام («lat lon lat lon …») — يُستعمل للعرض على الخريطة ولحساب المساحة */
  async zonePolygonText(zoneId: string): Promise<string> {
    const text = await sdkGuard<string>(supabase.rpc('map_zone_polygon', { p_zone: zoneId }))
    return String(text ?? '')
  },

  /**
   * مساحة الزون كم² — من مضلّع `gps_geofences` الحقيقي (لا من نسخة في الواجهة).
   * `app.map_zone_polygon` تُرجع نصاً بصيغة Overpass («lat lon lat lon …»)، فنُحلّله هنا.
   * لا توجد دالة مساحة في الهجرات — الحساب في TS هو المرجع الوحيد المتاح،
   * و`geometry.polygonAreaM2` مختبَرة (٣٥ اختباراً).
   */
  async zoneArea(zoneId: string): Promise<number> {
    const text = await sdkGuard<string>(
      supabase.rpc('map_zone_polygon', { p_zone: zoneId }),
    )
    const nums = String(text ?? '')
      .trim()
      .split(/\s+/)
      .map(Number)
      .filter((n) => Number.isFinite(n))
    if (nums.length < 6) return 0
    const ring: MapPoint[] = []
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const lat = nums[i]
      const lng = nums[i + 1]
      if (lat !== undefined && lng !== undefined) ring.push([lat, lng])
    }
    const { polygonAreaM2 } = await import('@features/map-import/lib/geometry')
    return polygonAreaM2(ring) / 1e6
  },

  /** سجل الدفعات لزون، الأحدث أولاً */
  async batches(zoneId: string, limit = 20): Promise<MapImportBatch[]> {
    return sdkGuard(
      supabase
        .from('map_import_batches')
        .select('*')
        .eq('zone_id', zoneId)
        .order('created_at', { ascending: false })
        .limit(limit),
    )
  },

  /**
   * يرسل دفعة واحدة. `batchId` واحد لكل عملية استيراد — يجمع صفوفها في سجل الدفعات،
   * ويجعل إعادة إرسال نفس الصفوف آمنة (`on conflict (zone_id, code) do update`).
   */
  async sendBatch(input: {
    zoneId: string
    rows: ImportRow[]
    mahallas?: ImportBatchMahalla[]
    batchId: string
    meta?: Record<string, unknown>
  }): Promise<ImportBatchResult> {
    /*
     * روابط الطرق (`*_link`) قد تكون في `rows` لأن المشغّل فعّل «إظهار الوصلات»
     * للمقارنة البصرية. **لا تُرسل للقاعدة أبداً**: هي منحدرات لا شوارع،
     * وإدراجها يضخّم الكثافة ويولّد زيارات وهمية — وهو سبب إسقاطها الأصلي.
     * الفلترة هنا لا في الواجهة كي لا تُنسى عند أي مسار إدراج جديد.
     */
    const importable = input.rows.filter((r) => !r.excludeFromImport)
    const payload = {
      p_zone: input.zoneId,
      p_rows: importable.map(toBatchRow),
      p_mahallas: input.mahallas ?? [],
      p_batch: input.batchId,
      p_meta: input.meta ?? {},
    }
    const data = await sdkGuard<Record<string, unknown> | null>(
      supabase.rpc('map_import_batch', payload),
    )
    const r = data ?? {}
    const errors = Array.isArray(r.errors) ? (r.errors as ImportBatchResult['errors']) : []
    return {
      batch_id: (r.batch_id as string) ?? null,
      inserted: Number(r.inserted ?? 0),
      updated: Number(r.updated ?? 0),
      skipped: Number(r.skipped ?? 0),
      errors,
    }
  },

  /**
   * يمسح سجل التخطي لزون — يُستدعى قبل استيراد جديد فقط بقرار صريح من المستخدم.
   *
   * ⚠ لا يُمرَّر عبر `sdkGuard`: الحذف الناجح لا يُرجع صفاً (`data: null`)، و`sdkGuard`
   * يرفع `EMPTY_RESULT` على null. فكان أي استدعاء ناجح يفشل — عيب نائم لأن الدالة
   * غير مستدعاة من الواجهة بعد. هنا نفحص `error` وحدها: نجاحٌ بلا خطأ = تمّ الحذف.
   */
  async clearSkips(zoneId: string): Promise<void> {
    const { error } = await supabase
      .from('map_import_skips')
      .delete()
      .eq('zone_id', zoneId)
      .select()
      .maybeSingle()
    if (error) throw new SDKError(error.message, error.code ?? 'UNKNOWN', error)
  },

  /**
   * الأشواط الموجودة في القاعدة والغائبة عن الملف — **قراءة فقط**.
   *
   * تُستدعى بعد الاستيراد بصفوف الملف نفسه (`ImportRow[]`)، فتقارن
   * `osm_way_id` في القاعدة بما في الملف. لا تحذف شيئاً: تُظهر القائمة
   * ليقرّر المشغّل. الصفوف اليدوية والصفوف المصحَّحة (`name_source='manual'`)
   * مستبعدة من القائمة نفسها لأنها محميّة في الحذف أيضاً.
   */
  async orphanReport(zoneId: string, rows: ImportRow[]): Promise<OrphanPlace[]> {
    const payload = {
      p_zone: zoneId,
      p_rows: rows.filter((r) => !r.excludeFromImport).map(toBatchRow),
    }
    const data = await sdkGuard<OrphanPlace[] | null>(
      supabase.rpc('map_orphan_report', payload),
    )
    return data ?? []
  },

  /**
   * حذف الأشواط اليتيمة — **بقرار صريح فقط**، بعد رؤية `orphanReport`.
   *
   * `batchId` ليس زينة: القاعدة تتحقق أن الدفعة لهذا الزون وتستعمل وقتها
   * حاجزاً — فلا يُحذف صف أُنشئ بعد رفع الملف. مرّر معرّف الدفعة التي
   * أدرجت الملف الجديد، لا معرّفاً عشوائياً.
   *
   * يُحذف أيضاً زيارات الصفوف المحذوفة (`map_visits.place_id` بلا FK، فلا
   * تتابع تلقائية) — **للصفوف المحذوفة في هذه الدفعة وحدها**.
   */
  async orphanPurge(
    zoneId: string,
    batchId: string,
    rows: ImportRow[],
  ): Promise<OrphanPurgeResult> {
    const payload = {
      p_zone: zoneId,
      p_batch: batchId,
      p_rows: rows.filter((r) => !r.excludeFromImport).map(toBatchRow),
    }
    const data = await sdkGuard<Record<string, unknown> | null>(
      supabase.rpc('map_orphan_purge', payload),
    )
    const r = data ?? {}
    return {
      streets_deleted: Number(r.streets_deleted ?? 0),
      alleys_deleted: Number(r.alleys_deleted ?? 0),
      visits_deleted: Number(r.visits_deleted ?? 0),
      kept_protected: Number(r.kept_protected ?? 0),
    }
  },
}
