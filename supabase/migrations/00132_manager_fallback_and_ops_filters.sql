-- ═══════════════════════════════════════════════════════════════
-- 00132 · معالجة جذرية لبلاغين ميدانيين + توسيع فلاتر غرفة العمليات
--   ① «لا يوجد مسؤول» عند الانطلاقة رغم وجود مسؤول للقاطع:
--      حل مسؤول القاطع صار بسلسلتين: مسؤول المنطقة نفسها أولاً
--      (وبالتعدد يبقى رفض AMBIGUOUS حفاظاً على العقد)، وعند غيابه
--      يرتد تلقائياً لأي مسؤول ضمن القاطع الأب (كرادة/زعفرانية)
--      بترتيب حتمي: مطابقة الشفت ← الأقدم إنشاءً ← المعرف.
--   ② مفتاح مكرر weighings-<uuid>: سببه ضلع خروج مكرر للزيارة نفسها؛
--      صار الخروج lateral بسطر واحد، وأضيف sector_id وparent_sector
--      لجدول غرفة العمليات لتعمل فلاتر المناطق الثماني والقاطعين.
-- ═══════════════════════════════════════════════════════════════

-- ── ① حل مسؤول القسم مع الارتداد للقطاع الأب ──
create or replace function app.resolve_sector_shift_manager(p_sector_id smallint, p_shift text)
returns table (user_id uuid, manager_name text)
language plpgsql stable security definer set search_path = public, app as $$
declare
  matched_count integer;
  parent text;
  fallback uuid;
begin
  select count(*) into matched_count
  from public.manager_profiles mp
  where p_sector_id = any(mp.sectors)
    and exists (select 1 from public.user_roles ur where ur.user_id = mp.user_id and ur.role = 'department_manager');
  if matched_count > 1 then raise exception 'GARAGE_SECTOR_MANAGER_AMBIGUOUS'; end if;
  if matched_count = 1 then
    return query
    select mp.user_id, coalesce(nullif(e.full_name, ''), au.email, mp.user_id::text)
    from public.manager_profiles mp
    join auth.users au on au.id = mp.user_id
    left join public.employees e on e.user_id = mp.user_id
    where p_sector_id = any(mp.sectors)
      and exists (select 1 from public.user_roles ur where ur.user_id = mp.user_id and ur.role = 'department_manager');
    return;
  end if;
  -- ارتداد: أي مسؤول قسم يغطي منطقة شقيقة ضمن القاطع الأب نفسه
  select s.parent_sector into parent from public.sectors s where s.id = p_sector_id;
  select mp.user_id into fallback
  from public.manager_profiles mp
  where exists (select 1 from public.sectors sx where sx.id = any(mp.sectors) and sx.parent_sector = parent)
    and exists (select 1 from public.user_roles ur where ur.user_id = mp.user_id and ur.role = 'department_manager')
  order by (mp.shift = p_shift) desc, mp.created_at, mp.user_id
  limit 1;
  if fallback is null then raise exception 'GARAGE_SECTOR_MANAGER_NOT_CONFIGURED'; end if;
  return query
  select fallback, coalesce(nullif(e.full_name, ''), au.email, fallback::text)
  from auth.users au
  left join public.employees e on e.user_id = fallback
  where au.id = fallback;
end$$;

-- ── ② جدول سير العمل: خروج وحيد + أعمدة المنطقة والقاطع ──
drop function if exists public.ops_station_workflow(date, text);
drop function if exists app.ops_station_workflow(date, text);
create or replace function app.ops_station_workflow(p_day date default null, p_search text default null)
returns table (
  visit_id uuid, departure_id uuid, trip_day date, db_number text, vehicle_name text,
  driver_name text, shift text, area_name text, manager_name text,
  sector_id smallint, parent_sector text,
  inbound_departed_at timestamptz, arrived_at timestamptz, weighed_at timestamptz,
  completed_at timestamptz, dispatched_at timestamptz,
  weight_tons numeric, destination text, destination_label text,
  vehicle_kind text, kind_label text, min_tons numeric,
  violation boolean, deficit_tons numeric,
  transit_minutes integer, weigh_wait_minutes integer, process_minutes integer, stay_minutes integer
)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.has_role(array['ops_room','transfer_station','super_admin']) then
    raise exception 'OPS_WORKFLOW_FORBIDDEN';
  end if;
  return query
  select i.id, i.departure_id, (i.departed_at at time zone 'Asia/Baghdad')::date,
         gv.db_number, gv.vehicle_name, d.driver_name, d.shift, s.name, d.recipient_manager_name,
         d.sector_id, s.parent_sector,
         i.departed_at, i.arrived_at, st.weighed_at, st.completed_at, o.departed_at,
         st.weight_tons, st.destination,
         case st.destination when 'press' then 'المكبس' when 'transfer_station' then 'المحطة التحويلية' end,
         st.vehicle_kind, k.label, k.min_tons,
         coalesce(st.violation, false), st.deficit_tons,
         floor(extract(epoch from (i.arrived_at - i.departed_at)) / 60)::int,
         case when st.weighed_at is null or st.weighed_at < i.arrived_at then null
              else floor(extract(epoch from (st.weighed_at - i.arrived_at)) / 60)::int end,
         case when st.completed_at is null then null
              else floor(extract(epoch from (st.completed_at - i.arrived_at)) / 60)::int end,
         floor(extract(epoch from (coalesce(o.departed_at, now()) - i.arrived_at)) / 60)::int
  from public.vehicle_trip_legs i
  join public.garage_departures d on d.id = i.departure_id
  join public.garage_vehicles gv on gv.id = d.vehicle_id
  join public.sectors s on s.id = d.sector_id
  left join public.ts_visit_weighing_steps st on st.visit_leg_id = i.id
  left join public.ts_vehicle_kinds k on k.kind = st.vehicle_kind
  left join lateral (
    select oo.departed_at
    from public.vehicle_trip_legs oo
    where oo.departure_id = i.departure_id
      and oo.sequence_no = i.sequence_no + 1
      and oo.origin_type = 'transfer_station'
    order by oo.id
    limit 1
  ) o on true
  where i.destination_type = 'transfer_station'
    and (p_day is null or (i.departed_at at time zone 'Asia/Baghdad')::date = p_day)
    and (p_search is null or trim(p_search) = ''
         or gv.db_number ilike '%' || trim(p_search) || '%'
         or gv.vehicle_name ilike '%' || trim(p_search) || '%'
         or d.driver_name ilike '%' || trim(p_search) || '%')
  order by i.departed_at desc
  limit 500;
end$$;

create or replace function public.ops_station_workflow(p_day date default null, p_search text default null)
returns table (
  visit_id uuid, departure_id uuid, trip_day date, db_number text, vehicle_name text,
  driver_name text, shift text, area_name text, manager_name text,
  sector_id smallint, parent_sector text,
  inbound_departed_at timestamptz, arrived_at timestamptz, weighed_at timestamptz,
  completed_at timestamptz, dispatched_at timestamptz,
  weight_tons numeric, destination text, destination_label text,
  vehicle_kind text, kind_label text, min_tons numeric,
  violation boolean, deficit_tons numeric,
  transit_minutes integer, weigh_wait_minutes integer, process_minutes integer, stay_minutes integer
)
language sql stable security invoker set search_path = public, app as $$
  select * from app.ops_station_workflow(p_day, p_search)
$$;

revoke all on function app.ops_station_workflow(date, text), public.ops_station_workflow(date, text) from public, anon, authenticated;
grant execute on function app.ops_station_workflow(date, text), public.ops_station_workflow(date, text) to authenticated;
