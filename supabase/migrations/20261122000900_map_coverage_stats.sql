-- ═══════════════════════════════════════════════════════════════════════════
-- 20261122000900 — إحصاءات التغطية (المرحلة ⑥)
-- ═══════════════════════════════════════════════════════════════════════════
-- معيار القبول من الخطة: «تغطية/زون/آلية/شفت + قائمة لم تُزر + نسبة غير
-- المؤكد معروضة منفصلة عن المؤكد».
--
-- ثلاثة مستويات لا رابع:
--   app.map_coverage_by_place   — مكان مكان (يُغذّي جدول التغطية والتصدير)
--   app.map_coverage_by_vehicle — آلية آلية، مع الشفت والسائق من الأسطول
--   app.map_coverage_rollup     — صف واحد للزون كله (تغطية الزون في يوم)
--
-- كلها تقرأ **اليوم البغدادي** عبر app.map_baghdad_day، ولا تُرجع «صفراً
-- كاذباً»: المكان غير المُزار يظهر بصف `visited=false` (لم تُدخل)، لا يغيب.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- ① مكان مكان — الأساس لكل تقرير
-- ───────────────────────────────────────────────────────────────────────────
drop function if exists app.map_coverage_by_place(uuid, date, text);
create or replace function app.map_coverage_by_place(
  p_zone uuid,
  p_day  date,
  p_kind text default null          -- 'street' | 'alley' | null=الكل
) returns table (
  place_kind text, place_id uuid, place_code text, place_name text,
  mahalla_code text, width_m numeric, length_m numeric,
  visited boolean, confirmed boolean, uncertain_visits integer,
  visits_count integer, first_entered_at timestamptz, last_exited_at timestamptz,
  total_dwell_seconds integer, vehicles_count integer, max_depth_m numeric
)
language sql stable set search_path = public, app as $$
  with places as (
    select 'street'::text as kind, s.id, s.code, s.name,
           null::text as mahalla_code, s.width_m, s.length_m
      from public.map_streets s
     where s.zone_id = p_zone and s.status <> 'archived'
    union all
    select 'alley'::text, a.id, a.code, a.name,
           m.code, a.width_m, a.length_m
      from public.map_alleys a
      left join public.map_mahallas m on m.id = a.mahalla_id
     where a.zone_id = p_zone and a.status <> 'archived'
  ), v as (
    select mv.place_kind, mv.place_id,
           count(*)::int as visits_count,
           count(*) filter (where mv.status = 'confirmed')::int as confirmed_n,
           count(*) filter (where mv.status = 'uncertain')::int as uncertain_n,
           min(mv.entered_at) as first_at,
           max(mv.exited_at) as last_at,
           coalesce(sum(mv.dwell_seconds), 0)::int as dwell,
           count(distinct mv.vehicle_id)::int as veh_n,
           max(mv.max_depth_m) as depth
      from public.map_visits mv
     where mv.zone_id = p_zone
       and app.map_baghdad_day(mv.entered_at) = p_day
     group by mv.place_kind, mv.place_id
  )
  select p.kind, p.id, p.code, p.name, p.mahalla_code, p.width_m, p.length_m,
         (v.place_id is not null) as visited,
         coalesce(v.confirmed_n, 0) > 0 as confirmed,
         coalesce(v.uncertain_n, 0),
         coalesce(v.visits_count, 0),
         v.first_at, v.last_at, coalesce(v.dwell, 0),
         coalesce(v.veh_n, 0), v.depth
  from places p
  left join v on v.place_kind = p.kind and v.place_id = p.id
  where p_kind is null or p.kind = p_kind
  order by p.kind, p.code
$$;
comment on function app.map_coverage_by_place(uuid, date, text) is
  'كل مكان في الزون مع حالته في يوم بغداد: visited=false تعني «لم تُدخل» ولا تُحذف من الجدول';

