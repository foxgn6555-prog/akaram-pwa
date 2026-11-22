-- ═══════════════════════════════════════════════════════════════════════════
-- 20261122001100 — شفت الزيارة وسائقها ومسؤول القسم (الجولة ٦)
-- ═══════════════════════════════════════════════════════════════════════════
-- المطلب: عند عرض زيارة، يجب أن يُعرف **اسم سائق الآلية وشفتها** لا الآلية وحدها.
--
-- الحقيقة في المخطط (تحققتُ منها، لا افتراضاً):
--   garage_vehicles.driver_name / .shift  = السائق والشفت **الثابتان** للآلية
--   garage_departures.driver_name / .shift / .departed_at / .returned_at
--                                          = السائق والشفت **لرحلة اليوم**
--
-- لذلك: نبحث عن الانطلاقية التي يغطّي نطاقها الزمني لحظة دخول الزيارة.
--   وُجدت  ⇒ الشفت والسائق من الانطلاقية، المصدر 'departure' (دقيق)
--   لم تُوجد ⇒ من سجل الآلية، المصدر 'vehicle' (بديل **موسوم** لا مدَّعى)
--
-- مسؤول القسم: manager_profiles (sectors[], shift) + employees.full_name.
--   مسؤول القسم يحمل عدة قواطع، فتُعرض قائمة المسؤولين لا شخصاً واحداً —
--   وتُفضَّل مطابقة الشفت لأن المسؤول مرتبط بشفت في ملفه.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- ① مسؤول/مسؤولو قسم لمجموعة قواطع — نصوص جاهزة للعرض
-- ───────────────────────────────────────────────────────────────────────────
drop function if exists app.map_sector_managers(smallint[]);
create or replace function app.map_sector_managers(p_sectors smallint[])
returns table (
  sector_id smallint,
  manager_names text,     -- «أحمد، علي»
  manager_shifts text,    -- «صباحي، مسائي»
  managers_count integer
)
language sql stable set search_path = public, app as $$
  with mgrs as (
    select s.id as sec_id, mp.user_id, mp.shift
      from public.sectors s
      join public.manager_profiles mp on s.id = any(mp.sectors)
     where p_sectors is null or s.id = any(p_sectors)
  ), named as (
    select m.sec_id, m.shift, app.manager_display_name(m.user_id) as nm
      from mgrs m
  )
  select n.sec_id,
         string_agg(distinct n.nm, '، ' order by n.nm),
         string_agg(distinct case n.shift when 'morning' then 'صباحي'
                                       when 'evening' then 'مسائي'
                                       when 'night' then 'ليلي'
                                       else n.shift end, '، ' order by
                    case n.shift when 'morning' then 'صباحي'
                                  when 'evening' then 'مسائي'
                                  when 'night' then 'ليلي'
                                  else n.shift end),
         count(distinct n.nm)::int
    from named n
   group by n.sec_id
$$;
comment on function app.map_sector_managers(smallint[]) is
  'أسماء مسؤولي الأقسام وشفتاتهم لكل قاطع — مصدر عمود «مسؤول القسم» بلا تلفيق';

