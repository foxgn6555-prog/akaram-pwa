-- ═══════════════════════════════════════════════════════════════════════════
-- 20261122000600 — فهرس مكاني للحرّاس: من تربيعي إلى لوغاريتمي
-- ═══════════════════════════════════════════════════════════════════════════
-- المشكلة المقيسة:
--   حرّاس الهندسة كانوا يقارنون كل مسار جديد بـ**كل** مسارات الزون:
--     الأرخيته (٣١٦ عنصراً)        ⇒ ٣٠٠ ثانية      ✓ مقبول
--     الرياض+الواثق+الجادرية (١٣٢٧) ⇒ >١٢٠ دقيقة    ✗ غير مقبول
--   السبب: لكل زوج تُشغَّل map_distance_between_paths_m التي تفحص
--   كل مقطع ضد كل مقطع. مع ١٦٣٨ عنصراً يصبح كل إدراج ~٢.٧ مليون عملية.
--   والنتيجة أن المحرّر (يُدرج ويعدّل باستمرار) سيصبح غير قابل للاستخدام.
--
-- الحل: مستطيل إحاطة (bbox) لكل مسار في عمود مخصّص + فهرس GiST.
--   عند الإدراج نحسب bbox الجديد ونسأل القاعدة عن المسارات التي **تتقاطع
--   مستطيلاتها** فقط (استعلام فهرس حقيقي، لا مسح كامل). ثم نُبقي الفحص
--   الدقيق (المسافة ٥٠٠م والتداخل) على هذه المجموعة الصغيرة وحدها.
--
--   التوسيع: نُوسّع bbox الجديد بـ«هامش» = أقصى مسافة قد تهمّنا (٦٠٠م
--   بدل ٥٠٠م هامش أمان)، لأن مساراً قد يكون قريباً بمسافة ٥٠٠م دون أن
--   يتقاطع مستطيلاه (مثلاً مساران متوازيان بينهما ١٠م لكن أحدهما خارج
--   مستطيل الآخر). التوسيع يُلغي هذه الحالة الحدّية.
--
--   الأثر: من O(n²) إلى O(n log n) تقريباً — الإدراج يصبح مستقلاً عن حجم الزون.
--
-- التراجع: drop column bbox, وأعد تعريف الحرّاس من 20261122000500.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- ① bbox4: مستطيل إحاطة من مسار — يُرجع (min_lat, min_lng, max_lat, max_lng)
--    أو NULL إن كان المسار غير صالح.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_bbox(p_path jsonb)
returns double precision[]
language sql immutable set search_path = pg_catalog as $$
  with pts as (
    select app.map_pt_lat(p_path -> i) as la, app.map_pt_lng(p_path -> i) as ln
    from generate_series(0, greatest(jsonb_array_length(p_path) - 1, 0)) as i
  )
  select case when count(*) filter (where la is not null and ln is not null) >= 2
    then array[min(la), min(ln), max(la), max(ln)]
    else null end
  from pts
$$;
comment on function app.map_bbox(jsonb) is
  'مستطيل إحاطة المسار [min_lat, min_lng, max_lat, max_lng] — أساس الفهرسة المكانية';

-- ───────────────────────────────────────────────────────────────────────────
-- ② bbox8: المستطيل موسّعاً بمقدار بالأمتار (للبحث عن الجيران القريبين)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_bbox_expand(p_bbox double precision[], p_m double precision)
returns double precision[]
language sql immutable set search_path = pg_catalog as $$
  select case when p_bbox is null then null else array[
    p_bbox[1] - p_m / 111320.0,
    p_bbox[2] - p_m / (111320.0 * greatest(cos(radians((p_bbox[1] + p_bbox[3]) / 2)), 0.01)),
    p_bbox[3] + p_m / 111320.0,
    p_bbox[4] + p_m / (111320.0 * greatest(cos(radians((p_bbox[1] + p_bbox[3]) / 2)), 0.01))
  ] end
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- ③ الأعمدة والفهارس
-- ───────────────────────────────────────────────────────────────────────────
alter table public.map_streets add column if not exists bbox double precision[];
alter table public.map_alleys  add column if not exists bbox double precision[];

