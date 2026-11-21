-- ═══════════════════════════════════════════════════════════════════════════
-- 20261122000700 — محرّك الزيارات (المرحلة ⑤)
-- ═══════════════════════════════════════════════════════════════════════════
-- الغرض: تحويل نقاط GPS الخام إلى **زيارات مؤكدة** على شوارع وأزقة مخطّطة،
--        بحيث تُشرح كل زيارة للمفتّش بلا تخمين، وكل تمييز صريح بين
--        «مؤكد» و«غير مؤكد» و«لم تُدخل» — لا «صفر كاذب» يُعرض كتغطية.
--
-- منطق التأكيد (ثلاثة معايير مجتمعة — من خطة ٣.٢):
--   ① **عمق الدخول:** النقطة داخل نصف العرض الداخلي للطريق، لا على حافته.
--      السبب: المرور على الطريق المتاخم (شارع موازٍ) لا يُعدّ دخولاً.
--      التطبيق: مسافة النقطة عن محور المسار ≤ (العرض/2 − هامش)، ونأخذ
--      أكبر مسافة مسموحة لا تقل عن 3م حتى لا تختفي أزقة ضيقة.
--   ② **المكوث:** ≥ 60 ثانية متصلة داخل النطاق. العبور العابر يخرج زمنياً.
--   ③ **التقارب:** نقطتان متصلتان على الأقل بفاصل ≤ 5 دقائق (لا نقطة وحيدة).
--
-- التصنيف الناتج ثلاث حالات صريحة:
--   confirmed   — تحققت الثلاثة
--   uncertain   — تحقق بعضها فقط (دقة منخفضة/انقطاع/مكوث قصير)
--   (لا صف)     — لم تُدخل أصلاً
--
-- منع التكرار: مفتاح (vehicle_id, place_kind, place_id, entered_at) فريد،
-- ودمج الزيارتين المتتاليتين لنفس المكان إذا الفاصل < 10 دقائق.
--
-- **الاحتفاظ:** map_visits جدول دائم **لا يُمسّ** بتفريغ نقاط GPS اليومي
-- (00328 يحذف gps_device_position_history كل 21:00 UTC). لهذا يعمل المحرّك
-- قبل التفريغ ويُخزّن النتيجة في جدول دائم.
--
-- التراجع: drop table map_visits; drop function app.map_build_visits(...);
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- ① جدول الزيارات — دائم، لا يُمسّ بالتفريغ اليومي
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.map_visits (
  id            uuid primary key default gen_random_uuid(),
  zone_id       uuid not null references public.map_zones(id) on delete cascade,
  vehicle_id    uuid references public.garage_vehicles(id) on delete set null,
  device_id     uuid references public.gps_devices(id) on delete set null,
  place_kind    text not null check (place_kind in ('street','alley')),
  place_id      uuid not null,
  place_code    text not null,
  place_name    text,                        -- اسم الشارع/الزقاق لحظة الاستخراج
  placeday      date not null,               -- «day» كلمة محجوزة في بعض السياقات
  seq           smallint not null default 1, -- ترتيب الزيارة في اليوم
  entered_at    timestamptz not null,
  exited_at     timestamptz,
  dwell_seconds integer check (dwell_seconds is null or dwell_seconds >= 0),
  points_count  smallint not null default 0 check (points_count >= 0),
  max_depth_m   numeric(7,1),                -- أعمق مسافة داخل النطاق (مؤشر جودة)
  status        text not null default 'confirmed'
                check (status in ('confirmed','uncertain')),
  reason        text,                        -- سبب «غير مؤكد» بنصّ صريح
  created_at    timestamptz not null default now()
);
comment on table public.map_visits is
  'الزيارات المستخرجة من GPS — دائمة، لا تُمسّ بتفريغ النقاط الخام اليومي';
comment on column public.map_visits.status is
  'confirmed=تحققت المعايير الثلاثة · uncertain=تحقق بعضها (السبب في reason)';
comment on column public.map_visits.max_depth_m is
  'أقصى مسافة داخل النطاق — تكشف «مرور على الحافة» الذي لا يُعدّ زيارة';

