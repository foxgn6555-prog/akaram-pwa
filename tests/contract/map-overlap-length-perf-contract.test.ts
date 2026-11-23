/**
 * عقد الجولة ⑩ — كلفة فحص التطابق: ٢٧.٦ms ⇒ أقل من الميلي ثانية.
 *
 * ## العَرَض
 *
 * كل إدراج لشارع يُشغّل trigger `map_streets_overlap_trg` →
 * `app.map_overlap_check()`، الذي يمشي على كل جارٍ ضمن ٦٠٠ متر ويستدعي
 * `app.map_overlap_length_m(new.path, r.path, 1.5)` لكل واحد.
 *
 * ## القياس (قاعدة الإنتاج، ٢٠٢٦-١١-١٩ — ١٠٠ استدعاء)
 *
 * | الدالة | الزمن/استدعاء |
 * |---|---|
 * | `map_overlap_length_m` | **27.62 ms** |
 * | `map_intersection_kind` | 1.04 ms |
 * | `map_bbox` | 1.01 ms |
 *
 * أي أن `map_overlap_length_m` = **٩٦.٤٪** من كلفة كل جار. تحسين
 * `map_intersection_kind` وحده كان سيوفّر ٣.٦٪ — لا يُحسّ.
 *
 * ## الجذر
 *
 * ```sql
 * for j in 0 .. nb - 2 loop
 *   b1x := app.map_pt_lng(p_b->j);
 *   for i in 0 .. na - 2 loop
 *     a1x := app.map_pt_lng(p_a->i);   -- ← داخل الحلقة الداخلية
 *     a1y := app.map_pt_lat(p_a->i);
 *     a2x := app.map_pt_lng(p_a->(i+1));
 *     a2y := app.map_pt_lat(p_a->(i+1));
 * ```
 *
 * فالنقطة `a[i]` تُقرأ **مرة لكل مقطع b** ⇒ `na × nb` قراءة بدل `na`.
 * و`map_pt_lng`/`map_pt_lat` بدورهما تناديان `app.map_safe_num`.
 * الحساب: ٣٠ × ٣٠ = ٩٠٠ زوج × ٤ قراءات × ٢ استدعاء ≈ **٧٢٠٠ استدعاء دالة**.
 *
 * ## الإصلاح — ثلاث طبقات
 *
 *  ① **رفع القراءة (hoisting)**: مصفوفتان `alats/alngs` و`blats/blngs`
 *    تُملأ مرة واحدة قبل الحلقتين ⇒ ٧٢٠٠ ⇒ ~١٢٤ استدعاء.
 *  ② **قطع مبكر بالـbbox**: إن تباعد المستطيلان بأكثر من `p_tol_m` فالنتيجة
 *    صفر حتماً ⇒ جارٌ بعيد يرجع فوراً.
 *  ③ (بلا تغيير) كل العمليات الحسابية منقولة حرفياً — لا تغيير في النتيجة.
 *
 * ## إثبات تطابق الناتج (قاعدة الإنتاج)
 *
 * ```
 * md5 قبل  = 4915e7ae084a44ef7e878792f50a45f1
 * md5 بعد  = 4915e7ae084a44ef7e878792f50a45f1   ✓ مطابق
 * ```
 *
 * والقيم المرجعية الأربع لم تتغيّر أي منزلة:
 * متطابقان `144.919283393444` · متوازيان ٢م `143.212910886871` · متقاطعان `0` · متباعدان `0`.
 *
 * ## الزمن بعد
 *
 * | الحالة | قبل | بعد |
 * |---|---|---|
 * | مساران ٣١ نقطة | 27.62 ms | **5.85 ms** (٤.٧×) |
 * | مساران ٢١ نقطة | — | **1.65 ms** |
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8')

const migration = read('supabase/migrations/20261124000500_map_overlap_length_perf.sql')
const prevSpatial = read('supabase/migrations/20261122000600_map_spatial_index.sql')

/** جسم الدالة فقط (بين `create …` و`end $function$`) */
const fnBody = (): string => {
  const start = migration.indexOf('create or replace function app.map_overlap_length_m(')
  const end = migration.indexOf('end $function$;', start)
  return migration.slice(start, end)
}

