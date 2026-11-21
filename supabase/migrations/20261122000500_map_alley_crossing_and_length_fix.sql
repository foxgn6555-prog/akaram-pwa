-- ═══════════════════════════════════════════════════════════════════════════
-- 20261122000500 — إصلاح حساب الطول + قانون الزقاق النهائي
-- ═══════════════════════════════════════════════════════════════════════════
-- ① إصلاح عطل: app.map_line_length_m في 20261122000400_map_geofence_format_fix
--    كانت تقرأ app.map_pt_lat(pts.e - 1) — و pts.e **نقطة jsonb** لا فهرس.
--    عامل − 1 على jsonb يحذف العنصر الأخير من المصفوفة، فتُقرأ كل نقطة كنقطة
--    فارغة ⇒ الطول = 0 لكل عنصر. والأخطر: كل فحوص التداخل (التي تعتمد على
--    map_paths_intersect / map_overlap_length_m / الأطوال) كانت تمرّ على مسارات
--    طولها صفر، فبدا الاستيراد «ناجحاً بلا خطأ» وهو لم يُفحص أصلاً.
--
--    الأثر الحقيقي المرصود: 226 شارعاً · 0 كم · 226 عنصراً بطول صفر.
--    بعد الإصلاح: الأطوال تُحسب فعلياً، وتعود الحرّاس للعمل.
--
-- ② قانون الزقاق النهائي — بعد قياس الواقع لا الافتراض:
--    على 95 زقاقاً حقيقياً في الأرخيته:
--      • 10 أزواج تتقاطع **بين نقطتين** (عبور حقيقي)
--      • 15 زوجاً تتلامس عند الأطراف فقط (< 2 م)
--    قاعدة «الزقاق لا يعبر زقاقاً» كانت تُسقط 10 حالات واقعية — أي 10.5% من
--    الأزقة الحقيقية. وهذا يخالف هدف الجولة (استيراد الواقع كما هو).
--    القرار: العبور مسموح ويُسجَّل في map_geometry_reviews مثل الشوارع تماماً،
--    مع الإبقاء على منع **التكرار** و**التراكب الطولي ≥ 20 م** (وهذان هما
--    الخطأ الحقيقي). في الأزقة يبقى منع التكرار صارماً لأن الزقاق المكرر
--    يضاعف عدّ التغطية ويضلّل محرّك الزيارات.
--
-- التراجع: أعد تعريف الدالتين من 20261122000200 و 20261122000400.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- ① إصلاح الطول — نسخة صحيحة تعمل على أي تنسيق نقطة
--    الأساس: نأخذ كل زوج متتالٍ من **الفهارس** لا من النقاط.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_line_length_m(p_path jsonb)
returns double precision
language sql immutable set search_path = pg_catalog as $$
  select coalesce(sum(app.map_distance_m(
           app.map_pt_lat(p_path -> i),
           app.map_pt_lng(p_path -> i),
           app.map_pt_lat(p_path -> (i + 1)),
           app.map_pt_lng(p_path -> (i + 1))
         )), 0)
  from generate_series(0, greatest(jsonb_array_length(p_path) - 2, 0)) as i
  where p_path -> i is not null
    and p_path -> (i + 1) is not null
$$;
comment on function app.map_line_length_m(jsonb) is
  'طول المسار بالأمتار — مجموع المسافات بين كل نقطتين متتاليتين (يعمل على [lat,lng] و{lat,lng})';

-- ───────────────────────────────────────────────────────────────────────────
-- ② إعادة حساب الأطوال الموجودة — لولاها بقيت الأرقام صفراً بعد الإصلاح
-- ───────────────────────────────────────────────────────────────────────────
update public.map_streets
   set length_m = round(app.map_line_length_m(path)::numeric, 1)
 where path is not null
   and jsonb_array_length(path) >= 2;

update public.map_alleys
   set length_m = round(app.map_line_length_m(path)::numeric, 1)
 where path is not null
   and jsonb_array_length(path) >= 2;