create index if not exists map_visits_zone_day_idx on public.map_visits(zone_id, placeday desc);
create index if not exists map_visits_place_idx on public.map_visits(place_kind, place_id, placeday desc);
create index if not exists map_visits_vehicle_day_idx on public.map_visits(vehicle_id, placeday desc);
-- منع التكرار: نفس الآلية لا تزور نفس المكان مرتين في نفس اللحظة
create unique index if not exists map_visits_uk
  on public.map_visits(vehicle_id, place_kind, place_id, entered_at);

alter table public.map_visits enable row level security;
create policy "map visits read" on public.map_visits for select to authenticated
  using (app.has_role(array['ops_room','it_admin','super_admin','sector_manager','deputy','executive']));
drop policy if exists "map visits write" on public.map_visits;
create policy "map visits write" on public.map_visits for all to authenticated
  using (app.has_role(array['ops_room','it_admin','super_admin']))
  with check (app.has_role(array['ops_room','it_admin','super_admin']));
revoke all on public.map_visits from anon;
grant select, insert, update, delete on public.map_visits to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- ② نصف العرض الداخلي: أقصى مسافة من المحور تُعدّ «دخولاً»
--    الحساب: width/2 ناقص هامش 1م، بحد أدنى 3م (أزقة ضيقة) وبحد أقصى 12م.
--    بلا عرض مسجَّل: نفترض 6م (متوسط بغداد المقيس) — وهو الافتراضي المعلن
--    في docs (6.38م)، ونُعلن ذلك في reason عند التصنيف.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_entry_radius_m(p_width_m numeric)
returns double precision
language sql immutable set search_path = pg_catalog as $$
  select least(greatest(coalesce(p_width_m, 6.0) / 2.0 - 1.0, 3.0), 12.0)
$$;
comment on function app.map_entry_radius_m(numeric) is
  'أقصى مسافة من محور الطريق تُعدّ دخولاً — لا مروراً على الحافة';

-- ───────────────────────────────────────────────────────────────────────────
-- ③ فحص نقطة واحدة على مسار: هل هي «داخل» النطاق وبأي عمق؟
--    يُرجع المسافة عن أقرب مقطع، أو NULL إن لم تكن قريبة.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_point_depth_m(
  p_lat double precision, p_lng double precision, p_path jsonb
) returns double precision
language sql immutable set search_path = pg_catalog as $$
  select min(app.map_point_segment_m(
           p_lat, p_lng,
           app.map_pt_lat(p_path -> i), app.map_pt_lng(p_path -> i),
           app.map_pt_lat(p_path -> (i + 1)), app.map_pt_lng(p_path -> (i + 1))
         ))
  from generate_series(0, greatest(jsonb_array_length(p_path) - 2, 0)) as i
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- ④ المحرّك نفسه
--    خوارزمية: نأخذ نقاط الآلية في نافذة زمنية، ونُسقطها على **كل** طريق
--    في زونها (الفهرس المكاني على bbox يقلّلها)، ونبني مقاطع زمنية متصلة
--    لكل طريق. المقطع الذي يحقق المعايير الثلاثة يصير زيارة.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_build_visits(
  p_zone uuid,
  p_from  timestamptz,
  p_to    timestamptz,
  p_vehicle uuid default null,
  p_min_dwell_seconds integer default 60,
  p_max_gap_seconds   integer default 300,
  p_replace boolean default true
) returns table (visits_created integer, visits_merged integer, places_scanned integer)
language plpgsql
security definer
set search_path = public, app as $$
declare
  v_created int := 0;
  v_merged  int := 0;
  v_places  int := 0;
