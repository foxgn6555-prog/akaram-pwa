/**
 * عقد «تعديل العنصر من غرفة العمليات يعمل فعلاً» — الجولة الحالية.
 *
 * ثلاثة أعطال مقيسة على الإنتاج، كل واحد منها كان يجعل زر «حفظ» يفشل أو يمحو
 * بيانات بصمت. الاختبارات هنا تثبّت **السبب** لا الشكل، حتى لا يعود:
 *
 *  ① `saveStreet` يرسل `width_m: null` بينما العمود NOT NULL default 6.0
 *     ⇒ `23502 not_null_violation` ⇒ كل حفظ شارع يفشل، وصفر صفّ في `map_edit_log`.
 *  ② نفس الحمولة ترسل `is_bridge: false` دائماً ⇒ أي جسر يفقد صفته بمجرّد
 *     تغيير اسمه (تحقّقنا عملياً: true ⇒ false).
 *  ③ `app.map_edit_log_trigger` مشترك بين الشوارع والأزقة ويقرأ `new.kind`،
 *     و`map_alleys` **بلا عمود kind** ⇒ أي تحديث على زقاق يفشل بـ
 *     `record "new" has no field "kind"` (مؤكَّد على الإنتاج بالكائنات).
 *
 * الاختبار يقرأ الملفات لا يشغّل القاعدة (القاعدة تُختبر في الاختبار المحصّن)،
 * لكنه يمنع **إعادة إدخال النمط** الذي أنتج الأعطال.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8')

const SDK = 'src/services/map-planning.sdk.ts'
const EDITOR = 'src/portals/ops-room/pages/MapPlanning/OpsMapPlanningEditorPage.tsx'
const MIG = 'supabase/migrations/20261129000100_map_alley_edit_unblock.sql'

const sdk = read(SDK)
const editor = read(EDITOR)
const migration = read(MIG)
const core = read('supabase/migrations/20261122000000_map_planning_core.sql')

/** جسم دالة داخل ملف هجرة */
const fnBody = (sql: string, name: string): string => {
  const start = sql.indexOf(`create or replace function ${name}(`)
  const end = sql.indexOf('end $$;', start)
  return sql.slice(start, end)
}

describe('① العرض لا يُرسل null — العمود NOT NULL', () => {
  // استخراج دالة saveStreet من SDK (TS لا SQL) — نأخذ النص بين التوقيع والحفظ
  const saveStreetTs = (() => {
    const start = sdk.indexOf('async saveStreet(input: {')
    return sdk.slice(start, sdk.indexOf('async saveAlley(input: {', start))
  })()
  const saveAlleyTs = (() => {
    const start = sdk.indexOf('async saveAlley(input: {')
    return sdk.slice(start, sdk.indexOf('async archiveStreet(', start))
  })()

  it('القاعدة تُعلن width_m إلزامياً في الجدولين (سبب العطب)', () => {
    expect(core).toMatch(/width_m\s+numeric\(5,1\) not null default 6\.0/)
    expect(core).toMatch(/width_m\s+numeric\(5,1\) not null default 3\.0/)
  })

  it('⛔ لا `?? null` للعرض في أي من الدالتين', () => {
    expect(saveStreetTs).not.toMatch(/width_m:\s*input\.width_m\s*\?\?\s*null/)
    expect(saveAlleyTs).not.toMatch(/width_m:\s*input\.width_m\s*\?\?\s*null/)
  })

  it('الحقل يُضاف فقط عند تمريره بقيمة فعلية', () => {
    expect(saveStreetTs).toMatch(/input\.width_m !== undefined && input\.width_m !== null/)
    expect(saveAlleyTs).toMatch(/input\.width_m !== undefined && input\.width_m !== null/)
  })

  it('`is_bridge` يُكتب فقط عند تمريره صراحةً — الجسر لا يُمسح صامتاً', () => {
    expect(saveStreetTs).not.toMatch(/is_bridge:\s*input\.is_bridge\s*\?\?\s*false/)
    expect(saveStreetTs).toMatch(/input\.is_bridge !== undefined/)
  })

  it('المحرّر يمرّر العرض وصفة الجسر من العنصر المخزَّن', () => {
    expect(editor).toMatch(/width_m:\s*street\?\.width_m/)
    expect(editor).toMatch(/is_bridge:\s*street\?\.is_bridge/)
    expect(editor).toMatch(/width_m:\s*alley\.width_m/)
  })
})

