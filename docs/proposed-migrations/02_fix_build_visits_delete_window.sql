-- ═══════════════════════════════════════════════════════════════════════════════════════
-- 02_fix_build_visits_delete_window — إصلاح نافذة الحذف في map_build_visits (الدورة⑥ — مقترح)
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- مقترح للدورة⑥: لا يُطبّق على الإنتاج قبل مراجعة المالك والموافقة الصريحة.
--
-- العطل: `app.map_build_visits` تحسب حدود النافذة البغدادية:
--     v_day_from := map_baghdad_day(p_from)
--     v_day_to   := map_baghdad_day(p_to)
-- عندما يُستدعى الإConstruction بنهاية اليوم كحد استثنائي (p_to = بداية اليوم التالي
-- بتوقيت بغداد، كما يفعل البناء الليلي gps_visits_build_scan عبر map_day_bounds)،
-- تُنتج map_baghdad_day(p_to) اليوم التالي ⇒ الحذف بـ `between v_day_from and v_day_to`
-- يمسح زيارات اليوم المطلوب **واليوم التالي juntos** — أي إعادة بناء يوم تحذف زيارات
-- اليوم الذي يليه عن طريق الخطأ.
--
-- الإصلاح: p_to حد استبعادي،所以今天 القابل للحذف هو اليوم الذي يحتوي p_to ناقص ثانية واحدة:
--     v_day_to := map_baghdad_day(p_to - interval '1 second')
-- لذا، عند p_to = بداية اليوم D+1، يصبح v_day_to = D، ويُحذف اليوم D فقط.
--
-- يُطبّق على دالة 20261127000100 (التي أضافت عمود skipped_visits). نوع الإرجاع لا يتغيّر
-- ⇒ يُستخدم CREATE OR REPLACE. لا يلمس الغلاف public.map_build_visits (هو مجرد تمرير).
--
-- التراجع: إعادة سطر v_day_to إلى app.map_baghdad_day(p_to).

-- ─────────────────────────────────────────────────────────────────────────────
-- المحرّك: rebuild لزيارات يوم/أيام بغدادي مع نافذة حذف مصححة (لا تمسح اليوم التالي)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function app.map_build_visits(
  p_zone uuid,
  p_from  timestamptz,
  p_to    timestamptz,
  p_vehicle uuid default null,
  p_min_dwell_seconds integer default 60,
  p_max_gap_seconds   integer default 300,
  p_replace boolean default true
) returns table (visits_created integer, visits_merged integer, places_scanned integer, skipped_visits integer)
language plpgsql
security definer
set search_path = public, app as $$
declare
  v_created int := 0;
  v_merged  int := 0;
  v_places  int := 0;
  v_skipped int := 0;
  v_day_from date := app.map_baghdad_day(p_from);
  -- ★ الإصلاح: p_to حد استبعادي، so نطرح ثانية واحدة قبل استخراج اليوم البغدادي
  --   حتى لا يمتد الحذف إلى اليوم التالي عند استدعاء الدالة بنهاية اليوم كقاطع.
  v_day_to   date := app.map_baghdad_day(p_to - interval '1 second');