begin
  -- نُعيد حساب النافذة كاملة حتى تكون النتيجة idempotent (تشغيل مرتين = نفس الأرقام)
  if p_replace then
    delete from public.map_visits v
     where v.zone_id = p_zone
       and v.placeday between (p_from at time zone 'UTC')::date and (p_to at time zone 'UTC')::date
       and (p_vehicle is null or v.vehicle_id = p_vehicle);
  end if;

  select count(*)::int into v_places
    from (
      select 1 from public.map_streets s
       where s.zone_id = p_zone and s.status <> 'archived'
      union all
      select 1 from public.map_alleys a
       where a.zone_id = p_zone and a.status <> 'archived'
    ) x;

  -- ⚠ اتجاه الحلقة: **النقاط** هي الخارج، والأماكن هي الداخل المفهرس.
  --    الاتجاه المعاكس (مكان × كل نقاط الزون) = O(أماكن × نقاط) بلا فهرس ⇒ ساعات.
  create temp table if not exists _map_near (
    device_id uuid, vehicle_id uuid, place_kind text, place_id uuid,
    place_code text, place_name text, fix_time timestamptz,
    depth_m double precision, radius_m double precision, inside_n boolean
  );
  truncate _map_near;

  insert into _map_near
  select h.device_id, h.vehicle_id, c.kind, c.id, c.code, c.name,
         h.fix_time, p.depth_m, p.radius_m, p.depth_m <= p.radius_m
  from (
    select h.id as pos_id, h.device_id, h.latitude, h.longitude, h.fix_time,
           vb.garage_vehicle_id as vehicle_id
      from public.gps_device_position_history h
      join public.gps_vehicle_bindings vb on vb.device_id = h.device_id
     where h.fix_time >= p_from
       and h.fix_time <  p_to
       and h.latitude is not null
       and h.longitude is not null
       and (p_vehicle is null or vb.garage_vehicle_id = p_vehicle)
  ) h
  cross join lateral (
    -- ① الشوارع: نصف قطر الدخول يعتمد على عرض الشارع ⇒ مسافة قصوى 12م + هامش
    select 'street'::text as kind, s.id, s.code, s.name, s.path, s.width_m
      from public.map_streets s
     where s.zone_id = p_zone
       and s.status <> 'archived'
       and s.bbox is not null
       -- فهرس GiST على bbox
       and box(point((s.bbox)[2], (s.bbox)[1]), point((s.bbox)[4], (s.bbox)[3]))
           && box(point(h.longitude - 0.0005, h.latitude - 0.0005),
                 point(h.longitude + 0.0005, h.latitude + 0.0005))
    union all
    -- ② الأزقة
    select 'alley'::text, a.id, a.code, a.name, a.path, a.width_m
      from public.map_alleys a
     where a.zone_id = p_zone
       and a.status <> 'archived'
       and a.bbox is not null
       and box(point((a.bbox)[2], (a.bbox)[1]), point((a.bbox)[4], (a.bbox)[3]))
           && box(point(h.longitude - 0.0005, h.latitude - 0.0005),
                 point(h.longitude + 0.0005, h.latitude + 0.0005))
  ) c
  cross join lateral (
    select app.map_point_depth_m(h.latitude, h.longitude, c.path) as depth_m,
           app.map_entry_radius_m(c.width_m) as radius_m
  ) p
  -- نُبقي النقاط القريبة (هامش 55م) حتى نرى **الخروج** بين زيارتين؛
  -- التصنيف «داخل/خارج» يأتي مع النقطة (inside_n) ويُستخدم لاحقاً.
  where p.depth_m <= p.radius_m + 55.0;

  create index if not exists _map_near_place on _map_near (place_kind, place_id, vehicle_id, fix_time);

  -- ③ بناء الجزر لكل (مكان، آلية): الجزيرة = نقاط داخل النطاق **متلاصقة**،
  --    تنقطع بـ: نقطة خارج النطاق (خروج) أو فاصل > p_max_gap_seconds (انقطاع تتبّع).
  --    قطع الانقطاع ضروري لشرط التقارب: نقاط كل 6 دقائق لا تُثبت مكوثاً متصلاً.
  create temp table if not exists _map_island (
    place_kind text, place_id uuid, place_code text, place_name text,
    vehicle_id uuid, device_id uuid, entered_at timestamptz, exited_at timestamptz,
    dwell_s integer, pts_n integer, max_depth double precision, min_gap_s integer
  );
  truncate _map_island;
  insert into _map_island
  select place_kind, place_id, place_code, place_name, vehicle_id,
         (array_agg(device_id  order by fix_time) filter (where inside_n))[1],
         min(fix_time) filter (where inside_n),
         max(fix_time) filter (where inside_n),
         extract(epoch from (max(fix_time) filter (where inside_n)
                           - min(fix_time) filter (where inside_n)))::int,
         count(*) filter (where inside_n)::int,
         round(max(depth_m) filter (where inside_n)::numeric, 1)::double precision,
         min(gap_s) filter (where inside_n)::int
  from (
    select n.*,
           sum(n.is_start) over (partition by n.place_kind, n.place_id, n.vehicle_id
                                order by n.fix_time) as grp_id
    from (
      select m.*,
             extract(epoch from (m.fix_time - lag(m.fix_time) over (
                        partition by m.place_kind, m.place_id, m.vehicle_id
                        order by m.fix_time)))::int as gap_s,
             case when m.inside_n and (
                    lag(m.inside_n) over (
                        partition by m.place_kind, m.place_id, m.vehicle_id
                        order by m.fix_time) is distinct from true
                    or m.fix_time - lag(m.fix_time) over (
                        partition by m.place_kind, m.place_id, m.vehicle_id
                        order by m.fix_time) > make_interval(secs => p_max_gap_seconds)
                  ) then 1 else 0 end as is_start
        from _map_near m
    ) n
  ) g
  where grp_id > 0
  group by place_kind, place_id, place_code, place_name, vehicle_id, grp_id
  having count(*) filter (where inside_n) > 0;

  -- ④ الدمج: جزيرتان لنفس (مكان، آلية) تفصلهما < 10 دقائق = زيارة واحدة.
  --    المكوث = مجموع مكوث الجزيرتين (زمن مُرصود فعلاً)، والنقاط = مجموعهما.
  create temp table if not exists _map_merged (
    place_kind text, place_id uuid, place_code text, place_name text,
    vehicle_id uuid, device_id uuid, entered_at timestamptz, exited_at timestamptz,
    dwell_s integer, pts_n integer, max_depth double precision,
    min_gap_s integer, has_pair boolean
  );
  truncate _map_merged;
  insert into _map_merged
  select place_kind, place_id, place_code, place_name, vehicle_id,
         (array_agg(device_id order by entered_at))[1] as device_id,
         min(entered_at) as entered_at,
         max(exited_at)  as exited_at,
         sum(dwell_s)::int as dwell_s,
         sum(pts_n)::int   as pts_n,
         max(max_depth)    as max_depth,
         least(min(min_gap_s), 100000)::int as min_gap_s,
         bool_or(pts_n >= 2) as has_pair
  from (
    select i.*,
           sum(i.is_new) over (partition by i.place_kind, i.place_id, i.vehicle_id
                               order by i.entered_at) as m_grp
    from (
      select i.*,
             case when extract(epoch from (i.entered_at - lag(i.exited_at) over (
                            partition by i.place_kind, i.place_id, i.vehicle_id
                            order by i.entered_at))) < 600
                   then 0 else 1 end as is_new
        from _map_island i
    ) i
  ) m
  group by place_kind, place_id, place_code, place_name, vehicle_id, m_grp;

  -- ⑤ الإدراج: الحالة والسبب صريحان — «مؤكد» أو «غير مؤكد (السبب)»
  with decided as (
    select m.*,
           case when m.dwell_s >= p_min_dwell_seconds and m.pts_n >= 2 and m.has_pair
                then 'confirmed' else 'uncertain' end as v_status,
           case when m.pts_n < 2
                  then 'نقطة واحدة فقط — لا يتحقق شرط التقارب (نقطتان بفاصل ≤ '
                       || p_max_gap_seconds || 'ث)'
                when not m.has_pair
                  then 'لا تقارب: كل الفواصل بين نقاط التتبّع تتجاوز '
                       || p_max_gap_seconds || 'ث، فلا يمكن إثبات مكوث متصل (زمن مُرصود '
                       || m.dwell_s || 'ث فقط)'
                when m.dwell_s < p_min_dwell_seconds
                  then 'مكوث ' || m.dwell_s || 'ث أقل من الحد ' || p_min_dwell_seconds || 'ث'
                else null end as v_reason
      from _map_merged m
  ), ins as (
    insert into public.map_visits
      (zone_id, vehicle_id, device_id, place_kind, place_id, place_code, place_name,
       placeday, seq, entered_at, exited_at, dwell_seconds, points_count,
       max_depth_m, status, reason)
    select p_zone, d.vehicle_id, d.device_id, d.place_kind, d.place_id, d.place_code, d.place_name,
           (d.entered_at at time zone 'UTC')::date,
           row_number() over (partition by d.vehicle_id, (d.entered_at at time zone 'UTC')::date
                              order by d.entered_at)::smallint,
           d.entered_at, d.exited_at, d.dwell_s, d.pts_n,
           d.max_depth, d.v_status, d.v_reason
      from decided d
    on conflict (vehicle_id, place_kind, place_id, entered_at) do nothing
    returning 1
  )
  select count(*)::int into v_created from ins;

  select coalesce(sum(greatest(pts_n - 1, 0)), 0)::int into v_merged
    from _map_merged;

  return query select v_created, v_merged, v_places;
