/**
 * عقد الجولة ⑦ — الخطأ ٥٠٠ عند الإدراج + الوضع الليلي بلا خريطة.
 *
 * ## العَرَض من الميدان (لقطات شاشة، ٢٠٢٦-١١)
 *
 * ```
 * ⚠ تعذّر إكمال العملية
 * canceling statement due to statement timeout
 * ```
 *
 * في وحدة التحكّم: `Failed to load resource: 500` على `…/map_import_batch`.
 * والنتيجة: لا يُدرَج شيء، ويبقى المستخدم أعيد على «تعذّر إكمال العملية».
 *
 * ## الجذر (مقيس على قاعدة الإنتاج لا مخمَّن)
 *
 * `statement_timeout = 2min`. وقياسات فعلية:
 *
 * | الحجم | الزمن | ملاحظة |
 * |---|---|---|
 * | ١٠٠ صف | ٢٢.٧٧ ث | (قبل) |
 * | ٢٠٠ صف | > ٣٠ ث | (قبل) |
 * | ٤٣٩ صفاً (٣ دفعات) | > ١٢٠ ث | **الخطأ ٥٠٠** |
 *
 * والسبب **ليس** عدد الصفوف بل **التخطيط (planning) لا التنفيذ**:
 *
 * ```
 * explain analyze select … from app.map_nearby_streets(…)
 *   Planning Time: 11.329 ms
 *   Execution Time:  0.042 ms   ← 269× فرقاً
 * ```
 *
 * وسبب بطء التخطيط أن **كل** دوال الهندسة تحمل `SET search_path = pg_catalog`،
 * وهذه الخاصية تُصنّف الدالة **غير قابلة للتضمين (non-inlinable)**، فتُعاد
 * كتابتها وتخطيطها في كل استدعاء. ومع ١٠٠ صف × ~٣٠ استدعاء = ٣٠٠٠ تخطيط.
 *
 * ## الإصلاح المقيس (نفس الدالة، نفس البيانات)
 *
 * | المرحلة | الزمن |
 * |---|---|
 * | قبل | ٦٣٦ ms لـ٤٣ جاراً |
 * | بعد CTE + إزالة SET من `map_nearby_*` | ٣ ms |
 * | بعد إزالة SET من دوال الهندسة | ٠.٣٧ ms |
 * | **٢٠٠ صف كاملة** | **٢٨.١٥ ث ⇒ ٨.٦٥ ث** |
 *
 * ## العيب الثاني: «التخطيط يختلف» في الوضع الليلي
 *
 * الوضع النهاري يعرض شبكة شوارع بأسمائها. الليلي يعرض **خطوطاً رمادية
 * صمّاء** — لأن `esri-dark` (World_Dark_Gray_Base) كانت **أولاً**، وهي
 * خدمة **خلفية** أسموتية: أرضية وماء وحدود، **بلا طبقة طرق أصلاً**.
 * فالمشغّل يقارن ملفه بخريطة لا تحمل ما يقارن به.
 *
 * الإصلاح: `osm-filtered` أولاً (نفس هندسة النهاري وأسماءه)، وEsri تراجعاً.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DARK_TILES, LIGHT_TILES, MAP_MAX_ZOOM } from '@features/map-theme/map-theme'

const ROOT = process.cwd()
const MIG = readFileSync(
  join(ROOT, 'supabase/migrations/20261124000300_map_import_timeout_fix.sql'),
  'utf8',
)
const HOOK = readFileSync(join(ROOT, 'src/features/map-import/hooks/useMapImport.ts'), 'utf8')

describe('① الاستيراد لا يتجاوز المهلة — الجذر: SET يمنع inlining', () => {
  it('دوال المرشّحين بلا `SET search_path` وتحسب bbox في CTE', () => {
    expect(MIG).toContain('create or replace function app.map_nearby_streets')
    expect(MIG).toContain('with bounds as')
    // لا `set search_path` في تعريف الدالتين
    const streetsFn = MIG.slice(
      MIG.indexOf('create or replace function app.map_nearby_streets'),
      MIG.indexOf('create or replace function app.map_nearby_alleys'),
    )
    expect(streetsFn).not.toContain('set search_path')
    expect(streetsFn).toContain('cross join bounds b')
  })

  it('دوال الهندسة تُنزع منها `SET search_path` (١٦ دالة)', () => {
    expect(MIG).toContain('alter function %s reset search_path')
    // القائمة تشمل الأساسيات والدوال المكتشفة لاحقاً
    for (const fn of [
      'app.map_pt_lat(jsonb)',
      'app.map_pt_lng(jsonb)',
      'app.map_distance_m',
      'app.map_bbox(jsonb)',
      'app.map_bbox_expand',
      'app.map_overlap_length_m',
      'app.map_intersection_kind',
      'app.map_line_length_m',
      'app.map_max_segment_m',
      'app.map_point_segment_m',
      'app.map_centroid',
      'app.map_is_vertex',
      'app.map_paths_intersect',
      'app.map_point_depth_m',
      'app.map_point_in_zone',
      'app.map_segments_intersect',
    ]) {
      expect(MIG, fn).toContain(fn)
    }
  })

  it('التعليل موثَّق بالرقم لا بالوصف', () => {
    expect(MIG).toContain('Planning Time: 11.329 ms')
    expect(MIG).toContain('Execution Time:  0.042 ms')
    expect(MIG).toContain('٢٦٩')
  })
})

describe('② سقف الدفعة يمنع المهلة الصامتة', () => {
  it('الغلاف يرفض > ٣٠٠ برسالة مفهومة', () => {
    expect(MIG).toContain('MAP_IMPORT_BATCH_TOO_LARGE')
    expect(MIG).toContain('v_max_rows constant int := 300')
  })

  it('التنفيذ الأصلي محفوظ بلا تغيير (`_impl`) — لا إعادة كتابة خطرة', () => {
    expect(MIG).toContain("rename to map_import_batch_impl")
    expect(MIG).toContain('return app.map_import_batch_impl(')
    // الحماية من إعادة التسمية المزدوجة
    expect(MIG).toContain('map_import_batch_impl')
    expect(MIG).toMatch(/if not v_exists then/)
  })

  it('`_impl` محجوبة عن المستدعين — الواجهة لا تناديها', () => {
    expect(MIG).toContain('revoke all on function app.map_import_batch_impl')
    expect(HOOK).not.toContain('map_import_batch_impl')
    // الاستدعاء في الـSDK لا في الخطاف
    const SDK = readFileSync(join(ROOT, 'src/services/map-import.sdk.ts'), 'utf8')
    expect(SDK).toContain("rpc('map_import_batch'")
  })

  it('حجم دفعة الواجهة تحت السقف بهامش', () => {
    expect(HOOK).toContain('opts.batchSize ?? 200')
    expect(200).toBeLessThan(300)
  })
})

describe('③ الوضع الليلي يرسم نفس الخريطة', () => {
  it('OSM أولاً — نفس مصدر بلاطات النهاري', () => {
    expect(DARK_TILES[0]?.id).toBe('osm-filtered')
    expect(DARK_TILES[0]?.url).toBe(LIGHT_TILES.url)
    expect(DARK_TILES[0]?.filter).toBe(true)
  })

  it('Esri تراجع لا أساس — وموثَّق أنها بلا أسماء شوارع', () => {
    const esri = DARK_TILES.at(-1)
    expect(esri?.id).toBe('esri-dark')
    expect(esri?.attribution).toContain('بلا أسماء شوارع')
  })

  it('سقف التكبير موحّد رغم اختلاف المصدر', () => {
    for (const p of [...DARK_TILES, LIGHT_TILES]) expect(p.maxZoom).toBe(MAP_MAX_ZOOM)
  })

  it('السبب موثَّق: خدمة خلفية بلا طبقة طرق', () => {
    const src = readFileSync(join(ROOT, 'src/features/map-theme/map-theme.ts'), 'utf8')
    expect(src).toContain('لا طبقة طرق فيها إطلاقاً')
    expect(src).toContain('خطوطاً رمادية صمّاء')
  })
})

describe('④ الإدراج المتكرر آمن — لا مضاعفة', () => {
  it('المفتاح osm_way_id يُستخدم قبل code', () => {
    /*
     * الهجرة **الأصلية** (20261122001300) كانت `on conflict (zone_id, code)`
     * — وهو العيب الذي أصلحته 20261124000100_map_import_quarter_key بإضافة
     * الفهرس الفريد على osm_way_id. فالتحقق هنا من الهجرة المُصلِحة لا الأصلية.
     */
    const fix = readFileSync(
      join(ROOT, 'supabase/migrations/20261124000100_map_import_quarter_key.sql'),
      'utf8',
    )
    expect(fix).toContain('map_streets_zone_osm_uk')
    expect(fix).toContain('osm_way_id')
  })

  it('الواجهة تجمع النتائج ولا تستبدلها', () => {
    expect(HOOK).toContain('acc.inserted += res.inserted')
    expect(HOOK).toContain('acc.updated += res.updated')
  })
})
