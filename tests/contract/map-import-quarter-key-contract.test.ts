/**
 * عقد الجولة ④ — الأرباع لا تستبدل، والنص لا يكذب، والقياس لا يُفقد.
 *
 * ## العيوب الثلاثة التي وُجدت بالفحص (لا بالاستخدام)
 *
 * ① `on conflict (zone_id, code)` + أكواد تبدأ من 0001 في كل ملف ⇒ استيراد
 *    أربعة أرباع يُبقي ربعاً واحداً (٧٥٪ فقدان صامت). أُثبت هذا **بتشغيل
 *    فعلي على PostgreSQL** (scripts/verify-quarter-fix.ts): ٤×٥ ⇒ ٥ صفوف.
 *
 * ② عبارة الواجهة «الإدراج يدمج تلقائياً ولا يتكرّر» كانت تُشجّع على الخطأ.
 *
 * ③ `maxSegmentM` كان يُحسب في المعاينة ثم يُفقد عند الإدراج — والتحذير
 *    يصير بلا أثر. وكشف الفحص عيباً رابعاً: `length_m` **لم يكن يُعبَّأ
 *    أبداً** فيبقى صفراً لكل صف مستورد.
 *
 * هذا الملف يحرس البنية (نصوص وقيود)، والتشغيل الفعلي في السكربت المستقل.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const MIG = readFileSync(
  join(ROOT, 'supabase/migrations/20261124000100_map_import_quarter_key.sql'),
  'utf8',
)
const OLD = readFileSync(join(ROOT, 'supabase/migrations/20261122001300_map_import_batch.sql'), 'utf8')
const PAGE = readFileSync(
  join(ROOT, 'src/portals/ops-room/pages/MapPlanning/OpsMapImportPage.tsx'),
  'utf8',
)

describe('① المفتاح osm_way_id لا الكود', () => {
  it('العيب موجود في الهجرة القديمة (توثيق لا اتهام)', () => {
    expect(OLD).toMatch(/on conflict \(zone_id, code\) do update/)
  })

  it('الإصلاح يطابق بـosm_way_id للشوارع والأزقة', () => {
    expect(MIG).toMatch(/from public\.map_streets where zone_id = p_zone and osm_way_id = v_osm/)
    expect(MIG).toMatch(/from public\.map_alleys where zone_id = p_zone and osm_way_id = v_osm/)
  })

  it('لا on conflict على الكود في مسار العناصر', () => {
    // `on conflict (id)` لسجل الدفعة و `(zone_id, code)` للمحلات مشروعان
    expect(MIG).not.toMatch(/on conflict \(zone_id, code\) do update\s+set path/)
  })

  it('فهرس فريد على (zone_id, osm_way_id) للشوارع', () => {
    expect(MIG).toMatch(/create unique index if not exists map_streets_zone_osm_uk/)
    expect(MIG).toMatch(/on public\.map_streets\(zone_id, osm_way_id\)/)
  })

  it('إدراج وتحديث صريحان — لا إدراج دائماً', () => {
    expect(MIG).toMatch(/if v_existing_code is null then\s+insert into/)
    expect(MIG).toMatch(/else\s+update public\.map_streets/)
  })

  it('الكود المشغول يُرقَّم تالياً لا يُستبدل', () => {
    expect(MIG).toContain('app.map_next_code')
    expect(MIG).toMatch(/if v_existing_code is null and exists/)
  })

  it('الترقيم يقرأ أكبر رقم قائم لا الافتراضي', () => {
    expect(MIG).toMatch(/max\(\(split_part\(code/)
    expect(MIG).toMatch(/v_next := v_max \+ 1/)
  })

  it('قائمة بيضاء لأسماء الجداول (لا SQL حر)', () => {
    expect(MIG).toMatch(/p_table not in \('map_streets', 'map_alleys'\)/)
  })
})

describe('② النص لا يضلّل المشغّل', () => {
  it('لا تقول «الإدراج يدمج تلقائياً» بعد اليوم (خارج التعليقات التوضيحية)', () => {
    // التعليق يشرح العيب القديم ويذكره — نفحص JSX وحده
    const jsx = PAGE.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(jsx).not.toMatch(/الإدراج\s+يدمج تلقائياً ولا يتكرّر/)
  })

  it('تقول إن الترتيب غير مهم بسبب معرّف OSM', () => {
    expect(PAGE).toContain('في أي ترتيب')
    expect(PAGE).toMatch(/يُطابق بمعرّف OSM/)
  })

  it('توضّح أن إعادة الاستيراد لا تُضاعف', () => {
    expect(PAGE).toMatch(/إعادة الاستيراد لا\s+تُضاعف|لا\s+تُضاعف/)
  })
})

describe('③ القياس لا يُفقد بعد الإدراج', () => {
  it('عمود max_segment_m على الجدولين', () => {
    expect(MIG).toMatch(/alter table public\.map_streets add column if not exists max_segment_m/)
    expect(MIG).toMatch(/alter table public\.map_alleys\s+add column if not exists max_segment_m/)
  })

  it('القيمة تُحسب في القاعدة من path لا تُرسَل من المتصفح', () => {
    expect(MIG).toMatch(/app\.map_max_segment_m\(v_path\)/)
    // لو أرسلها العميل لأمكن أن تخالف المسار المخزَّن
    expect(MIG).not.toMatch(/v_row->>'max_segment_m'/)
  })

  it('length_m يُعبَّأ أخيراً (كان صفراً دائماً)', () => {
    // العيب: الجدول يعرّفه default 0 والإدراج لم يذكره
    expect(MIG).toMatch(/app\.map_line_length_m\(v_path\)/)
    expect(MIG).toMatch(/length_m\s*=\s*app\.map_line_length_m/)
  })

  it('التحديث يُحدّث القياسين أيضاً', () => {
    const updates = MIG.match(/set path\s+= v_path[\s\S]{0,400}?max_segment_m = app\.map_max_segment_m/g)
    expect(updates?.length ?? 0).toBeGreaterThanOrEqual(2)
  })

  it('الواجهة تقرأ max_segment_m في الأنواع', () => {
    const sdk = readFileSync(join(ROOT, 'src/services/map-planning.sdk.ts'), 'utf8')
    expect(sdk).toContain('max_segment_m')
  })
})

describe('④ سلامة البنية', () => {
  it('الدالة في مخطط app (والغلاف public يُترك)', () => {
    expect(MIG).toMatch(/create or replace function app\.map_import_batch/)
    // لا نُعيد تعريف الغلاف — يبقى كما في 20261122001600
    expect(MIG).not.toMatch(/create or replace function public\.map_import_batch/)
  })

  it('التوقيع مطابق للأصل (وإلا صار تحميلاً زائداً لا استبدالاً)', () => {
    // تطبيع المسافات ثم مقارنة معاملات التوقيع حرفياً
    // نُزيل تعليقات SQL السطرية أولاً — الأصل فيه تعليقان داخل التوقيع نفسه
    const norm = (s: string) =>
      s
        .replace(/--[^\n]*/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    const sigOf = (s: string): string | null => {
      const i = s.indexOf('create or replace function app.map_import_batch(')
      if (i < 0) return null
      const j = s.indexOf(') returns jsonb', i)
      return norm(s.slice(i, j + 1))
    }
    const a = sigOf(MIG)
    const b = sigOf(OLD)
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(a).toBe(b)
  })

  it('لا حذف للبيانات القديمة (الحذف الصامت أسوأ من الخطأ)', () => {
    expect(MIG).not.toMatch(/delete from public\.map_streets/)
    expect(MIG).not.toMatch(/delete from public\.map_alleys/)
  })

  it('الهجرة موثّقة بالعيب والسبب', () => {
    expect(MIG).toContain('٧٥٪')
    expect(MIG).toContain('osm_way_id')
  })
})