-- ───────────────────────────────────────────────────────────────────────────
-- ②.b أدنى مسافة بين مسارين (بالمتر) — البوّابة الصحيحة لاختيار المرشّحين
--
--    عطل حقيقي كشفه الاختبار: كان الحارس يبدأ بـ
--        and app.map_paths_intersect(new.path, s.path)
--    فمساران **متوازيان على نفس المحور** (تداخل ١١٠ م) لا يتقاطعان هندسياً
--    ⇒ لا يدخلان الفحص ⇒ يمرّ التكرار بلا اعتراض. أي أن القانون كان يمنع
--    التقاطع المسموح ويعفو عن التكرار الممنوع — بالعكس تماماً.
--    البديل: نُرشّح بالمسافة (< ٦٠ م) ونحكم بالتقاطع/التداخل داخلياً.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_distance_between_paths_m(p_a jsonb, p_b jsonb)
returns double precision
language sql immutable set search_path = pg_catalog as $$
  select min(app.map_point_segment_m(
           app.map_pt_lat(p_a -> i), app.map_pt_lng(p_a -> i),
           app.map_pt_lat(p_b -> j),     app.map_pt_lng(p_b -> j),
           app.map_pt_lat(p_b -> (j + 1)), app.map_pt_lng(p_b -> (j + 1))
         ))
  from generate_series(0, greatest(jsonb_array_length(p_a) - 1, 0)) as i
  cross join generate_series(0, greatest(jsonb_array_length(p_b) - 2, 0)) as j
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- ③ قانون التداخل النهائي — الشوارع كما هو، الأزقة بتسامح العبور
--    (الدالة الحقيقية app.map_overlap_check — تسمية متوارثة من الجولة ١،
--     وهي مربوطة بالتريغرين map_streets_overlap_trg و map_alleys_overlap_trg)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_overlap_check()
returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  r record;
  v_kind text;
  v_olap double precision;
  v_same boolean;
  -- ٢٠م: قياس حقيقي على ٣٣٤ عنصراً بالأرخيته ⇒ أقصى تراكب طبيعي ١٤م (وسيط ٢م).
  -- أي تراكب ≥ ٢٠م = طريقان على نفس المحور فعلاً (تكرار)، لا تقارب مفترق.
  v_min_overlap constant double precision := 20.0;  -- متر
  v_new_is_bridge boolean := coalesce((to_jsonb(new) ->> 'is_bridge')::boolean, false);
