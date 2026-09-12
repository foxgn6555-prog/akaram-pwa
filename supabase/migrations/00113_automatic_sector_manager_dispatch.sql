-- 00113 · الإسناد التلقائي للانطلاقية إلى مسؤول المنطقة والشفت.
-- لا يقبل العميل manager_id؛ المصدر الوحيد هو إسناد السائق/الآلية وملف مسؤول القسم.

create or replace function app.resolve_sector_shift_manager(p_sector_id smallint,p_shift text)
returns table(user_id uuid,manager_name text)
language plpgsql stable security definer set search_path=public,app as $$
declare matched_count integer;
begin
  select count(*) into matched_count
  from public.manager_profiles mp
  where p_sector_id=any(mp.sectors)
    and mp.shift=p_shift
    and exists(select 1 from public.user_roles ur where ur.user_id=mp.user_id and ur.role='department_manager');
  if matched_count=0 then raise exception 'GARAGE_SECTOR_MANAGER_NOT_CONFIGURED';end if;
  if matched_count>1 then raise exception 'GARAGE_SECTOR_MANAGER_AMBIGUOUS';end if;
  return query
  select mp.user_id,coalesce(nullif(e.full_name,''),au.email,mp.user_id::text)
  from public.manager_profiles mp
  join auth.users au on au.id=mp.user_id
  left join public.employees e on e.user_id=mp.user_id
  where p_sector_id=any(mp.sectors)
    and mp.shift=p_shift
    and exists(select 1 from public.user_roles ur where ur.user_id=mp.user_id and ur.role='department_manager');
end$$;
revoke all on function app.resolve_sector_shift_manager(smallint,text) from public,anon,authenticated;

-- إزالة العقد القديمة التي سمحت للواجهة باختيار المسؤول.
drop function if exists public.garage_record_shift_departure(uuid,text,text,uuid);
drop function if exists public.garage_record_departure(uuid,text,uuid);

create or replace function public.garage_record_shift_departure(p_vehicle_id uuid,p_shift text,p_notes text default null)
returns public.garage_departures
language plpgsql security definer set search_path=public,app as $$
declare
  actor_id uuid:=app.require_garage_actor();vehicle_row public.garage_vehicles;
  assignment_row public.garage_vehicle_shift_assignments;departure_row public.garage_departures;
  manager_id uuid;manager_label text;
begin
  if p_shift not in('morning','evening','night')then raise exception 'GARAGE_SHIFT_INVALID';end if;
  if length(coalesce(p_notes,''))>500 then raise exception 'GARAGE_DEPARTURE_NOTES_TOO_LONG';end if;
  select * into vehicle_row from public.garage_vehicles where id=p_vehicle_id and archived_at is null for update;
  if not found then raise exception 'GARAGE_VEHICLE_NOT_FOUND';end if;
  if exists(select 1 from public.vehicle_maintenance_cases mc where mc.vehicle_id=vehicle_row.id and mc.completed_at is null)then raise exception 'GARAGE_VEHICLE_IN_MAINTENANCE';end if;
  if exists(select 1 from public.garage_departures gd where gd.vehicle_id=vehicle_row.id and gd.returned_at is null)then raise exception 'GARAGE_DEPARTURE_ALREADY_OPEN';end if;
  select * into assignment_row from public.garage_vehicle_shift_assignments a where a.vehicle_id=vehicle_row.id and a.shift=p_shift and a.ends_at is null;
  if not found then raise exception 'GARAGE_SHIFT_ASSIGNMENT_NOT_FOUND';end if;
  select resolved.user_id,resolved.manager_name into manager_id,manager_label from app.resolve_sector_shift_manager(assignment_row.sector_id,p_shift) resolved;
  insert into public.garage_departures(vehicle_id,driver_name,shift,sector_id,departed_by,notes,recipient_manager_id,recipient_manager_name)
  values(vehicle_row.id,assignment_row.driver_name,p_shift,assignment_row.sector_id,actor_id,nullif(btrim(coalesce(p_notes,'')),''),manager_id,manager_label)
  returning * into departure_row;
  insert into public.notifications(user_id,title,body,type,link,category,entity_type,entity_id,dedupe_key)
  values(manager_id,'آلية في الطريق إلى موقع العمل',format('%s · DB %s انطلقت تلقائياً إلى منطقتك في الشفت %s',vehicle_row.vehicle_name,vehicle_row.db_number,p_shift),'info','/manager/vehicle-trips','departure','garage_departure',departure_row.id,'departure:auto-manager:'||departure_row.id::text)
  on conflict(user_id,dedupe_key)where dedupe_key is not null do nothing;
  return departure_row;
exception when unique_violation then raise exception 'GARAGE_DEPARTURE_ALREADY_OPEN';
end$$;

create or replace function public.garage_record_departure(p_vehicle_id uuid,p_notes text default null)
returns public.garage_departures
language plpgsql security definer set search_path=public,app as $$
declare current_assignment public.garage_driver_assignments;begin
  perform app.require_garage_actor();
  select * into current_assignment from public.garage_driver_assignments a where a.vehicle_id=p_vehicle_id and a.ends_at is null;
  if not found then raise exception 'GARAGE_NO_ACTIVE_ASSIGNMENT';end if;
  return public.garage_record_shift_departure(p_vehicle_id,current_assignment.shift,p_notes);
end$$;

revoke all on function public.garage_record_shift_departure(uuid,text,text),public.garage_record_departure(uuid,text) from public,anon;
grant execute on function public.garage_record_shift_departure(uuid,text,text),public.garage_record_departure(uuid,text) to authenticated;
