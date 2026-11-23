/**
 * عقد الجولة ⑨ — الشوط المنقسم على حدود الزون: القطعة مفتاح ثالث.
 *
 * ## العَرَض من الميدان
 *
 * يرفع المشغّل ملف زون الأرخيته، تظهر رسالة نجاح، وعدد الشوارع في القاعدة
 * **أقل** من عدد صفوف الملف. لا خطأ، لا تحذير — فقدان بيانات صامت.
 *
 * ## الجذر (مقيس على قاعدة الإنتاج، ٢٠٢٦-١١)
 *
 * ثلاث آليات متعاونة:
 *
 *   ① `assembleImport` تقصّ الشوط على مضلّع الزون، و`clipPathIndexed` قد
 *      تُرجع **عدة قطع** لنفس `way.id` (الشوط يخرج من الزون ويعود).
 *
 *   ② الهجرة `20261124000100` فرضت `unique (zone_id, osm_way_id)`.
 *
 *   ③ والمطابقة `where osm_way_id = v_osm` بلا `piece_index` ⇒ الجزء الثاني
 *      يجد الأول ويُحدّثه ⇒ **يمسحه**.
 *
 * ## القياس الذي أثبته الإصلاح مطلوباً
 *
 * | الحالة | قبل ⑨ | بعد ⑨ (المتوقّع) |
 * |---|---|---|
 * | ٣ قطع بنفس osm_way_id | `ins=1 upd=1` · **١ صف** | `ins=3 upd=0` · **٣ صفوف** |
 * | إعادة الاستيراد | `ins=0 upd=1` · ١ صف | `ins=0 upd=3` · ٣ صفوف |
 * | صف قديم بلا piece_index | _يُمحى_ | يُطابَق بـ٠ ويُحدَّث |
 *
 * ## ما يثبته هذا الاختبار
 *
 *   · العمودان موجودان في الهجرة بـ`default 0 not null` (توافق خلفي).
 *   · الفهرس الفريد صار ثلاثياً، والثنائي **حُذف** (وإلا فشل الإدراج).
 *   · المطابقة في الدالة تحمل `piece_index = v_piece` في الفرعين.
 *   · `toBatchRow` يُرسل `piece_index`.
 *   · `assembleImport` يُنتج `pieceIndex` من فهرس الجزء.
 *   · الترتيب حتمي (فاصل `piece` يمنع انقلاب الأكواد بين تشغيلين).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8')

const migration = read('supabase/migrations/20261124000400_map_import_piece_key.sql')
const prevMigration = read('supabase/migrations/20261124000100_map_import_quarter_key.sql')
const assemble = read('src/features/map-import/lib/assemble.ts')
const sdk = read('src/services/map-import.sdk.ts')

describe('⑨ — عمود piece_index', () => {
  it('يُضاف إلى map_streets و map_alleys بـ default 0 not null (توافق خلفي)', () => {
    for (const table of ['map_streets', 'map_alleys']) {
      const re = new RegExp(
        `alter table public\\.${table}\\s+add column if not exists piece_index smallint not null default 0`,
      )
      expect(migration).toMatch(re)
    }
  })

  it('يحرس السالب بقيد check', () => {
    expect(migration).toContain('map_streets_piece_index_ck')
    expect(migration).toContain('map_alleys_piece_index_ck')
    expect(migration).toMatch(/check \(piece_index >= 0\)/)
  })
})

describe('⑨ — الفهرس الفريد ثلاثي', () => {
  it('الثنائي (zone_id, osm_way_id) يُحذف — وإلا فشل الجزء الثاني', () => {
    expect(migration).toContain('drop index if exists public.map_streets_zone_osm_uk')
  })

  it('الثلاثي (zone_id, osm_way_id, piece_index) يُنشأ للشوارع والأزقة', () => {
    expect(migration).toMatch(
      /create unique index if not exists map_streets_zone_osm_piece_uk\s*\n\s*on public\.map_streets\(zone_id, osm_way_id, piece_index\)/,
    )
    expect(migration).toMatch(
      /create unique index if not exists map_alleys_zone_osm_piece_uk\s*\n\s*on public\.map_alleys\(zone_id, osm_way_id, piece_index\)/,
    )
  })

  it('يبقي الصفوف اليدوية (osm_way_id null) خارج القيد', () => {
    expect(migration).toMatch(/where osm_way_id is not null/)
  })
})

describe('⑨ — المطابقة في الدالة', () => {
  it('تُعيد تعريف app.map_import_batch_impl لا الغلاف', () => {
    expect(migration).toContain('create or replace function app.map_import_batch_impl(')
    // الغلاف public.map_import_batch يبقى في 00300 — لا يُمسّ هنا
    expect(migration).not.toMatch(/create or replace function public\.map_import_batch/)
  })

  it('تقرأ piece_index من الصف بأمان (غيابه ⇒ ٠، والسالب يُقصَر)', () => {
    expect(migration).toMatch(/v_piece\s*:=\s*greatest\(coalesce\(nullif\(v_row->>'piece_index',''\)::smallint, 0\), 0\)/)
  })

  it('الأزقة: المطابقة بـ osm_way_id + piece_index', () => {
    const alleyBlock = migration.slice(
      migration.indexOf("if v_kind = 'alley' then"),
      migration.indexOf('-- الشارع بأنواعه الأربعة'),
    )
    expect(alleyBlock).toMatch(/from public\.map_alleys\s*\n\s*where zone_id = p_zone and osm_way_id = v_osm and piece_index = v_piece/)
    expect(alleyBlock).toContain('piece_index')
  })

  it('الشوارع: المطابقة بـ osm_way_id + piece_index', () => {
    const streetBlock = migration.slice(migration.indexOf('-- الشارع بأنواعه الأربعة'))
    expect(streetBlock).toMatch(/from public\.map_streets\s*\n\s*where zone_id = p_zone and osm_way_id = v_osm and piece_index = v_piece/)
  })

  it('الإدراج يكتب piece_index في الجدولين', () => {
    expect(migration).toMatch(/insert into public\.map_alleys \([\s\S]*?piece_index[\s\S]*?\) values \(/)
    expect(migration).toMatch(/insert into public\.map_streets \([\s\S]*?piece_index[\s\S]*?\) values \(/)
  })

  it('التحديث يُبقي piece_index متطابقاً', () => {
    const updates = migration.match(/piece_index\s*=\s*v_piece/g) ?? []
    expect(updates.length).toBeGreaterThanOrEqual(2)
  })

  it('لا يحذف شيئاً — الهجرة لا تفقد بيانات', () => {
    expect(migration).not.toMatch(/delete from public\.map_streets/i)
    expect(migration).not.toMatch(/delete from public\.map_alleys/i)
    expect(migration).not.toMatch(/truncate/i)
  })
})

describe('⑨ — الواجهة ترسل القطعة', () => {
  it('ImportRow يحمل pieceIndex', () => {
    expect(assemble).toMatch(/pieceIndex: number/)
  })

  it('حلقة القصّ تمرّر فهرس الجزء', () => {
    expect(assemble).toMatch(/for \(let pi = 0; pi < parts\.length; pi\+\+\)/)
    expect(assemble).toMatch(/piece: pi/)
    expect(assemble).toMatch(/pieceIndex: row\.piece/)
  })

  it('الترتيب حتمي: piece فاصلٌ أخير بين قطعتَي الشوط الواحد', () => {
    expect(assemble).toMatch(/return a\.piece - b\.piece/)
  })

  it('toBatchRow يُرسل piece_index (و٠ عند الغياب)', () => {
    expect(sdk).toMatch(/piece_index: row\.pieceIndex \?\? 0/)
    expect(sdk).toMatch(/piece_index: number/)
  })
})

describe('⑨ — الانحدار السابق موثَّق لا مخفي', () => {
  it('الهجرة تشرح أنها انحدار أدخلته 20261124000100', () => {
    expect(migration).toMatch(/انحدار/)
    expect(migration).toContain('20261124000100')
  })

  it('السابقة كانت تطابق بلا piece_index (الدليل النصي على العيب)', () => {
    const streetMatch = prevMigration.match(
      /from public\.map_streets where zone_id = p_zone and osm_way_id = v_osm limit 1/,
    )
    expect(streetMatch).not.toBeNull()
    // ولا يوجد piece_index في السابقة
    expect(prevMigration).not.toContain('piece_index')
  })
})
