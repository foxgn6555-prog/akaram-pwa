-- ═══════════════════════════════════════════════════════════════════════════
-- 20261127000200 — زون الآلية + تقرير الزيارات المُجمَّع (شكل ورقة الشركة)
-- ═══════════════════════════════════════════════════════════════════════════
-- المشكلة الأولى: **لا عمود واحد يربط الآلية بزون الخريطة.**
--   `garage_vehicles` فيه `sector_id → sectors` و`garage_parent_sector text`
--   (نصّ حرّ غير مُعبّأ)، لكن لا شيء يشير إلى `map_zones`. النتيجة: «الآلية
--   تعمل في الأرخيته» لا يمكن التعبير عنها، وكل آلية تظهر في كل زون تدخل
--   نقاطها فيه. طلب المستخدم صريح: «لا يهمني أي بيانات لهذه الآلية خارج زون
--   الأرخيته — الأرخيته فقط».
--
--   الحل: عمود `map_zone_id` صريح (مصدر واحد للحقيقة) + تعبئة أوّلية من
--   `sector_id` حيث يتطابق الاسم (تحقّقنا: الأزون الثمانية أسماؤها مطابقة
--   لأسماء القطاعات ١–٨ حرفياً). الربط **اختياري**: آلية بلا زون تبقى
--   مرئية كما هي — لا نكسر أي بيانات قائمة.
--
-- المشكلة الثانية: **تقرير الزيارات مسطَّح** — صف لكل زيارة. ورقة الشركة
--   المعتمدة تجميع هرمي:
--       رقم الآلية ← اسم السائق ← المحلة ← (الشارع · الأزقة)
--   وداخل كل محلة عدة أزقة، وأمام كل محلة شارعها الرئيسي.
--
--   الحل: `app.map_vehicle_visits_grouped` — صف واحد لكل
--   (آلية × يوم × محلة) للأزقة، وصف واحد لكل (آلية × يوم) للشوارع.
--
-- ⚠ قرار المستخدم الصريح (2026-11-19): **لا محلة للشوارع — لا اشتقاق ولا
--   تخمين من الموقع الجغرافي.** `map_streets` لا يحمل `mahalla_id` وهذا
--   صحيح ومقصود؛ فلا نُخترع له محلة.
--
--   السبب الذي يجعل هذا هو الخيار الصحيح (قياس فعلي على ١٥٠ شارعاً):
--     · ٨٤ شارعاً من ١٥٠ (٥٦٪) تلامس محلّتين أو أكثر — أقصاها ٦ محلات.
--     · ٥٥٪ من نقاط الشوارع لا يوجد زقاق ضمن ٦٠ متراً منها.
--   فأي نسبةٍ للشارع إلى محلة ستكون صحيحة في نصف الحالات فقط. الأصدق أن
--   تبقى الشوارع في صف مستقل بلا محلة.
--
--   وأما الأزقة فمكتملة: **١٠١٪ من ١٥١٨ زقاقاً لها `mahalla_id`** ومسار
--   هندسي (تحقّقنا: 1518/1518). فهي وحدها أساس التجميع بالمحلة.
--
--   العمود `street_mahalla_source` يبقى لأن الشفافية مطلوبة:
--         actual  — صف أزقة: المحلة من الجدول مباشرة
--         street  — صف شوارع: بلا محلة، بأمانة (لا derived ولا تخمين)
--         unknown — زقاق بلا محلة في القاعدة (لا يحدث اليوم، لكنه محفوظ)
--
-- الترقيم: 20261127000200 — بعد 20261127000100.
-- التراجع:
--   drop function public.map_vehicle_visits_grouped(uuid,date,date,uuid,text,text,text,boolean);
--   drop function app.map_vehicle_visits_grouped(uuid,date,date,uuid,text,text,text,boolean);
--   drop function app.map_alley_short(text);
--   alter table public.garage_vehicles drop column map_zone_id;
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- ① عمود ربط الآلية بزون الخريطة
-- ───────────────────────────────────────────────────────────────────────────
alter table public.garage_vehicles
  add column if not exists map_zone_id uuid references public.map_zones(id) on delete set null;

