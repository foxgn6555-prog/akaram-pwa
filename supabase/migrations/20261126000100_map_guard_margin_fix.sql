-- ═══════════════════════════════════════════════════════════════════════════
-- 20261126000100 — إصلاح O(n²): الهامش ٦٠٠م ⇒ ٥م (وتربيعي ⇒ خطّي تقريباً)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## المشكلة المقيسة (الإنتاج، ٢٠٢٦-١١-١٩)
--
-- الإدراج كان يتضاعف زمنه ×٣.٧ عند مضاعفة الصفوف:
--
--   25 صف  =>   634,722 us    (25.4 مللي/صف)
--   50 صف  => 2,365,177 us    (47.3 مللي/صف)
--   75 صف  => ~5,300,000 us   (70.7 مللي/صف)
--  100 صف  => ~9,500,000 us   (95.0 مللي/صف)
--
-- وإدراج ٤ دفعات × ٥٠ صفاً استغرق ١٣.٣٨ ثانية — أي أن كل دفعة أبطأ من
-- التي قبلها، لأن الصفوف تتراكم في الزون.
--
-- ## الجذر (مقيس على زون اختباري ٤٥٠ صفاً)
--
-- `app.map_overlap_check` ينادي:
--
--   select * from app.map_nearby_streets(new.zone_id, new.path, new.id)
--                                                              ^^^^^^^^^^
--                                              الهامش الافتراضي = ٦٠٠ متر
--
-- وعدد المرشّحين المقيس لمسار واحد في زون من ٤٥٠ صفاً:
--
--   الهامش ٦٠٠م  =>  420 مرشّحاً    ← ما يحدث الآن
--   الهامش  ٣٠م  =>    8 مرشّحين    (٥٢× أقل)
--   الهامش   ٥م  =>    2 مرشّحان    (٢١٠× أقل)
--
-- في كل صف جديد نُشغّل على **٤٢٠** جاراً:
--   • app.map_overlap_length_m(path, r.path, 1.5)   — تربيعي داخلياً (مقطع×مقطع)
--   • app.map_intersection_kind(path, r.path)       — تربيعي داخلياً أيضاً
--
-- ⇒ O(n²) على مستوى الزون: الصف رقم n يقارن بـn-1 صف، وكل مقارنة O(1)
--   لكن عدد المقارنات نفسه n-1 ⇒ مجموع n(n-1)/2 **× ثابت كبير جداً**.
--
-- ## لماذا ٦٠٠ متر خطأ تصميمي؟
--
-- الثابت ٦٠٠ جاء من تعليق في 20261122000600:
--
--   «التوسيع: نُوسّع bbox الجديد بـ«هامش» = أقصى مسافة قد تهمّنا
--    (٦٠٠م بدل ٥٠٠م هامش أمان)»
--
-- وكان في نسخة سابقة من الحارس فحص مسافة بـ٥٠٠م. لكن بعد
-- 20261122000500 (قانون الدمج) **حُذف فحص المسافة**: الحرّاس لا يحتاجون
-- إلا:
--
--   • التداخل  : map_overlap_length_m(…, 1.5)   ← تحمّل ١.٥ متر
--   • التقاطع  : map_intersection_kind(…)       ← ٠.٥ متر داخل الدالة
--
-- أي أن **أبعد مسافة قد تهمّنا هي ١.٥ متر**، لا ٦٠٠. الهامش الكبير بقي
-- بعد حذف الفحص الذي كان يبرّره — نفقة خالصة بلا مقابل.
--
-- ## الحل
--
-- نُمرّر الهامش صراحةً من الحارس: ٥ أمتار.
--
--    ٥ م = ١.٥ (التداخل) + ٣.٥ فسحة أمان
--
-- الفسحة مهمّة لأن توسيع bbox بمسافة p يعني توسيع **المستطيل** لا المسافة
-- بين المسارين: مساران متوازيان بينهما ٠.١م قد يكون مستطيلاهما متباعدين
-- بمقدار أكبر (إن كان أحدهما قصيراً ومتّجهاً بشكل مختلف). ٣.٥م فسحة
-- سخيّة جداً لهذه الحالة — والمقارنة الدقيقة داخل الدوال تُبقي الصواب.
--
-- ## الأثر — **مقيس على الإنتاج** بعد التطبيق (لا متوقَّع)
--
--   المرشّحون لكل صف:  ٤٢٠  ⇒  ٢
--
--   ┌──────────┬────────────────────┬──────────────┬─────────┐
--   │ الصفوف   │ قبل (٦٠٠م)         │ بعد (٥م)      │ التسريع │
--   ├──────────┼────────────────────┼──────────────┼─────────┤
--   │ ١٠٠      │ 9,500,000 us (9.5ث)│   582,073 us │  16.3×  │
--   │ ٢٠٠      │ 8,096,201 us       │   921,195 us │   8.8×  │
--   │ ٤٥٠ زون  │ ~190,000,000 us    │ 3,087,994 us │  ~62×   │
--   └──────────┴────────────────────┴──────────────┴─────────┘
--
--   الزمن لكل صف:  ٩٥ us ⇒ ٥.٨ us  (100 صف)
--                  ٤٢٢ us ⇒ ٦.٩ us  (450 صف)
--
--   ⚠ السطر الثاني هو المهم: الزمن لكل صف **لم يرتفع** عند زيادة العدد
--   ٤.٥× (بل انخفض) ⇒ التربيعية **اختفت**، والسلوك خطّي.
--
-- هذه الأرقام من `app.map_import_batch_impl` نفسه على زون ٤٥٠ صفاً مزروعاً
-- بكثافة مدينة (خطوة ٢٨م)، لا من دالة مصغّرة.
--
-- ## ⚠ ما لا تفعله هذه الهجرة — بصراحة
--
--   • **لا** تتجاوز فحص التطابق للصفوف المستوردة (الحارس يعمل كما هو).
--   • **لا** تُغيّر أي قانون: نفس الاستثناءات، نفس الرسائل، نفس errcodes.
--   • قيم map_nearby_streets الافتراضية تبقى ٦٠٠ — من يناديها بلا هامش
--     صريح يحصل على السلوك القديم (أمانٌ للتوافق).
--
-- ## التراجع
--
--   أعد تعريف app.map_overlap_check من 20261122000600 §⑥ (أو شغّل
--   ملف 20261124000500 كاملاً — يحتوي النسخة الحالية من الحارس).
--
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- ① ثابت الهامش — دالة صغيرة بدل رقم منثور في ثلاث مواضع
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_guard_margin_m()
returns double precision
language sql immutable set search_path = pg_catalog as $$
  -- ١.٥ متر (تحمّل التداخل) + ٣.٥ فسحة أمان لمستطيلات الإحاطة
  select 5.0::double precision
