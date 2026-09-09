-- ═══════════════════════════════════════════════════════════════
-- 00075 · الكراج المركزي — انطلاق السائقين وعودتهم
-- سجل ذري، توقيت خادم، عزل كامل، ومنع تعديل/أرشفة آلية في الميدان.
-- ═══════════════════════════════════════════════════════════════

create table public.garage_departures (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.garage_vehicles(id),
  driver_name text not null check (length(trim(driver_name)) between 2 and 120),
  shift text not null check (shift in ('morning','evening','night')),
  sector_id smallint not null references public.sectors(id),
  departed_at timestamptz not null default now(),
  departed_by uuid not null references auth.users(id),
  returned_at timestamptz,
  returned_by uuid references auth.users(id),
  notes text check (notes is null or length(notes)<=500),
  check (returned_at is null or returned_at >= departed_at),
  check ((returned_at is null and returned_by is null) or (returned_at is not null and returned_by is not null))
);
create unique index uq_garage_open_departure on public.garage_departures(vehicle_id) where returned_at is null;
create index idx_garage_departures_day on public.garage_departures (((departed_at at time zone 'Asia/Baghdad')::date),departed_at desc);
create index idx_garage_departures_vehicle on public.garage_departures(vehicle_id,departed_at desc);
create trigger trg_audit_garage_departures after insert or update or delete on public.garage_departures
  for each row execute function app.audit_trigger();

alter table public.garage_departures enable row level security;
create policy "garage departures read" on public.garage_departures for select to authenticated
  using (app.has_role(array['central_garage_officer','super_admin']));

create or replace function public.garage_record_departure(p_vehicle_id uuid,p_notes text default null)
returns public.garage_departures language plpgsql volatile security definer set search_path=public,app as $$
declare v_uid uuid:=app.require_garage_actor();v_vehicle public.garage_vehicles;v_assignment public.garage_driver_assignments;v_row public.garage_departures;
begin
  if length(coalesce(p_notes,''))>500 then raise exception 'GARAGE_DEPARTURE_NOTES_TOO_LONG'; end if;
  select * into v_vehicle from public.garage_vehicles where id=p_vehicle_id and archived_at is null for update;
  if not found then raise exception 'GARAGE_VEHICLE_NOT_FOUND'; end if;
  select * into v_assignment from public.garage_driver_assignments where vehicle_id=p_vehicle_id and ends_at is null;
  if not found then raise exception 'GARAGE_NO_ACTIVE_ASSIGNMENT'; end if;
  if exists(select 1 from public.garage_departures where vehicle_id=p_vehicle_id and returned_at is null) then raise exception 'GARAGE_DEPARTURE_ALREADY_OPEN'; end if;
  insert into public.garage_departures(vehicle_id,driver_name,shift,sector_id,departed_by,notes)
  values(p_vehicle_id,v_assignment.driver_name,v_assignment.shift,v_assignment.sector_id,v_uid,nullif(trim(coalesce(p_notes,'')),'')) returning * into v_row;
  return v_row;
exception when unique_violation then raise exception 'GARAGE_DEPARTURE_ALREADY_OPEN';
end$$;

create or replace function public.garage_record_return(p_departure_id uuid)
returns public.garage_departures language plpgsql volatile security definer set search_path=public,app as $$
declare v_uid uuid:=app.require_garage_actor();v_row public.garage_departures;
begin
  update public.garage_departures set returned_at=now(),returned_by=v_uid where id=p_departure_id and returned_at is null returning * into v_row;
  if not found then raise exception 'GARAGE_OPEN_DEPARTURE_NOT_FOUND'; end if;
  return v_row;
end$$;

