-- ═══════════════════════════════════════════════════════════════════════════
-- 20261124000300 — الاستيراد لا يتجاوز المهلة: from 636ms to 1ms per path
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## العَرَض الذي وصل من الميدان
--
--   ① `app.map_import_batch` تُرجع HTTP 500:
--        «canceling statement due to statement timeout»
--   ② الواجهة تعرض «تعذّر إكمال العملية» ولا يُدرَج شيء.
--
-- ## القياس (على مشروع الإنتاج، ٢٠٢٦-١١)
--
--   بيئة Supabase: `statement_timeout = 2min`.
--
--   | الحالة                | الزمن        |
--   |-----------------------|--------------|
--   | ١٠٠ صف                | ٢٢.٧٧ ث      |  ← لا يزال تحت الحدّ
--   | ٥٠٠ صف                | > ٣٠ ثوانٍ   |  ← تجاوز مهلة العميل أيضاً
--   | دفعة واحدة (٤٣٩ مساراً)| > ١٢٠ ث     |  ← **٥٠٠ الحقيقي**
--
--   أي ٠٫٢٣ ث/صف. والمستخدم يُرسل ٤٣٩ مساراً في ٣ دفعات من ٢٠٠.
--
-- ## الجذر: `SET search_path` يُلغي inlining
--
--   `app.map_nearby_streets` كانت:
--
--       language sql stable set search_path = public, app as $$
--         select … where box(point((s.bbox)[2], …)) && box(
--           point((app.map_bbox_expand(app.map_bbox(p_path), p_margin_m))[2], …)
--           …
--       $$
--
--   المشكلة: `app.map_bbox_expand(app.map_bbox(p_path), p_margin_m)` **ثابت
--   لكل صف** (لا يعتمد على `s`)، لكنه مكتوب **٤ مرات** داخل تعبير `&&`.
--   وكان المتوقّع أن يحسبه المخطّط مرة واحدة (common subexpression)، لكن
--   خاصية `SET search_path` تُصنّف الدالة **غير قابلة للـ inlining**،
--   فتُستدعى الدالة كاملة لكل صف من `map_streets` — ٤ استدعاءات × عدد الصفوف.
--
--   القياس الفاصل:
--
--       دالة map_nearby_streets         636 ms  (٤٣ صفاً)
--       نفس المنطق inline               0–1 ms  (٤٣ صفاً)
--       ─────────────────────────────────────────
--       التسريع                         636 ×
--
-- ## الإصلاح: حساب bbox المستعلَم مرة واحدة في دالة بلا `SET`
--
--   `app.map_nearby_streets` و`map_nearby_alleys` صارتا `LANGUAGE sql`
--   **بلا `SET search_path`** (المخطّطات مؤهَّلة بالكامل `public.`/`app.`)،
--   مع `WITH bounds AS (SELECT app.map_bbox_expand(...) AS e)` — يُحسب مرة
--   واحدة ويُقرأ من الـCTE. وهكذا يستطيع المخطّط أن يُضمّن الدالة (inline)
--   ويُخطّط استعلام الفهرس GiST كما يجب.
--
--   النتيجة المقيسة بعد الإصلاح: **~١ مللي ثانية** لكل مسار ⇒ ٤٣٩ مساراً
--   في أقل من ثانية بدل أكثر من دقيقتين.
--
-- ## لماذا `SET search_path` حُذف آمناً هنا
--
--   هاتان الدالتان `LANGUAGE sql` وتحتويان **جدولين فقط** (`map_streets`
--   و`map_alleys`) وكل مرجع فيهما مؤهَّل صراحةً. لا `execute` ديناميكي،
--   ولا أسماء غير مؤهَّلة، فلا خطر search_path injection. أما الحارس
--   `map_overlap_check` فبقي `SECURITY DEFINER` + `SET` كما هو: هو الذي
--   يكتب في `map_geometry_reviews` ويحتاج تأمين المسار.
--
-- ## تحقّق بعد التطبيق
--
--   • `select app.map_nearby_streets(zone, path, null, 600)` ≈ ١ ms
--   • إدراج ٤٣٩ مساراً (٣ دفعات) < ٥ ثوانٍ كاملة
--   • الحرّاس لم تتغيّر سلوكياً: نفس الشروط ونفس الأعمدة المُعادة
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- ① map_nearby_streets — bbox المستعلَم مرة واحدة، بلا SET
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_nearby_streets(
  p_zone uuid, p_path jsonb, p_exclude uuid, p_margin_m double precision default 600.0
) returns table (id uuid, code text, name text, path jsonb, is_bridge boolean)
language sql
stable
as $$
  with bounds as (
    select app.map_bbox_expand(app.map_bbox(p_path), p_margin_m) as e
  )
  select s.id, s.code, s.name, s.path, coalesce(s.is_bridge, false)
  from public.map_streets s
  cross join bounds b
  where s.zone_id = p_zone
    and s.id is distinct from p_exclude
    and s.status <> 'archived'
    and s.bbox is not null
    and box(point((s.bbox)[2], (s.bbox)[1]), point((s.bbox)[4], (s.bbox)[3]))
        && box(point((b.e)[2], (b.e)[1]), point((b.e)[4], (b.e)[3]))
$$;

comment on function app.map_nearby_streets(uuid, jsonb, uuid, double precision) is
  'مرشّحو التقاطع من فهرس GiST. bbox المستعلَم يُحسب مرة واحدة في CTE — '
  'بدونه كان SET search_path يمنع inlining ويُعيد حسابه ٤× لكل صف (636ms ⇒ 1ms).';

-- ───────────────────────────────────────────────────────────────────────────
-- ② map_nearby_alleys — نفس الإصلاح
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_nearby_alleys(
  p_zone uuid, p_path jsonb, p_exclude uuid, p_margin_m double precision default 600.0
) returns table (id uuid, code text, name text, path jsonb)
language sql
stable
as $$
  with bounds as (
    select app.map_bbox_expand(app.map_bbox(p_path), p_margin_m) as e
  )
  select a.id, a.code, a.name, a.path
  from public.map_alleys a
  cross join bounds b
  where a.zone_id = p_zone
    and a.id is distinct from p_exclude
    and a.status <> 'archived'
    and a.bbox is not null
    and box(point((a.bbox)[2], (a.bbox)[1]), point((a.bbox)[4], (a.bbox)[3]))
        && box(point((b.e)[2], (b.e)[1]), point((b.e)[4], (b.e)[3]))
$$;

comment on function app.map_nearby_alleys(uuid, jsonb, uuid, double precision) is
  'مرشّحو التقاطع للأزقة — نفس إصلاح map_nearby_streets.';

-- ───────────────────────────────────────────────────────────────────────────
-- ③ إعادة منح الصلاحيات (CREATE OR REPLACE يُبقيها، لكن صريحاً أوضح)
-- ───────────────────────────────────────────────────────────────────────────
revoke all on function app.map_nearby_streets(uuid, jsonb, uuid, double precision)
  from public, anon;
revoke all on function app.map_nearby_alleys(uuid, jsonb, uuid, double precision)
  from public, anon;


-- ───────────────────────────────────────────────────────────────────────────
-- ④ دوال الهندسة: إزالة `SET search_path = pg_catalog` — يمنع inlining
-- ───────────────────────────────────────────────────────────────────────────
-- **القياس الذي كشف هذا:**
--
--   explain analyze select * from app.map_nearby_streets(...)
--     Planning Time: 11.329 ms
--     Execution Time:  0.042 ms     ← التنفيذ لا شيء
--
--   أي أن **٢٦٩×** من الزمن في التخطيط لا التنفيذ. والسبب أن كل دوال
--   الهندسة (`map_pt_lat`, `map_pt_lng`, `map_distance_m`, `map_bbox`,
--   `map_bbox_expand`, `map_overlap_length_m`, `map_intersection_kind`,
--   `map_line_length_m`, `map_max_segment_m`) تحمل
--   `SET search_path = pg_catalog`، وهذه الخاصية تجعل PostgreSQL
--   **يرفض تضمينها (inlining)** — فيُعاد تخطيط كل استدعاء من الصفر.
--
--   ومع ١٠٠ صف × ~٣٠ استدعاء = ٣٠٠٠ عملية تخطيط ⇒ ١٢.٥ ثانية.
--
-- **الإصلاح:** إسقاط `SET search_path` من الدوال التي:
--   ① لا تقرأ أي جدول (حساب هندسي خالص — jsonb وdouble precision فقط)
--   ② كل مرجع فيها مؤهَّل أو من `pg_catalog` الضمني
--
-- فهو **لا أثر أمني له** (لا يوجد جدول يمكن hijack مساره)، ويمنع التضمين
-- تماماً. بعد الإزالة يصبح التخطيط جزءاً من تخطيط الاستدعاء الأب.
do $fix$
declare
  fn text;
  fns text[] := array[
    'app.map_pt_lat(jsonb)',
    'app.map_pt_lng(jsonb)',
    'app.map_distance_m(double precision, double precision, double precision, double precision)',
    'app.map_bbox(jsonb)',
    'app.map_bbox_expand(double precision[], double precision)',
    'app.map_overlap_length_m(jsonb, jsonb, double precision)',
    'app.map_intersection_kind(jsonb, jsonb)',
    'app.map_line_length_m(jsonb)',
    'app.map_max_segment_m(jsonb)',
    -- الدفعة الثانية: اكتُشفت بعد قياس map_intersection_kind (62ms/27 زوجاً)
    'app.map_point_segment_m(double precision, double precision, double precision, double precision, double precision, double precision)',
    'app.map_centroid(jsonb)',
    'app.map_is_vertex(jsonb, jsonb, double precision)',
    'app.map_paths_intersect(jsonb, jsonb)',
    'app.map_point_depth_m(double precision, double precision, jsonb)',
    'app.map_point_in_zone(double precision, double precision, jsonb, double precision)',
    'app.map_segments_intersect(jsonb, jsonb, jsonb, jsonb)'
  ];
begin
  foreach fn in array fns loop
    -- آلتر على التكوين فقط: يُبقي كل شيء آخر (الجسم، الملكية، الأذونات)
    execute format('alter function %s reset search_path', fn);
  end loop;
end $fix$;

-- ───────────────────────────────────────────────────────────────────────────
-- ⑤ سقف حجم الدفعة — إصلاح جراحي على الدالة الحيّة
-- ───────────────────────────────────────────────────────────────────────────
-- الدالة `map_import_batch` طويلة (~١٢٦٩٤ حرفاً) وتحتوي منطق الأزقة والشوارع
-- الذي أُصلح في هجرات سابقة. **إعادة كتابتها بالكامل هنا خطر**: أي انحراف
-- لفظي يُسقط إصلاحاً سابقاً. فنُبقيها كما هي ونضيف حراسة الحجم في غلاف
-- رقيق يُستدعى من الواجهة باسمها نفسه عبر تعيينها مرة واحدة:
--
--   app.map_import_batch     ← الغلاف (يفحص الحجم ثم يستدعي)
--   app.map_import_batch_impl ← التنفيذ الأصلي (نقل بلا تغيير)
--
-- ⚠ `create or replace` لا يمكنه تغيير اسم؛ فنستخدم rename ذرّياً داخل DO.

do $mig$
declare
  v_exists boolean;
begin
  -- إن كان الغلاف قد ثُبِّت سابقاً فلا ننقل مرة أخرى
  select exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname = 'map_import_batch_impl'
  ) into v_exists;

  if not v_exists then
    alter function app.map_import_batch(uuid, jsonb, jsonb, uuid, jsonb)
      rename to map_import_batch_impl;
  end if;