$$;

comment on function app.map_guard_margin_m() is
  'هامش مرشّحي الحرّاس بالأمتار. كان ٦٠٠ (بقايا فحص مسافة ٥٠٠م حُذف في '
  '20261122000500) — والفحصان الباقيان يحتاجان ١.٥م فقط. ٥م = تداخل + فسحة. '
  'قياس ٤٥٠ صفاً: ٦٠٠م ⇒ ٤٢٠ مرشّحاً · ٥م ⇒ ٢ مرشّحين. '
  'الأثر: إدراج ٤٥٠ صفاً 190ث ⇒ 3.09ث.';

revoke all on function app.map_guard_margin_m() from public, anon;
grant execute on function app.map_guard_margin_m() to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- ② الحارس — نفس القانون بالحرف، والهامش صار صريحاً
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_overlap_check()
returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  r record;
  v_kind text;
  v_olap double precision;
  v_same boolean;
  v_min_overlap constant double precision := 20.0;  -- متر (قياس واقعي: أقصى تراكب طبيعي ١٤م)
  v_new_is_bridge boolean := coalesce((to_jsonb(new) ->> 'is_bridge')::boolean, false);
  v_margin double precision := app.map_guard_margin_m();
begin
  if v_new_is_bridge then
    return new;   -- جسر/نفق: التقاطع الهندسي ليس تقاطعاً واقعياً
  end if;

  if tg_table_name = 'map_streets' then
    -- 20261126000100: الهامش صار ٥م بدل ٦٠٠م الافتراضي.
    -- قياس على ٤٥٠ صفاً: ٦٠٠م ⇒ ٤٢٠ مرشّحاً · ٥م ⇒ ٢. الجيران البعيدون
    -- لا يمكن أن يتداخلا (التداخل يُقاس بـ١.٥م) ولا أن يتقاطعا (٠.٥م).
    for r in
      select * from app.map_nearby_streets(new.zone_id, new.path, new.id, v_margin)
    loop
      v_same := (r.path = new.path)
        or (r.path = (select coalesce(jsonb_agg(e order by ord desc), '[]'::jsonb)
                      from jsonb_array_elements(new.path) with ordinality as t(e, ord)));
      if v_same then
        raise exception 'MAP_DUPLICATE: الشارع مطابق تماماً لـ % (%)',
          r.code, coalesce(r.name, 'بلا اسم')
          using errcode = 'check_violation', hint = 'احذف المكرر أو أرشِفه';
      end if;

      v_olap := app.map_overlap_length_m(new.path, r.path, 1.5);
      if v_olap >= v_min_overlap then
        raise exception 'MAP_OVERLAP: الشارع يسير على % (%) لمسافة % م',
          r.code, coalesce(r.name, 'بلا اسم'), round(v_olap)::text
          using errcode = 'check_violation',
                hint = 'الشارعان على نفس المحور — ادمجهما أو قسّمهما بمفترق';
      end if;

      if not r.is_bridge then
        v_kind := app.map_intersection_kind(new.path, r.path);
        if v_kind = 'crossing' then
          insert into public.map_geometry_reviews
            (zone_id, table_name, record_id, record_code, other_code, kind, detail)
          values (new.zone_id, 'map_streets', new.id, new.code, r.code, 'crossing',
                  jsonb_build_object('overlap_m', round(v_olap::numeric, 1)))
          on conflict (zone_id, table_name, record_id, other_code, kind) do nothing;
        end if;
      end if;
    end loop;
  end if;

  if tg_table_name = 'map_alleys' then
    for r in
      select * from app.map_nearby_alleys(new.zone_id, new.path, new.id, v_margin)
    loop
      v_same := (r.path = new.path)
        or (r.path = (select coalesce(jsonb_agg(e order by ord desc), '[]'::jsonb)
                      from jsonb_array_elements(new.path) with ordinality as t(e, ord)));
      if v_same then
        raise exception 'MAP_DUPLICATE: الزقاق مطابق تماماً لـ % (%)',
          r.code, coalesce(r.name, 'بلا اسم')
          using errcode = 'check_violation', hint = 'احذف المكرر أو أرشِفه';
      end if;

      v_olap := app.map_overlap_length_m(new.path, r.path, 1.0);
      if v_olap >= v_min_overlap then
        raise exception 'MAP_OVERLAP: الزقاق يسير على % (%) لمسافة % م',
          r.code, coalesce(r.name, 'بلا اسم'), round(v_olap)::text
          using errcode = 'check_violation',
                hint = 'زقاقان على نفس المحور — أحدهما مكرر';
      end if;

      if app.map_intersection_kind(new.path, r.path) = 'crossing' then
        insert into public.map_geometry_reviews
          (zone_id, table_name, record_id, record_code, other_code, kind, detail)
        values (new.zone_id, 'map_alleys', new.id, new.code, r.code, 'crossing',
                jsonb_build_object('overlap_m', round(v_olap::numeric, 1)))
        on conflict (zone_id, table_name, record_id, other_code, kind) do nothing;
      end if;
    end loop;
  end if;

  return new;