begin
  if v_new_is_bridge then
    return new;   -- جسر/نفق: التقاطع الهندسي ليس تقاطعاً واقعياً
  end if;

  if tg_table_name = 'map_streets' then
    for r in
      select s.id, s.code, s.name, s.path,
             coalesce(s.is_bridge, false) as is_bridge
      from public.map_streets s
      where s.zone_id = new.zone_id
        and s.id is distinct from new.id
        and s.status <> 'archived'
        -- لا بوّابة تقاطع هنا: المسارات المتوازية على نفس المحور
        -- لا «تتقاطع» هندسياً لكنها أخطر خطأ (تكرار). نفحص كل مرشّح
        -- قريب. عتبة ٥٠٠م: تقاطع طريقين لا يحدث إلا إذا تقاربا،
        -- وأطول طريق في الأرخيته ١٩٨٩م — فالمسافة ٥٠٠م تغطي كل حالة واقعية
        -- دون فحص ٣١٦×٣١٦ زوجاً كاملة.
        and app.map_distance_between_paths_m(new.path, s.path) < 500
    loop
      -- المتكرر/المعكوس
      v_same := (r.path = new.path)
        or (r.path = (select coalesce(jsonb_agg(e order by ord desc), '[]'::jsonb)
                      from jsonb_array_elements(new.path) with ordinality as t(e, ord)));
      if v_same then
        raise exception 'MAP_DUPLICATE: الشارع مطابق تماماً لـ % (%)',
          r.code, coalesce(r.name, 'بلا اسم')
          using errcode = 'check_violation', hint = 'احذف المكرر أو أرشِفه';
      end if;

      -- تراكب طولي (يسيران على نفس الخط) — وهذا هو الخطأ الحقيقي
      v_olap := app.map_overlap_length_m(new.path, r.path, 1.5);   -- تسامح ١.٥م = عرض رصف
      if v_olap >= v_min_overlap then
        raise exception 'MAP_OVERLAP: الشارع يسير على % (%) لمسافة % م',
          r.code, coalesce(r.name, 'بلا اسم'), round(v_olap)::text
          using errcode = 'check_violation',
                hint = 'الشارعان على نفس المحور — ادمجهما أو قسّمهما بمفترق';
      end if;

      -- تقاطع عند نقطة داخلية: مسموح، لكن يُسجَّل للمراجعة
      if not r.is_bridge and app.map_paths_intersect(new.path, r.path) then
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
      select a.id, a.code, a.name, a.path
      from public.map_alleys a
      where a.zone_id = new.zone_id
        and a.id is distinct from new.id
        and a.status <> 'archived'
        and app.map_distance_between_paths_m(new.path, a.path) < 500
    loop
      -- التكرار المطابق: ممنوع دائماً — يضاعف التغطية ويضلّل العدّ
      v_same := (r.path = new.path)
        or (r.path = (select coalesce(jsonb_agg(e order by ord desc), '[]'::jsonb)
                      from jsonb_array_elements(new.path) with ordinality as t(e, ord)));
      if v_same then
        raise exception 'MAP_DUPLICATE: الزقاق مطابق تماماً لـ % (%)',
          r.code, coalesce(r.name, 'بلا اسم')
          using errcode = 'check_violation', hint = 'احذف المكرر أو أرشِفه';
      end if;

      -- التراكب الطولي: ممنوع (زقاقان على نفس المحور = تكرار أو تمديد خاطئ)
      v_olap := app.map_overlap_length_m(new.path, r.path, 1.0);   -- الأزقة أضيق: تسامح ١م
      if v_olap >= v_min_overlap then
        raise exception 'MAP_OVERLAP: الزقاق يسير على % (%) لمسافة % م',
          r.code, coalesce(r.name, 'بلا اسم'), round(v_olap)::text
          using errcode = 'check_violation',
                hint = 'زقاقان على نفس المحور — أحدهما مكرر';
      end if;

      -- التقاطع الداخلي: **مسموح ويُسجَّل** — قياس الواقع: ١٠ من ٩٥ زقاقاً
      -- تتقاطع فعلياً في الأرخيته. منعها كان يُسقط واقعاً لا خطأ.
      if app.map_paths_intersect(new.path, r.path)
         and app.map_intersection_kind(new.path, r.path) = 'crossing' then
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
-- ④ تحقّق فوري: لا مسار بطول صفر بعد الإصلاح
--    هذا ليس حارساً — بل إفشال صريح للهجرة إن بقي الخلل، حتى لا يتكرر
--    سيناريو «استيراد ناجح بأرقام فارغة».
-- ───────────────────────────────────────────────────────────────────────────
do $verify$
declare
  v_bad integer;
begin
  select count(*) into v_bad
  from (
    select id from public.map_streets
     where path is not null and jsonb_array_length(path) >= 2 and length_m <= 0
    union all
    select id from public.map_alleys
     where path is not null and jsonb_array_length(path) >= 2 and length_m <= 0
  ) x;

  if v_bad > 0 then
    raise exception 'MAP_LENGTH_ZERO: % مساراً ما زال بطول صفر بعد إصلاح دالة الطول',
      v_bad
      using errcode = 'check_violation',
            hint = 'افحص تنسيق النقاط: app.map_pt_lat/map_pt_lng يجب أن تقرأ التنسيقين';
  end if;
end $verify$;

-- ───────────────────────────────────────────────────────────────────────────
-- ④ فهرس osm_way_id: من فريد إلى عادي
--
--    كشفه الاستيراد: بعد قصّ الطريق على حدود الزون، ينتج عن الطريق الواحد
--    (osm_way_id = 317) **ثلاثة أجزاء**، لكل منها كود مستقل.
--    الفهرس الفريد كان يرفض الجزء الثاني والثالث فيُفقد واقعاً.
--    الكود (zone_id, code) هو المعرّف — و osm_way_id مرجع مصدري يُسمح بتكراره.
-- ───────────────────────────────────────────────────────────────────────────
drop index if exists public.map_alleys_zone_osm_uk;
create index if not exists map_alleys_zone_osm_idx
  on public.map_alleys(zone_id, osm_way_id) where osm_way_id is not null;