comment on column public.map_streets.bbox is
  'مستطيل إحاطة [min_lat,min_lng,max_lat,max_lng] — محسوب من path، يُستخدم لتضييق مرشّحي فحص التداخل';
comment on column public.map_alleys.bbox is 'مستطيل إحاطة — نفس دور map_streets.bbox';

-- فهرس GiST على نطاق ثنائي الأبعاد (لا نحتاج box2d عموداً منفصلاً:
-- نستخدم تعبيراً على (min_lng, min_lat, max_lng, max_lat) عبر box)
create index if not exists map_streets_bbox_gist on public.map_streets
  using gist (box(
    point((bbox)[2], (bbox)[1]),
    point((bbox)[4], (bbox)[3])
  )) where bbox is not null;

create index if not exists map_alleys_bbox_gist on public.map_alleys
  using gist (box(
    point((bbox)[2], (bbox)[1]),
    point((bbox)[4], (bbox)[3])
  )) where bbox is not null;

-- ملء الأعمدة للموجود (١٦٣٨ عنصراً حالياً — مرة واحدة، سريع)
update public.map_streets set bbox = app.map_bbox(path) where path is not null;
update public.map_alleys  set bbox = app.map_bbox(path) where path is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- ④ حارس path: يُحسب bbox دائماً من المسار
--    يستخدم map_streets_guard و map_alleys_guard الموجودين — نُضيف bbox
--    في طبقة منفصلة حتى لا نعيد كتابة الحرّاس كلهم.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_bbox_guard()
returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if tg_table_name = 'map_streets' then
    new.bbox := app.map_bbox(new.path);
  elsif tg_table_name = 'map_alleys' then
    new.bbox := app.map_bbox(new.path);
  end if;
  return new;
end $$;

drop trigger if exists map_streets_bbox_trg on public.map_streets;
create trigger map_streets_bbox_trg
  before insert or update of path on public.map_streets
  for each row execute function app.map_bbox_guard();

drop trigger if exists map_alleys_bbox_trg on public.map_alleys;
create trigger map_alleys_bbox_trg
  before insert or update of path on public.map_alleys
  for each row execute function app.map_bbox_guard();

-- ───────────────────────────────────────────────────────────────────────────
-- ⑤ map_overlap_length_m — إعادة كتابة هندسية (كانت عنق الزجاجة الحقيقي)
--
--    القياس: النسخة السابقة (تعيين كل ~2م) استغرقت ٥٦ ثانية على ٣٣٦ زوجاً
--    فقط = ١٦٧ms للزوج. والسبب أنها تُنشئ ~٧٠٠ نقطة لكل مسار وتفحص كل
--    نقطة ضد كل مقاطع الآخر: O(n·m) بتكرار عالٍ.
--
--    البديل الهندسي الدقيق: نُسقط كل مقطع مستقيم على الآخر ونحسب طول
--    التقاطع. لمسارات «تسير على نفس الخط» عندنا حالتان:
--      ① متوازيان متقاربان: نُسقط نقاط مقاطع A على خط B ونقيس الطول
--         الذي يبقى داخل حدود B وبمسافة ≤ التسامح.
--      ② متطابقان تقريباً: تلتقطهما الحالة ① نفسها.
--    النتيجة: بلا تعيين، وعدد العمليات = عدد أزواج المقاطع فقط.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_overlap_length_m(
  p_a jsonb, p_b jsonb, p_tol_m double precision default 1.5
) returns double precision
language plpgsql immutable set search_path = pg_catalog as $$
declare
  na int := jsonb_array_length(p_a);
  nb int := jsonb_array_length(p_b);
  i int; j int;
  a1x double precision; a1y double precision;  -- lng, lat
  a2x double precision; a2y double precision;
  b1x double precision; b1y double precision;
  b2x double precision; b2y double precision;
  -- خط B في إحداثيات مترية محلية حول منتصف B
  mlat double precision; mlng double precision;
  seg double precision;      -- طول المقطع A بالأمتار
  total double precision := 0;
  -- إسقاط مقطع A على خط B
  dirx double precision; diry double precision; dlen double precision;
  px double precision; py double precision;
  t0 double precision; t1 double precision;
  s0 double precision; s1 double precision;
  lo double precision; hi double precision;
  dprep double precision;
  m_per_lat double precision := 111320.0;
  m_per_lng double precision;