describe('⑩ — رفع قراءة الإحداثيات (النواة)', () => {
  it('مصفوفات alats/alngs/blats/blngs معرَّفة', () => {
    const b = fnBody()
    expect(b).toContain('alats double precision[]')
    expect(b).toContain('alngs double precision[]')
    expect(b).toContain('blats double precision[]')
    expect(b).toContain('blngs double precision[]')
  })

  it('تُملأ مرة واحدة قبل الحلقتين (لا داخل حلقة الأزواج)', () => {
    const b = fnBody()
    const fillIdx = b.indexOf('alats[i + 1] := app.map_pt_lat(p_a -> i)')
    const outerLoop = b.indexOf('for j in 1 .. nb - 1 loop')
    expect(fillIdx).toBeGreaterThan(-1)
    expect(outerLoop).toBeGreaterThan(-1)
    // التعبئة **قبل** حلقة المقاطع
    expect(fillIdx).toBeLessThan(outerLoop)
  })

  it('🗝 لا استدعاء map_pt_* داخل حلقة الأزواج — هذا هو الجذر', () => {
    const b = fnBody()
    const outerIdx = b.indexOf('for j in 1 .. nb - 1 loop')
    const innerLoopIdx = b.indexOf('for i in 1 .. na - 1 loop')
    expect(outerIdx).toBeGreaterThan(-1)
    expect(innerLoopIdx).toBeGreaterThan(outerIdx)

    // كل ما بعد بداية الحلقة الخارجية حتى النهاية: لا map_pt_
    const afterOuter = b.slice(outerIdx)
    expect(afterOuter).not.toContain('app.map_pt_lat')
    expect(afterOuter).not.toContain('app.map_pt_lng')
    // ولا `p_a->`/`p_b->` — القراءة صارت من المصفوفات
    expect(afterOuter).not.toMatch(/p_[ab]\s*->/)
  })

  it('الشيفرة القديمة كانت تقرأ داخل الحلقة (الدليل النصي على الجذر)', () => {
    // التعريف الساري في 20261122000600 سطر ١٧٢-١٧٣ — دليل الجذر
    const old = prevSpatial
    expect(old).toMatch(/for i in 0\.\.na - 2 loop/)
    const loopIdx = old.search(/for i in 0\.\.na - 2 loop/)
    const readIdx = old.indexOf('a1x := app.map_pt_lng(p_a->i)', loopIdx)
    expect(loopIdx).toBeGreaterThan(-1)
    // القراءة **داخل** الحلقة الداخلية — هذا هو الجذر بالضبط
    expect(readIdx).toBeGreaterThan(loopIdx)
    // والدليل أن الحلقة الداخلية تقع داخل حلقة j
    const outerIdx = old.search(/for j in 0\.\.nb - 2 loop/)
    expect(outerIdx).toBeGreaterThan(-1)
    expect(loopIdx).toBeGreaterThan(outerIdx)
  })
})

describe('⑩ — القطع المبكر بالـbbox', () => {
  it('يقرأ bbox المسبق ويرجع ٠ قبل أي حلقة', () => {
    const b = fnBody()
    expect(b).toContain('ba := app.map_bbox(p_a)')
    expect(b).toContain('bb := app.map_bbox(p_b)')
    const bboxIdx = b.indexOf('ba := app.map_bbox(p_a)')
    const outerLoop = b.indexOf('for j in 1 .. nb - 1 loop')
    expect(bboxIdx).toBeLessThan(outerLoop)
  })

  it('ba/bb من نوع double precision[] لا jsonb (عيب ٢٢P٠٢)', () => {
    const b = fnBody()
    expect(b).toContain('ba double precision[]')
    expect(b).toContain('bb double precision[]')
    expect(b).not.toMatch(/\bba jsonb\b/)
    expect(b).not.toMatch(/\bbb jsonb\b/)
  })

  it('الترتيب [min_lat, min_lng, max_lat, max_lng] مؤكَّد', () => {
    // تحقّق حيّ: map_bbox('[[33.31,44.36],[33.30,44.35]]') ⇒ {33.3,44.35,33.31,44.36}
    const b = fnBody()
    // الفحص يستخدم [1]=min_lat و[3]=max_lat و[2]=min_lng و[4]=max_lng
    expect(b).toMatch(/ba\[3\] \+ pad_lat < bb\[1\]/)
    expect(b).toMatch(/bb\[3\] \+ pad_lat < ba\[1\]/)
    expect(b).toMatch(/ba\[4\] \+ pad_lng < bb\[2\]/)
    expect(b).toMatch(/bb\[4\] \+ pad_lng < ba\[2\]/)
  })
})

describe('⑩ — الشروط الأصلية محفوظة حرفياً', () => {
  it('شرط null على a1x/a2x فقط (لا a1y/a2y — لا تغيير سلوك)', () => {
    const b = fnBody()
    expect(b).toMatch(/if a1x is null or a2x is null then continue; end if;/)
    expect(b).not.toMatch(/a1x is null or a1y is null/)
  })

  it('شرط b1x/b2x في الحلقة الخارجية', () => {
    expect(fnBody()).toMatch(/if b1x is null or b2x is null then continue; end if;/)
  })

  it('dlen <= 0 يُستبعد', () => {
    expect(fnBody()).toMatch(/if dlen <= 0 then continue; end if;/)
  })

  it('dprep > p_tol_m يُستبعد، وhi <= lo يُستبعد', () => {
    const b = fnBody()
    expect(b).toMatch(/if dprep > p_tol_m then continue; end if;/)
    expect(b).toMatch(/if hi <= lo then continue; end if;/)
  })

  it('يستخدم map_distance_m (لا Haversine مضمَّنة — نفس الدالة)', () => {
    expect(fnBody()).toContain('app.map_distance_m(a1y, a1x, a2y, a2x)')
  })

  it('يُبقى immutable (الدوال المساعدة نقية)', () => {
    expect(fnBody()).toMatch(/language plpgsql\s*\n\s*immutable/)
  })
})

describe('⑩ — التوثيق يحمل القياس لا يدّعيه', () => {
  it('السطور تحمل الأرقام المقيسة قبل/بعد', () => {
    expect(migration).toContain('27.62')
    expect(migration).toContain('5.85')
    expect(migration).toContain('٤.٧×')
  })

  it('بصمة إثبات التطابق موجودة', () => {
    expect(migration).toContain('4915e7ae084a44ef7e878792f50a45f1')
  })

  it('القيم المرجعية الأربع موثّقة', () => {
    expect(migration).toContain('144.919283393444')
    expect(migration).toContain('143.212910886871')
  })

  it('يعترف بما تبقّى (حلقة PL/pgSQL)', () => {
    expect(migration).toMatch(/حلقة PL\/pgSQL نفسها/)
  })
})