end $$;

comment on function app.map_build_visits(uuid, timestamptz, timestamptz, uuid, integer, integer, boolean) is
  'يستخرج الزيارات من نقاط GPS — معايير: عمق الدخول + مكوث ≥60ث + تقارب ≥نقطتين؛ idempotent عند p_replace';

-- ───────────────────────────────────────────────────────────────────────────
-- ⑤ ملخّص التغطية لزون/يوم — أساس المرحلة ⑥
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_coverage_summary(p_zone uuid, p_day date)
returns table (
  place_kind text, places_total integer, places_visited integer,
  places_confirmed integer, coverage_pct numeric
)
language sql stable set search_path = public, app as $$
  with places as (
    select 'street'::text as kind, s.id from public.map_streets s
     where s.zone_id = p_zone and s.status <> 'archived'
    union all
    select 'alley'::text, a.id from public.map_alleys a
     where a.zone_id = p_zone and a.status <> 'archived'
  ), visited as (
    select v.place_kind as kind, v.place_id as id,
           bool_or(v.status = 'confirmed') as any_confirmed
    from public.map_visits v
    where v.zone_id = p_zone and v.placeday = p_day
    group by v.place_kind, v.place_id
  )
  select p.kind, count(*)::int,
         count(vi.id)::int,
         count(*) filter (where vi.any_confirmed)::int,
         case when count(*) = 0 then 0
              else round(100.0 * count(vi.id) / count(*), 1) end
  from places p
  left join visited vi on vi.kind = p.kind and vi.id = p.id
  group by p.kind order by p.kind
$$;
comment on function app.map_coverage_summary(uuid, date) is
  'تغطية الزون في يوم: كل الأماكن، المُزارة، المؤكدة، والنسبة — لا «صفر كاذب»';

-- ───────────────────────────────────────────────────────────────────────────
-- ⑥ الصلاحيات
-- ───────────────────────────────────────────────────────────────────────────
revoke all on function app.map_entry_radius_m(numeric) from public, anon;
revoke all on function app.map_point_depth_m(float8, float8, jsonb) from public, anon;
revoke all on function app.map_build_visits(uuid, timestamptz, timestamptz, uuid, integer, integer, boolean) from public, anon;
revoke all on function app.map_coverage_summary(uuid, date) from public, anon;
grant execute on function app.map_entry_radius_m(numeric) to authenticated;
grant execute on function app.map_point_depth_m(float8, float8, jsonb) to authenticated;
grant execute on function app.map_build_visits(uuid, timestamptz, timestamptz, uuid, integer, integer, boolean) to authenticated;
grant execute on function app.map_coverage_summary(uuid, date) to authenticated;
