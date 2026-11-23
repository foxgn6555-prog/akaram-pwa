-- ═══════════════════════════════════════════════════════════════════════════
-- 20261127000400 — المرحلة ⑤: فلاتر موسّعة على الخادم
-- ═══════════════════════════════════════════════════════════════════════════
-- طلب المستخدم: «فلاتر كثيرة» + «أضف فلاتر نستبعد فيها الزيارات غير المؤكدة».
--
-- فلاتر جديدة فوق الأربعة السابقة (آلية · شفت · حالة · محلة · زون الآلية):
--   p_driver    uuid    — السائق: يعمل على الآلية التي كان يقودها في ذلك اليوم
--   p_kind      text    — نوع المكان: 'alley' | 'street' | null
--   p_confirmed boolean — true ⇒ المؤكد فقط (استبعاد غير المؤكد) · null ⇒ لا تصفية
--
-- التصفية **على الخادم** لأن الجدول قد يبلغ آلاف الصفوف: جلب الكل وتصفية
-- المتصفح يخالف النمط القائم في كل بقية الوحدات.
--
-- ⚠ قرار المستخدم القائم: لا محلة للشوارع. فلتر المحلة يستبعد صفوف الشوارع
--   تلقائياً لأنها لا تحمل محلة — و`p_kind='street'` هو الطريق لعرضها وحدها.
--
-- الترقيم: 20261127000400 — بعد 00200 و00300.
-- التراجع:
--   drop function public.map_vehicle_visits_grouped(uuid,date,date,uuid,text,text,text,boolean,uuid,text,boolean);
--   drop function app.map_vehicle_visits_grouped(uuid,date,date,uuid,text,text,text,boolean,uuid,text,boolean);
--   (ثم أعد تشغيل 20261127000200 لاستعادة النسخة السابقة)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function app.map_vehicle_visits_grouped(
  p_zone    uuid,
  p_from    date,
  p_to      date,
  p_vehicle uuid default null,
  p_shift   text default null,
  p_status  text default null,   -- confirmed | uncertain | null=الكل
  p_mahalla text default null,   -- osm_number أو رمز المحلة
  -- طلب المستخدم: «لا يهمني أي بيانات لهذه الآلية خارج زون الأرخيته».
  -- true = لا تظهر آلية مربوطة بزون إلا في زونها. false = السلوك القديم (كل ما دخلت).
  -- آلية بلا map_zone_id تظهر في كل مكان دائماً — لا نحجب بيانات بلا تصنيف.
  p_respect_vehicle_zone boolean default true,
  -- ―― فلاتر المرحلة ⑤ ――
  p_driver     uuid    default null,  -- employee_id للسائق (أي آلية قد يقودها)
  p_kind       text    default null,  -- 'alley' | 'street' | null=الكل
  -- طلب المستخدم: «أضف فلاتر نستبعد فيها الزيارات غير المؤكدة».
  --   true  ⇒ **مؤكد فقط** (استبعاد غير المؤكد)
  --   false/NULL ⇒ لا تصفية — يُعرض الكل مع عدّاد غير المؤكد لكل صف
  p_confirmed  boolean default null
)
returns table (
  zone_id uuid, zone_name text, placeday date,
  vehicle_id uuid, db_number text, plate_number text, vehicle_name text,
  driver_name text, shift text,
  mahalla_code text, mahalla_number text, mahalla_name text,
  street_names text, street_mahalla_source text,
  alley_names text, alley_week_or_num text,
  alleys_count integer, streets_count integer,
  visits_count integer, confirmed_count integer, uncertain_count integer,
  total_dwell_seconds integer, first_entered_at timestamptz, last_exited_at timestamptz,
  avg_dwell_seconds integer, max_depth_m numeric
)
language sql
stable
security definer
set search_path = public, app as $$
  with bounds as (
    select p_from::timestamp at time zone 'Asia/Baghdad' as day_start,
           ((p_to + 1)::timestamp at time zone 'Asia/Baghdad') as day_end
  ),
  -- السائق: من `employees` عبر `driver_employee_id` (المصدر المعتمد)،
  -- و`garage_vehicles.driver_name` نصّ حرّ قديم يُستعمل احتياطاً فقط.
  veh as (
    select g.id, g.db_number, g.plate_number, g.vehicle_name,
           coalesce(nullif(btrim(e.full_name), ''), nullif(btrim(g.driver_name), '')) as driver_name,
           g.shift, g.map_zone_id, g.driver_employee_id
      from public.garage_vehicles g
      left join public.employees e on e.id = g.driver_employee_id
  ),
  base as (
    select v.*, app.map_baghdad_day(v.entered_at) as d
      from public.map_visits v
      cross join bounds b
      left join veh vg on vg.id = v.vehicle_id
     where v.zone_id = p_zone
       and v.entered_at >= b.day_start and v.entered_at < b.day_end
       and (p_vehicle is null or v.vehicle_id = p_vehicle)
       and (p_status is null or v.status = p_status)
       and (not coalesce(p_confirmed, false) or v.status = 'confirmed')
       and (p_driver is null or vg.driver_employee_id = p_driver)
       and (not p_respect_vehicle_zone
            or vg.map_zone_id is null
            or vg.map_zone_id = p_zone)
  ),
  alley_m as (
    select a.id as place_id, m.id as mahalla_id, m.code as mahalla_code,
           m.osm_number as mahalla_number, m.name as mahalla_name
      from public.map_alleys a
      left join public.map_mahallas m on m.id = a.mahalla_id
  ),
  visit_m as (
    select b.*, am.mahalla_id, am.mahalla_code, am.mahalla_number, am.mahalla_name
      from base b
      left join alley_m am on am.place_id = b.place_id and b.place_kind = 'alley'
  ),
  with_shift as (
    select vm.*,
           coalesce((
             select d.shift from public.garage_departures d
              where d.vehicle_id = vm.vehicle_id
                and vm.entered_at >= d.departed_at
                and vm.entered_at <  coalesce(d.returned_at, vm.exited_at)
              order by d.departed_at desc limit 1
           ), gv.shift) as eff_shift
      from visit_m vm
      left join veh gv on gv.id = vm.vehicle_id
  ),
  filtered as (
    select * from with_shift
     where (p_shift is null or eff_shift = p_shift)
       and (p_kind is null or place_kind = p_kind)
  ),
  -- ────────────────────────────────────────────────────────────────────────
  -- المفتاح: **الشارع لا محلة له — لا اشتقاق ولا تخمين** (قرار المستخدم).
  --
  --   `map_streets` لا يحمل `mahalla_id` في القاعدة أصلاً، والقرار أن يبقى
  --   كذلك: لا ننسب الشارع إلى محلة من موقعه الجغرافي. السبب عملي: الفحص
  --   على ١٥٠ شارعاً أظهر أن **٨٤ منها (٥٦٪) تلامس محلّتين أو أكثر**، وأقصى
  --   حالة ٦ محلات لشارع واحد؛ و**٥٥٪ من نقاط الشوارع لا زقاق ضمن ٦٠م منها**.
  --   فأي نسبة ستكون صحيحة في نصف الحالات وخاطئة في نصفها الآخر.
  --
  --   لذلك: الزقاق يُجمَّع بمحلته الحقيقية (١٠٠٪ من الأزقة لها محلة)،
  --   والشوارع كلها تُجمَّع في صفّ واحد لكل (آلية × يوم) بلا محلة.
  -- ────────────────────────────────────────────────────────────────────────
  keyed as (
    select f.*,
           case when f.place_kind = 'alley' then f.mahalla_number end as eff_number,
           case when f.place_kind = 'alley' then f.mahalla_code   end as eff_code,
           case when f.place_kind = 'alley' then f.mahalla_name   end as eff_name,
           case when f.place_kind <> 'alley' then 'street'
                when f.mahalla_id is not null then 'actual'
                else 'unknown' end as m_source,
           -- مفتاح المجموعة: محلة الزقاق، أو 'street' للشوارع
           case when f.place_kind = 'alley' then 'm:' || coalesce(f.mahalla_id::text, '∅')
                else 's' end as grp
      from filtered f
  ),
  filtered_m as (
    select * from keyed
     where p_mahalla is null
        or (place_kind = 'alley'
            and (eff_number = p_mahalla or eff_code = p_mahalla))
  ),
  agg as (
    select p_zone as zid, fm.placeday, fm.vehicle_id,
           g.db_number, g.plate_number, g.vehicle_name, g.driver_name,
           max(fm.eff_shift) as shift_v,
           max(fm.eff_code) as m_code, max(fm.eff_number) as m_number, max(fm.eff_name) as m_name,
           max(fm.m_source) as m_source,
           string_agg(distinct s.name, ' · ' order by s.name)
             filter (where fm.place_kind = 'street') as st_names,
           string_agg(distinct al.name, ' · ' order by al.name)
             filter (where fm.place_kind = 'alley') as al_names,
           string_agg(distinct app.map_alley_short(al.name), ','
                      order by app.map_alley_short(al.name))
             filter (where fm.place_kind = 'alley') as al_nums,
           count(distinct fm.place_id) filter (where fm.place_kind = 'alley')::int as n_alleys,
           count(distinct fm.place_id) filter (where fm.place_kind = 'street')::int as n_streets,
           count(*)::int as n_visits,
           count(*) filter (where fm.status = 'confirmed')::int as n_conf,
           count(*) filter (where fm.status <> 'confirmed')::int as n_unc,
           coalesce(sum(fm.dwell_seconds), 0)::int as sum_dwell,
           min(fm.entered_at) as first_at, max(fm.exited_at) as last_at,
           coalesce(round(avg(fm.dwell_seconds)), 0)::int as avg_dwell,
           max(fm.max_depth_m) as depth
      from filtered_m fm
      left join veh g on g.id = fm.vehicle_id
      left join public.map_streets s on s.id = fm.place_id and fm.place_kind = 'street'
      left join public.map_alleys  al on al.id = fm.place_id and fm.place_kind = 'alley'
     group by fm.placeday, fm.vehicle_id, fm.grp,
              g.db_number, g.plate_number, g.vehicle_name, g.driver_name
  )
  select a.zid, z.name, a.placeday, a.vehicle_id, a.db_number, a.plate_number, a.vehicle_name,
         a.driver_name, a.shift_v, a.m_code, a.m_number, a.m_name, a.st_names, a.m_source,
         a.al_names, a.al_nums, a.n_alleys, a.n_streets, a.n_visits, a.n_conf, a.n_unc,
         a.sum_dwell, a.first_at, a.last_at, a.avg_dwell, a.depth
    from agg a
    left join public.map_zones z on z.id = a.zid
   order by a.placeday, a.db_number nulls last, a.m_source, a.m_number nulls last
