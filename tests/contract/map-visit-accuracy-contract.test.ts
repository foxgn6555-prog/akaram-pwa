/**
 * عقد دقة الزيارات (20261127000100) — يثبّت ثلاثة تصحيحات مقيسة:
 *
 *   ① الزقاق لا يعتمد عرضه المسجَّل: 489 زقاقاً بعرض 20–30م (قياس خاطئ
 *      بالمصدر) جعلت نصف قطر الدخول يبلغ 12م ⇒ آلية في الشارع الرئيسي
 *      تُحتسب «داخلة الزقاق». الآن 3م ثابتة.
 *
 *   ② الزيارة التي لا تُثبَت لا تُدرَج: مكوث ≤ 0 أو نقاط < 3.
 *      على البيانات الحقيقية كان 1067 من 1915 (56%) مكوثها صفر.
 *
 *   ③ زقاق مغطّى ≥95% زمنياً بزيارة شارع لنفس الآلية = تلامس لا دخول.
 *
 * المبدأ الحاكم لم يتغيّر: «لا صفر كاذب» — لكن الضجيج الكاذب مرفوض أيضاً.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const MIG = 'supabase/migrations/20261127000100_map_visit_accuracy.sql'
const ENGINE_V1 = 'supabase/migrations/20261122000700_map_visits_engine.sql'
const ENGINE_V2 = 'supabase/migrations/20261122000800_map_visits_baghdad_day.sql'

describe('① نصف قطر الدخول واعٍ بنوع المكان', () => {
  it('الزقاق 3م ثابتة — لا يعتمد العرض المسجَّل', () => {
    const sql = read(MIG)
    // الفرع الصريح: النوع `alley` ⇒ 3.0 في الحدّين
    expect(sql).toMatch(/when p_kind = 'alley' then 3\.0/)
    // والسقف والأرضية كلاهما 3.0 للزقاق
    expect(sql).toMatch(/case when p_kind = 'alley' then 3\.0 else 12\.0 end/)
  })

  it('التوقيع الجديد نوعيّ: (numeric, text)', () => {
    expect(read(MIG)).toMatch(/function app\.map_entry_radius_m\(p_width_m numeric, p_kind text\)/)
  })

  it('المحرّك يمرّر النوع فعلاً — لا يستعمل التوقيع القديم', () => {
    const sql = read(MIG)
    expect(sql).toMatch(/app\.map_entry_radius_m\(c\.width_m, c\.kind\)/)
    // القديم (بلا نوع) يجب ألّا يُستدعى داخل المحرّك
    expect(sql).not.toMatch(/app\.map_entry_radius_m\(c\.width_m\)(?!\s*,)/)
  })

  it('الشارع لم يتغيّر سلوكه — عرض/2 − 1م', () => {
    expect(read(MIG)).toMatch(/coalesce\(p_width_m, 6\.0\) \/ 2\.0 - 1\.0/)
  })
})

describe('② الزيارة غير المُثبتة لا تُدرَج', () => {
  it('الإسقاط يشمل المكوث الصفري والنقاط الأقل من ثلاث', () => {
    const sql = read(MIG)
    expect(sql).toMatch(/when c\.dwell_s <= 0 then 'zero_dwell'/)
    expect(sql).toMatch(/when c\.pts_n < 3\s+then 'too_few_points'/)
  })

  it('الإدراج يقرأ من `_map_kept` (المُصفّى) لا من `_map_merged` (الخام)', () => {
    const sql = read(MIG)
    // قسم decided يقرأ من kept
    expect(sql).toMatch(/from _map_kept m\s*\n\s*\), ins as/)
    // ولا يوجد إدراج يقرأ من merged مباشرة
    expect(sql).not.toMatch(/from _map_merged m\s*\n\s*\), ins as/)
  })

  it('التأكيد يشترط ٣ نقاط لا نقطتين', () => {
    expect(read(MIG)).toMatch(/m\.dwell_s >= p_min_dwell_seconds and m\.pts_n >= 3 and m\.has_pair/)
  })

  it('حالة الزيارة ما زالت محصورة في confirmed|uncertain — لا صنف ثالث', () => {
    // العقد الأصلي في 20261122000700 ساري: لا نضيف حالة «مرفوضة» للجدول
    expect(read(ENGINE_V1)).toMatch(/check \(status in \('confirmed','uncertain'\)\)/)
    // وهجرتنا لا تلمس القيد
    expect(read(MIG)).not.toMatch(/check \(status in/)
  })
})

describe('③ أولوية الشارع على الزقاق', () => {
  it('التغطية تُحسب من الزمن المشترك مع زيارات الشارع لنفس الآلية', () => {
    const sql = read(MIG)
    expect(sql).toMatch(/s\.place_kind = 'street'/)
    expect(sql).toMatch(/s\.vehicle_id = m\.vehicle_id/)
    expect(sql).toMatch(/least\(m\.exited_at, s\.exited_at\) - greatest\(m\.entered_at, s\.entered_at\)/)
  })

  it('العتبة 95% — محافظة: دخول حقيقي يُبقي ≥5% خارج الشارع', () => {
    expect(read(MIG)).toMatch(/c\.street_cover_s::numeric \/ c\.dwell_s >= 0\.95/)
    expect(read(MIG)).toMatch(/then 'street_covered'/)
  })

  it('الإسقاط للزقاق وحده — الشارع لا يُسقَط بأولوية', () => {
    expect(read(MIG)).toMatch(/when c\.place_kind = 'alley'\s+and c\.dwell_s > 0/)
  })
})

describe('④ الإبلاغ عن المسقَط بدل إخفائه', () => {
  it('نوع الإرجاع يحمل skipped_visits', () => {
    expect(read(MIG)).toMatch(/skipped_visits integer\)\nlanguage plpgsql/)
  })

  it('الغلاف العام يعيد كل الأعمدة الأربعة', () => {
    expect(read(MIG)).toMatch(
      /return query select \* from app\.map_build_visits\(p_zone, p_from, p_to, p_vehicle, p_min_dwell_seconds, p_max_gap_seconds, p_replace\)/,
    )
  })

  it('الواجهة تعرض المسقَط في التوست', () => {
    const hook = read('src/features/map-planning/hooks/useMapPlanning.ts')
    expect(hook).toMatch(/r\.skipped_visits/)
    expect(hook).toContain('أُسقطت لعدم إثباتها')
  })

  it('نوع TypeScript يحمل الحقل — لا وصول لحقل غير معرَّف', () => {
    expect(read('src/services/map-planning.sdk.ts')).toMatch(/skipped_visits: number/)
  })
})

describe('⑤ ما لا يجب أن تغيّره الهجرة', () => {
  it('منطق اليوم البغدادي محفوظ', () => {
    const sql = read(MIG)
    expect(sql).toMatch(/app\.map_baghdad_day\(d\.entered_at\)/)
    expect(sql).toMatch(/app\.map_baghdad_day\(v\.entered_at\) between v_day_from and v_day_to/)
  })

  it('المفتاح الفريد و`on conflict` محفوظان', () => {
    expect(read(MIG)).toMatch(/on conflict \(vehicle_id, place_kind, place_id, entered_at\) do nothing/)
  })

  it('الصلاحيات: لا anon على أي من الدالتين', () => {
    const sql = read(MIG)
    const revokes = sql.match(/revoke all on function [^;]+from public, anon;/g) ?? []
    expect(revokes.length).toBeGreaterThanOrEqual(3)
    expect(sql).toMatch(/grant execute on function public\.map_build_visits[^;]+to authenticated;/)
  })

  it('الهجرة تُسقط الغلاف القديم قبل إنشاء الجديد — نوع الإرجاع تغيّر', () => {
    const sql = read(MIG)
    const dropAt = sql.indexOf('drop function if exists public.map_build_visits')
    const createAt = sql.indexOf('create function public.map_build_visits')
    expect(dropAt).toBeGreaterThan(-1)
    expect(createAt).toBeGreaterThan(dropAt)
  })

  it('لا تستعمل `create or replace` على دالة تغيّر نوع إرجاعها', () => {
    const sql = read(MIG)
    expect(sql).not.toMatch(/create or replace function (app|public)\.map_build_visits/)
  })
})

describe('⑥ توثيق الأسباب مقيسة — لا ادّعاء', () => {
  it('الهجرة تنصّ على الأرقام المقيسة', () => {
    const sql = read(MIG)
    expect(sql).toContain('1067')
    expect(sql).toContain('489')
    expect(sql).toContain('20–30')
  })

  it('الهجرة تشرح لماذا 3م للزقاق', () => {
    expect(read(MIG)).toMatch(/زقاق بعرض 30م ليس زقاقاً/)
  })

  it('السبب الجذري في بيانات العرض موثَّق لا مخفيّ', () => {
    expect(read(MIG)).toMatch(/width_source='measured'/)
  })
})

describe('⑦ لا تناقض مع النسخة السابقة', () => {
  it('النسخة السابقة ما زالت تعرّف المحرّك — هجرتنا تبني عليها', () => {
    expect(read(ENGINE_V2)).toMatch(/create or replace function app\.map_build_visits/)
  })

  it('هجرة الدقة أحدث من آخر هجرة في السلسلة — لا تعارض ترقيم', () => {
    const files = readdirSync(join(ROOT, 'supabase/migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort()
    const idx = files.indexOf('20261127000100_map_visit_accuracy.sql')
    expect(idx).toBeGreaterThan(-1)
    // لا ملف لاحق يحمل الرقم نفسه أو أعلى في نفس النطاق الزمني
    const sameStamp = files.filter((f) => f.startsWith('20261127000100'))
    expect(sameStamp).toHaveLength(1)
    expect(files[idx]).toBe('20261127000100_map_visit_accuracy.sql')
    // والهجرة السابقة موجودة فعلاً
    expect(files).toContain('20261126000100_map_guard_margin_fix.sql')
  })
})
