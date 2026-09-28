-- 00149 · الجولة 3 من تدقيق الانطلاقيات: المحطة التحويلية
-- القرارات المعتمدة:
--  · تعديل بيانات الوزن بعد الإكمال يجوز حصراً لغرفة العمليات، بسبب إلزامي وتدقيق كامل (قبل/بعد)،
--    مع إعادة احتساب المخالفة وتحديث صف الدفتر التلقائي وإبلاغ المحطة.
--  · الحد الأدنى/الأعلى لكل نوع آلية يُدار حصراً من غرفة العمليات (المحطة تقرأ فقط).
--  · القاعدة ثابتة: الأقل من الحد الأدنى = مخالفة، الأكثر مسموح (الحد الأعلى إرشادي).
--  · لا علاقة لأي من هذا بالبصمة.

-- ─── 0) عمليات التدقيق الجديدة ───
alter table public.audit_logs drop constraint if exists audit_logs_operation_check;
alter table public.audit_logs add constraint audit_logs_operation_check
  check (operation in ('INSERT','UPDATE','DELETE','ARCHIVE','RESTORE','SEND_FOLDER_TO_DEPUTY','RECORD_WEIGHING','COMPLETE_WEIGHING','SET_DRIVER','CORRECT_WEIGHING','SAVE_VEHICLE_KIND'));

-- ─── 1) ربط صف الدفتر بخطوة الوزن + أثر التصحيح على الخطوة ───
alter table public.ts_weight_records add column if not exists step_id uuid references public.ts_visit_weighing_steps(id) on delete set null;
create unique index if not exists uq_ts_weight_records_step on public.ts_weight_records(step_id) where step_id is not null;
-- ربط أفضل جهد للصفوف التلقائية السابقة
update public.ts_weight_records r
   set step_id = s.id
  from public.ts_visit_weighing_steps s
  join public.vehicle_trip_legs l on l.id = s.visit_leg_id
  join public.garage_departures d on d.id = l.departure_id
  join public.garage_vehicles gv on gv.id = d.vehicle_id
 where r.step_id is null and s.completed_at is not null and r.db_number = gv.db_number and r.net_weight = s.weight_tons
   and r.log_date = (s.completed_at at time zone 'Asia/Baghdad')::date and r.entry_time = (s.weighed_at at time zone 'Asia/Baghdad')::time
   and not exists (select 1 from public.ts_weight_records r2 where r2.step_id = s.id);

alter table public.ts_visit_weighing_steps
  add column if not exists corrected_at timestamptz,
  add column if not exists corrected_by uuid references auth.users(id),
  add column if not exists correction_reason text,
  add column if not exists correction_count integer not null default 0;

-- ─── 2) أنواع الآليات: تفعيل/تعطيل + من عدّل ───
alter table public.ts_vehicle_kinds
  add column if not exists active boolean not null default true,
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by uuid references auth.users(id);

-- ─── 3) الإكمال يسجّل step_id في الدفتر ويرفض النوع المعطّل ───
create or replace function app.ts_complete_weighing(p_visit_leg_id uuid, p_destination text, p_vehicle_kind text)
returns public.ts_visit_weighing_steps
language plpgsql security definer set search_path = public, app as $$
declare
  u uuid; l public.vehicle_trip_legs; s public.ts_visit_weighing_steps;
  k public.ts_vehicle_kinds; d public.garage_departures; gv public.garage_vehicles;
  v boolean; deficit numeric(6,2);