-- ───────────────────────────────────────────────────────────────────────────
-- ② آلية آلية — لا تُخفى آلية متتبَّعة
-- ⚠ العيب الذي منعتْه هذه الدالة: لو اعتمدنا على `garage_vehicles` مع شرط
--   `archived_at is null` وحدها، لاختفت **الآليات المؤرشفة التي ما زالت
--   تُرسل نقاطاً وتزور أماكن**. الاختفاء يُقرأ كـ«لا شيء يحدث» فيقرير
--   المفتّش، وهو صنف «صفر كاذب» بعينه. (الآلية بلا سجل أسطول مستحيلة بنيوياً:
--   `map_visits.vehicle_id` و`gps_vehicle_bindings.garage_vehicle_id` كلاهما
--   مفتاح خارجي إلى garage_vehicles — تحقّقتُ من ذلك في المخطط.)
--   لذلك: نبدأ من **اتحاد** (آليات الأسطول ∪ آليات لها ربط جهاز ∪ آليات لها
--   نقاط في اليوم)، ونعرض `in_fleet=false` بصراحة للمؤرشفة وغير المسجّلة.
-- ───────────────────────────────────────────────────────────────────────────
drop function if exists app.map_coverage_by_vehicle(uuid, date);
create or replace function app.map_coverage_by_vehicle(p_zone uuid, p_day date)
returns table (
  vehicle_id uuid, vehicle_name text, db_number text, plate_number text,
  shift text, driver_name text, in_fleet boolean, unbound_devices integer,
  visits_count integer, confirmed_count integer, uncertain_count integer,
  places_count integer, total_dwell_seconds integer, first_at timestamptz, last_at timestamptz
)
language sql stable set search_path = public, app as $$
  with bounds as (
    select day_start, day_end from app.map_day_bounds(p_day)
  ), mine as (
    select mv.* from public.map_visits mv, bounds b
     where mv.zone_id = p_zone
       and mv.entered_at >= b.day_start and mv.entered_at < b.day_end
  ), tracked as (
    -- (أ) آلية لها ربط جهاز
    select vb.garage_vehicle_id as vid, 0 as extra_devices from public.gps_vehicle_bindings vb
    union all
    -- (ب) آلية لها زيارات في اليوم
    select m.vehicle_id, 0 from mine m where m.vehicle_id is not null
  ), tracked_sum as (
    select vid, sum(extra_devices)::int as extra from tracked where vid is not null group by vid
  ), fleet as (
    -- الاسم يُقرأ لكل الآليات (المؤرشفة أيضاً) — وإلا عرض التقرير «(بلا اسم)»
    -- لآلية معروفة، وهذا يُضلّل المفتّش. `in_fleet` تعني «فعّالة الآن».
    select gv.id as vid, gv.vehicle_name, gv.db_number, gv.plate_number,
           gv.shift, gv.driver_name, (gv.archived_at is null) as in_fleet
      from public.garage_vehicles gv
  ), ids as (
    select vid from tracked_sum
    union
    select vid from fleet
  ), agg as (
    select m.vehicle_id, count(*)::int as vn,
           count(*) filter (where m.status = 'confirmed')::int as cn,
           count(*) filter (where m.status = 'uncertain')::int as un,
           count(distinct m.place_id)::int as pn,
           coalesce(sum(m.dwell_seconds), 0)::int as dw,
           min(m.entered_at) as fa, max(m.exited_at) as la
      from mine m where m.vehicle_id is not null group by m.vehicle_id
  )
  select i.vid, f.vehicle_name, f.db_number, f.plate_number, f.shift, f.driver_name,
         coalesce(f.in_fleet, false),
         coalesce(ts.extra, 0),
         coalesce(a.vn, 0), coalesce(a.cn, 0), coalesce(a.un, 0),
         coalesce(a.pn, 0), coalesce(a.dw, 0), a.fa, a.la
  from ids i
  left join fleet f on f.vid = i.vid
  left join tracked_sum ts on ts.vid = i.vid
  left join agg a on a.vehicle_id = i.vid
  order by coalesce(a.vn, 0) desc, f.db_number nulls last
$$;
comment on function app.map_coverage_by_vehicle(uuid, date) is
  'أداء كل آلية متتبَّعة في يوم بغداد — تشمل الآليات خارج سجل الأسطول (in_fleet=false) بلا إخفاء';

-- ───────────────────────────────────────────────────────────────────────────
-- ③ صف الزون الواحد — الرقم الذي يُعرض في رأس الصفحة
-- ───────────────────────────────────────────────────────────────────────────
drop function if exists app.map_coverage_rollup(uuid, date);
create or replace function app.map_coverage_rollup(p_zone uuid, p_day date)
returns table (
  places_total integer, places_visited integer, places_confirmed integer,
  places_uncertain integer, places_not_entered integer,
  visits_total integer, visits_confirmed integer, visits_uncertain integer,
  coverage_pct numeric, confirmed_pct numeric, uncertain_pct numeric,
  vehicles_active integer, total_dwell_seconds integer
)
language sql stable set search_path = public, app as $$
  with p as (
    select * from app.map_coverage_by_place(p_zone, p_day, null)
  ), v as (
    select mv.* from public.map_visits mv
     where mv.zone_id = p_zone
       and app.map_baghdad_day(mv.entered_at) = p_day
  )
  select
    (select count(*)::int from p),
    (select count(*)::int from p where visited),
    (select count(*)::int from p where confirmed),
    (select count(*)::int from p where visited and not confirmed),
    (select count(*)::int from p where not visited),
    (select count(*)::int from v),
    (select count(*)::int from v where status = 'confirmed'),
    (select count(*)::int from v where status = 'uncertain'),
    case when (select count(*) from p) = 0 then 0
         else round(100.0 * (select count(*) from p where visited) / (select count(*) from p), 1) end,
    case when (select count(*) from p) = 0 then 0
         else round(100.0 * (select count(*) from p where confirmed) / (select count(*) from p), 1) end,
    case when (select count(*) from p) = 0 then 0
         else round(100.0 * (select count(*) from p where visited and not confirmed)
                    / (select count(*) from p), 1) end,
    (select count(distinct vehicle_id)::int from v where vehicle_id is not null),
    (select coalesce(sum(dwell_seconds), 0)::int from v)