-- ───────────────────────────────────────────────────────────────────────────
-- ② إثراء الزيارات: شفت · سائق · مصدر الشفت · مسؤول القسم
--    دالة تُقرأ من SDK، لا تُعدّل map_visits (الجدول يبقى سجل الوقائع)
-- ───────────────────────────────────────────────────────────────────────────
drop function if exists app.map_visits_enriched(uuid, date, uuid, text);
create or replace function app.map_visits_enriched(
  p_zone   uuid,
  p_day    date,
  p_vehicle uuid default null,   -- زيارات آلية واحدة
  p_kind   text default null     -- 'street' | 'alley'
) returns table (
  id uuid, vehicle_id uuid, device_id uuid,
  place_kind text, place_id uuid, place_code text, place_name text,
  placeday date, seq smallint,
  entered_at timestamptz, exited_at timestamptz,
  dwell_seconds integer, points_count smallint, max_depth_m numeric,
  status text, reason text,
  vehicle_name text, db_number text,
  driver_name text, shift text,
  shift_source text,              -- departure | vehicle | none
  driver_source text,
  department_manager_names text,
  sector_id smallint, sector_name text
)
language sql stable set search_path = public, app as $$
  with bounds as (select * from app.map_day_bounds(p_day)),
  base as (
    select v.*, b.day_start, b.day_end
      from public.map_visits v, bounds b
     where v.zone_id = p_zone
       and v.entered_at >= b.day_start and v.entered_at < b.day_end
       and (p_vehicle is null or v.vehicle_id = p_vehicle)
       and (p_kind is null or v.place_kind = p_kind)
  ), dep as (
    -- الانطلاقية التي تغطي لحظة الدخول (نأخذ الأحدث بدءاً)
    select distinct on (bl.id) bl.id as visit_id,
           d.shift as dep_shift, d.driver_name as dep_driver
      from base bl
      join public.garage_departures d
        on d.vehicle_id = bl.vehicle_id
       and bl.entered_at >= d.departed_at
       and bl.entered_at <  coalesce(d.returned_at, bl.day_end)
     order by bl.id, d.departed_at desc
  ), zone_sec as (
    select z.id as zone_id, z.sector_id, s.name as sector_name
      from public.map_zones z
      left join public.sectors s on s.id = z.sector_id
     where z.id = p_zone
  ), mgr as (
    select * from app.map_sector_managers(array[(select sector_id from zone_sec)])
  )
  select bl.id, bl.vehicle_id, bl.device_id,
         bl.place_kind, bl.place_id, bl.place_code, bl.place_name,
         bl.placeday, bl.seq, bl.entered_at, bl.exited_at,
         bl.dwell_seconds, bl.points_count, bl.max_depth_m, bl.status, bl.reason,
         gv.vehicle_name, gv.db_number,
         coalesce(dep.dep_driver, gv.driver_name) as driver_name,
         coalesce(dep.dep_shift,  gv.shift)       as shift,
         case when dep.visit_id is not null then 'departure'
              when gv.id is not null        then 'vehicle'
              else 'none' end                     as shift_source,
         case when dep.visit_id is not null then 'departure'
              when gv.driver_name is not null then 'vehicle'
              else 'none' end                     as driver_source,
         m.manager_names,
         zs.sector_id, zs.sector_name
    from base bl
    left join public.garage_vehicles gv on gv.id = bl.vehicle_id
    left join dep on dep.visit_id = bl.id
    left join zone_sec zs on zs.zone_id = bl.zone_id
    left join mgr m on m.sector_id = zs.sector_id
   order by bl.entered_at
$$;
comment on function app.map_visits_enriched(uuid,date,uuid,text) is
  'زيارات يوم بغداد مع السائق والشفت (من الانطلاقية وإلا من الآلية، موسوم المصدر) ومسؤول القسم';

-- ───────────────────────────────────────────────────────────────────────────
-- ③ الأماكن غير المُزارة مع مسؤول قسمها
-- ───────────────────────────────────────────────────────────────────────────
drop function if exists app.map_unvisited_enriched(uuid, date, text);
create or replace function app.map_unvisited_enriched(
  p_zone uuid, p_day date, p_kind text default null
) returns table (
  place_kind text, place_id uuid, place_code text, place_name text,
  mahalla_code text, length_m numeric, width_m numeric,
  department_manager_names text
)
language sql stable set search_path = public, app as $$
  with zs as (
    select z.sector_id from public.map_zones z where z.id = p_zone
  ), m as (
    select manager_names from app.map_sector_managers(array[(select sector_id from zs)])
  )
  select u.place_kind, u.place_id, u.place_code, u.place_name,
         u.mahalla_code, u.length_m, u.width_m,
         (select manager_names from m)
    from app.map_unvisited_places(p_zone, p_day, p_kind) u
$$;
comment on function app.map_unvisited_enriched(uuid,date,text) is
  'قائمة «لم تُزر» مع مسؤول القسم — المسؤولية بجانب الرقم';