describe('② تعديل الزقاق غير محجوب في القاعدة', () => {
  it('السبب موثَّق: map_alleys بلا عمود kind', () => {
    expect(migration).toMatch(/map_alleys/)
    expect(migration).toMatch(/has no field "kind"|لا يوجد فيه هذا العمود/)
  })

  it('الحارس الجديد لا يقرأ new.kind مباشرةً', () => {
    const body = fnBody(migration, 'app.map_edit_log_trigger')
    expect(body).not.toMatch(/new\.kind/)
    expect(body).not.toMatch(/old\.kind/)
    expect(body).toMatch(/to_jsonb\(new\)/)
    expect(body).toMatch(/to_jsonb\(old\)/)
  })

  it('يسجّل الحقول الأربعة عبر jsonb (name · path · kind · width_m)', () => {
    const body = fnBody(migration, 'app.map_edit_log_trigger')
    for (const field of ["'name'", "'path'", "'kind'", "'width_m'"]) {
      expect(body, `الحقل ${field}`).toContain(`field, old_value, new_value`)
      expect(body).toContain(field)
    }
  })

  it('الدالة تُنشأ بـ create or replace (قابلة للتطبيق مرتين)', () => {
    expect(migration).toMatch(/create or replace function app\.map_edit_log_trigger/)
  })

  it('الترتيب: أحدث من 20261128000400', () => {
    const ids = readdirSync(join(ROOT, 'supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort()
    expect(ids.indexOf('20261129000100_map_alley_edit_unblock.sql')).toBeGreaterThan(
      ids.indexOf('20261128000400_map_visits_archive_retention.sql'),
    )
  })
})

describe('③ تشخيص «لماذا لا تظهر زيارات؟» موجود في القاعدة والواجهة', () => {
  const MIG2 = 'supabase/migrations/20261129000200_map_visit_readiness.sql'
  const readiness = read(MIG2)
  const page = read('src/portals/ops-room/pages/MapPlanning/OpsMapVehicleVisitsPage.tsx')

  it('الملف موجود وقابل للتطبيق مرتين (drop ثم create)', () => {
    expect(existsSync(join(ROOT, MIG2))).toBe(true)
    expect(readiness).toMatch(/drop function if exists public\.map_visit_readiness\(date, uuid\)/)
  })

  it('قراءة فقط — لا كتابة ولا حذف', () => {
    const body = fnBody(readiness, 'public.map_visit_readiness')
    expect(body).not.toMatch(/^\s*(insert|update|delete|truncate)\b/im)
  })

  it('محميّة بصلاحية القراءة نفسها', () => {
    expect(readiness).toContain('perform public.map_require_reader()')
    expect(readiness).toMatch(/revoke all on function public\.map_visit_readiness/)
  })

  it('تفصل مستوى الأسطول عن مستوى الزون (نقاط GPS ليست منسوبة إلى زون)', () => {
    expect(readiness).toContain("'fleet'::text")
    expect(readiness).toContain("'zone'::text")
  })

  it('ترتيب الأسباب يطابق ترتيب المحرّك: نقاط ← ربط ← شهادة ← بناء ← شهادة زون', () => {
    const body = fnBody(readiness, 'public.map_visit_readiness')
    // نبحث عن `then '<code>'` أي قيمة الفرع نفسه، لا عن أي ورود للنص
    const order = ['no_points', 'unbound_devices', 'certificate_stale', 'needs_build', 'built', 'visits_without_certificate']
    let last = -1
    for (const code of order) {
      const at = body.indexOf(`then '${code}'`)
      expect(at, `السبب ${code}`).toBeGreaterThan(-1)
      expect(at, `ترتيب ${code}`).toBeGreaterThan(last)
      last = at
    }
  })

  it('الصفحة تعرض السبب بدل «لا زيارات» جافّة', () => {
    expect(page).toContain('useVisitReadiness')
    expect(page).toMatch(/fleet\.reason/)
    expect(page).toMatch(/fleet\.reason_label/)
  })

  it('صفحة الآليات تعرض الحالة دائماً: بناء · شهادة · ربط', () => {
    expect(page).toContain('حالة البناء')
    expect(page).toContain('حماية اليوم من التفريغ')
    expect(page).toContain('تغطية الربط')
    // الشهادة تُقرأ من صفّ الأسطول لا تُفترض
    expect(page).toMatch(/fleet\.certified/)
  })

  it('صفحة الزيارات (المرحلة ⑤) تحمل نفس الأرقام الثلاثة', () => {
    const visits = read('src/portals/ops-room/pages/MapPlanning/OpsMapVisitsPage.tsx')
    expect(visits).toContain('useVisitReadiness')
    expect(visits).toContain('بناء زيارات هذا الزون')
    expect(visits).toContain('حماية النقاط الخام')
    expect(visits).toMatch(/fleet\.points_unbound/)
    // الربط يُشترط لصفّ الأسطول لا لصفّ الزون
    expect(visits).toMatch(/readiness\.find\(\(r\) => r\.level === 'fleet'\)/)
  })

  it('الرابط إلى ربط الأجهزة يستعمل Link لا <a href> (لا إعادة تحميل الصفحة)', () => {
    const visits = read('src/portals/ops-room/pages/MapPlanning/OpsMapVisitsPage.tsx')
    expect(visits).toContain("from 'react-router'")
    expect(page).toContain("from 'react-router'")
    expect(page).not.toMatch(/<a href="\/ops-room\/gps"/)
  })
})