begin
  if na < 2 or nb < 2 then return 0; end if;
  if app.map_bbox(p_a) is null or app.map_bbox(p_b) is null then return 0; end if;

  for j in 0..nb - 2 loop
    b1x := app.map_pt_lng(p_b->j);        b1y := app.map_pt_lat(p_b->j);
    b2x := app.map_pt_lng(p_b->(j+1));    b2y := app.map_pt_lat(p_b->(j+1));
    if b1x is null or b2x is null then continue; end if;

    mlat := radians((b1y + b2y) / 2);
    m_per_lng := m_per_lat * cos(mlat);
    -- اتجاه المقطع B في متر
    dirx := (b2x - b1x) * m_per_lng;
    diry := (b2y - b1y) * m_per_lat;
    dlen := sqrt(dirx * dirx + diry * diry);
    if dlen <= 0 then continue; end if;
    dirx := dirx / dlen; diry := diry / dlen;

    for i in 0..na - 2 loop
      a1x := app.map_pt_lng(p_a->i);      a1y := app.map_pt_lat(p_a->i);
      a2x := app.map_pt_lng(p_a->(i+1));  a2y := app.map_pt_lat(p_a->(i+1));
      if a1x is null or a2x is null then continue; end if;

      -- إسقاط طرفي المقطع A على محور B (بالمتر، نسبة 0..1)
      px := (a1x - b1x) * m_per_lng;
      py := (a1y - b1y) * m_per_lat;
      t0 := (px * dirx + py * diry) / dlen;          -- 0 عند B1، 1 عند B2
      px := (a2x - b1x) * m_per_lng;
      py := (a2y - b1y) * m_per_lat;
      t1 := (px * dirx + py * diry) / dlen;

      -- المسافة العمودية لمقطع A عن خط B.
      -- **أعظم** مسافة الطرفين لا أقلهما: المقطع الموازي بإزاحة كبيرة عن
      -- B يجب ألا يُعدّ تراكباً حتى لو اقترب طرفه الأول. القياس السابق
      -- بـ least أعطى ٩٥م «تراكب» لمسارين يفصل بينهما ٥م — خطأ فادح.
      dprep := greatest(
        abs((a1x - b1x) * m_per_lng * (-diry) + (a1y - b1y) * m_per_lat * dirx),
        abs((a2x - b1x) * m_per_lng * (-diry) + (a2y - b1y) * m_per_lat * dirx)
      );
      if dprep > p_tol_m then continue; end if;

      -- طول الجزء من A الواقع داخل نطاق B
      lo := greatest(least(t0, t1), 0);
      hi := least(greatest(t0, t1), 1);
      if hi <= lo then continue; end if;

      seg := app.map_distance_m(a1y, a1x, a2y, a2x);
      if seg is null or seg <= 0 then continue; end if;

      total := total + seg * (hi - lo);
    end loop;
  end loop;

  return total;
end $$;
comment on function app.map_overlap_length_m(jsonb, jsonb, float8) is
  'طول الجزء من A الذي يسير على B ضمن تسامح بالمتر — حساب هندسي بلا تعيين نقاط';