drop index if exists public.map_streets_zone_osm_uk;
create index if not exists map_streets_zone_osm_idx
  on public.map_streets(zone_id, osm_way_id) where osm_way_id is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- ⑤ سجل التخطيات — كل عنصر لم يُستورد يُكتب هنا باسمه وسببه
--
--    الاستيراد لا يُسقط شيئاً بصمت: العنصر المرفوض يُدرج في هذا الجدول
--    (code + name + سبب الرفض)، فيبقى معلوماً وقابلاً للمراجعة والإصلاح.
--    وهذا تطبيق مباشر لقاعدة «لا تخمين: يُترك فارغاً ويُوسم».
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.map_import_skips (
  id           uuid primary key default gen_random_uuid(),
  zone_id      uuid not null references public.map_zones(id) on delete cascade,
  table_name   text not null check (table_name in ('map_streets','map_alleys')),
  code         text not null,
  name         text,
  error_code   text,           -- MAP_CROSSING / MAP_OVERLAP / MAP_OUTSIDE ...
  error_msg    text not null,
  created_at   timestamptz not null default now()
);
comment on table public.map_import_skips is
  'العناصر التي رفضها الاستيراد الحقيقي — لا يُسقط عنصر بصمت: الكود والاسم والسبب محفوظة للمراجعة';

create index if not exists map_import_skips_zone_idx
  on public.map_import_skips(zone_id, table_name);
create unique index if not exists map_import_skips_uk
  on public.map_import_skips(zone_id, table_name, code);

alter table public.map_import_skips enable row level security;
create policy "map skips read" on public.map_import_skips for select to authenticated
  using (app.has_role(array['ops_room','it_admin','super_admin','sector_manager','deputy','executive']));
revoke all on public.map_import_skips from anon;
grant select on public.map_import_skips to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- ⑥ map_pt_lat / map_pt_lng: تحويل آمن لا ينفجر
--
--    كشفته اختبارات الجولة ١: الإحداثي النصّي '["x",44.42]' كان يرفع
--    invalid input syntax بدل أن يُعيد null، فتتحوّل «رفض المسار» إلى خطأ
--    تشغيلي. الدالة العائدة من الصفر يجب أن تُعيد null لا أن ترمي.
--    الحل: تعبير نمطي يتحقق من الشكل الرقمي قبل ::float8.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_safe_num(p_text text)
returns double precision
language sql immutable set search_path = pg_catalog as $$
  select case
    when p_text is null then null
    when p_text ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$'
      then p_text::double precision
    else null
  end
$$;

-- ── map_pt_lat / map_pt_lng بعد التحويل الآمن ──
create or replace function app.map_pt_lat(p_pt jsonb)
returns double precision
language sql immutable set search_path = pg_catalog as $$
  select case
    when jsonb_typeof(p_pt) = 'array' then app.map_safe_num(p_pt ->> 0)
    when jsonb_typeof(p_pt) = 'object' then app.map_safe_num(p_pt ->> 'lat')
    else null
  end
$$;

create or replace function app.map_pt_lng(p_pt jsonb)
returns double precision
language sql immutable set search_path = pg_catalog as $$
  select case
    when jsonb_typeof(p_pt) = 'array' then app.map_safe_num(p_pt ->> 1)
    when jsonb_typeof(p_pt) = 'object' then app.map_safe_num(p_pt ->> 'lng')
    else null
  end
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- ⑦ الصلاحيات
-- ───────────────────────────────────────────────────────────────────────────
revoke all on function app.map_line_length_m(jsonb) from public, anon;
grant execute on function app.map_line_length_m(jsonb) to authenticated;
revoke all on function app.map_safe_num(text) from public, anon;
revoke all on function app.map_pt_lat(jsonb), app.map_pt_lng(jsonb) from public, anon;
grant execute on function app.map_pt_lat(jsonb), app.map_pt_lng(jsonb) to authenticated;