begin
  u := app.ts_require_station_actor();
  l := app.ts_visit_open_leg(p_visit_leg_id);
  if p_destination not in ('press','transfer_station') then raise exception 'STATION_DESTINATION_INVALID'; end if;
  select * into k from public.ts_vehicle_kinds where kind = p_vehicle_kind and active;
  if not found then raise exception 'STATION_KIND_INVALID'; end if;
  if k.destination not in ('both', p_destination) then raise exception 'STATION_KIND_DESTINATION_INVALID'; end if;
  select * into s from public.ts_visit_weighing_steps where visit_leg_id = l.id for update;
  if not found then raise exception 'STATION_WEIGHING_REQUIRED'; end if;
  if s.completed_at is not null then raise exception 'STATION_WEIGHING_COMPLETED'; end if;
  select * into d from public.garage_departures where id = l.departure_id;
  select * into gv from public.garage_vehicles where id = d.vehicle_id;

  v := s.weight_tons < k.min_tons;
  deficit := case when v then round(k.min_tons - s.weight_tons, 2) end;

  update public.ts_visit_weighing_steps
     set destination = p_destination, vehicle_kind = k.kind, completed_at = now(), violation = v, deficit_tons = deficit, updated_at = now()
   where id = s.id returning * into s;

  if v then
    insert into public.ts_violations (step_id, visit_leg_id, driver_name, db_number, vehicle_kind, weight_tons, min_tons, deficit_tons, created_by)
    values (s.id, l.id, d.driver_name, gv.db_number, k.kind, s.weight_tons, k.min_tons, deficit, u);
    perform app.notify_by_role(array['ops_room','super_admin'], 'مخالفة وزن في المحطة التحويلية',
      format('DB %s — السائق %s: الوزن %s طن أقل من الحد المسموح لـ%s (%s طن). سُجلت مخالفة ووصل التنبيه للتدقيق.', gv.db_number, d.driver_name, s.weight_tons, k.label, k.min_tons),
      'warning', '/ops-room/operations-data');
  end if;

  insert into public.ts_weight_records (db_number, driver_name, vehicle_type, gross_weight, tare_weight, net_weight, entry_time, log_date, shift, status, created_by, step_id)
  values (gv.db_number, d.driver_name, k.label || ' → ' || case p_destination when 'press' then 'المكبس' else 'المحطة التحويلية' end,
          s.weight_tons, null, s.weight_tons, (s.weighed_at at time zone 'Asia/Baghdad')::time, (s.completed_at at time zone 'Asia/Baghdad')::date,
          case d.shift when 'night' then 'evening' else d.shift end, 'draft', u, s.id);

  insert into public.audit_logs (table_name, record_id, operation, new_row, actor_id, actor_role)
  values ('ts_visit_weighing_steps', s.id::text, 'COMPLETE_WEIGHING', jsonb_build_object('destination', p_destination, 'kind', k.kind, 'violation', v), u, app.current_role());
  return s;
end$$;

-- ─── 4) تصحيح وزن مكتمل — غرفة العمليات فقط ───
create or replace function public.ops_correct_weighing(p_visit_leg_id uuid, p_weight_tons numeric, p_destination text, p_vehicle_kind text, p_reason text)
returns public.ts_visit_weighing_steps
language plpgsql security definer set search_path = public, app as $$
declare
  u uuid := auth.uid(); l public.vehicle_trip_legs; s public.ts_visit_weighing_steps; old_s public.ts_visit_weighing_steps;
  k public.ts_vehicle_kinds; d public.garage_departures; gv public.garage_vehicles; v boolean; deficit numeric(6,2);
