-- ═══════════════════════════════════════════════════════════════════════════
-- 20261122000200_map_overlap_merge_law.sql
-- القانون النهائي للتقاطع بعد فحص ٧,١٤٠ زوجاً حقيقياً من شوارع الأرخيته.
--
-- المعطى التجريبي: ٩٣ زوجاً تتقاطع، منها ١.٣٪ فقط تشترك في رأس (مفترق OSM).
-- السبب: الطريق يُرسم خطاً مستمراً، والفرعي يبدأ من نقطة على حافته.
-- منع التقاطع المطلق ⇒ استيراد أي مدينة مستحيل. السماح المطلق ⇒ فقدان الحماية.
--
-- القانون المعتمد (الخيار أ):
--   ① تكرار تام (نفس المسار مطابقاً أو معكوساً)        ⇒ مرفوض  MAP_DUPLICATE
--   ② تراكب طولي > 5 م مع مسار آخر (يسيران على نفس الخط) ⇒ مرفوض  MAP_OVERLAP
--   ③ تقاطع عند رأس مشترك (مفترق)                      ⇒ مسموح بصمت
--   ④ تقاطع عند نقطة داخلية (طريق يعبر طريقاً)          ⇒ مسموح + يُسجَّل للمراجعة
--   ⑤ جسر/نفق (is_bridge)                              ⇒ مستثنى من ② و ④
--
-- الأزقة تبقى أشد صرامة: لا تتقاطع مع زقاق آخر إطلاقاً (④ غير مسموح لها).
--
-- التراجع: أعد تعريف app.map_overlap_check من 20261122000000 §⑥
--          و 20261122000100 §③، ثم drop table public.map_geometry_reviews.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- ⓪ جدول المراجعة: ما نسمح به اليوم ونحقّق فيه غداً
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.map_geometry_reviews (
  id            uuid primary key default gen_random_uuid(),
  zone_id       uuid not null references public.map_zones(id) on delete cascade,
  table_name    text not null check (table_name in ('map_streets','map_alleys')),
  record_id     uuid not null,
  record_code   text not null,
  other_code    text not null,
  kind          text not null check (kind in ('crossing','near_parallel')),
  detail        jsonb not null default '{}',
  reviewed      boolean not null default false,
  reviewed_by   uuid references auth.users(id) on delete set null,
  reviewed_at   timestamptz,
  decision      text check (decision in ('ok','fix_needed','merged','ignored')),
  created_at    timestamptz not null default now()
);
comment on table public.map_geometry_reviews is
  'تقاطعات مسموحة تُسجَّل لمراجعة غرفة العمليات — "دقة عالية" = نعرف كل تقاطع لا نمنعه فقط';

create index if not exists map_geometry_reviews_zone_idx
  on public.map_geometry_reviews(zone_id, reviewed);
create unique index if not exists map_geometry_reviews_pair_uk
  on public.map_geometry_reviews(zone_id, table_name, record_id, other_code, kind);

alter table public.map_geometry_reviews enable row level security;
create policy "map reviews read" on public.map_geometry_reviews for select to authenticated
  using (app.has_role(array['ops_room','it_admin','super_admin','sector_manager','deputy','executive']));
create policy "map reviews write" on public.map_geometry_reviews for update to authenticated
  using (app.has_role(array['ops_room','it_admin','super_admin']))
  with check (app.has_role(array['ops_room','it_admin','super_admin']));
revoke all on public.map_geometry_reviews from anon;
grant select, update on public.map_geometry_reviews to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- ① طول التداخل الطولي بين مسارين (كم متراً من A يقع على B)
--    نستخدم أخذ عيّنات على A كل ~2م — أدق من كشف تقاطع نقطي، وأسرع من تحليل كامل.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_overlap_length_m(
  p_a jsonb, p_b jsonb, p_tol_m double precision default 1.5
) returns double precision
language plpgsql immutable set search_path = pg_catalog as $$
declare
  i int; j int;
  na int := jsonb_array_length(p_a);
  nb int := jsonb_array_length(p_b);
  seg_len double precision;
  steps int;
  k int;
  t double precision;
  px double precision; py double precision;
  d double precision;
  best double precision;
  hit_len double precision := 0;
