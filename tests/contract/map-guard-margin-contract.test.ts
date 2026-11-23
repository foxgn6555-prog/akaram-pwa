/**
 * عقد الجولة ⑬ — إصلاح O(n²): هامش الحرّاس ٦٠٠م ⇒ ٥م.
 *
 * ## السلسلة الكاملة (مقيسة، لا مُدَّعاة)
 *
 * الجولة ⑪ كشفت أن الإدراج تربيعي:
 *
 * ```
 *   25 صف =>   634,722 us
 *   50 صف => 2,365,177 us      ×3.7 عند مضاعفة العدد
 *   100 صف => 9,500,000 us
 * ```
 * وسببته `map_overlap_check` التي تنادي
 * `map_nearby_streets(zone, path, id)` **بلا هامش** ⇒ الافتراضي ٦٠٠ متر.
 *
 * ## الجذر الحقيقي (هذه الجولة)
 *
 * في زون اختباري من ٤٥٠ صفاً، عدد المرشّحين لمسار واحد:
 *
 * ```
 *   الهامش ٦٠٠م  =>  420 مرشّحاً     ← ما كان يحدث
 *   الهامش  ٣٠م  =>    8 مرشّحين
 *   الهامش   ٥م  =>    2 مرشّحان     ← 210× أقل
 * ```
 *
 * و٦٠٠ متر **بقايا تصميم**: تعليق 20261122000600 يقول إن الهامش يغطّي
 * «أقصى مسافة قد تهمّنا» حين كان في الحارس فحص مسافة ٥٠٠م. لكن
 * 20261122000500 **حذف فحص المسافة**، وبقي الفحصان:
 *
 *   • التداخل  — `map_overlap_length_m(…, 1.5)`  ⇒ ١.٥ متر
 *   • التقاطع  — `map_intersection_kind(…)`      ⇒ ٠.٥ متر داخل الدالة
 *
 * أي أن أبعد مسافة قد تهمّنا **١.٥ متر**، لا ٦٠٠.
 *
 * ## الأثر — مقيس على الإنتاج بعد التطبيق
 *
 * ```
 *  100 صف: 9,500,000 us  ⇒   582,073 us   (16.3×)
 *  450 صف: ~190,000,000  ⇒ 3,087,994 us   (~62×)
 *
 *  الزمن/صف: 95 us ⇒ 5.8 us   (100 صف)
 *            422 us ⇒ 6.9 us  (450 صف)   ← لم يرتفع ⇒ التربيعية اختفت
 * ```
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8')

const MIG = 'supabase/migrations/20261126000100_map_guard_margin_fix.sql'
const migration = read(MIG)
const prior = read('supabase/migrations/20261122000600_map_spatial_index.sql')

/** جسم الحارس في الهجرة الجديدة */
const guardBody = (() => {
  const start = migration.indexOf('create or replace function app.map_overlap_check()')
  return migration.slice(start, migration.indexOf('end $$;', start))
})()

describe('⑬ — الهامش صار ٥ أمتار لا ٦٠٠', () => {
  it('app.map_guard_margin_m تُرجع ٥.٠', () => {
    expect(migration).toMatch(/create or replace function app\.map_guard_margin_m\(\)/)
    expect(migration).toMatch(/select 5\.0::double precision/)
  })

  it('الحارس يقرأ الهامش من الدالة لا من رقم منثور', () => {
    expect(guardBody).toMatch(/v_margin double precision := app\.map_guard_margin_m\(\)/)
  })

  it('يمرّر الهامش صراحةً إلى الدالتين', () => {
    expect(guardBody).toContain('app.map_nearby_streets(new.zone_id, new.path, new.id, v_margin)')
    expect(guardBody).toContain('app.map_nearby_alleys(new.zone_id, new.path, new.id, v_margin)')
  })

  it('⛔ لا نداء بلا هامش (يعود إلى ٦٠٠م الافتراضي)', () => {
    // أي نداء بـ٣ وسائط فقط يعني الافتراضي ٦٠٠
    const bare = guardBody.match(/map_nearby_(streets|alleys)\(new\.zone_id, new\.path, new\.id\)/g)
    expect(bare, `نداءات بلا هامش: ${bare?.join(', ')}`).toBeNull()
  })

  it('الدالتان تحتفظان بالافتراضي ٦٠٠ (توافق خلفي لمن ينادي بلا هامش)', () => {
    expect(prior).toMatch(/p_margin_m double precision default 600\.0/)
  })
})