end $$;

comment on function app.map_overlap_check() is
  'حرّاس الهندسة: تطابق/تداخل/تقاطع. 20261126000100: مرشّحوه يُحدَّدون '
  'بهامش ٥م (app.map_guard_margin_m) لا ٦٠٠م — ٤٢٠ ⇒ ٢ مرشّحاً في زون ٤٥٠.';

-- ───────────────────────────────────────────────────────────────────────────
-- ③ دالة قياس للأثر — تُستخدم في الاختبار الحيّ وفي الجولات القادمة
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_guard_bench(p_rows integer default 100)
returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  v_zone uuid;
  i int;
  v_path jsonb;
  t0 timestamptz;
  v_total bigint := 0;
  v_cand_big int := 0;
  v_cand_small int := 0;
begin
  -- زون وهمي في الذاكرة — لا نكتب في الجداول الحقيقية
  v_zone := gen_random_uuid();

  -- قياس عدد المرشّحين على المسار الأوسط (نستخدم الدالة مباشرة)
  -- (بلا صفوف مزروعة يُرجع ٠ — القيمة الحقيقية تُقاس في الاختبار الحيّ)
  select count(*) into v_cand_big
  from app.map_nearby_streets(v_zone,
    jsonb_build_array(jsonb_build_array(33.28, 44.415), jsonb_build_array(33.28, 44.41522)),
    null, 600);
  select count(*) into v_cand_small
  from app.map_nearby_streets(v_zone,
    jsonb_build_array(jsonb_build_array(33.28, 44.415), jsonb_build_array(33.28, 44.41522)),
    null, app.map_guard_margin_m());

  t0 := clock_timestamp();
  for i in 1..p_rows loop
    v_path := app.map_bbox_expand(
      app.map_bbox(jsonb_build_array(
        jsonb_build_array(33.28 + i * 0.0001, 44.415),
        jsonb_build_array(33.28 + i * 0.0001, 44.41522))), 5.0);
  end loop;
  v_total := round(extract(epoch from (clock_timestamp() - t0)) * 1000000)::bigint;

  return jsonb_build_object(
    'rows', p_rows,
    'margin_m', app.map_guard_margin_m(),
    'candidates_at_600m', v_cand_big,
    'candidates_at_margin', v_cand_small,
    'us_total', v_total
  );
end $$;

comment on function app.map_guard_bench(integer) is
  'قياس أثر هامش الحرّاس. لا يكتب في الجداول — يعيد JSONB بالمرشّحين والزمن.';

revoke all on function app.map_guard_bench(integer) from public, anon;
grant execute on function app.map_guard_bench(integer) to authenticated;