begin
  if u is null or not app.has_role(array['ops_room','super_admin']) then raise exception 'OPS_ROOM_FORBIDDEN'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'OPS_CORRECTION_REASON_REQUIRED'; end if;
  if p_weight_tons is null or p_weight_tons <= 0 or p_weight_tons >= 100 then raise exception 'STATION_WEIGHT_INVALID'; end if;
  if p_destination not in ('press','transfer_station') then raise exception 'STATION_DESTINATION_INVALID'; end if;
  select * into k from public.ts_vehicle_kinds where kind = p_vehicle_kind;   -- التصحيح يقبل نوعاً معطّلاً لاحقاً حفاظاً على السجل التاريخي
  if not found then raise exception 'STATION_KIND_INVALID'; end if;
  if k.destination not in ('both', p_destination) then raise exception 'STATION_KIND_DESTINATION_INVALID'; end if;
  select * into l from public.vehicle_trip_legs where id = p_visit_leg_id and destination_type = 'transfer_station';
  if not found then raise exception 'STATION_VISIT_NOT_FOUND'; end if;
  select * into s from public.ts_visit_weighing_steps where visit_leg_id = l.id for update;
  if not found or s.completed_at is null then raise exception 'OPS_CORRECTION_NOT_COMPLETED'; end if;
  old_s := s;
  select * into d from public.garage_departures where id = l.departure_id;
  select * into gv from public.garage_vehicles where id = d.vehicle_id;

  v := round(p_weight_tons, 2) < k.min_tons;
  deficit := case when v then round(k.min_tons - round(p_weight_tons, 2), 2) end;

  update public.ts_visit_weighing_steps
     set weight_tons = round(p_weight_tons, 2), destination = p_destination, vehicle_kind = k.kind, violation = v, deficit_tons = deficit,
         corrected_at = now(), corrected_by = u, correction_reason = trim(p_reason), correction_count = correction_count + 1, updated_at = now()
   where id = s.id returning * into s;

  -- المخالفة تتبع الحقيقة الجديدة
  if v then
    insert into public.ts_violations (step_id, visit_leg_id, driver_name, db_number, vehicle_kind, weight_tons, min_tons, deficit_tons, created_by)
    values (s.id, l.id, d.driver_name, gv.db_number, k.kind, s.weight_tons, k.min_tons, deficit, u)
    on conflict (step_id) do update set vehicle_kind = excluded.vehicle_kind, weight_tons = excluded.weight_tons, min_tons = excluded.min_tons, deficit_tons = excluded.deficit_tons;
  else
    delete from public.ts_violations where step_id = s.id;
  end if;

  -- صف الدفتر التلقائي
  update public.ts_weight_records
     set net_weight = s.weight_tons, gross_weight = s.weight_tons,
         vehicle_type = k.label || ' → ' || case p_destination when 'press' then 'المكبس' else 'المحطة التحويلية' end
   where step_id = s.id;

  insert into public.audit_logs (table_name, record_id, operation, old_row, new_row, actor_id, actor_role)
  values ('ts_visit_weighing_steps', s.id::text, 'CORRECT_WEIGHING',
          jsonb_build_object('weight_tons', old_s.weight_tons, 'destination', old_s.destination, 'kind', old_s.vehicle_kind, 'violation', old_s.violation),
          jsonb_build_object('weight_tons', s.weight_tons, 'destination', s.destination, 'kind', s.vehicle_kind, 'violation', s.violation, 'reason', trim(p_reason)),
          u, app.current_role());

  perform app.notify_by_role(array['transfer_station'], 'صحّحت غرفة العمليات بيانات وزن',
    format('DB %s — الوزن %s ← %s طن (%s). السبب: %s', gv.db_number, old_s.weight_tons, s.weight_tons, k.label, trim(p_reason)),
    'info', '/transfer-station/vehicle-movements');
  return s;
end$$;
revoke all on function public.ops_correct_weighing(uuid,numeric,text,text,text) from public, anon;
grant execute on function public.ops_correct_weighing(uuid,numeric,text,text,text) to authenticated;

-- ─── 5) إدارة أنواع الآليات وحدودها — غرفة العمليات فقط ───
create or replace function public.ops_ts_vehicle_kind_save(p_kind text, p_label text, p_min_tons numeric, p_max_tons numeric, p_destination text, p_sort integer default 0, p_active boolean default true)
returns public.ts_vehicle_kinds
language plpgsql security definer set search_path = public, app as $$
declare u uuid := auth.uid(); k public.ts_vehicle_kinds; old_k public.ts_vehicle_kinds;
begin
  if u is null or not app.has_role(array['ops_room','super_admin']) then raise exception 'OPS_ROOM_FORBIDDEN'; end if;
  if p_kind !~ '^[a-z0-9_]{2,40}$' then raise exception 'TS_KIND_CODE_INVALID'; end if;
  if p_label is null or length(trim(p_label)) < 2 then raise exception 'TS_KIND_LABEL_REQUIRED'; end if;
  if p_min_tons is null or p_min_tons <= 0 or p_min_tons >= 100 then raise exception 'TS_KIND_MIN_INVALID'; end if;
  if p_max_tons is not null and (p_max_tons < p_min_tons or p_max_tons >= 100) then raise exception 'TS_KIND_MAX_INVALID'; end if;
  if p_destination not in ('press','transfer_station','both') then raise exception 'STATION_DESTINATION_INVALID'; end if;
  select * into old_k from public.ts_vehicle_kinds where kind = p_kind;
  insert into public.ts_vehicle_kinds (kind, label, min_tons, max_tons, destination, sort, active, updated_at, updated_by)
  values (p_kind, trim(p_label), round(p_min_tons, 2), round(p_max_tons, 2), p_destination, coalesce(p_sort, 0), coalesce(p_active, true), now(), u)
  on conflict (kind) do update
    set label = excluded.label, min_tons = excluded.min_tons, max_tons = excluded.max_tons, destination = excluded.destination,
        sort = excluded.sort, active = excluded.active, updated_at = now(), updated_by = u
  returning * into k;
  insert into public.audit_logs (table_name, record_id, operation, old_row, new_row, actor_id, actor_role)
  values ('ts_vehicle_kinds', k.kind, 'SAVE_VEHICLE_KIND', case when old_k.kind is null then null else to_jsonb(old_k) end, to_jsonb(k), u, app.current_role());
  return k;