begin
  perform public.map_require_editor();
  -- نُعيد حساب النافذة كاملة حتى تكون النتيجة idempotent:
  -- نحذف بحسب **اليوم البغدادي** لا بحسب يوم UTC، والآن دون أن يمتد الحذف لليوم التالي
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
    -- النوع يدخل في حساب نصف القطر: الزقاق 3م دائماً
    select app.map_point_depth_m(h.latitude, h.longitude, c.path) as depth_m,
           app.map_entry_radius_m(c.width_m, c.kind) as radius_m
  ) p
  -- نُبقي النقاط القريبة حتى نرى **الخروج** بين زيارتين
  where p.depth_m <= p.radius_m + 55.0;

  create index if not exists _map_near_place on _map_near (place_kind, place_id, vehicle_id, fix_time);

  -- الجزر: تنقطع بالخروج أو بفاصل > p_max_gap_seconds
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

  -- الدمج: جزيرتان لنفس (مكان، آلية) تفصلهما < 10 دقائق
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

  -- الإسقاط: زيارة لا تُثبَت ليست زيارة (مكوث ≤0، نقاط <3، زقاق مغطى ≥95% بشارع)
  create temp table if not exists _map_kept (
    place_kind text, place_id uuid, place_code text, place_name text,
    vehicle_id uuid, device_id uuid, entered_at timestamptz, exited_at timestamptz,
    dwell_s integer, pts_n integer, max_depth double precision,
    min_gap_s integer, has_pair boolean
  );
  truncate _map_kept;

  with cand as (
    select m.*,
           coalesce((
             select sum(greatest(0, extract(epoch from (
                      least(m.exited_at, s.exited_at) - greatest(m.entered_at, s.entered_at)))))
               from _map_merged s
              where s.place_kind = 'street'
                and s.vehicle_id = m.vehicle_id
                and s.entered_at < m.exited_at
                and s.exited_at > m.entered_at
           ), 0) as street_cover_s
      from _map_merged m
  ), judged as (
    select c.*,
           case
             when c.dwell_s <= 0 then 'zero_dwell'
             when c.pts_n < 3    then 'too_few_points'
             when c.place_kind = 'alley'
                  and c.dwell_s > 0
                  and c.street_cover_s::numeric / c.dwell_s >= 0.95 then 'street_covered'
             else null
           end as drop_code
      from cand c
  )
  insert into _map_kept
  select place_kind, place_id, place_code, place_name, vehicle_id, device_id,
         entered_at, exited_at, dwell_s, pts_n, max_depth, min_gap_s, has_pair
    from judged
   where drop_code is null;

  select count(*)::int into v_skipped from (
    with cand as (
      select m.*,
             coalesce((
               select sum(greatest(0, extract(epoch from (
                        least(m.exited_at, s.exited_at) - greatest(m.entered_at, s.entered_at)))))
                 from _map_merged s
                where s.place_kind = 'street'
                  and s.vehicle_id = m.vehicle_id
                  and s.entered_at < m.exited_at
                  and s.exited_at > m.entered_at
             ), 0) as street_cover_s
      from _map_merged m
    )
    select 1 from cand c
     where c.dwell_s <= 0
        or c.pts_n < 3
        or (c.place_kind = 'alley' and c.dwell_s > 0
            and c.street_cover_s::numeric / c.dwell_s >= 0.95)
  ) z;

  -- الإدراج: الحالة والسبب صريحان — واليوم يوم بغداد
  with decided as (
    select m.*,
           case when m.dwell_s >= p_min_dwell_seconds and m.pts_n >= 3 and m.has_pair
                then 'confirmed' else 'uncertain' end as v_status,
           case when m.pts_n < 3
                  then 'نقاط ' || m.pts_n || ' أقل من ٣ — لا يتحقق شرط إثبات المكوث'
                when not m.has_pair
                  then 'لا تقارب: كل الفواصل بين نقاط التتبّع تتجاوز '
                       || p_max_gap_seconds || 'ث، فلا يمكن إثبات مكوث متصل (زمن مُرصود '
                       || m.dwell_s || 'ث فقط)'
                when m.dwell_s < p_min_dwell_seconds
                  then 'مكوث ' || m.dwell_s || 'ث أقل من الحد ' || p_min_dwell_seconds || 'ث'
                else null end as v_reason
      from _map_kept m
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

  return query select v_created, v_merged, v_places, v_skipped;
end $$;

comment on function app.map_build_visits(uuid, timestamptz, timestamptz, uuid, integer, integer, boolean) is
  'يستخرج الزيارات من GPS. يُسقط: مكوث ≤0، نقاط <3، وزقاقاً مغطى ≥95% بشارع. يوم الزيارة بتوقيت بغداد. 02_fix_build_visits_delete_window: نافذة الحذف لا تمتد إلى اليوم التالي.';