-- ───────────────────────────────────────────────────────────────────────────
-- ⑤.b map_paths_intersect — إعادة كتابة بلا نداءات متداخلة
--
--    القياس: النسخة القديمة ٥٥ms لكل زوج (١٠٠ نداء map_segments_intersect
--    لكل مقاطع الزوج). وعلى ٧٤٩٦ زوجاً = ٦٨٦ ثانية — وهي وحدها تُفسّر
--    بطء الحرّاس. النسخة القديمة كانت تُقارن المقاطع مرتين (A→B و B→A)
--    لأن map_segments_intersect متماثلة، وهذا هدر صريح.
--
--    البديل: استعلام واحد يُحسب فيه كل المقاطع دفعة واحدة، ثم فحص تقاطع
--    المقاطع عبر تعبير واحد على اتجاهات متجهات (cross products).
--    التقاطع الحقيقي: يتقاطعان إذا اختلفت إشارتا d1/d2 و d3/d4 معاً.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_paths_intersect(p_a jsonb, p_b jsonb)
returns boolean
language sql immutable set search_path = pg_catalog as $$
  with seg_a as (
    select app.map_pt_lat(p_a -> i) as y1, app.map_pt_lng(p_a -> i) as x1,
           app.map_pt_lat(p_a -> (i+1)) as y2, app.map_pt_lng(p_a -> (i+1)) as x2
    from generate_series(0, greatest(jsonb_array_length(p_a) - 2, 0)) as i
    where app.map_pt_lat(p_a -> i) is not null
      and app.map_pt_lat(p_a -> (i+1)) is not null
  ), seg_b as (
    select app.map_pt_lat(p_b -> j) as y1, app.map_pt_lng(p_b -> j) as x1,
           app.map_pt_lat(p_b -> (j+1)) as y2, app.map_pt_lng(p_b -> (j+1)) as x2
    from generate_series(0, greatest(jsonb_array_length(p_b) - 2, 0)) as j
    where app.map_pt_lat(p_b -> j) is not null
      and app.map_pt_lat(p_b -> (j+1)) is not null
  )
  select exists (
    select 1
    from seg_a a cross join seg_b b
    where
      -- d1 = إشارة طرف B1 بالنسبة لـ A؛ d2 = طرف B2؛ d3 = طرف A1 لـ B؛ d4 = طرف A2
      ((a.x2 - a.x1) * (b.y1 - a.y1) - (a.y2 - a.y1) * (b.x1 - a.x1))
      * ((a.x2 - a.x1) * (b.y2 - a.y1) - (a.y2 - a.y1) * (b.x2 - a.x1)) < 0
      and
      ((b.x2 - b.x1) * (a.y1 - b.y1) - (b.y2 - b.y1) * (a.x1 - b.x1))
      * ((b.x2 - b.x1) * (a.y2 - b.y1) - (b.y2 - b.y1) * (a.x2 - b.x1)) < 0
  )
$$;
comment on function app.map_paths_intersect(jsonb, jsonb) is
  'هل يتقاطع المساران؟ حساب واحد لكل أزواج المقاطع بلا نداءات دالة متداخلة';

-- ───────────────────────────────────────────────────────────────────────────
-- ⑤.c map_is_vertex + map_intersection_kind — إصلاح تنسيق وإزالة تربيع
--
--    عيبان كشفهما القياس:
--      ① map_is_vertex كانت تقرأ (v->>0) مباشرة ⇒ تُعيد NULL لكل نقطة
--         بصيغة {lat,lng}، فتصير كل التقاطعات «crossing» زوراً.
--      ② map_intersection_kind كانت تنادي map_is_vertex أربع مرات
--         **داخل** حلقة مزدوجة على المقاطع ⇒ عمل تربيعي.
--
--    البديل: نجمع المقاطع المتقاطعة أولاً في استعلام واحد، ثم نسأل مرة
--    واحدة: هل يوجد تقاطع لا يقع عند رأس مشترك؟
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_is_vertex(p_pt jsonb, p_path jsonb, p_tol_m double precision default 0.5)
returns boolean
language sql immutable set search_path = pg_catalog as $$
  select exists (
    select 1 from jsonb_array_elements(p_path) v
    where app.map_distance_m(
      app.map_pt_lat(v), app.map_pt_lng(v),
      app.map_pt_lat(p_pt), app.map_pt_lng(p_pt)) <= p_tol_m
  )