$$;
comment on function app.map_coverage_rollup(uuid, date) is
  'ملخص الزون في يوم: مؤكد وغير مؤكد ولم تُدخل — النسب الثلاث منفصلة لا مخلوطة';

-- ───────────────────────────────────────────────────────────────────────────
-- ④ قائمة «لم تُزر» — أهم مخرَج للمفتّش: أين لم تصل الآلية
-- ───────────────────────────────────────────────────────────────────────────
drop function if exists app.map_unvisited_places(uuid, date, text);
create or replace function app.map_unvisited_places(
  p_zone uuid, p_day date, p_kind text default null
) returns table (
  place_kind text, place_id uuid, place_code text, place_name text,
  mahalla_code text, length_m numeric, width_m numeric
)
language sql stable set search_path = public, app as $$
  select c.place_kind, c.place_id, c.place_code, c.place_name,
         c.mahalla_code, c.length_m, c.width_m
  from app.map_coverage_by_place(p_zone, p_day, p_kind) c
  where not c.visited
  order by c.length_m desc nulls last, c.place_code
$$;
comment on function app.map_unvisited_places(uuid, date, text) is
  'الأماكن التي لم تُدخل في يوم بغداد — مرتّبة بالطول تنازلياً (الأهم أولاً)';

-- ───────────────────────────────────────────────────────────────────────────
-- ⑤ اتجاه التغطية عبر الأيام (للرسم البياني) — آخر N يوماً
-- ⚠ القياس: النسخة الأولى كانت تستدعي rollup لكل يوم (1640 صفاً × 30) ⇒
--   53 ثانية على 491 ألف زيارة. هنا تجميع **واحد** على كل النافذة ثم قسمة
--   بالأيام — نفس النتيجة بلا تكرار العمل.
-- ───────────────────────────────────────────────────────────────────────────
drop function if exists app.map_coverage_trend(uuid, date, integer);
create or replace function app.map_coverage_trend(
  p_zone uuid, p_until date, p_days integer default 14
) returns table (
  day date, places_total integer, places_visited integer, places_confirmed integer,
  places_uncertain integer, coverage_pct numeric, visits_total integer
)
language sql stable set search_path = public, app as $$
  with span as (
    select (p_until - (p_days - 1)) as first_day, p_until as last_day
  ), total_places as (
    select (select count(*) from public.map_streets s
             where s.zone_id = p_zone and s.status <> 'archived')
         + (select count(*) from public.map_alleys a
             where a.zone_id = p_zone and a.status <> 'archived') as n
  ), per_place as (
    -- تجميع واحد: كل (يوم، مكان) مع أفضل حالة بلغها
    select app.map_baghdad_day(mv.entered_at) as d, mv.place_kind, mv.place_id,
           bool_or(mv.status = 'confirmed') as conf,
           count(*)::int as visits_n
      from public.map_visits mv, span
     where mv.zone_id = p_zone
       and mv.entered_at >= (select b.day_start from span, app.map_day_bounds(span.first_day) b)
       and mv.entered_at <  (select b.day_end   from span, app.map_day_bounds(span.last_day) b)
     group by 1, 2, 3
  ), per_day as (
    select d, count(*)::int as visited,
           count(*) filter (where conf)::int as confirmed,
           count(*) filter (where not conf)::int as uncertain,
           coalesce(sum(visits_n), 0)::int as visits
      from per_place group by d
  )
  select gs::date,
         tp.n,
         coalesce(pd.visited, 0),
         coalesce(pd.confirmed, 0),
         coalesce(pd.uncertain, 0),
         case when tp.n = 0 then 0
              else round(100.0 * coalesce(pd.visited, 0) / tp.n, 1) end,
         coalesce(pd.visits, 0)
  from generate_series((select first_day from span), (select last_day from span),
                       interval '1 day') gs
  cross join total_places tp
  left join per_day pd on pd.d = gs::date
  order by gs
$$;
comment on function app.map_coverage_trend(uuid, date, integer) is
  'تغطية آخر N يوماً بتجميع واحد — الأيام بلا زيارات تظهر أصفاراً صريحة لا تُحذف';

-- ───────────────────────────────────────────────────────────────────────────
-- ⑥ الصلاحيات
-- ───────────────────────────────────────────────────────────────────────────
revoke all on function app.map_coverage_by_place(uuid, date, text) from public, anon;
revoke all on function app.map_coverage_by_vehicle(uuid, date) from public, anon;
revoke all on function app.map_coverage_rollup(uuid, date) from public, anon;
revoke all on function app.map_unvisited_places(uuid, date, text) from public, anon;
revoke all on function app.map_coverage_trend(uuid, date, integer) from public, anon;
grant execute on function app.map_coverage_by_place(uuid, date, text) to authenticated;
grant execute on function app.map_coverage_by_vehicle(uuid, date) to authenticated;
grant execute on function app.map_coverage_rollup(uuid, date) to authenticated;
grant execute on function app.map_unvisited_places(uuid, date, text) to authenticated;
grant execute on function app.map_coverage_trend(uuid, date, integer) to authenticated;