$$;

comment on function app.map_vehicle_visits_grouped(uuid,date,date,uuid,text,text,text,boolean,uuid,text,boolean) is
  'تقرير ورقة الشركة + فلاتر ⑤: صف لكل (آلية × يوم × محلة) للأزقة، وصف لكل (آلية × يوم) للشوارع. الشوارع بلا محلة — قرار المستخدم. p_confirmed=true ⇒ المؤكد فقط (استبعاد غير المؤكد). p_driver/p_kind فلاتر إضافية';

revoke all on function app.map_vehicle_visits_grouped(uuid,date,date,uuid,text,text,text,boolean,uuid,text,boolean)
  from public, anon, authenticated;
grant execute on function app.map_vehicle_visits_grouped(uuid,date,date,uuid,text,text,text,boolean,uuid,text,boolean)
  to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- الغلاف العام — منطق الحماية كما هو، والتوقيع الجديد يضاف بجانب القديم
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.map_vehicle_visits_grouped(
  p_zone uuid, p_from date, p_to date,
  p_vehicle uuid default null, p_shift text default null,
  p_status text default null, p_mahalla text default null,
  p_respect_vehicle_zone boolean default true,
  p_driver uuid default null, p_kind text default null,
  p_confirmed boolean default null
)
returns table (
  zone_id uuid, zone_name text, placeday date,
  vehicle_id uuid, db_number text, plate_number text, vehicle_name text,
  driver_name text, shift text,
  mahalla_code text, mahalla_number text, mahalla_name text,
  street_names text, street_mahalla_source text,
  alley_names text, alley_week_or_num text,
  alleys_count integer, streets_count integer,
  visits_count integer, confirmed_count integer, uncertain_count integer,
  total_dwell_seconds integer, first_entered_at timestamptz, last_exited_at timestamptz,
  avg_dwell_seconds integer, max_depth_m numeric
)
language plpgsql
security definer
set search_path = public, app as $w$
begin
  perform public.map_require_reader();
  return query select * from app.map_vehicle_visits_grouped(
    p_zone, p_from, p_to, p_vehicle, p_shift, p_status, p_mahalla,
    p_respect_vehicle_zone, p_driver, p_kind, p_confirmed);