end$$;
revoke all on function public.ops_ts_vehicle_kind_save(text,text,numeric,numeric,text,integer,boolean) from public, anon;
grant execute on function public.ops_ts_vehicle_kind_save(text,text,numeric,numeric,text,integer,boolean) to authenticated;

-- قائمة الأنواع (للمحطة: الفعّالة فقط؛ لغرفة العمليات: الكل عند الطلب)
create or replace function public.ts_vehicle_kinds_list(p_include_inactive boolean default false)
returns setof public.ts_vehicle_kinds
language sql stable security invoker set search_path = public as $$
  select * from public.ts_vehicle_kinds where p_include_inactive or active order by sort, kind
$$;
grant execute on function public.ts_vehicle_kinds_list(boolean) to authenticated;

-- ─── 6) المحطة ترى أن الوزن صُحح (شفافية بلا صلاحية تعديل) ───
drop function if exists public.station_visits_for_day(date,text,text,smallint);
create function public.station_visits_for_day(p_day date, p_search text default null, p_status text default null, p_sector_id smallint default null)
returns table(visit_id uuid, departure_id uuid, visit_number bigint, inbound_sequence integer, vehicle_id uuid, vehicle_name text, db_number text, driver_name text, shift text, sector_id smallint, area_name text, manager_name text, inbound_departed_at timestamptz, arrived_at timestamptz, dispatched_at timestamptz, outbound_destination text, status text, transit_minutes integer, stay_minutes integer, inbound_notes text, arrival_notes text, dispatch_notes text, step_weight_tons numeric, step_destination text, step_vehicle_kind text, step_weighed_at timestamptz, step_completed_at timestamptz, step_violation boolean, step_corrected_at timestamptz, step_correction_reason text)
language plpgsql stable security definer set search_path = public, app as $$
begin
 if not app.has_role(array['transfer_station']) then raise exception 'STATION_FORBIDDEN';end if;
 if p_day is null then raise exception 'STATION_DAY_REQUIRED';end if;
 if p_status is not null and p_status not in('in_transit','at_station','dispatched') then raise exception 'STATION_STATUS_INVALID';end if;
 return query
 with inbound as(
  select i.*,row_number() over(partition by i.departure_id order by i.sequence_no) as visit_no
  from public.vehicle_trip_legs i where i.destination_type='transfer_station'
 ),visits as(
  select i.id visit_id,i.departure_id,i.visit_no,i.sequence_no,d.vehicle_id,gv.vehicle_name,gv.db_number,d.driver_name,d.shift,d.sector_id,s.name area_name,d.recipient_manager_name,
   i.departed_at,i.arrived_at,o.departed_at dispatched_at,o.destination_type outbound_destination,
   case when i.arrived_at is null then 'in_transit' when o.id is null then 'at_station' else 'dispatched' end visit_status,
   case when i.arrived_at is null then null else floor(extract(epoch from(i.arrived_at-i.departed_at))/60)::int end transit_minutes,
   case when i.arrived_at is null then null else floor(extract(epoch from(coalesce(o.departed_at,now())-i.arrived_at))/60)::int end stay_minutes,
   i.departure_notes,i.arrival_notes,o.departure_notes dispatch_notes
  from inbound i join public.garage_departures d on d.id=i.departure_id join public.garage_vehicles gv on gv.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
  left join public.vehicle_trip_legs o on o.departure_id=i.departure_id and o.sequence_no=i.sequence_no+1 and o.origin_type='transfer_station'
  where(i.departed_at at time zone 'Asia/Baghdad')::date=p_day
 )
 select v.visit_id,v.departure_id,v.visit_no,v.sequence_no,v.vehicle_id,v.vehicle_name,v.db_number,v.driver_name,v.shift,v.sector_id,v.area_name,v.recipient_manager_name,v.departed_at,v.arrived_at,v.dispatched_at,v.outbound_destination,v.visit_status,v.transit_minutes,v.stay_minutes,v.departure_notes,v.arrival_notes,v.dispatch_notes,
  st.weight_tons,st.destination,st.vehicle_kind,st.weighed_at,st.completed_at,coalesce(st.violation,false),st.corrected_at,st.correction_reason
 from visits v
 left join public.ts_visit_weighing_steps st on st.visit_leg_id=v.visit_id
 where(p_search is null or trim(p_search)='' or v.db_number ilike '%'||trim(p_search)||'%' or v.vehicle_name ilike '%'||trim(p_search)||'%' or v.driver_name ilike '%'||trim(p_search)||'%')
 and(p_status is null or v.visit_status=p_status) and(p_sector_id is null or v.sector_id=p_sector_id)
 order by case v.visit_status when 'in_transit' then 0 when 'at_station' then 1 else 2 end,v.departed_at desc;