end $mig$;

create or replace function app.map_import_batch(
  p_zone uuid,
  p_rows jsonb,
  p_mahallas jsonb default '{}'::jsonb,
  p_batch uuid default null,
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, app
as $fn$
declare
  /*
   * سقف حجم الدفعة.
   *
   * **القياس الذي فرضه** (قبل إصلاح المرشّحين في ①–② أعلاه):
   *   ١٠٠ صف ≈ ٢٢.٧٧ ثانية | ٥٠٠ صف > ٣٠ ثانية (تجاوز مهلة الأداة)
   *   ودفعة الواجهة ٤٣٩ مساراً ⇒ «canceling statement due to statement timeout»
   *   والنتيجة للمستخدم: HTTP 500 و«تعذّر إكمال العملية» بلا سطر يُفهم.
   *
   * **بعد** إصلاح ①–②: ٢٠٠ صف ≈ ١–٢ ثانية. فالسقف ٣٠٠ يترك هامشاً
   * مريحاً ويمنع أي مستدعٍ (سكربت/curl/اختبار) من ملامسة المهلة صامتاً.
   * والواجهة تُرسل ٢٠٠ — لا تغيير عليها.
   */
  v_max_rows constant int := 300;
  v_n int;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'MAP_IMPORT_ROWS_INVALID: p_rows ليست مصفوفة'
      using errcode = 'invalid_parameter_value';
  end if;

  v_n := jsonb_array_length(p_rows);
  if v_n > v_max_rows then
    raise exception 'MAP_IMPORT_BATCH_TOO_LARGE: % صفاً في دفعة واحدة (السقف %) — قسّمها', v_n, v_max_rows
      using errcode = 'invalid_parameter_value',
            hint = 'الواجهة تُرسل ٢٠٠ صفاً لكل دفعة. إن كنت تستدعي الدالة يدوياً فقسّمها إلى دفعات ≤ ٣٠٠.';
  end if;

  return app.map_import_batch_impl(p_zone, p_rows, p_mahallas, p_batch, p_meta);
end $fn$;

comment on function app.map_import_batch(uuid, jsonb, jsonb, uuid, jsonb) is
  'غلاف حراسة: يرفض دفعات > ٣٠٠ صفاً (كانت ٥٠٠ تتجاوز statement_timeout '
  'وتُظهر 500 صامت)، ثم يستدعي map_import_batch_impl.';

revoke all on function app.map_import_batch_impl(uuid, jsonb, jsonb, uuid, jsonb) from public, anon;
grant execute on function app.map_import_batch(uuid, jsonb, jsonb, uuid, jsonb) to authenticated;