end $w$;

revoke all on function public.map_vehicle_visits_grouped(uuid,date,date,uuid,text,text,text,boolean,uuid,text,boolean)
  from public, anon;
grant execute on function public.map_vehicle_visits_grouped(uuid,date,date,uuid,text,text,text,boolean,uuid,text,boolean)
  to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- كشف قائمة السائقين لهذا التقرير — من يعمل فعلاً في هذا الزون وهذا المدى
--
--   الغرض: فلتر «السائق» يحتاج قائمة قصيرة صحيحة، لا كل موظفي الشركة.
--   القائمة مبنية على زيارات مسجَّلة: من لم يقد آلية لا يظهر.
--   وتطبّق **نفس قيد الزون** المطبَّق في التقرير — وإلا أظهرت سائقاً لا صفّ له.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_grouped_drivers(p_zone uuid, p_from date, p_to date)
returns table (driver_id uuid, driver_name text, vehicles_count integer)
language sql
stable
security definer
set search_path = public, app as $b$
  select g.driver_employee_id,
         coalesce(nullif(btrim(e.full_name), ''), nullif(btrim(g.driver_name), ''), '—'),
         count(distinct g.id)::int
    from public.map_visits v
    join public.garage_vehicles g on g.id = v.vehicle_id
    left join public.employees e on e.id = g.driver_employee_id
   where v.zone_id = p_zone
     and v.entered_at >= p_from::timestamp at time zone 'Asia/Baghdad'
     and v.entered_at <  ((p_to + 1)::timestamp at time zone 'Asia/Baghdad')
     and g.driver_employee_id is not null
     -- نفس قيد الزون المطبَّق في التقرير: لا نعرض سائقاً لن يظهر صفّه أصلاً
     and (g.map_zone_id is null or g.map_zone_id = p_zone)
   group by g.driver_employee_id, e.full_name, g.driver_name
   order by 2
$b$;

revoke all on function app.map_grouped_drivers(uuid,date,date) from public, anon, authenticated;
grant execute on function app.map_grouped_drivers(uuid,date,date) to authenticated, service_role;

create or replace function public.map_grouped_drivers(p_zone uuid, p_from date, p_to date)
returns table (driver_id uuid, driver_name text, vehicles_count integer)
language plpgsql
security definer
set search_path = public, app as $w$
begin
  perform public.map_require_reader();
  return query select * from app.map_grouped_drivers(p_zone, p_from, p_to);
end $w$;

revoke all on function public.map_grouped_drivers(uuid,date,date) from public, anon;
grant execute on function public.map_grouped_drivers(uuid,date,date) to authenticated;