comment on column public.garage_vehicles.map_zone_id is
  'زون الخريطة الذي تعمل فيه الآلية — إن عُيّن، تُقصر تقارير الزيارات عليه. NULL = بلا قيد';

create index if not exists garage_vehicles_map_zone_idx
  on public.garage_vehicles (map_zone_id) where map_zone_id is not null;

-- تعبئة أوّلية: مطابقة الاسم بين القطاع والزون (تحقّقنا من التطابق ١–٨)
update public.garage_vehicles g
   set map_zone_id = z.id
  from public.sectors s
  join public.map_zones z on z.sector_id = s.id
 where g.sector_id = s.id
   and g.map_zone_id is null
   and z.name = s.name;

-- ───────────────────────────────────────────────────────────────────────────
-- ② استخراج رقم الزقاق من اسمه: «929-41» ⇒ 41
--    الأسماء في مصدر OSM بصيغة «محلة-زقاق»، والورقة المعتمدة تعرض الرقم
--    الأخير وحده. نُبقي الاسم الكامل أيضاً في `alley_names` فلا نفقد شيئاً.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function app.map_alley_short(p_name text)
returns text
language sql immutable set search_path = pg_catalog as $$
  select case
    when p_name is null or btrim(p_name) = '' then null
    when position('-' in p_name) = 0 then btrim(p_name)
    else btrim(split_part(p_name, '-', array_length(string_to_array(p_name, '-'), 1)))
  end
$$;
comment on function app.map_alley_short(text) is
  'رقم الزقاق من اسم «محلة-زقاق» (929-41 ⇒ 41) — للعرض في التقرير المعتمد';

-- ───────────────────────────────────────────────────────────────────────────
-- ③ التقرير المُجمَّع: صف واحد لكل (آلية × يوم × محلة)
-- ───────────────────────────────────────────────────────────────────────────
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
  p_respect_vehicle_zone boolean default true
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
           g.shift, g.map_zone_id
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
     where p_shift is null or eff_shift = p_shift
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
comment on function app.map_vehicle_visits_grouped(uuid, date, date, uuid, text, text, text, boolean) is
  'تقرير ورقة الشركة: صف لكل (آلية × يوم × محلة) للأزقة، وصف لكل (آلية × يوم) للشوارع. الشوارع بلا محلة — قرار المستخدم، لا اشتقاق جغرافي. p_respect_vehicle_zone=true يحصر النتائج في الآليات المربوطة بهذا الزون';

-- ⚠ نسخة `app` كانت مكشوفة لـanon رغم أن الغلاف العام محمي: anon يستدعي
--   app.* مباشرةً عبر PostgREST فيتجاوز map_require_reader. أُغلق هذا في
--   20261127000200 (تحقق فعلي: has_function_privilege('anon', …) = false).
revoke all on function app.map_vehicle_visits_grouped(uuid, date, date, uuid, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function app.map_vehicle_visits_grouped(uuid, date, date, uuid, text, text, text, boolean)
  to authenticated, service_role;
revoke all on function app.map_alley_short(text) from public, anon;
grant execute on function app.map_alley_short(text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- ④ غلاف عام بنفس الصرامة
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.map_vehicle_visits_grouped(
  p_zone uuid, p_from date, p_to date,
  p_vehicle uuid default null, p_shift text default null,
  p_status text default null, p_mahalla text default null,
  p_respect_vehicle_zone boolean default true
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
language plpgsql security definer set search_path = public, app as $$
begin
  perform public.map_require_reader();
  return query select * from app.map_vehicle_visits_grouped(
    p_zone, p_from, p_to, p_vehicle, p_shift, p_status, p_mahalla, p_respect_vehicle_zone);
end $$;

revoke all on function public.map_vehicle_visits_grouped(uuid, date, date, uuid, text, text, text, boolean) from public, anon;
grant execute on function public.map_vehicle_visits_grouped(uuid, date, date, uuid, text, text, text, boolean) to authenticated;