describe('⑬ — القانون لم يتغيّر حرفاً', () => {
  it('حدّ التداخل ٢٠ متراً كما هو', () => {
    expect(guardBody).toContain('v_min_overlap constant double precision := 20.0')
  })

  it('تحمّل التداخل ١.٥م للشوارع و١.٠م للأزقة — لم يُمسّا', () => {
    expect(guardBody).toContain('app.map_overlap_length_m(new.path, r.path, 1.5)')
    expect(guardBody).toContain('app.map_overlap_length_m(new.path, r.path, 1.0)')
  })

  it('الاستثناءان الأربعة برسائلهم وerrcode — حرفياً', () => {
    // الشارع
    expect(guardBody).toContain("raise exception 'MAP_DUPLICATE: الشارع مطابق تماماً لـ % (%)'")
    expect(guardBody).toContain("raise exception 'MAP_OVERLAP: الشارع يسير على % (%) لمسافة % م'")
    // الزقاق
    expect(guardBody).toContain("raise exception 'MAP_DUPLICATE: الزقاق مطابق تماماً لـ % (%)'")
    expect(guardBody).toContain("raise exception 'MAP_OVERLAP: الزقاق يسير على % (%) لمسافة % م'")
    // errcode
    expect(guardBody.match(/errcode = 'check_violation'/g)?.length).toBe(4)
  })

  it('تخطّي الجسور باقٍ (التقاطع الهندسي ليس واقعياً لجسر)', () => {
    expect(guardBody).toMatch(/if v_new_is_bridge then\s+return new;/)
    expect(guardBody).toContain('if not r.is_bridge then')
  })

  it('تسجيل التقاطع في map_geometry_reviews باقٍ', () => {
    expect(guardBody).toContain('insert into public.map_geometry_reviews')
    expect(guardBody).toContain("kind, detail)")
    expect(guardBody).toContain('on conflict (zone_id, table_name, record_id, other_code, kind) do nothing')
  })

  it('security definer و search_path محفوظان', () => {
    expect(guardBody).toContain('security definer')
    expect(guardBody).toMatch(/set search_path = public, app/)
  })

  it('كشف حرف مسار معكوس باقٍ (نفس الشارع باتجاه آخر)', () => {
    expect(guardBody).toContain('jsonb_agg(e order by ord desc)')
  })
})

describe('⑬ — التوثيق يحمل الأرقام المقيسة لا المتوقَّعة', () => {
  it('قياس المرشّحين الثلاثة موجود', () => {
    expect(migration).toContain('420')
    expect(migration).toContain('8 مرشّحين')
    expect(migration).toContain('2 مرشّحان')
  })

  it('أرقام الأثر الفعلية بعد التطبيق', () => {
    expect(migration).toContain('582,073')
    expect(migration).toContain('3,087,994')
    expect(migration).toContain('16.3×')
  })

  it('يشرح أن ٦٠٠ متر بقايا فحص محذوف', () => {
    expect(migration).toMatch(/بقايا/)
    expect(migration).toContain('20261122000500')
  })

  it('يُقرّ أن القانون لم يتغيّر — لا تجاوز للفحص', () => {
    // النص فيه توكيد ماركداون: «**لا** تتجاوز فحص التطابق»
    expect(migration).toMatch(/لا\*\* تتجاوز فحص التطابق/)
    // ويُقرّ أن القانون نفسه لم يُمسّ
    expect(migration).toMatch(/لا\*\* تُغيّر أي قانون/)
  })

  it('التراجع موثَّق', () => {
    expect(migration).toMatch(/## التراجع/)
    expect(migration).toContain('20261124000500')
  })
})

describe('⑬ — لا تناقض مع هجرات الجولات السابقة', () => {
  it('هامش الحرّاس لا يُعرَّف في مكان آخر (مصدر واحد)', () => {
    const files = readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql'))
    const definers = files.filter((f) => {
      const src = readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8')
      return /create or replace function app\.map_guard_margin_m\(\)/.test(src)
    })
    expect(definers).toEqual(['20261126000100_map_guard_margin_fix.sql'])
  })

  it('هجرة ⑪ (سقف ١١٠ ثانية) ما زالت سارية ولم تُعدَّل', () => {
    const cap = read('supabase/migrations/20261124000600_map_import_timeout_cap.sql')
    expect(cap).toContain("set statement_timeout = '110s'")
  })

  it('هجرة ⑩ (كلفة فحص التطابق) لم تُعدَّل', () => {
    const perf = read('supabase/migrations/20261124000500_map_overlap_length_perf.sql')
    expect(perf).toContain('map_overlap_length_m')
  })

  it('الحارس الأخير المعرَّف هو هذا — لا هجرة لاحقة تعيده', () => {
    const files = readdirSync(join(ROOT, 'supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort()
    const definers = files.filter((f) => {
      const src = readFileSync(join(ROOT, 'supabase/migrations', f), 'utf8')
      return /create or replace function app\.map_overlap_check\(\)/.test(src)
    })
    const last = definers[definers.length - 1]
    expect(last).toBe('20261126000100_map_guard_margin_fix.sql')
  })
})