-- ───────────────────────────────────────────────────────────────────────────
-- ④ ملخص الآليات: إضافة الشفت والسائق المعتمدين على الانطلاقية
-- ───────────────────────────────────────────────────────────────────────────
drop function if exists app.map_vehicles_day(uuid, date);
create or replace function app.map_vehicles_day(p_zone uuid, p_day date)
returns table (
  vehicle_id uuid, vehicle_name text, db_number text, plate_number text,
  fleet_shift text, fleet_driver text,
  shift text, driver_name text, shift_source text,
  visits_count integer, confirmed_count integer, uncertain_count integer,
  places_count integer, total_dwell_seconds integer,
  first_at timestamptz, last_at timestamptz
)
language sql stable set search_path = public, app as $$
  with bounds as (select * from app.map_day_bounds(p_day)),
  base as (
    select v.* from public.map_visits v, bounds b
     where v.zone_id = p_zone
       and v.entered_at >= b.day_start and v.entered_at < b.day_end
       and v.vehicle_id is not null
  ), dep as (
    -- ⚠ انطلاقية الشفت الليلي تسبق بداية **يوم بغداد** (تبدأ 21:00 UTC،
    --   والانطلاقية 19:00 UTC). تضييق النافذة على [day_start, day_end) يُسقطها،
    --   فتظهر الزيارة «من سجل الآلية» كذباً. لذلك نمدّ البداية 12 ساعة للخلف،
    --   ونحسب الشفت **السائد** بين الانطلاقيات التي قد تخصّ هذا اليوم.
    select d.vehicle_id, d.shift as dep_shift, d.driver_name as dep_driver,
           count(*) over (partition by d.vehicle_id) as n
      from public.garage_departures d, bounds b
     where d.departed_at >= b.day_start - interval '12 hours'
       and d.departed_at <  b.day_end
  ), dep_pick as (
    select distinct on (vehicle_id) vehicle_id, dep_shift, dep_driver
      from dep order by vehicle_id, n desc
  )
  select gv.id, gv.vehicle_name, gv.db_number, gv.plate_number,
         gv.shift, gv.driver_name,
         coalesce(dp.dep_shift, gv.shift),
         coalesce(dp.dep_driver, gv.driver_name),
         case when dp.vehicle_id is not null then 'departure' else 'vehicle' end,
         count(b.id)::int,
         count(b.id) filter (where b.status = 'confirmed')::int,
         count(b.id) filter (where b.status = 'uncertain')::int,
         count(distinct b.place_id)::int,
         coalesce(sum(b.dwell_seconds), 0)::int,
         min(b.entered_at), max(b.exited_at)
    from base b
    join public.garage_vehicles gv on gv.id = b.vehicle_id
    left join dep_pick dp on dp.vehicle_id = gv.id
   group by gv.id, gv.vehicle_name, gv.db_number, gv.plate_number,
            gv.shift, gv.driver_name, dp.dep_shift, dp.dep_driver, dp.vehicle_id
   order by count(b.id) desc, gv.db_number
$$;
comment on function app.map_vehicles_day(uuid,date) is
  'أداء كل آلية في يوم: الشفت والسائق من الانطلاقية إن وُجدت، وإلا من سجل الآلية';

-- ───────────────────────────────────────────────────────────────────────────
-- ⑤ الصلاحيات
-- ───────────────────────────────────────────────────────────────────────────
revoke all on function app.map_sector_managers(smallint[]) from public, anon;
revoke all on function app.map_visits_enriched(uuid,date,uuid,text) from public, anon;
revoke all on function app.map_unvisited_enriched(uuid,date,text) from public, anon;
revoke all on function app.map_vehicles_day(uuid,date) from public, anon;
grant execute on function app.map_sector_managers(smallint[]) to authenticated;
grant execute on function app.map_visits_enriched(uuid,date,uuid,text) to authenticated;
grant execute on function app.map_unvisited_enriched(uuid,date,text) to authenticated;
grant execute on function app.map_vehicles_day(uuid,date) to authenticated;
