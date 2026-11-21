-- ═══════════════════════════════════════════════════════════════════════════
-- 20261122000800 — تصحيح «يوم الزيارة» إلى توقيت بغداد (المرحلة ⑥)
-- ═══════════════════════════════════════════════════════════════════════════
-- العيب: 20261122000700 كان يحسب `placeday = (entered_at at time zone 'UTC')::date`.
--        بغداد = UTC+3، فزيارة الساعة 01:00 بغداد (22:00 UTC من اليوم السابق)
--        كانت تُنسب لليوم السابق. كل تقرير يومي/شفت كان سيجمع ليلة مع يوم.
--
-- الدليل على أن المنصة كلها بتوقيت بغداد: 264 موضعاً تستعمل
--        `at time zone 'Asia/Baghdad'` — منها فهرس يوم الانطلاقيات
--        (00075:21) وكل تقارير الشفت. محرّك الزيارات كان الشاذّ الوحيد.
--
-- التصحيح:
--   ① placeday يُحسب بـ(entered_at at time zone 'Asia/Baghdad')::date
--   ② p_from/p_to تُوسَّعان لتغطيا اليوم البغدادي كاملاً (00:00–24:00 بغداد)
--   ③ نافذة الحذف (p_replace) تتبع اليوم البغدادي أيضاً
--
-- لا نُغيّر أعمدة مكانية ولا منطق التأكيد — اليوم وحده.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- ① يوم بغداد لأي لحظة — دالة واحدة تُستعمل في المحرّك والتقارير
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_baghdad_day(p_ts timestamptz)
returns date language sql immutable set search_path = pg_catalog as $$
  select (p_ts at time zone 'Asia/Baghdad')::date
$$;
comment on function app.map_baghdad_day(timestamptz) is
  'يوم بغداد (UTC+3) لأي لحظة — مصدر واحد للحقيقة بدل تكرار at time zone في كل استعلام';

-- حدود اليوم البغدادي كـtimestamptz (يبدأ 21:00 UTC للسابق)
create or replace function app.map_day_bounds(p_day date)
returns table (day_start timestamptz, day_end timestamptz)
language sql immutable set search_path = pg_catalog as $$
  select (p_day::timestamp at time zone 'Asia/Baghdad'),
         ((p_day + 1)::timestamp at time zone 'Asia/Baghdad')
$$;
comment on function app.map_day_bounds(date) is
  'حدود اليوم البغدادي: [00:00 بغداد، 00:00 بغداد التالي) بتوقيت UTC للتخزين';

-- فهرس على اليوم البغدادي لخدمة التقارير اليومية دون حساب لكل صف
create index if not exists map_visits_baghdad_day_idx
  on public.map_visits (((entered_at at time zone 'Asia/Baghdad')::date), zone_id);

-- ───────────────────────────────────────────────────────────────────────────
-- ② المحرّك: اليوم البغدادي، مع نفس المنطق في كل ما عدا ذلك
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
  v_day_from date := app.map_baghdad_day(p_from);
  v_day_to   date := app.map_baghdad_day(p_to);
begin
  -- نُعيد حساب النافذة كاملة حتى تكون النتيجة idempotent:
  -- نحذف بحسب **اليوم البغدادي** لا بحسب يوم UTC
  if p_replace then
    delete from public.map_visits v
     where v.zone_id = p_zone
       and app.map_baghdad_day(v.entered_at) between v_day_from and v_day_to
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
    select 'street'::text as kind, s.id, s.code, s.name, s.path, s.width_m
      from public.map_streets s
     where s.zone_id = p_zone
       and s.status <> 'archived'
       and s.bbox is not null
       and box(point((s.bbox)[2], (s.bbox)[1]), point((s.bbox)[4], (s.bbox)[3]))
           && box(point(h.longitude - 0.0005, h.latitude - 0.0005),
                 point(h.longitude + 0.0005, h.latitude + 0.0005))
    union all
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
  -- نُبقي النقاط القريبة حتى نرى **الخروج** بين زيارتين
  where p.depth_m <= p.radius_m + 55.0;

  create index if not exists _map_near_place on _map_near (place_kind, place_id, vehicle_id, fix_time);

  -- ③ الجزر: تنقطع بالخروج أو بفاصل > p_max_gap_seconds
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

  -- ④ الدمج: جزيرتان لنفس (مكان، آلية) تفصلهما < 10 دقائق
  create temp table if not exists _map_merged (
    place_kind text, place_id uuid, place_code text, place_name text,
    vehicle_id uuid, device_id uuid, entered_at timestamptz, exited_at timestamptz,
    dwell_s integer, pts_n integer, max_depth double precision,
    min_gap_s integer, has_pair boolean
  );
  truncate _map_merged;
  insert into _map_merged
  select place_kind, place_id, place_code, place_name, vehicle_id,
         (array_agg(device_id order by entered_at))[1],
         min(entered_at), max(exited_at),
         sum(dwell_s)::int, sum(pts_n)::int, max(max_depth),
         least(min(min_gap_s), 100000)::int, bool_or(pts_n >= 2)
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

  -- ⑤ الإدراج: الحالة والسبب صريحان — **واليوم يوم بغداد**
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
           app.map_baghdad_day(d.entered_at),
           row_number() over (partition by d.vehicle_id, app.map_baghdad_day(d.entered_at)
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
  'يستخرج الزيارات من GPS — معايير: عمق + مكوث ≥60ث + تقارب؛ يوم الزيارة بتوقيت بغداد';

-- ───────────────────────────────────────────────────────────────────────────
-- ③ التغطية: تقرأ حدود اليوم البغدادي، وتضيف «غير مؤكد» منفصلاً عن «مؤكد»
-- ───────────────────────────────────────────────────────────────────────────
-- نُسقطها أولاً: إضافة عمود في RETURNS TABLE يغيّر نوع الإرجاع ولا يقبله
-- CREATE OR REPLACE (خطأ صريح: cannot change return type of existing function).
drop function if exists app.map_coverage_summary(uuid, date);

create or replace function app.map_coverage_summary(p_zone uuid, p_day date)
returns table (
  place_kind text, places_total integer, places_visited integer,
  places_confirmed integer, places_uncertain integer, coverage_pct numeric
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
    where v.zone_id = p_zone
      and app.map_baghdad_day(v.entered_at) = p_day
    group by v.place_kind, v.place_id
  )
  select p.kind, count(*)::int,
         count(vi.id)::int,
         count(*) filter (where vi.any_confirmed)::int,
         -- «غير مؤكد» = زِير ولم يؤكد (لا يُخلط مع المؤكد في نسبة واحدة)
         count(*) filter (where vi.id is not null and not vi.any_confirmed)::int,
         case when count(*) = 0 then 0
              else round(100.0 * count(vi.id) / count(*), 1) end
  from places p
  left join visited vi on vi.kind = p.kind and vi.id = p.id
  group by p.kind order by p.kind
$$;
comment on function app.map_coverage_summary(uuid, date) is
  'تغطية الزون في يوم بغداد: مؤكد/غير مؤكد/لم تُدخل منفصلة — لا «صفر كاذب»';

revoke all on function app.map_baghdad_day(timestamptz) from public, anon;
revoke all on function app.map_day_bounds(date) from public, anon;
grant execute on function app.map_baghdad_day(timestamptz) to authenticated;
grant execute on function app.map_day_bounds(date) to authenticated;