-- يعيد انطلاقات يوم بغداد، ويُبقي أي انطلاقة مفتوحة من يوم سابق ظاهرة حتى تسجيل العودة.
create or replace function public.garage_today_departures()
returns table(id uuid,vehicle_id uuid,driver_name text,shift text,sector_id smallint,departed_at timestamptz,returned_at timestamptz,notes text,vehicle_name text,db_number text,image_path text,area_name text,parent_sector text)
language plpgsql stable security definer set search_path=public,app as $$
begin
  perform app.require_garage_actor();
  return query select d.id,d.vehicle_id,d.driver_name,d.shift,d.sector_id,d.departed_at,d.returned_at,d.notes,v.vehicle_name,v.db_number,v.image_path,s.name,s.parent_sector
  from public.garage_departures d join public.garage_vehicles v on v.id=d.vehicle_id join public.sectors s on s.id=d.sector_id
  where d.returned_at is null or (d.departed_at at time zone 'Asia/Baghdad')::date=(now() at time zone 'Asia/Baghdad')::date
  order by (d.returned_at is null) desc,d.departed_at desc;
end$$;

-- لا يجوز تغيير الإسناد أثناء وجود الآلية في الميدان.
create or replace function public.garage_assign_driver(p_vehicle_id uuid,p_driver_name text,p_shift text,p_sector_id smallint,p_reason text default null)
returns public.garage_driver_assignments language plpgsql security definer set search_path=public,app as $$
declare v_uid uuid:=app.require_garage_actor();v_row public.garage_driver_assignments;
begin
  if length(trim(coalesce(p_driver_name,'')))<2 then raise exception 'GARAGE_DRIVER_REQUIRED'; end if;
  if p_shift not in ('morning','evening','night') then raise exception 'GARAGE_SHIFT_INVALID'; end if;
  if length(coalesce(p_reason,''))>300 then raise exception 'GARAGE_ASSIGNMENT_REASON_TOO_LONG'; end if;
  if not exists(select 1 from public.sectors where id=p_sector_id) then raise exception 'GARAGE_AREA_INVALID'; end if;
  perform 1 from public.garage_vehicles where id=p_vehicle_id and archived_at is null for update;
  if not found then raise exception 'GARAGE_VEHICLE_NOT_FOUND'; end if;
  if exists(select 1 from public.garage_departures where vehicle_id=p_vehicle_id and returned_at is null) then raise exception 'GARAGE_VEHICLE_IN_FIELD'; end if;
  update public.garage_driver_assignments set ends_at=now(),change_reason=coalesce(nullif(trim(coalesce(p_reason,'')),''),change_reason) where vehicle_id=p_vehicle_id and ends_at is null;
  insert into public.garage_driver_assignments(vehicle_id,driver_name,shift,sector_id,assigned_by,change_reason)
  values(p_vehicle_id,trim(p_driver_name),p_shift,p_sector_id,v_uid,nullif(trim(coalesce(p_reason,'')),'')) returning * into v_row;
  update public.garage_vehicles set driver_name=v_row.driver_name,shift=v_row.shift,sector_id=v_row.sector_id where id=p_vehicle_id;
  return v_row;
end$$;

create or replace function public.garage_archive_vehicle(p_vehicle_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public,app as $$
declare v_uid uuid:=app.require_garage_actor();
begin
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'GARAGE_ARCHIVE_REASON_REQUIRED'; end if;
  if length(p_reason)>500 then raise exception 'GARAGE_ARCHIVE_REASON_TOO_LONG'; end if;
  perform 1 from public.garage_vehicles where id=p_vehicle_id and archived_at is null for update;
  if not found then raise exception 'GARAGE_VEHICLE_NOT_FOUND'; end if;
  if exists(select 1 from public.garage_departures where vehicle_id=p_vehicle_id and returned_at is null) then raise exception 'GARAGE_VEHICLE_IN_FIELD'; end if;
  update public.garage_vehicles set archived_at=now(),archived_by=v_uid,archive_reason=trim(p_reason) where id=p_vehicle_id;
  update public.garage_driver_assignments set ends_at=now(),change_reason=coalesce(change_reason,'أرشفة الآلية') where vehicle_id=p_vehicle_id and ends_at is null;
end$$;

revoke all on function public.garage_record_departure(uuid,text),public.garage_record_return(uuid),public.garage_today_departures(),
  public.garage_assign_driver(uuid,text,text,smallint,text),public.garage_archive_vehicle(uuid,text) from public,anon;
grant execute on function public.garage_record_departure(uuid,text),public.garage_record_return(uuid),public.garage_today_departures(),
  public.garage_assign_driver(uuid,text,text,smallint,text),public.garage_archive_vehicle(uuid,text) to authenticated;