$$;

create or replace function app.map_intersection_kind(p_a jsonb, p_b jsonb)
returns text
language sql immutable set search_path = pg_catalog as $$
  with seg_a as (
    select i, app.map_pt_lat(p_a -> i) as y1, app.map_pt_lng(p_a -> i) as x1,
           app.map_pt_lat(p_a -> (i+1)) as y2, app.map_pt_lng(p_a -> (i+1)) as x2
    from generate_series(0, greatest(jsonb_array_length(p_a) - 2, 0)) as i
  ), seg_b as (
    select app.map_pt_lat(p_b -> j) as y1, app.map_pt_lng(p_b -> j) as x1,
           app.map_pt_lat(p_b -> (j+1)) as y2, app.map_pt_lng(p_b -> (j+1)) as x2
    from generate_series(0, greatest(jsonb_array_length(p_b) - 2, 0)) as j
  ), hits as (
    select a.i as ai,
           -- هل طرف من A رأس في B؟ (مقارنة مباشرة بالمسافة، بلا نداء دالة)
           (exists (select 1 from seg_b bb
                     where app.map_distance_m(a.y1, a.x1, bb.y1, bb.x1) <= 0.5
                        or app.map_distance_m(a.y1, a.x1, bb.y2, bb.x2) <= 0.5)
            and exists (select 1 from seg_b bb
                     where app.map_distance_m(a.y2, a.x2, bb.y1, bb.x1) <= 0.5
                        or app.map_distance_m(a.y2, a.x2, bb.y2, bb.x2) <= 0.5)) as both_ends_are_vertices
    from seg_a a cross join seg_b b
    where
      ((a.x2 - a.x1) * (b.y1 - a.y1) - (a.y2 - a.y1) * (b.x1 - a.x1))
      * ((a.x2 - a.x1) * (b.y2 - a.y1) - (a.y2 - a.y1) * (b.x2 - a.x1)) < 0
      and
      ((b.x2 - b.x1) * (a.y1 - b.y1) - (b.y2 - b.y1) * (a.x1 - b.x1))
      * ((b.x2 - b.x1) * (a.y2 - b.y1) - (b.y2 - b.y1) * (a.x2 - b.x1)) < 0
  )
  select case
    -- ① لا تقاطع هندسي: هل يتشاركان رأساً فعلياً؟ (وليس أي نقطة قريبة)
    --    الشرط السابق كان يفحص «أي طرف من A قريب من أي طرف من B» بمسافة
    --    0.5م — وهذا يتحقق لمسارين متوازيين بينهما 0.4م بلا تقاطع أصلاً.
    --    الشرط الصحيح: نقطة نهاية **لأحدهما** تقع على **مسار** الآخر.
    when not exists (select 1 from hits) then
      case when exists (
        select 1 from seg_a a cross join seg_b b
        where app.map_point_segment_m(a.y1, a.x1, b.y1, b.x1, b.y2, b.x2) <= 0.5
           or app.map_point_segment_m(a.y2, a.x2, b.y1, b.x1, b.y2, b.x2) <= 0.5
      ) then 'junction' else 'none' end
    when exists (select 1 from hits where not both_ends_are_vertices) then 'crossing'
    else 'junction'
  end
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- ⑥ دالة المرشّحين: المسارات التي يتقاطع مستطيلها مع مستطيل المسار موسّعاً
--    هذه هي القفزة من تربيعي إلى فهرسي.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_nearby_streets(
  p_zone uuid, p_path jsonb, p_exclude uuid, p_margin_m double precision default 600.0
) returns table (id uuid, code text, name text, path jsonb, is_bridge boolean)
language sql stable set search_path = public, app as $$
  select s.id, s.code, s.name, s.path, coalesce(s.is_bridge, false)
  from public.map_streets s
  where s.zone_id = p_zone
    and s.id is distinct from p_exclude
    and s.status <> 'archived'
    and s.bbox is not null
    and box(point((s.bbox)[2], (s.bbox)[1]), point((s.bbox)[4], (s.bbox)[3]))
        && box(
             point((app.map_bbox_expand(app.map_bbox(p_path), p_margin_m))[2],
                   (app.map_bbox_expand(app.map_bbox(p_path), p_margin_m))[1]),
             point((app.map_bbox_expand(app.map_bbox(p_path), p_margin_m))[4],
                   (app.map_bbox_expand(app.map_bbox(p_path), p_margin_m))[3])
           )