end$$;
revoke all on function public.station_visits_for_day(date,text,text,smallint) from public,anon;
grant execute on function public.station_visits_for_day(date,text,text,smallint) to authenticated;

-- ─── 7) تقرير أوزان غرفة العمليات يحمل أثر التصحيح ───
drop function if exists public.ops_station_workflow_range(date,date,text);
create function public.ops_station_workflow_range(p_from date,p_to date,p_search text default null)
returns table (
  visit_id uuid, departure_id uuid, trip_day date, db_number text, vehicle_name text,
  driver_name text, shift text, area_name text, manager_name text,
  sector_id smallint, parent_sector text,
  inbound_departed_at timestamptz, arrived_at timestamptz, weighed_at timestamptz,
  completed_at timestamptz, dispatched_at timestamptz,
  weight_tons numeric, destination text, destination_label text,
  vehicle_kind text, kind_label text, min_tons numeric,
  violation boolean, deficit_tons numeric,
  transit_minutes integer, weigh_wait_minutes integer, process_minutes integer, stay_minutes integer,
  corrected_at timestamptz, correction_reason text, correction_count integer
)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.has_role(array['ops_room','transfer_station','super_admin']) then raise exception 'OPS_WORKFLOW_FORBIDDEN'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then raise exception 'OPS_DATE_RANGE_INVALID'; end if;
  return query
  select i.id, i.departure_id, (i.departed_at at time zone 'Asia/Baghdad')::date,
         gv.db_number, gv.vehicle_name, d.driver_name, d.shift, s.name, d.recipient_manager_name,
         d.sector_id, s.parent_sector,
         i.departed_at, i.arrived_at, st.weighed_at, st.completed_at, o.departed_at,
         st.weight_tons, st.destination,
         case st.destination when 'press' then 'المكبس' when 'transfer_station' then 'المحطة التحويلية' end,
         st.vehicle_kind, k.label, k.min_tons,
         coalesce(st.violation, false), st.deficit_tons,
         case when i.arrived_at is null then null else floor(extract(epoch from (i.arrived_at - i.departed_at)) / 60)::int end,
         case when st.weighed_at is null or i.arrived_at is null or st.weighed_at < i.arrived_at then null
              else floor(extract(epoch from (st.weighed_at - i.arrived_at)) / 60)::int end,
         case when st.completed_at is null or i.arrived_at is null then null
              else floor(extract(epoch from (st.completed_at - i.arrived_at)) / 60)::int end,
         case when i.arrived_at is null then null else floor(extract(epoch from (coalesce(o.departed_at, now()) - i.arrived_at)) / 60)::int end,
         st.corrected_at, st.correction_reason, coalesce(st.correction_count, 0)
  from public.vehicle_trip_legs i
  join public.garage_departures d on d.id = i.departure_id
  join public.garage_vehicles gv on gv.id = d.vehicle_id
  join public.sectors s on s.id = d.sector_id
  left join public.ts_visit_weighing_steps st on st.visit_leg_id = i.id
  left join public.ts_vehicle_kinds k on k.kind = st.vehicle_kind
  left join lateral (
    select oo.departed_at from public.vehicle_trip_legs oo
    where oo.departure_id = i.departure_id and oo.sequence_no = i.sequence_no + 1 and oo.origin_type = 'transfer_station'
    order by oo.id limit 1
  ) o on true
  where i.destination_type = 'transfer_station'
    and (i.departed_at at time zone 'Asia/Baghdad')::date between p_from and p_to
    and (p_search is null or trim(p_search) = ''
         or gv.db_number ilike '%' || trim(p_search) || '%'
         or gv.vehicle_name ilike '%' || trim(p_search) || '%'
         or d.driver_name ilike '%' || trim(p_search) || '%')
  order by i.departed_at desc
  limit 2000;
end$$;
revoke all on function public.ops_station_workflow_range(date,date,text) from public, anon;
grant execute on function public.ops_station_workflow_range(date,date,text) to authenticated;