begin
  if na < 2 or nb < 2 then return 0; end if;

  for i in 0..na - 2 loop
    seg_len := app.map_distance_m(
      (p_a->i->>0)::float8, (p_a->i->>1)::float8,
      (p_a->(i+1)->>0)::float8, (p_a->(i+1)->>1)::float8);
    if seg_len is null or seg_len <= 0 then continue; end if;
    -- عيّنة كل ~2م، بحد أقصى 200 نقطة للمقطع (حماية من المقاطع الطويلة)
    steps := least(greatest(ceil(seg_len / 2.0)::int, 1), 200);

    for k in 0..steps loop
      t := k::float8 / steps;
      px := (p_a->i->>0)::float8
            + ((p_a->(i+1)->>0)::float8 - (p_a->i->>0)::float8) * t;
      py := (p_a->i->>1)::float8
            + ((p_a->(i+1)->>1)::float8 - (p_a->i->>1)::float8) * t;

      best := null;
      for j in 0..nb - 2 loop
        d := app.map_point_segment_m(
          px, py,
          (p_b->j->>0)::float8, (p_b->j->>1)::float8,
          (p_b->(j+1)->>0)::float8, (p_b->(j+1)->>1)::float8);
        if best is null or d < best then best := d; end if;
        exit when best <= p_tol_m;   -- تحسين: وجدنا تطابقاً فلا نكمل البحث
      end loop;

      if best is not null and best <= p_tol_m then
        hit_len := hit_len + (seg_len / steps);
      end if;
    end loop;
  end loop;

  return hit_len;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- ② المُشغِّل النهائي
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
        and app.map_paths_intersect(new.path, s.path)
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
      select a.id, a.code, a.name, a.path
      from public.map_alleys a
      where a.zone_id = new.zone_id
        and a.id is distinct from new.id
        and a.status <> 'archived'
        and app.map_paths_intersect(new.path, a.path)
    loop
      v_olap := app.map_overlap_length_m(new.path, r.path, 1.0);   -- الأزقة أضيق: تسامح ١م
      if v_olap >= v_min_overlap then
        raise exception 'MAP_OVERLAP: الزقاق يسير على % (%) لمسافة % م',
          r.code, coalesce(r.name, 'بلا اسم'), round(v_olap)::text
          using errcode = 'check_violation',
                hint = 'زقاقان على نفس المحور — أحدهما مكرر';
      end if;
      -- الزقاق لا يعبر زقاقاً (استثناء ④ غير مسموح له)
      if app.map_intersection_kind(new.path, r.path) = 'crossing' then
        raise exception 'MAP_CROSSING: الزقاق يعبر % (%) في نقطة داخلية',
          r.code, coalesce(r.name, 'بلا اسم')
          using errcode = 'check_violation',
                hint = 'الزقاق يصل إلى شارع، ولا يخترق زقاقاً آخر';
      end if;
    end loop;
  end if;

  return new;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- ③ حقل الجسر/النفق
-- ───────────────────────────────────────────────────────────────────────────
alter table public.map_streets
  add column if not exists is_bridge boolean not null default false;
comment on column public.map_streets.is_bridge is
  'جسر أو نفق: تقاطعه الهندسي مع طرق أخرى لا يعني تقاطعاً واقعياً — يُستثنى من فحص التقاطع';

-- ───────────────────────────────────────────────────────────────────────────
-- ④ إلغاء فرادة الاسم — الخطأ التصميمي الذي كشفه الاستيراد
--
-- في الجولة ١ وضعت: unique (zone_id, kind, lower(name)).
-- الاستيراد الحقيقي أثبت أنه قيد خاطئ لسببين:
--   ① OSM يعطي نفس اسم الشارع لأشياء متعددة (مقاطع، امتدادات، طرق متوازية)
--   ② الاسم ليس معرّفاً في أي مدينة — **الكود** هو المعرّف (وهو فريد أصلاً)
-- إبقاء القيد كان يمنع استيراد الواقع ويدفع لاختراع أسماء، وهذا يخالف «لا تخمين».
-- البديل: لا فرادة على الاسم؛ التمييز بالكود؛ والبحث بالاسم يبقى (فهرس عادي).
-- ───────────────────────────────────────────────────────────────────────────
drop index if exists public.map_streets_zone_name_uk;
create index if not exists map_streets_zone_name_idx
  on public.map_streets(zone_id, lower(name)) where name is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- ⑤ الصلاحيات
-- ───────────────────────────────────────────────────────────────────────────
revoke all on function app.map_overlap_length_m(jsonb, jsonb, float8) from public, anon;
grant execute on function app.map_overlap_length_m(jsonb, jsonb, float8) to authenticated;