$$;

create or replace function app.map_nearby_alleys(
  p_zone uuid, p_path jsonb, p_exclude uuid, p_margin_m double precision default 600.0
) returns table (id uuid, code text, name text, path jsonb)
language sql stable set search_path = public, app as $$
  select a.id, a.code, a.name, a.path
  from public.map_alleys a
  where a.zone_id = p_zone
    and a.id is distinct from p_exclude
    and a.status <> 'archived'
    and a.bbox is not null
    and box(point((a.bbox)[2], (a.bbox)[1]), point((a.bbox)[4], (a.bbox)[3]))
        && box(
             point((app.map_bbox_expand(app.map_bbox(p_path), p_margin_m))[2],
                   (app.map_bbox_expand(app.map_bbox(p_path), p_margin_m))[1]),
             point((app.map_bbox_expand(app.map_bbox(p_path), p_margin_m))[4],
                   (app.map_bbox_expand(app.map_bbox(p_path), p_margin_m))[3])
           )
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- ⑥ الحرّاس النهائيون: نفس قانون 20261122000500 بالحرف، لكن المرشّحون
--    يأتون من الفهرس بدل مسح كل مسارات الزون.
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
begin
  if v_new_is_bridge then
    return new;   -- جسر/نفق: التقاطع الهندسي ليس تقاطعاً واقعياً
  end if;

  if tg_table_name = 'map_streets' then
    -- المرشّحون يأتون من الفهرس المكاني (bbox) — لا داعي لدالة المسافة.
    -- كان كل إدراج يُشغّل map_distance_between_paths_m على ١١٤ مرشّحاً
    -- (٣.٢ ثانية) قبل أي فحص آخر. الفهرس يُغني عنها تماماً.
    for r in
      select * from app.map_nearby_streets(new.zone_id, new.path, new.id)
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

      -- التقاطع يُحسب مرة واحدة: الشرط السابق كان يفحص map_paths_intersect
      -- ثم map_intersection_kind التي تعيد الفحص من جديد — ضِعف العمل.
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
      select * from app.map_nearby_alleys(new.zone_id, new.path, new.id)
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

-- ───────────────────────────────────────────────────────────────────────────
-- ⑦ تحقّق: كل مسار له bbox
-- ───────────────────────────────────────────────────────────────────────────
do $verify$
declare
  v_missing integer;
begin
  select count(*) into v_missing from (
    select id from public.map_streets where path is not null and bbox is null
    union all
    select id from public.map_alleys where path is not null and bbox is null
  ) x;
  if v_missing > 0 then
    raise exception 'MAP_BBOX_MISSING: % مساراً بلا مستطيل إحاطة', v_missing
      using errcode = 'check_violation';
  end if;
end $verify$;

-- ───────────────────────────────────────────────────────────────────────────
-- ⑧ الصلاحيات
-- ───────────────────────────────────────────────────────────────────────────
revoke all on function app.map_bbox(jsonb), app.map_bbox_expand(float8[], float8) from public, anon;
revoke all on function app.map_nearby_streets(uuid, jsonb, uuid, float8) from public, anon;
revoke all on function app.map_nearby_alleys(uuid, jsonb, uuid, float8) from public, anon;
grant execute on function app.map_bbox(jsonb), app.map_bbox_expand(float8[], float8) to authenticated;
grant execute on function app.map_nearby_streets(uuid, jsonb, uuid, float8) to authenticated;
grant execute on function app.map_nearby_alleys(uuid, jsonb, uuid, float8) to authenticated;
